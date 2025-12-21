/**
 * 质检准确率页面 - 展示质检数据及准确率统计
 * 
 * 【功能】
 * - 展示所有质检记录（准确率 = (质检数-错误数)/质检数）
 * - 达标标准：准确率 >= 95%（绿色显示），否则红色
 * - 数据可见性：admin全部 / manager本子公司 / employee本小组
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { QualityInspection, Branch, Group, User } from '../types/database'
import './PageStyles.css'

const ACCURACY_THRESHOLD = 95 // 准确率达标阈值

interface ExtendedQCRecord extends QualityInspection {
    user?: User & { group?: Group }
    branch?: Branch
}

export default function QCAccuracy() {
    const { user: currentUser } = useAuth()
    const [records, setRecords] = useState<ExtendedQCRecord[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [employees, setEmployees] = useState<User[]>([])
    const [loading, setLoading] = useState(true)

    // 默认日期范围：当月1号 到 今天
    const today = new Date()
    const firstDayOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const [filterDateStart, setFilterDateStart] = useState(firstDayOfMonth)
    const [filterDateEnd, setFilterDateEnd] = useState(todayStr)
    const [filterBranch, setFilterBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [filterGroup, setFilterGroup] = useState('')
    const [filterEmployee, setFilterEmployee] = useState('')

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

            // 构建查询，根据角色添加过滤条件
            // 使用 groups!users_group_id_fkey 指定外键关系，避免歧义
            let query = supabase.from('quality_inspections')
                .select(`*, user:users(id, name, email, group_id, branch_id, group:groups!users_group_id_fkey(id, name, branch_id)), branch:branches(id, name)`)
                .order('inspection_date', { ascending: true })  // 按日期升序排列

            if (currentUser.role === 'manager' && currentUser.branch_id) {
                query = query.eq('branch_id', currentUser.branch_id)
            } else if (currentUser.role === 'employee' && currentUser.group_id) {
                const { data: groupMembers } = await supabase.from('users').select('id').eq('group_id', currentUser.group_id)
                if (groupMembers?.length) query = query.in('user_id', groupMembers.map(m => m.id))
            }

            const { data, error } = await query
            if (error) {
                console.error('查询错误:', error)
            }
            setRecords(data || [])
        } finally { setLoading(false) }
    }

    // 计算准确率
    const calcAccuracy = (inspected: number, errors: number) => inspected > 0 ? ((inspected - errors) / inspected) * 100 : 0

    // 应用筛选
    let filteredRecords = records
    if (filterDateStart) filteredRecords = filteredRecords.filter(r => r.inspection_date >= filterDateStart)
    if (filterDateEnd) filteredRecords = filteredRecords.filter(r => r.inspection_date <= filterDateEnd)
    if (filterBranch) filteredRecords = filteredRecords.filter(r => r.branch_id === filterBranch)
    if (filterGroup) filteredRecords = filteredRecords.filter(r => r.user?.group_id === filterGroup)
    if (filterEmployee) filteredRecords = filteredRecords.filter(r => r.user_id === filterEmployee)

    const availableGroups = filterBranch ? groups.filter(g => g.branch_id === filterBranch) : groups
    const availableEmployees = filterGroup ? employees.filter(e => e.group_id === filterGroup) : employees

    return (
        <div className="page-container">
            <header className="page-header"><div><h1>质检准确率</h1><p>标准：≥{ACCURACY_THRESHOLD}% 达标</p></div></header>
            <div className="filter-bar">
                <div className="filter-group"><label>开始日期</label><input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} /></div>
                <div className="filter-group"><label>结束日期</label><input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} /></div>
                {currentUser?.role === 'admin' && <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterGroup(''); setFilterEmployee('') }}><option value="">全部子公司</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
                {currentUser?.role !== 'employee' && <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterEmployee('') }}><option value="">全部小组</option>{availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
                <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}><option value="">全部员工</option>{availableEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                <button className="btn-secondary" onClick={() => { setFilterDateStart(firstDayOfMonth); setFilterDateEnd(todayStr); setFilterBranch(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : ''); setFilterGroup(''); setFilterEmployee('') }}>重置筛选</button>
            </div>
            <div className="table-container">
                {loading ? <div className="loading">加载中...</div> : filteredRecords.length === 0 ? (
                    <div className="empty-state"><span className="empty-icon">🎯</span><h3>暂无质检数据</h3></div>
                ) : (
                    <table className="data-table">
                        <thead><tr><th>日期</th><th>员工</th><th>子公司</th><th>小组</th><th>Topic</th><th>批次</th><th>质检数</th><th>错误数</th><th>准确率</th><th>状态</th></tr></thead>
                        <tbody>{filteredRecords.map((r) => {
                            const acc = calcAccuracy(r.inspected_count, r.error_count)
                            return (<tr key={r.id}><td><span className="badge">{r.inspection_date}</span></td><td>{r.user?.name || '-'}</td><td>{r.branch?.name || '-'}</td><td>{r.user?.group?.name || '-'}</td><td>{r.topic || '-'}</td><td>{r.batch_name || '-'}</td><td>{r.inspected_count}</td><td>{r.error_count}</td><td className={acc >= ACCURACY_THRESHOLD ? 'accuracy-pass' : 'accuracy-fail'}><strong>{acc.toFixed(1)}%</strong></td><td><span className={`badge ${acc >= ACCURACY_THRESHOLD ? 'badge-success' : 'badge-danger'}`}>{acc >= ACCURACY_THRESHOLD ? '达标' : '不达标'}</span></td></tr>)
                        })}</tbody>
                    </table>
                )}
            </div>
            {!loading && filteredRecords.length > 0 && <div className="stats-summary"><p>共 <strong>{filteredRecords.length}</strong> 条 | 达标 <strong style={{ color: 'var(--success)' }}>{filteredRecords.filter(r => calcAccuracy(r.inspected_count, r.error_count) >= ACCURACY_THRESHOLD).length}</strong> | 不达标 <strong style={{ color: 'var(--danger)' }}>{filteredRecords.filter(r => calcAccuracy(r.inspected_count, r.error_count) < ACCURACY_THRESHOLD).length}</strong></p></div>}
            <style>{`.accuracy-pass { color: var(--success, #10b981); font-weight: 600; } .accuracy-fail { color: var(--danger, #ef4444); font-weight: 600; } .filter-group { display: flex; flex-direction: column; gap: 4px; } .filter-group label { font-size: 12px; color: rgba(255,255,255,0.6); } .filter-group input[type="date"] { padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; } .stats-summary { margin-top: 16px; padding: 12px 16px; background: rgba(255,255,255,0.03); border-radius: 8px; text-align: center; color: rgba(255,255,255,0.8); }`}</style>
        </div>
    )
}
