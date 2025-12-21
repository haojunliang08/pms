/**
 * ============================================================================
 * Performance.tsx - 绩效记录页面
 * ============================================================================
 * 
 * 【功能】
 * - 展示员工绩效评估记录，支持筛选
 * - 按小组生成绩效（可选择具体员工）
 * - 修改/删除绩效记录
 * 
 * 【权限控制】
 * - admin: 可选择子公司、小组、员工，可生成/修改/删除
 * - manager: 可选择本分公司的小组、员工，可生成/修改/删除
 * - employee: 只能查看
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { PerformanceRecord, Branch, Group, User } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import './PageStyles.css'

// 员工数据类型
interface EmployeeData {
    user_id: string
    name: string
    selected: boolean
    actual_attendance: number
    required_attendance: number
    annotation_score: number      // 标注得分 (0-100)
    onsite_performance: number    // 现场表现 (1-5)
    total_inspected: number       // 自动获取
    total_errors: number          // 自动获取
    minor_error_count: number     // 自动获取
}

export default function Performance() {
    const { user: currentUser } = useAuth()

    // ========== 基础数据 ==========
    const [records, setRecords] = useState<(PerformanceRecord & { user?: User; branch?: Branch; group?: Group })[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [employees, setEmployees] = useState<User[]>([])
    const [loading, setLoading] = useState(true)

    // ========== 弹窗状态 ==========
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [selectedRecord, setSelectedRecord] = useState<PerformanceRecord | null>(null)
    const [showGenerateModal, setShowGenerateModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [saving, setSaving] = useState(false)

    // ========== 生成绩效状态 ==========
    const [generatePeriod, setGeneratePeriod] = useState('')
    const [generateBranch, setGenerateBranch] = useState('')
    const [generateGroup, setGenerateGroup] = useState('')
    const [employeeDataList, setEmployeeDataList] = useState<EmployeeData[]>([])

    // ========== 快捷设置值 ==========
    const [batchAttendance, setBatchAttendance] = useState(22)
    const [batchOnsite, setBatchOnsite] = useState(3)
    const [batchAnnotation, setBatchAnnotation] = useState(80)
    const [batchMinorError, setBatchMinorError] = useState(0)

    // ========== 编辑绩效状态 ==========
    const [editRecord, setEditRecord] = useState<{
        id: string
        user_id: string
        user_name: string
        period: string
        actual_attendance: number
        required_attendance: number
        annotation_score: number
        onsite_performance: number
        total_inspected: number
        total_errors: number
        minor_error_count: number
    } | null>(null)

    // ========== 周期选项 ==========
    const periodOptions = Array.from({ length: 12 }, (_, i) => {
        const date = new Date()
        date.setMonth(date.getMonth() - i - 1)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })
    const lastMonth = periodOptions[0]

    // ========== 筛选状态 ==========
    const [filterPeriod, setFilterPeriod] = useState(lastMonth)
    const [filterBranch, setFilterBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [filterGroup, setFilterGroup] = useState('')

    // ========== 生命周期 ==========
    useEffect(() => { fetchData() }, [])

    // ========== 数据获取 ==========
    async function fetchData() {
        try {
            const [recordsRes, branchesRes, groupsRes, employeesRes] = await Promise.all([
                supabase.from('performance_records')
                    .select('*, user:users(name, email), branch:branches(name), group:groups(name)')
                    .order('period', { ascending: false }),
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
                supabase.from('users').select('*').eq('role', 'employee').order('name'),
            ])

            let recordsData = recordsRes.data || []
            if (currentUser?.role === 'manager') {
                recordsData = recordsData.filter(r => r.branch_id === currentUser.branch_id)
            }
            setRecords(recordsData)
            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
            setEmployees(employeesRes.data || [])

            if (recordsData.length > 0 && !recordsData.some(r => r.period === lastMonth)) {
                setFilterPeriod(recordsData[0]?.period || lastMonth)
            }
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    // ========== 获取质检数据汇总 ==========
    async function fetchQCData(userIds: string[], period: string) {
        const periodStart = `${period}-01`
        // 计算月末日期（处理不同月份天数）
        const [year, month] = period.split('-').map(Number)
        const lastDay = new Date(year, month, 0).getDate()  // 获取该月最后一天
        const periodEnd = `${period}-${String(lastDay).padStart(2, '0')}`

        // 只获取质检数据，低级错误改为手动输入
        const { data: qcData } = await supabase.from('quality_inspections')
            .select('user_id, inspected_count, error_count')
            .gte('inspection_date', periodStart)
            .lte('inspection_date', periodEnd)
            .in('user_id', userIds)

        const qcSummary = new Map<string, { inspected: number; errors: number }>()
        qcData?.forEach(item => {
            const existing = qcSummary.get(item.user_id) || { inspected: 0, errors: 0 }
            existing.inspected += item.inspected_count
            existing.errors += item.error_count
            qcSummary.set(item.user_id, existing)
        })

        return { qcSummary }
    }

    // ========== 生成绩效相关 ==========

    function openGenerateModal() {
        setGeneratePeriod(lastMonth)
        setGenerateBranch(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
        setGenerateGroup('')
        setEmployeeDataList([])
        setBatchAttendance(22)
        setBatchAnnotation(80)
        setBatchOnsite(3)
        setShowGenerateModal(true)
    }

    async function loadEmployeesForGroup(groupId: string) {
        if (!groupId || !generatePeriod) return
        setGenerateGroup(groupId)

        const groupEmployees = employees.filter(e => e.group_id === groupId)
        const { qcSummary } = await fetchQCData(groupEmployees.map(e => e.id), generatePeriod)

        const dataList: EmployeeData[] = groupEmployees.map(emp => {
            const qc = qcSummary.get(emp.id) || { inspected: 0, errors: 0 }
            return {
                user_id: emp.id,
                name: emp.name,
                selected: true,
                actual_attendance: batchAttendance,
                required_attendance: 22,
                annotation_score: batchAnnotation,
                onsite_performance: batchOnsite,
                total_inspected: qc.inspected,
                total_errors: qc.errors,
                minor_error_count: 0,  // 默认为0，手动输入
            }
        })

        setEmployeeDataList(dataList)
    }

    function updateEmployeeData(userId: string, field: string, value: number | boolean) {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.user_id === userId ? { ...emp, [field]: value } : emp
        ))
    }

    // 批量设置
    function applyBatchAttendance() {
        // 同时设置实际出勤和应出勤
        setEmployeeDataList(prev => prev.map(emp => ({ ...emp, actual_attendance: batchAttendance, required_attendance: batchAttendance })))
    }
    function applyBatchAnnotation() {
        setEmployeeDataList(prev => prev.map(emp => ({ ...emp, annotation_score: batchAnnotation })))
    }
    function applyBatchOnsite() {
        setEmployeeDataList(prev => prev.map(emp => ({ ...emp, onsite_performance: batchOnsite })))
    }

    function toggleSelectAll(selected: boolean) {
        setEmployeeDataList(prev => prev.map(emp => ({ ...emp, selected })))
    }

    async function handleGeneratePerformance() {
        const selectedEmployees = employeeDataList.filter(e => e.selected)
        if (!generateGroup || !generatePeriod || selectedEmployees.length === 0) {
            alert('请选择小组和至少一名员工')
            return
        }

        setGenerating(true)
        try {
            const group = groups.find(g => g.id === generateGroup)

            for (const emp of selectedEmployees) {
                const recordData = {
                    user_id: emp.user_id,
                    branch_id: group?.branch_id,
                    group_id: generateGroup,
                    period: generatePeriod,
                    actual_attendance: emp.actual_attendance,
                    required_attendance: emp.required_attendance,
                    annotation_score: emp.annotation_score,
                    onsite_performance: emp.onsite_performance,
                    total_inspected: emp.total_inspected,
                    total_errors: emp.total_errors,
                    minor_error_count: emp.minor_error_count,
                }

                const { error } = await supabase
                    .from('performance_records')
                    .upsert(recordData, { onConflict: 'user_id,period' })

                if (error) console.error('保存失败:', emp.name, error)
            }

            alert('绩效生成成功！')
            setShowGenerateModal(false)
            fetchData()
        } catch (error) {
            console.error('生成绩效失败:', error)
            alert('生成绩效失败，请重试')
        } finally {
            setGenerating(false)
        }
    }

    // ========== 编辑绩效相关 ==========

    function openEditModal(record: PerformanceRecord & { user?: User }) {
        setEditRecord({
            id: record.id,
            user_id: record.user_id,
            user_name: record.user?.name || '',
            period: record.period,
            actual_attendance: record.actual_attendance,
            required_attendance: record.required_attendance,
            annotation_score: record.annotation_score,
            onsite_performance: record.onsite_performance,
            total_inspected: record.total_inspected,
            total_errors: record.total_errors,
            minor_error_count: record.minor_error_count,
        })
        setShowEditModal(true)
    }

    async function handleRefreshQCData() {
        if (!editRecord) return

        const { qcSummary } = await fetchQCData([editRecord.user_id], editRecord.period)
        const qc = qcSummary.get(editRecord.user_id) || { inspected: 0, errors: 0 }

        setEditRecord(prev => prev ? {
            ...prev,
            total_inspected: qc.inspected,
            total_errors: qc.errors,
        } : null)

        alert('质检数据已刷新')
    }

    async function handleSaveEdit() {
        if (!editRecord) return

        setSaving(true)
        try {
            const { error } = await supabase
                .from('performance_records')
                .update({
                    actual_attendance: editRecord.actual_attendance,
                    required_attendance: editRecord.required_attendance,
                    annotation_score: editRecord.annotation_score,
                    onsite_performance: editRecord.onsite_performance,
                    total_inspected: editRecord.total_inspected,
                    total_errors: editRecord.total_errors,
                    minor_error_count: editRecord.minor_error_count,
                })
                .eq('id', editRecord.id)

            if (error) throw error

            alert('保存成功！')
            setShowEditModal(false)
            fetchData()
        } catch (error) {
            console.error('保存失败:', error)
            alert('保存失败，请重试')
        } finally {
            setSaving(false)
        }
    }

    // ========== 删除绩效 ==========

    async function handleDelete(recordId: string, userName: string) {
        if (!confirm(`确定要删除 ${userName} 的绩效记录吗？`)) return

        try {
            const { error } = await supabase.from('performance_records').delete().eq('id', recordId)
            if (error) throw error
            alert('删除成功')
            fetchData()
        } catch (error) {
            console.error('删除失败:', error)
            alert('删除失败')
        }
    }

    // ========== 详情展示 ==========

    function showDetails(record: PerformanceRecord) {
        setSelectedRecord(record)
        setShowDetailModal(true)
    }

    // ========== 筛选逻辑 ==========

    let filteredRecords = records
    if (filterPeriod) filteredRecords = filteredRecords.filter(r => r.period === filterPeriod)
    if (filterBranch) filteredRecords = filteredRecords.filter(r => r.branch_id === filterBranch)
    if (filterGroup) filteredRecords = filteredRecords.filter(r => r.group_id === filterGroup)

    const availableGroups = filterBranch ? groups.filter(g => g.branch_id === filterBranch) : groups

    const generateAvailableGroups = generateBranch
        ? groups.filter(g => g.branch_id === generateBranch)
        : currentUser?.role === 'manager' && currentUser?.branch_id
            ? groups.filter(g => g.branch_id === currentUser.branch_id)
            : groups

    // ========== 等级计算 ==========

    function getScoreLevel(score: number | null) {
        if (score === null) return { label: '未评', class: 'badge-default' }
        if (score >= 90) return { label: '优秀', class: 'badge-success' }
        if (score >= 75) return { label: '良好', class: 'badge-info' }
        if (score >= 60) return { label: '合格', class: 'badge-warning' }
        return { label: '待改进', class: 'badge-danger' }
    }

    // 实时计算预估得分
    function calcPreviewScore(emp: EmployeeData) {
        const attendanceScore = emp.required_attendance > 0 ? (emp.actual_attendance / emp.required_attendance) * 100 : 100
        const onsiteScore = (emp.onsite_performance / 5) * 100
        const accuracyScore = emp.total_inspected > 0 ? (1 - emp.total_errors / emp.total_inspected) * 100 : 100
        const errorDeduction = emp.minor_error_count * 3

        // 默认权重：出勤20%, 标注25%, 现场15%, 准确率30%, 低级错9%
        const score =
            (attendanceScore * 20 / 100) +
            (emp.annotation_score * 25 / 100) +
            (onsiteScore * 15 / 100) +
            (accuracyScore * 30 / 100) -
            (errorDeduction * 10 / 100)

        return Math.max(0, Math.min(100, score)).toFixed(1)
    }

    const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager'

    // ========== 渲染 ==========

    return (
        <div className="page-container">
            <header className="page-header">
                <div><h1>绩效记录</h1></div>
                {canEdit && (
                    <button className="btn-primary" onClick={openGenerateModal}>📊 生成绩效</button>
                )}
            </header>

            {/* 筛选栏 */}
            <div className="filter-bar">
                <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
                    <option value="">全部周期</option>
                    {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {currentUser?.role === 'admin' && (
                    <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterGroup('') }}>
                        <option value="">全部子公司</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                )}
                <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
                    <option value="">全部小组</option>
                    {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
            </div>

            {/* 数据表格 */}
            <div className="table-container">
                {loading ? (
                    <div className="loading">加载中...</div>
                ) : filteredRecords.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📈</span>
                        <h3>暂无绩效记录</h3>
                        <p>点击"生成绩效"按钮为小组生成绩效记录</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>周期</th><th>员工</th><th>子公司</th><th>小组</th>
                                <th>出勤</th><th>现场表现</th><th>标注得分</th><th>低级错误</th><th>准确率</th><th>得分</th><th>等级</th><th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((record) => {
                                const level = getScoreLevel(record.final_score)
                                const accuracy = record.total_inspected > 0
                                    ? ((1 - record.total_errors / record.total_inspected) * 100).toFixed(1)
                                    : '-'

                                return (
                                    <tr key={record.id}>
                                        <td><span className="badge">{record.period}</span></td>
                                        <td>{record.user?.name || '-'}</td>
                                        <td>{record.branch?.name || '-'}</td>
                                        <td>{record.group?.name || '-'}</td>
                                        <td>{record.actual_attendance}/{record.required_attendance}</td>
                                        <td>{record.onsite_performance}</td>
                                        <td>{record.annotation_score}</td>
                                        <td>{record.minor_error_count}</td>
                                        <td>{accuracy}%</td>
                                        <td className="score-cell">{record.final_score?.toFixed(1) || '-'}</td>
                                        <td><span className={`badge ${level.class}`}>{level.label}</span></td>
                                        <td>
                                            <button className="btn-icon" onClick={() => showDetails(record)}>👁️</button>
                                            {canEdit && (
                                                <>
                                                    <button className="btn-icon" onClick={() => openEditModal(record)}>✏️</button>
                                                    <button className="btn-icon danger" onClick={() => handleDelete(record.id, record.user?.name || '')}>🗑️</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 详情弹窗 */}
            {showDetailModal && selectedRecord && (
                <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <h2>绩效详情 - {selectedRecord.period}</h2>
                        <div className="detail-grid">
                            <div className="detail-section">
                                <h3>📊 出勤 (权重 {selectedRecord.weight_attendance}%)</h3>
                                <p>实际出勤: <strong>{selectedRecord.actual_attendance}</strong> 天</p>
                                <p>应出勤: <strong>{selectedRecord.required_attendance}</strong> 天</p>
                                <p>出勤率: <strong>{(selectedRecord.actual_attendance / selectedRecord.required_attendance * 100).toFixed(1)}%</strong></p>
                            </div>
                            <div className="detail-section">
                                <h3>📝 标注得分 (权重 {selectedRecord.weight_annotation}%)</h3>
                                <p>得分: <strong>{selectedRecord.annotation_score}</strong> 分</p>
                            </div>
                            <div className="detail-section">
                                <h3>⭐ 现场表现 (权重 {selectedRecord.weight_onsite}%)</h3>
                                <p>评分: <strong>{selectedRecord.onsite_performance}</strong> / 5</p>
                            </div>
                            <div className="detail-section">
                                <h3>🎯 准确率 (权重 {selectedRecord.weight_accuracy}%)</h3>
                                <p>质检题目: <strong>{selectedRecord.total_inspected}</strong></p>
                                <p>错误题目: <strong>{selectedRecord.total_errors}</strong></p>
                                <p>准确率: <strong>{selectedRecord.total_inspected > 0 ? ((1 - selectedRecord.total_errors / selectedRecord.total_inspected) * 100).toFixed(2) : '-'}%</strong></p>
                            </div>
                            <div className="detail-section">
                                <h3>⚠️ 低级错误 (权重 {selectedRecord.weight_errors}%)</h3>
                                <p>错误次数: <strong>{selectedRecord.minor_error_count}</strong></p>
                                <p>扣分: <strong>-{selectedRecord.minor_error_count * 3}</strong> 分</p>
                            </div>
                            <div className="detail-section final-score">
                                <h3>📈 最终得分</h3>
                                <p className="big-score">{selectedRecord.final_score?.toFixed(2) || '-'}</p>
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => setShowDetailModal(false)}>关闭</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 生成绩效弹窗 */}
            {showGenerateModal && (
                <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '1100px' }}>
                        <h2>📊 生成绩效</h2>

                        <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                                <label>考核周期 *</label>
                                <select value={generatePeriod} onChange={e => { setGeneratePeriod(e.target.value); setEmployeeDataList([]) }}>
                                    {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            {currentUser?.role === 'admin' && (
                                <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                                    <label>选择子公司</label>
                                    <select value={generateBranch} onChange={e => { setGenerateBranch(e.target.value); setGenerateGroup(''); setEmployeeDataList([]) }}>
                                        <option value="">全部子公司</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                                <label>选择小组 *</label>
                                <select value={generateGroup} onChange={e => loadEmployeesForGroup(e.target.value)}>
                                    <option value="">请选择小组</option>
                                    {generateAvailableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {employeeDataList.length > 0 && (
                            <>
                                {/* 快捷设置区域 */}
                                <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={employeeDataList.every(e => e.selected)} onChange={e => toggleSelectAll(e.target.checked)} />
                                            全选
                                        </label>
                                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>出勤天数:</span>
                                            <input type="number" value={batchAttendance} onChange={e => setBatchAttendance(Number(e.target.value))} style={{ width: '50px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchAttendance}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>现场表现:</span>
                                            <input type="number" min="1" max="5" step="0.5" value={batchOnsite} onChange={e => setBatchOnsite(Number(e.target.value))} style={{ width: '50px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchOnsite}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>标注得分:</span>
                                            <input type="number" min="0" max="100" value={batchAnnotation} onChange={e => setBatchAnnotation(Number(e.target.value))} style={{ width: '50px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchAnnotation}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>低级错误:</span>
                                            <input type="number" min="0" value={batchMinorError} onChange={e => setBatchMinorError(Number(e.target.value))} style={{ width: '50px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => setEmployeeDataList(prev => prev.map(emp => ({ ...emp, minor_error_count: batchMinorError })))}>应用</button>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                                    <table className="data-table" style={{ fontSize: '12px' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ position: 'sticky', top: 0, width: '35px' }}>选择</th>
                                                <th style={{ position: 'sticky', top: 0 }}>员工</th>
                                                <th style={{ position: 'sticky', top: 0 }}>实际出勤</th>
                                                <th style={{ position: 'sticky', top: 0 }}>应出勤</th>
                                                <th style={{ position: 'sticky', top: 0 }}>现场表现</th>
                                                <th style={{ position: 'sticky', top: 0 }}>标注得分</th>
                                                <th style={{ position: 'sticky', top: 0 }}>低级错误</th>
                                                <th style={{ position: 'sticky', top: 0 }}>质检数</th>
                                                <th style={{ position: 'sticky', top: 0 }}>错题数</th>
                                                <th style={{ position: 'sticky', top: 0 }}>准确率</th>
                                                <th style={{ position: 'sticky', top: 0, color: '#10b981' }}>预估得分</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employeeDataList.map(emp => {
                                                const accuracy = emp.total_inspected > 0 ? ((1 - emp.total_errors / emp.total_inspected) * 100).toFixed(1) : '-'
                                                return (
                                                    <tr key={emp.user_id} style={{ opacity: emp.selected ? 1 : 0.5 }}>
                                                        <td><input type="checkbox" checked={emp.selected} onChange={e => updateEmployeeData(emp.user_id, 'selected', e.target.checked)} /></td>
                                                        <td><strong>{emp.name}</strong></td>
                                                        <td><input type="number" value={emp.actual_attendance} onChange={e => updateEmployeeData(emp.user_id, 'actual_attendance', Number(e.target.value))} style={{ width: '50px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="number" value={emp.required_attendance} onChange={e => updateEmployeeData(emp.user_id, 'required_attendance', Number(e.target.value))} style={{ width: '50px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="number" min="1" max="5" step="0.5" value={emp.onsite_performance} onChange={e => updateEmployeeData(emp.user_id, 'onsite_performance', Number(e.target.value))} style={{ width: '45px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="number" min="0" max="100" value={emp.annotation_score} onChange={e => updateEmployeeData(emp.user_id, 'annotation_score', Number(e.target.value))} style={{ width: '50px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="number" min="0" value={emp.minor_error_count} onChange={e => updateEmployeeData(emp.user_id, 'minor_error_count', Number(e.target.value))} style={{ width: '45px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td style={{ color: 'rgba(255,255,255,0.6)' }}>{emp.total_inspected}</td>
                                                        <td style={{ color: 'rgba(255,255,255,0.6)' }}>{emp.total_errors}</td>
                                                        <td style={{ color: 'rgba(255,255,255,0.6)' }}>{accuracy}%</td>
                                                        <td style={{ color: '#10b981', fontWeight: 600 }}>{calcPreviewScore(emp)}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>
                                    💡 质检数、错题数由系统自动汇总
                                </p>
                            </>
                        )}

                        <div className="form-actions" style={{ marginTop: '20px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowGenerateModal(false)}>取消</button>
                            <button type="button" className="btn-primary" onClick={handleGeneratePerformance} disabled={generating || employeeDataList.filter(e => e.selected).length === 0}>
                                {generating ? '生成中...' : `确认生成 (${employeeDataList.filter(e => e.selected).length}人)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 编辑绩效弹窗 */}
            {showEditModal && editRecord && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2>✏️ 修改绩效 - {editRecord.user_name}</h2>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>周期: {editRecord.period}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>实际出勤</label>
                                <input type="number" value={editRecord.actual_attendance} onChange={e => setEditRecord(prev => prev ? { ...prev, actual_attendance: Number(e.target.value) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>应出勤</label>
                                <input type="number" value={editRecord.required_attendance} onChange={e => setEditRecord(prev => prev ? { ...prev, required_attendance: Number(e.target.value) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>现场表现 (1-5)</label>
                                <input type="number" min="1" max="5" step="0.5" value={editRecord.onsite_performance} onChange={e => setEditRecord(prev => prev ? { ...prev, onsite_performance: Number(e.target.value) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>标注得分 (0-100)</label>
                                <input type="number" min="0" max="100" value={editRecord.annotation_score} onChange={e => setEditRecord(prev => prev ? { ...prev, annotation_score: Number(e.target.value) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>低级错误 (每次扣3分)</label>
                                <input type="number" min="0" value={editRecord.minor_error_count} onChange={e => setEditRecord(prev => prev ? { ...prev, minor_error_count: Number(e.target.value) } : null)} />
                            </div>
                        </div>

                        <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '8px' }}>系统数据（自动获取）：</p>
                            <p>质检数: <strong>{editRecord.total_inspected}</strong> | 错题数: <strong>{editRecord.total_errors}</strong></p>
                        </div>

                        <div className="form-actions" style={{ marginTop: '20px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>取消</button>
                            <button type="button" className="btn-secondary" onClick={handleRefreshQCData}>🔄 重新获取质检数据</button>
                            <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={saving}>
                                {saving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
