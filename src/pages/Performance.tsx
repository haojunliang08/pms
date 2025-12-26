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
 * 【评分权重】
 * - 标注数量: 20%
 * - 出勤: 20%
 * - 现场表现: 20%
 * - 准确率: 40%
 * - 加减分项: 直接加减
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PerformanceRecord, Branch, Group, User } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import './PageStyles.css'

// 员工数据类型
interface EmployeeData {
    user_id: string
    name: string
    selected: boolean           // 是否选中生成绩效
    batchSelected: boolean      // 是否选中批量应用
    actual_attendance: number
    required_attendance: number
    annotation_score: number    // 标注得分 (0-100)
    onsite_performance: number  // 现场表现 (1-5)
    total_inspected: number     // 自动获取
    total_errors: number        // 自动获取
    deduction_points: number    // 减分项
    deduction_reason: string    // 减分原因
    bonus_points: number        // 加分项
    bonus_reason: string        // 加分原因
}

export default function Performance() {
    const { user: currentUser } = useAuth()
    const navigate = useNavigate()

    // ========== 基础数据 ==========
    const [records, setRecords] = useState<(PerformanceRecord & { user?: User; branch?: Branch; group?: Group })[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [employees, setEmployees] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set())

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
    const [sortOrder, setSortOrder] = useState<string[]>([])  // 存储排序后的 user_id 顺序

    // ========== 快捷设置值 ==========
    const [batchAttendance, setBatchAttendance] = useState(22)
    const [batchOnsite, setBatchOnsite] = useState(5)
    const [batchAnnotation, setBatchAnnotation] = useState(20)  // 默认20分
    const [batchDeduction, setBatchDeduction] = useState(0)
    const [batchDeductionReason, setBatchDeductionReason] = useState('')
    const [batchBonus, setBatchBonus] = useState(0)
    const [batchBonusReason, setBatchBonusReason] = useState('')

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
        deduction_points: number
        deduction_reason: string
        bonus_points: number
        bonus_reason: string
    } | null>(null)

    // ========== 周期选项 ==========
    const periodOptions = Array.from({ length: 12 }, (_, i) => {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })
    const lastMonth = periodOptions[1]

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
        const [year, month] = period.split('-').map(Number)
        const lastDay = new Date(year, month, 0).getDate()
        const periodEnd = `${period}-${String(lastDay).padStart(2, '0')}`

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
        setSortOrder([])
        setBatchAttendance(22)
        setBatchAnnotation(20)  // 默认20分
        setBatchOnsite(5)
        setBatchDeduction(0)
        setBatchDeductionReason('')
        setBatchBonus(0)
        setBatchBonusReason('')
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
                batchSelected: true,
                actual_attendance: batchAttendance,
                required_attendance: 22,
                annotation_score: batchAnnotation,  // 使用批量设置的值（默认20）
                onsite_performance: 5,
                total_inspected: qc.inspected,
                total_errors: qc.errors,
                deduction_points: 0,
                deduction_reason: '',
                bonus_points: 0,
                bonus_reason: '',
            }
        })

        setEmployeeDataList(dataList)
        // 自动按得分从高到低排序
        const sorted = [...dataList].sort((a, b) => Number(calcPreviewScoreLocal(b)) - Number(calcPreviewScoreLocal(a)))
        setSortOrder(sorted.map(e => e.user_id))

        // 本地计算预估得分（加载时使用）
        function calcPreviewScoreLocal(emp: EmployeeData) {
            const attendanceScore = emp.required_attendance > 0 ? (emp.actual_attendance / emp.required_attendance) * 100 : 100
            const onsiteScore = (emp.onsite_performance / 5) * 100
            const accuracyScore = emp.total_inspected > 0 ? (1 - emp.total_errors / emp.total_inspected) * 100 : 100
            const baseScore =
                (emp.annotation_score * 20 / 100) +
                (attendanceScore * 20 / 100) +
                (onsiteScore * 20 / 100) +
                (accuracyScore * 40 / 100)
            return baseScore - emp.deduction_points + emp.bonus_points
        }
    }

    function updateEmployeeData(userId: string, field: string, value: number | boolean | string) {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.user_id === userId ? { ...emp, [field]: value } : emp
        ))
    }

    // 批量设置（只应用到勾选了batchSelected的员工）
    function applyBatchAttendance() {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.batchSelected ? { ...emp, actual_attendance: batchAttendance, required_attendance: batchAttendance } : emp
        ))
    }
    function applyBatchAnnotation() {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.batchSelected ? { ...emp, annotation_score: batchAnnotation } : emp
        ))
    }
    function applyBatchOnsite() {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.batchSelected ? { ...emp, onsite_performance: batchOnsite } : emp
        ))
    }
    function applyBatchDeduction() {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.batchSelected ? { ...emp, deduction_points: batchDeduction, deduction_reason: batchDeductionReason } : emp
        ))
    }
    function applyBatchBonus() {
        setEmployeeDataList(prev => prev.map(emp =>
            emp.batchSelected ? { ...emp, bonus_points: batchBonus, bonus_reason: batchBonusReason } : emp
        ))
    }

    function toggleSelectAll(selected: boolean) {
        setEmployeeDataList(prev => prev.map(emp => ({ ...emp, selected })))
    }
    function toggleBatchSelectAll(selected: boolean) {
        setEmployeeDataList(prev => prev.map(emp => ({ ...emp, batchSelected: selected })))
    }

    // 预览按钮 - 按得分排序（只更新排序顺序，不复制数据）
    function handlePreviewSort() {
        const sorted = [...employeeDataList].sort((a, b) => Number(calcPreviewScore(b)) - Number(calcPreviewScore(a)))
        setSortOrder(sorted.map(e => e.user_id))
    }

    // 根据排序顺序获取显示列表（始终从 employeeDataList 获取最新数据）
    function getDisplayList(): EmployeeData[] {
        if (sortOrder.length === 0) return employeeDataList
        return sortOrder.map(id => employeeDataList.find(e => e.user_id === id)!).filter(Boolean)
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
            let successCount = 0
            let failCount = 0
            const failedNames: string[] = []
            let lastError: unknown = null

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
                    deduction_points: emp.deduction_points,
                    deduction_reason: emp.deduction_reason || null,
                    bonus_points: emp.bonus_points,
                    bonus_reason: emp.bonus_reason || null,
                }

                const { error } = await supabase
                    .from('performance_records')
                    .upsert(recordData, { onConflict: 'user_id,period' })

                if (error) {
                    console.error('保存失败:', emp.name, error)
                    failCount++
                    failedNames.push(emp.name)
                    lastError = error
                } else {
                    successCount++
                }
            }

            if (failCount === 0) {
                alert('绩效生成成功！')
                setShowGenerateModal(false)
            } else if (successCount === 0) {
                // 全部失败
                const errorMsg = lastError && typeof lastError === 'object' && 'message' in lastError
                    ? (lastError as { message: string }).message
                    : '未知错误'
                alert(`绩效生成失败！\n失败人员: ${failedNames.join(', ')}\n错误信息: ${errorMsg}`)
            } else {
                // 部分成功
                alert(`部分生成成功！\n成功: ${successCount}人\n失败: ${failCount}人 (${failedNames.join(', ')})`)
                setShowGenerateModal(false)
            }
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
            deduction_points: record.deduction_points || 0,
            deduction_reason: record.deduction_reason || '',
            bonus_points: record.bonus_points || 0,
            bonus_reason: record.bonus_reason || '',
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
                    deduction_points: editRecord.deduction_points,
                    deduction_reason: editRecord.deduction_reason || null,
                    bonus_points: editRecord.bonus_points,
                    bonus_reason: editRecord.bonus_reason || null,
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

    // 批量删除
    async function handleBatchDelete() {
        if (selectedRecords.size === 0) {
            alert('请先选择要删除的记录')
            return
        }
        if (!confirm(`确定要删除选中的 ${selectedRecords.size} 条绩效记录吗？`)) return

        try {
            const { error } = await supabase
                .from('performance_records')
                .delete()
                .in('id', Array.from(selectedRecords))
            if (error) throw error
            alert('批量删除成功')
            setSelectedRecords(new Set())
            fetchData()
        } catch (error) {
            console.error('批量删除失败:', error)
            alert('批量删除失败')
        }
    }

    // 切换选择记录
    function toggleRecordSelection(recordId: string) {
        setSelectedRecords(prev => {
            const next = new Set(prev)
            if (next.has(recordId)) {
                next.delete(recordId)
            } else {
                next.add(recordId)
            }
            return next
        })
    }

    // 全选/取消全选
    function toggleAllRecords(checked: boolean) {
        if (checked) {
            setSelectedRecords(new Set(filteredRecords.map(r => r.id)))
        } else {
            setSelectedRecords(new Set())
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

    // 按得分从高到低排序
    filteredRecords = filteredRecords.sort((a, b) => (b.final_score || 0) - (a.final_score || 0))

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

    // 计算预估得分 - 新权重: 标注20% + 出勤20% + 现场20% + 准确率40%
    function calcPreviewScore(emp: EmployeeData) {
        const attendanceScore = emp.required_attendance > 0 ? (emp.actual_attendance / emp.required_attendance) * 100 : 100
        const onsiteScore = (emp.onsite_performance / 5) * 100
        const accuracyScore = emp.total_inspected > 0 ? (1 - emp.total_errors / emp.total_inspected) * 100 : 100

        // 新权重：标注20% + 出勤20% + 现场20% + 准确率40%
        const baseScore =
            (emp.annotation_score * 20 / 100) +
            (attendanceScore * 20 / 100) +
            (onsiteScore * 20 / 100) +
            (accuracyScore * 40 / 100)

        // 最终得分 = 基础分 - 减分 + 加分（无上下限）
        const score = baseScore - emp.deduction_points + emp.bonus_points

        return score.toFixed(2)
    }

    // 格式化数字输入 - 去除前导零
    function formatNumberInput(value: string): string {
        // 允许空字符串和负号（编辑中间状态）
        if (value === '' || value === '-') return value
        // 去除前导零（保留小数点前的单个0，如 0.5）
        const cleaned = value.replace(/^0+(?=\d)/, '')
        return cleaned === '' ? '0' : cleaned
    }

    // 将字符串转换为数字（用于最终计算和提交）
    function parseNumber(value: string | number): number {
        if (typeof value === 'number') return value
        if (value === '' || value === '-') return 0
        const num = parseFloat(value)
        return isNaN(num) ? 0 : num
    }

    const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager'

    // ========== 渲染 ==========

    return (
        <div className="page-container">
            <header className="page-header">
                <div><h1>绩效记录</h1></div>
                {canEdit && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {selectedRecords.size > 0 && (
                            <button className="btn-secondary" style={{ background: '#ef4444' }} onClick={handleBatchDelete}>
                                🗑️ 批量删除 ({selectedRecords.size})
                            </button>
                        )}
                        <button className="btn-primary" onClick={openGenerateModal}>📊 生成绩效</button>
                    </div>
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
                                {canEdit && (
                                    <th style={{ width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            checked={filteredRecords.length > 0 && selectedRecords.size === filteredRecords.length}
                                            onChange={e => toggleAllRecords(e.target.checked)}
                                        />
                                    </th>
                                )}
                                <th>周期</th><th>员工</th><th>子公司</th><th>小组</th>
                                <th>出勤</th><th>现场表现</th><th>标注得分</th><th>减分</th><th>加分</th><th>准确率</th><th>得分</th><th>等级</th><th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((record) => {
                                const level = getScoreLevel(record.final_score)
                                const accuracy = record.total_inspected > 0
                                    ? ((1 - record.total_errors / record.total_inspected) * 100).toFixed(2)
                                    : '-'

                                return (
                                    <tr key={record.id}>
                                        {canEdit && (
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRecords.has(record.id)}
                                                    onChange={() => toggleRecordSelection(record.id)}
                                                />
                                            </td>
                                        )}
                                        <td><span className="badge">{record.period}</span></td>
                                        <td>{record.user?.name || '-'}</td>
                                        <td>{record.branch?.name || '-'}</td>
                                        <td>{record.group?.name || '-'}</td>
                                        <td>{record.actual_attendance}/{record.required_attendance}</td>
                                        <td>{record.onsite_performance}</td>
                                        <td>{record.annotation_score}</td>
                                        <td style={{ color: record.deduction_points > 0 ? '#ef4444' : undefined }}>
                                            {record.deduction_points > 0 ? `-${record.deduction_points}` : '0'}
                                        </td>
                                        <td style={{ color: record.bonus_points > 0 ? '#10b981' : undefined }}>
                                            {record.bonus_points > 0 ? `+${record.bonus_points}` : '0'}
                                        </td>
                                        <td>
                                            <span
                                                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                                onClick={() => navigate(`/qc-accuracy?period=${record.period}&user=${record.user_id}`)}
                                            >
                                                {accuracy}%
                                            </span>
                                        </td>
                                        <td className="score-cell">{record.final_score?.toFixed(2) || '-'}</td>
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
                                <p>出勤率: <strong>{(selectedRecord.actual_attendance / selectedRecord.required_attendance * 100).toFixed(2)}%</strong></p>
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
                                <h3>➖ 减分项</h3>
                                <p>减分: <strong style={{ color: '#ef4444' }}>-{selectedRecord.deduction_points}</strong> 分</p>
                                {selectedRecord.deduction_reason && <p>原因: {selectedRecord.deduction_reason}</p>}
                            </div>
                            <div className="detail-section">
                                <h3>➕ 加分项</h3>
                                <p>加分: <strong style={{ color: '#10b981' }}>+{selectedRecord.bonus_points}</strong> 分</p>
                                {selectedRecord.bonus_reason && <p>原因: {selectedRecord.bonus_reason}</p>}
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
                <div className="modal-overlay">
                    <div className="modal modal-lg" style={{ maxWidth: '1500px' }}>
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
                                    <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={employeeDataList.every(e => e.selected)} onChange={e => toggleSelectAll(e.target.checked)} />
                                            全选生成
                                        </label>
                                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={employeeDataList.every(e => e.batchSelected)} onChange={e => toggleBatchSelectAll(e.target.checked)} />
                                            全选批量应用
                                        </label>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>出勤:</span>
                                            <input type="text" value={batchAttendance} onChange={e => setBatchAttendance(parseNumber(formatNumberInput(e.target.value)))} style={{ width: '45px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchAttendance}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>现场:</span>
                                            <input type="text" value={batchOnsite} onChange={e => setBatchOnsite(parseNumber(formatNumberInput(e.target.value)))} style={{ width: '45px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchOnsite}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>标注:</span>
                                            <input type="text" value={batchAnnotation} onChange={e => setBatchAnnotation(parseNumber(formatNumberInput(e.target.value)))} style={{ width: '45px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchAnnotation}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>减分:</span>
                                            <input type="text" value={batchDeduction} onChange={e => setBatchDeduction(parseNumber(formatNumberInput(e.target.value)))} style={{ width: '45px', padding: '4px' }} />
                                            <input type="text" placeholder="原因" value={batchDeductionReason} onChange={e => setBatchDeductionReason(e.target.value)} style={{ width: '80px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchDeduction}>应用</button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>加分:</span>
                                            <input type="text" value={batchBonus} onChange={e => setBatchBonus(parseNumber(formatNumberInput(e.target.value)))} style={{ width: '45px', padding: '4px' }} />
                                            <input type="text" placeholder="原因" value={batchBonusReason} onChange={e => setBatchBonusReason(e.target.value)} style={{ width: '80px', padding: '4px' }} />
                                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyBatchBonus}>应用</button>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                                    <table className="data-table" style={{ fontSize: '12px' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ position: 'sticky', top: 0, width: '35px' }}>生成</th>
                                                <th style={{ position: 'sticky', top: 0, width: '35px' }}>批量</th>
                                                <th style={{ position: 'sticky', top: 0 }}>员工</th>
                                                <th style={{ position: 'sticky', top: 0 }}>出勤</th>
                                                <th style={{ position: 'sticky', top: 0 }}>应出勤</th>
                                                <th style={{ position: 'sticky', top: 0 }}>现场</th>
                                                <th style={{ position: 'sticky', top: 0 }}>标注</th>
                                                <th style={{ position: 'sticky', top: 0 }}>减分</th>
                                                <th style={{ position: 'sticky', top: 0 }}>减分原因</th>
                                                <th style={{ position: 'sticky', top: 0 }}>加分</th>
                                                <th style={{ position: 'sticky', top: 0 }}>加分原因</th>
                                                <th style={{ position: 'sticky', top: 0 }}>质检数</th>
                                                <th style={{ position: 'sticky', top: 0 }}>错题数</th>
                                                <th style={{ position: 'sticky', top: 0 }}>准确率</th>
                                                <th style={{ position: 'sticky', top: 0, color: '#10b981' }}>预估得分</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getDisplayList().map(emp => {
                                                const accuracy = emp.total_inspected > 0 ? ((1 - emp.total_errors / emp.total_inspected) * 100).toFixed(2) : '-'
                                                return (
                                                    <tr key={emp.user_id} style={{ opacity: emp.selected ? 1 : 0.5 }}>
                                                        <td><input type="checkbox" checked={emp.selected} onChange={e => updateEmployeeData(emp.user_id, 'selected', e.target.checked)} /></td>
                                                        <td><input type="checkbox" checked={emp.batchSelected} onChange={e => updateEmployeeData(emp.user_id, 'batchSelected', e.target.checked)} /></td>
                                                        <td><strong>{emp.name}</strong></td>
                                                        <td><input type="text" value={emp.actual_attendance} onChange={e => updateEmployeeData(emp.user_id, 'actual_attendance', parseNumber(formatNumberInput(e.target.value)))} style={{ width: '40px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="text" value={emp.required_attendance} onChange={e => updateEmployeeData(emp.user_id, 'required_attendance', parseNumber(formatNumberInput(e.target.value)))} style={{ width: '40px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="text" value={emp.onsite_performance} onChange={e => updateEmployeeData(emp.user_id, 'onsite_performance', parseNumber(formatNumberInput(e.target.value)))} style={{ width: '40px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="text" value={emp.annotation_score} onChange={e => updateEmployeeData(emp.user_id, 'annotation_score', parseNumber(formatNumberInput(e.target.value)))} style={{ width: '40px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td><input type="text" value={emp.deduction_points} onChange={e => updateEmployeeData(emp.user_id, 'deduction_points', parseNumber(formatNumberInput(e.target.value)))} style={{ width: '40px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td>
                                                            {emp.deduction_points !== 0 ? (
                                                                <input
                                                                    type="text"
                                                                    placeholder="请输入原因"
                                                                    value={emp.deduction_reason}
                                                                    onChange={e => updateEmployeeData(emp.user_id, 'deduction_reason', e.target.value)}
                                                                    style={{ width: '80px', padding: '3px', fontSize: '11px' }}
                                                                    disabled={!emp.selected}
                                                                />
                                                            ) : (
                                                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>-</span>
                                                            )}
                                                        </td>
                                                        <td><input type="text" value={emp.bonus_points} onChange={e => updateEmployeeData(emp.user_id, 'bonus_points', parseNumber(formatNumberInput(e.target.value)))} style={{ width: '40px', padding: '3px' }} disabled={!emp.selected} /></td>
                                                        <td>
                                                            {emp.bonus_points !== 0 ? (
                                                                <input
                                                                    type="text"
                                                                    placeholder="请输入原因"
                                                                    value={emp.bonus_reason}
                                                                    onChange={e => updateEmployeeData(emp.user_id, 'bonus_reason', e.target.value)}
                                                                    style={{ width: '80px', padding: '3px', fontSize: '11px' }}
                                                                    disabled={!emp.selected}
                                                                />
                                                            ) : (
                                                                <span style={{ color: 'rgba(255,255,255,0.3)' }}>-</span>
                                                            )}
                                                        </td>
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
                                <p style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                    💡 质检数、错题数由系统自动汇总 | 权重：标注20% + 出勤20% + 现场20% + 准确率40%
                                </p>
                            </>
                        )}

                        <div className="form-actions" style={{ marginTop: '20px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowGenerateModal(false)}>取消</button>
                            <button type="button" className="btn-secondary" onClick={handlePreviewSort} style={{ fontSize: '12px' }}>
                                🔄 按得分排序预览
                            </button>
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
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                        <h2>✏️ 修改绩效 - {editRecord.user_name}</h2>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '20px' }}>周期: {editRecord.period}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>实际出勤</label>
                                <input type="text" value={editRecord.actual_attendance} onChange={e => setEditRecord(prev => prev ? { ...prev, actual_attendance: parseNumber(formatNumberInput(e.target.value)) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>应出勤</label>
                                <input type="text" value={editRecord.required_attendance} onChange={e => setEditRecord(prev => prev ? { ...prev, required_attendance: parseNumber(formatNumberInput(e.target.value)) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>现场表现 (1-5)</label>
                                <input type="text" value={editRecord.onsite_performance} onChange={e => setEditRecord(prev => prev ? { ...prev, onsite_performance: parseNumber(formatNumberInput(e.target.value)) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>标注得分 (0-100)</label>
                                <input type="text" value={editRecord.annotation_score} onChange={e => setEditRecord(prev => prev ? { ...prev, annotation_score: parseNumber(formatNumberInput(e.target.value)) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>减分项</label>
                                <input type="text" value={editRecord.deduction_points} onChange={e => setEditRecord(prev => prev ? { ...prev, deduction_points: parseNumber(formatNumberInput(e.target.value)) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>加分项</label>
                                <input type="text" value={editRecord.bonus_points} onChange={e => setEditRecord(prev => prev ? { ...prev, bonus_points: parseNumber(formatNumberInput(e.target.value)) } : null)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>减分原因</label>
                            <input type="text" value={editRecord.deduction_reason} onChange={e => setEditRecord(prev => prev ? { ...prev, deduction_reason: e.target.value } : null)} />
                        </div>
                        <div className="form-group">
                            <label>加分原因</label>
                            <input type="text" value={editRecord.bonus_reason} onChange={e => setEditRecord(prev => prev ? { ...prev, bonus_reason: e.target.value } : null)} />
                        </div>

                        <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '8px' }}>系统数据（自动获取）：</p>
                            <p>质检数: <strong>{editRecord.total_inspected}</strong> | 错题数: <strong>{editRecord.total_errors}</strong></p>
                        </div>

                        <div className="form-actions" style={{ marginTop: '20px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>取消</button>
                            <button type="button" className="btn-secondary" onClick={handleRefreshQCData}>🔄 刷新质检数据</button>
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
