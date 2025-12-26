/**
 * 质检准确率页面 - 展示质检数据及准确率统计
 * 
 * 【功能】
 * - 展示所有质检记录（准确率 = (质检数-错误数)/质检数）
 * - 达标标准：准确率 >= 95%
 * - 支持修改和删除（admin/manager）
 * - 默认显示当天数据，用户可选择日期范围（最多一个月）
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { QualityInspection, Branch, Group, User } from '../types/database'
import './PageStyles.css'

const ACCURACY_THRESHOLD = 95
const MAX_DATE_RANGE_DAYS = 31 // 最大日期范围（一个月）

interface ExtendedQCRecord extends QualityInspection {
    user?: User & { group?: Group }
    branch?: Branch
}

export default function QCAccuracy() {
    const { user: currentUser } = useAuth()
    const [searchParams] = useSearchParams()

    // 从 URL 获取参数（从绩效页面跳转来时）
    const urlPeriod = searchParams.get('period')  // 格式: 2025-11
    const urlUser = searchParams.get('user')      // user_id

    const [records, setRecords] = useState<ExtendedQCRecord[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [employees, setEmployees] = useState<User[]>([])
    const [loading, setLoading] = useState(true)

    // 编辑弹窗
    const [showEditModal, setShowEditModal] = useState(false)
    const [editRecord, setEditRecord] = useState<{
        id: string
        inspection_date: string
        topic: string
        batch_name: string
        inspected_count: number
        error_count: number
    } | null>(null)
    const [saving, setSaving] = useState(false)

    // 日期筛选 - 默认只显示当天数据（如果有URL参数则使用参数中的月份）
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const defaultStart = urlPeriod ? `${urlPeriod}-01` : todayStr
    const defaultEnd = urlPeriod ? `${urlPeriod}-31` : todayStr

    const [filterDateStart, setFilterDateStart] = useState(defaultStart)
    const [filterDateEnd, setFilterDateEnd] = useState(defaultEnd)
    const [filterBranch, setFilterBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [filterGroup, setFilterGroup] = useState('')
    const [filterEmployee, setFilterEmployee] = useState(urlUser || '')

    // 日期范围错误提示
    const [dateRangeError, setDateRangeError] = useState('')

    // 批量选择状态
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)

    // 验证日期范围是否超过一个月
    const validateDateRange = (start: string, end: string): boolean => {
        if (!start || !end) return true
        const startDate = new Date(start)
        const endDate = new Date(end)
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return diffDays <= MAX_DATE_RANGE_DAYS
    }

    // 处理日期变化，并验证范围
    const handleDateStartChange = (value: string) => {
        setFilterDateStart(value)
        if (!validateDateRange(value, filterDateEnd)) {
            setDateRangeError('日期范围不能超过一个月，请缩小范围以避免数据卡顿')
        } else {
            setDateRangeError('')
        }
    }

    const handleDateEndChange = (value: string) => {
        setFilterDateEnd(value)
        if (!validateDateRange(filterDateStart, value)) {
            setDateRangeError('日期范围不能超过一个月，请缩小范围以避免数据卡顿')
        } else {
            setDateRangeError('')
        }
    }

    useEffect(() => { fetchData() }, [currentUser])

    async function fetchData() {
        if (!currentUser) return
        try {
            setLoading(true)
            const [branchesRes, groupsRes, employeesRes] = await Promise.all([
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
                supabase.from('users').select('*').eq('role', 'employee').order('name'),
            ])

            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
            setEmployees(employeesRes.data || [])

            let query = supabase.from('quality_inspections')
                .select(`*, user:users(id, name, email, group_id, branch_id, group:groups!users_group_id_fkey(id, name, branch_id)), branch:branches(id, name)`)
                .order('inspection_date', { ascending: true })

            if (currentUser.role === 'manager' && currentUser.branch_id) {
                query = query.eq('branch_id', currentUser.branch_id)
            } else if (currentUser.role === 'employee' && currentUser.group_id) {
                const { data: groupMembers } = await supabase.from('users').select('id').eq('group_id', currentUser.group_id)
                if (groupMembers?.length) query = query.in('user_id', groupMembers.map(m => m.id))
            }

            const { data, error } = await query
            if (error) console.error('查询错误:', error)
            setRecords(data || [])
        } finally { setLoading(false) }
    }

    const calcAccuracy = (inspected: number, errors: number) => inspected > 0 ? ((inspected - errors) / inspected) * 100 : 0

    // 打开编辑弹窗
    function openEditModal(record: ExtendedQCRecord) {
        setEditRecord({
            id: record.id,
            inspection_date: record.inspection_date,
            topic: record.topic || '',
            batch_name: record.batch_name || '',
            inspected_count: record.inspected_count,
            error_count: record.error_count,
        })
        setShowEditModal(true)
    }

    // 保存编辑
    async function handleSaveEdit() {
        if (!editRecord) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('quality_inspections')
                .update({
                    inspection_date: editRecord.inspection_date,
                    topic: editRecord.topic,
                    batch_name: editRecord.batch_name,
                    inspected_count: editRecord.inspected_count,
                    error_count: editRecord.error_count,
                })
                .eq('id', editRecord.id)

            if (error) throw error
            alert('保存成功')
            setShowEditModal(false)
            fetchData()
        } catch (error) {
            console.error('保存失败:', error)
            alert('保存失败')
        } finally { setSaving(false) }
    }

    // 删除记录
    async function handleDelete(id: string) {
        if (!confirm('确定要删除这条记录吗？')) return
        try {
            const { error } = await supabase.from('quality_inspections').delete().eq('id', id)
            if (error) throw error
            alert('删除成功')
            fetchData()
        } catch (error) {
            console.error('删除失败:', error)
            alert('删除失败')
        }
    }

    // 批量删除 - 使用数据库批量删除
    async function handleBatchDelete() {
        if (selectedIds.size === 0) {
            alert('请先选择要删除的记录')
            return
        }
        if (!confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) return

        setDeleting(true)
        try {
            // 使用 in 条件一次性批量删除
            const { error } = await supabase
                .from('quality_inspections')
                .delete()
                .in('id', Array.from(selectedIds))

            if (error) throw error

            alert(`成功删除 ${selectedIds.size} 条记录`)
            setSelectedIds(new Set())
            fetchData()
        } catch (error) {
            console.error('批量删除失败:', error)
            alert('批量删除失败')
        } finally {
            setDeleting(false)
        }
    }

    // 切换单个选择
    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    // 筛选（日期范围超限时不显示数据，避免卡顿）
    const isDateRangeValid = validateDateRange(filterDateStart, filterDateEnd)
    let filteredRecords = isDateRangeValid ? records : []
    if (isDateRangeValid) {
        if (filterDateStart) filteredRecords = filteredRecords.filter(r => r.inspection_date >= filterDateStart)
        if (filterDateEnd) filteredRecords = filteredRecords.filter(r => r.inspection_date <= filterDateEnd)
        if (filterBranch) filteredRecords = filteredRecords.filter(r => r.branch_id === filterBranch)
        if (filterGroup) filteredRecords = filteredRecords.filter(r => r.user?.group_id === filterGroup)
        if (filterEmployee) filteredRecords = filteredRecords.filter(r => r.user_id === filterEmployee)
    }

    // 全选/取消全选
    function toggleSelectAll(checked: boolean) {
        if (checked) {
            setSelectedIds(new Set(filteredRecords.map(r => r.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const availableGroups = filterBranch ? groups.filter(g => g.branch_id === filterBranch) : groups
    const availableEmployees = filterGroup ? employees.filter(e => e.group_id === filterGroup) : employees

    // 权限判断
    const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager'

    return (
        <div className="page-container">
            <header className="page-header"><div><h1>质检准确率</h1><p>标准：≥{ACCURACY_THRESHOLD}% 达标</p></div></header>
            <div className="filter-bar">
                <div className="filter-group"><label>开始日期</label><input type="date" value={filterDateStart} onChange={e => handleDateStartChange(e.target.value)} /></div>
                <div className="filter-group"><label>结束日期</label><input type="date" value={filterDateEnd} onChange={e => handleDateEndChange(e.target.value)} /></div>
                {currentUser?.role === 'admin' && <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterGroup(''); setFilterEmployee('') }}><option value="">全部子公司</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
                {currentUser?.role !== 'employee' && <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterEmployee('') }}><option value="">全部小组</option>{availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}><option value="">全部员工</option>{availableEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                <button className="btn-secondary" onClick={() => { const t = new Date(); const todayReset = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; handleDateStartChange(todayReset); handleDateEndChange(todayReset); setFilterBranch(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : ''); setFilterGroup(''); setFilterEmployee('') }}>重置筛选</button>
            </div>
            {dateRangeError && <div className="date-range-error" style={{ padding: '12px 16px', marginBottom: '16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>⚠️ {dateRangeError}</div>}
            <div className="table-container">
                {loading ? <div className="loading">加载中...</div> : filteredRecords.length === 0 ? (
                    <div className="empty-state"><span className="empty-icon">🎯</span><h3>暂无质检数据</h3></div>
                ) : (
                    <>
                        {/* 批量操作栏 */}
                        {canEdit && (
                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                    className="btn-secondary"
                                    onClick={handleBatchDelete}
                                    disabled={deleting || selectedIds.size === 0}
                                    style={{ background: selectedIds.size > 0 ? 'var(--danger, #ef4444)' : undefined }}
                                >
                                    {deleting ? '删除中...' : `🗑️ 批量删除 ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                                </button>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
                                    共 {filteredRecords.length} 条记录
                                </span>
                            </div>
                        )}
                        <table className="data-table">
                            <thead><tr>
                                {canEdit && <th style={{ width: '40px' }}><input type="checkbox" checked={filteredRecords.length > 0 && filteredRecords.every(r => selectedIds.has(r.id))} onChange={e => toggleSelectAll(e.target.checked)} /></th>}
                                <th>日期</th><th>员工</th><th>子公司</th><th>小组</th><th>Topic</th><th>批次</th>
                                <th>质检数</th><th>错误数</th><th>准确率</th><th>状态</th>
                                {canEdit && <th>操作</th>}
                            </tr></thead>
                            <tbody>{filteredRecords.map((r) => {
                                const acc = calcAccuracy(r.inspected_count, r.error_count)
                                return (
                                    <tr key={r.id}>
                                        {canEdit && <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>}
                                        <td><span className="badge">{r.inspection_date}</span></td>
                                        <td>{r.user?.name || '-'}</td>
                                        <td>{r.branch?.name || '-'}</td>
                                        <td>{r.user?.group?.name || '-'}</td>
                                        <td>{r.topic || '-'}</td>
                                        <td>{r.batch_name || '-'}</td>
                                        <td>{r.inspected_count}</td>
                                        <td>{r.error_count}</td>
                                        <td className={acc >= ACCURACY_THRESHOLD ? 'accuracy-pass' : 'accuracy-fail'}><strong>{acc.toFixed(2)}%</strong></td>
                                        <td><span className={`badge ${acc >= ACCURACY_THRESHOLD ? 'badge-success' : 'badge-danger'}`}>{acc >= ACCURACY_THRESHOLD ? '达标' : '不达标'}</span></td>
                                        {canEdit && (
                                            <td>
                                                <button className="btn-icon" onClick={() => openEditModal(r)}>✏️</button>
                                                <button className="btn-icon danger" onClick={() => handleDelete(r.id)}>🗑️</button>
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}</tbody>
                        </table>
                    </>
                )}
            </div>
            {!loading && filteredRecords.length > 0 && <div className="stats-summary"><p>共 <strong>{filteredRecords.length}</strong> 条 | 达标 <strong style={{ color: 'var(--success)' }}>{filteredRecords.filter(r => calcAccuracy(r.inspected_count, r.error_count) >= ACCURACY_THRESHOLD).length}</strong> | 不达标 <strong style={{ color: 'var(--danger)' }}>{filteredRecords.filter(r => calcAccuracy(r.inspected_count, r.error_count) < ACCURACY_THRESHOLD).length}</strong></p></div>}

            {/* 编辑弹窗 */}
            {showEditModal && editRecord && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <h2>✏️ 修改质检记录</h2>
                        <div className="form-group">
                            <label>日期</label>
                            <input type="date" value={editRecord.inspection_date} onChange={e => setEditRecord(prev => prev ? { ...prev, inspection_date: e.target.value } : null)} />
                        </div>
                        <div className="form-group">
                            <label>Topic</label>
                            <input type="text" value={editRecord.topic} onChange={e => setEditRecord(prev => prev ? { ...prev, topic: e.target.value } : null)} />
                        </div>
                        <div className="form-group">
                            <label>批次名称</label>
                            <input type="text" value={editRecord.batch_name} onChange={e => setEditRecord(prev => prev ? { ...prev, batch_name: e.target.value } : null)} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>质检数</label>
                                <input type="number" value={editRecord.inspected_count} onChange={e => setEditRecord(prev => prev ? { ...prev, inspected_count: Number(e.target.value) } : null)} />
                            </div>
                            <div className="form-group">
                                <label>错误数</label>
                                <input type="number" value={editRecord.error_count} onChange={e => setEditRecord(prev => prev ? { ...prev, error_count: Number(e.target.value) } : null)} />
                            </div>
                        </div>
                        <div className="form-actions" style={{ marginTop: '20px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>取消</button>
                            <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`.accuracy-pass { color: var(--success, #10b981); font-weight: 600; } .accuracy-fail { color: var(--danger, #ef4444); font-weight: 600; } .filter-group { display: flex; flex-direction: column; gap: 4px; } .filter-group label { font-size: 12px; color: rgba(255,255,255,0.6); } .filter-group input[type="date"] { padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; } .stats-summary { margin-top: 16px; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 8px; text-align: center; color: rgba(255,255,255,0.8); }`}</style>
        </div>
    )
}
