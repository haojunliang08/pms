/**
 * 绩效记录页面
 * 
 * 功能：
 * - 显示员工绩效记录列表
 * - 按周期、子公司、小组筛选
 * - 查看绩效详情和得分明细
 * - 员工可查看同小组成员的绩效（数据透明）
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { PerformanceRecord, Branch, Group, User } from '../types/database'
import './PageStyles.css'

export default function Performance() {
    const [records, setRecords] = useState<(PerformanceRecord & { user?: User; branch?: Branch; group?: Group })[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [loading, setLoading] = useState(true)
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [selectedRecord, setSelectedRecord] = useState<PerformanceRecord | null>(null)
    const [filterPeriod, setFilterPeriod] = useState('')
    const [filterBranch, setFilterBranch] = useState('')
    const [filterGroup, setFilterGroup] = useState('')

    // 生成最近12个月的周期选项
    const periodOptions = Array.from({ length: 12 }, (_, i) => {
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            const [recordsRes, branchesRes, groupsRes] = await Promise.all([
                supabase.from('performance_records')
                    .select('*, user:users(name, email), branch:branches(name), group:groups(name)')
                    .order('period', { ascending: false }),
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
            ])

            setRecords(recordsRes.data || [])
            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    function showDetails(record: PerformanceRecord) {
        setSelectedRecord(record)
        setShowDetailModal(true)
    }

    // 筛选逻辑
    let filteredRecords = records
    if (filterPeriod) {
        filteredRecords = filteredRecords.filter(r => r.period === filterPeriod)
    }
    if (filterBranch) {
        filteredRecords = filteredRecords.filter(r => r.branch_id === filterBranch)
    }
    if (filterGroup) {
        filteredRecords = filteredRecords.filter(r => r.group_id === filterGroup)
    }

    const availableGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : groups

    // 计算得分等级
    function getScoreLevel(score: number | null) {
        if (score === null) return { label: '未评', class: 'badge-default' }
        if (score >= 90) return { label: '优秀', class: 'badge-success' }
        if (score >= 75) return { label: '良好', class: 'badge-info' }
        if (score >= 60) return { label: '合格', class: 'badge-warning' }
        return { label: '待改进', class: 'badge-danger' }
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>绩效记录</h1>
                    <p>查看和管理员工绩效评估记录</p>
                </div>
                <button className="btn-primary" onClick={() => alert('功能开发中')}>📊 生成绩效</button>
            </header>

            {/* 筛选栏 */}
            <div className="filter-bar">
                <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
                    <option value="">全部周期</option>
                    {periodOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                </select>
                <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterGroup('') }}>
                    <option value="">全部子公司</option>
                    {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
                <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
                    <option value="">全部小组</option>
                    {availableGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                </select>
            </div>

            <div className="table-container">
                {loading ? (
                    <div className="loading">加载中...</div>
                ) : filteredRecords.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📈</span>
                        <h3>暂无绩效记录</h3>
                        <p>导入质检数据后可生成绩效记录</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>周期</th>
                                <th>员工</th>
                                <th>子公司</th>
                                <th>小组</th>
                                <th>出勤</th>
                                <th>标注量</th>
                                <th>准确率</th>
                                <th>得分</th>
                                <th>等级</th>
                                <th>操作</th>
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
                                        <td>{record.annotation_count}</td>
                                        <td>{accuracy}%</td>
                                        <td className="score-cell">{record.final_score?.toFixed(1) || '-'}</td>
                                        <td><span className={`badge ${level.class}`}>{level.label}</span></td>
                                        <td>
                                            <button className="btn-icon" onClick={() => showDetails(record)}>👁️</button>
                                            <button className="btn-icon">✏️</button>
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
                                <h3>📝 标注数量 (权重 {selectedRecord.weight_annotation}%)</h3>
                                <p>完成数量: <strong>{selectedRecord.annotation_count}</strong></p>
                                <p>目标数量: <strong>{selectedRecord.annotation_target}</strong></p>
                                <p>完成率: <strong>{(selectedRecord.annotation_count / selectedRecord.annotation_target * 100).toFixed(1)}%</strong></p>
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
                        {selectedRecord.remarks && (
                            <div className="remarks-section">
                                <h3>📝 备注</h3>
                                <p>{selectedRecord.remarks}</p>
                            </div>
                        )}
                        <div className="form-actions">
                            <button type="button" className="btn-secondary" onClick={() => setShowDetailModal(false)}>关闭</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
