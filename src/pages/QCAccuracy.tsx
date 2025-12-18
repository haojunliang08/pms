/**
 * 质检准确率页面
 * 
 * 功能：
 * - 显示质检数据及准确率
 * - 根据角色过滤数据：admin全部, manager子公司, employee小组
 * - 准确率达标(>=95%)显示绿色，不达标显示红色
 * - 支持筛选和排序功能
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { QualityInspection, Branch, Group, User } from '../types/database'
import './PageStyles.css'

// 准确率要求标准
const ACCURACY_THRESHOLD = 95

interface ExtendedQCRecord extends QualityInspection {
    user?: User & { group?: Group }
    branch?: Branch
}

export default function QCAccuracy() {
    const { user: currentUser } = useAuth()
    const [records, setRecords] = useState<ExtendedQCRecord[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [loading, setLoading] = useState(true)

    // 筛选状态
    const [filterDateStart, setFilterDateStart] = useState('')
    const [filterDateEnd, setFilterDateEnd] = useState('')
    const [filterBranch, setFilterBranch] = useState('')
    const [filterGroup, setFilterGroup] = useState('')
    const [filterEmployee, setFilterEmployee] = useState('')

    // 用于员工筛选的员工列表
    const [employees, setEmployees] = useState<User[]>([])

    useEffect(() => {
        fetchData()
    }, [currentUser])

    async function fetchData() {
        if (!currentUser) return

        try {
            setLoading(true)

            // 获取筛选选项数据
            const [branchesRes, groupsRes, employeesRes] = await Promise.all([
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
                supabase.from('users').select('*').eq('role', 'employee').order('name'),
            ])

            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
            setEmployees(employeesRes.data || [])

            // 构建质检数据查询
            let query = supabase
                .from('quality_inspections')
                .select(`
                    *,
                    user:users(id, name, email, group_id, branch_id, group:groups(id, name, branch_id)),
                    branch:branches(id, name)
                `)
                .order('inspection_date', { ascending: false })

            // 根据角色过滤数据
            if (currentUser.role === 'manager') {
                // 项目经理只能看到所属子公司的数据
                if (currentUser.branch_id) {
                    query = query.eq('branch_id', currentUser.branch_id)
                }
            } else if (currentUser.role === 'employee') {
                // 员工只能看到所属小组的数据
                // 需要先获取同小组的所有员工ID
                if (currentUser.group_id) {
                    const { data: groupMembers } = await supabase
                        .from('users')
                        .select('id')
                        .eq('group_id', currentUser.group_id)

                    if (groupMembers && groupMembers.length > 0) {
                        const memberIds = groupMembers.map(m => m.id)
                        query = query.in('user_id', memberIds)
                    }
                }
            }
            // admin 不需要过滤

            const { data: qcData, error } = await query

            if (error) {
                console.error('获取质检数据失败:', error)
            } else {
                setRecords(qcData || [])
            }
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    // 计算准确率
    function calculateAccuracy(inspected: number, errors: number): number {
        if (inspected <= 0) return 0
        return ((inspected - errors) / inspected) * 100
    }

    // 获取准确率显示样式
    function getAccuracyStyle(accuracy: number): { className: string; label: string } {
        if (accuracy >= ACCURACY_THRESHOLD) {
            return { className: 'accuracy-pass', label: '达标' }
        }
        return { className: 'accuracy-fail', label: '不达标' }
    }

    // 应用筛选
    let filteredRecords = records

    // 日期筛选
    if (filterDateStart) {
        filteredRecords = filteredRecords.filter(r => r.inspection_date >= filterDateStart)
    }
    if (filterDateEnd) {
        filteredRecords = filteredRecords.filter(r => r.inspection_date <= filterDateEnd)
    }

    // 子公司筛选
    if (filterBranch) {
        filteredRecords = filteredRecords.filter(r => r.branch_id === filterBranch)
    }

    // 小组筛选
    if (filterGroup) {
        filteredRecords = filteredRecords.filter(r => r.user?.group_id === filterGroup)
    }

    // 员工筛选
    if (filterEmployee) {
        filteredRecords = filteredRecords.filter(r => r.user_id === filterEmployee)
    }

    // 根据当前用户角色过滤筛选选项

    const availableGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : currentUser?.role === 'employee'
            ? groups.filter(g => g.id === currentUser?.group_id)
            : currentUser?.role === 'manager'
                ? groups.filter(g => g.branch_id === currentUser?.branch_id)
                : groups

    const availableEmployees = filterGroup
        ? employees.filter(e => e.group_id === filterGroup)
        : filterBranch
            ? employees.filter(e => e.branch_id === filterBranch)
            : currentUser?.role === 'employee'
                ? employees.filter(e => e.group_id === currentUser?.group_id)
                : currentUser?.role === 'manager'
                    ? employees.filter(e => e.branch_id === currentUser?.branch_id)
                    : employees

    // 清除筛选
    function clearFilters() {
        setFilterDateStart('')
        setFilterDateEnd('')
        setFilterBranch('')
        setFilterGroup('')
        setFilterEmployee('')
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>质检准确率</h1>
                    <p>查看质检数据及准确率统计（标准：≥{ACCURACY_THRESHOLD}% 达标）</p>
                </div>
            </header>

            {/* 筛选栏 */}
            <div className="filter-bar">
                <div className="filter-group">
                    <label>开始日期</label>
                    <input
                        type="date"
                        value={filterDateStart}
                        onChange={e => setFilterDateStart(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <label>结束日期</label>
                    <input
                        type="date"
                        value={filterDateEnd}
                        onChange={e => setFilterDateEnd(e.target.value)}
                    />
                </div>
                {/* 只有 admin 能看到子公司选择器 */}
                {currentUser?.role === 'admin' && (
                    <select
                        value={filterBranch}
                        onChange={e => { setFilterBranch(e.target.value); setFilterGroup(''); setFilterEmployee('') }}
                    >
                        <option value="">全部子公司</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}
                {/* admin 和 manager 能看到小组选择器，employee 不能 */}
                {currentUser?.role !== 'employee' && (
                    <select
                        value={filterGroup}
                        onChange={e => { setFilterGroup(e.target.value); setFilterEmployee('') }}
                    >
                        <option value="">全部小组</option>
                        {availableGroups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                )}
                {/* 所有角色都能选择员工 */}
                <select
                    value={filterEmployee}
                    onChange={e => setFilterEmployee(e.target.value)}
                >
                    <option value="">全部员工</option>
                    {availableEmployees.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                </select>
                <button className="btn-secondary" onClick={clearFilters}>清除筛选</button>
            </div>

            <div className="table-container">
                {loading ? (
                    <div className="loading">加载中...</div>
                ) : filteredRecords.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🎯</span>
                        <h3>暂无质检数据</h3>
                        <p>导入质检数据后可查看准确率</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>质检日期</th>
                                <th>员工</th>
                                <th>子公司</th>
                                <th>小组</th>
                                <th>Topic</th>
                                <th>批次</th>
                                <th>质检数</th>
                                <th>错误数</th>
                                <th>准确率</th>
                                <th>达标状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((record) => {
                                const accuracy = calculateAccuracy(record.inspected_count, record.error_count)
                                const accuracyStyle = getAccuracyStyle(accuracy)

                                return (
                                    <tr key={record.id}>
                                        <td><span className="badge">{record.inspection_date}</span></td>
                                        <td>{record.user?.name || '-'}</td>
                                        <td>{record.branch?.name || '-'}</td>
                                        <td>{record.user?.group?.name || '-'}</td>
                                        <td>{record.topic || '-'}</td>
                                        <td>{record.batch_name || '-'}</td>
                                        <td>{record.inspected_count}</td>
                                        <td>{record.error_count}</td>
                                        <td className={accuracyStyle.className}>
                                            <strong>{accuracy.toFixed(1)}%</strong>
                                        </td>
                                        <td>
                                            <span className={`badge ${accuracy >= ACCURACY_THRESHOLD ? 'badge-success' : 'badge-danger'}`}>
                                                {accuracyStyle.label}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 统计信息 */}
            {!loading && filteredRecords.length > 0 && (
                <div className="stats-summary">
                    <p>
                        共 <strong>{filteredRecords.length}</strong> 条记录 |
                        达标 <strong style={{ color: 'var(--success)' }}>
                            {filteredRecords.filter(r => calculateAccuracy(r.inspected_count, r.error_count) >= ACCURACY_THRESHOLD).length}
                        </strong> 条 |
                        不达标 <strong style={{ color: 'var(--danger)' }}>
                            {filteredRecords.filter(r => calculateAccuracy(r.inspected_count, r.error_count) < ACCURACY_THRESHOLD).length}
                        </strong> 条
                    </p>
                </div>
            )}

            <style>{`
                .accuracy-pass {
                    color: var(--success, #10b981);
                    font-weight: 600;
                }
                .accuracy-fail {
                    color: var(--danger, #ef4444);
                    font-weight: 600;
                }
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .filter-group label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                }
                .filter-group input[type="date"] {
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    background: rgba(255, 255, 255, 0.05);
                    color: #fff;
                }
                .stats-summary {
                    margin-top: 16px;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                    text-align: center;
                    color: rgba(255, 255, 255, 0.8);
                }
            `}</style>
        </div>
    )
}
