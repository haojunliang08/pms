/**
 * ============================================================================
 * Performance.tsx - 绩效记录页面
 * ============================================================================
 * 
 * 【文件作用】
 * 展示所有员工的绩效评估记录。
 * 支持按周期、子公司、小组筛选，可查看详细得分。
 * 
 * 【绩效计算说明】
 * 绩效由多个维度组成：
 * 1. 出勤率 - 实际出勤/应出勤
 * 2. 标注量 - 完成数量/目标数量
 * 3. 现场表现 - 1-5分评分
 * 4. 质检准确率 - (总质检数-错误数)/总质检数
 * 5. 低级错误 - 每次扣3分
 * 
 * 最终得分 = 各维度得分 × 权重 - 低级错误扣分
 * 
 * 【等级划分】
 * - 优秀：>=90分
 * - 良好：>=75分
 * - 合格：>=60分
 * - 待改进：<60分
 * 
 * 【技术点】
 * 1. 日期周期生成 - 动态生成最近12个月的选项
 * 2. 嵌套查询 - 使用 Supabase 的关联查询语法
 * 3. 条件渲染 - 根据不同状态显示不同 UI
 */

// ============================================================================
// 导入部分
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { PerformanceRecord, Branch, Group, User } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import './PageStyles.css'

// ============================================================================
// 组件定义
// ============================================================================

export default function Performance() {
    // =========== 获取当前用户信息 ===========
    const { user: currentUser } = useAuth()

    // =========== 状态定义 ===========

    /**
     * 绩效记录列表（带关联数据）
     * 
     * PerformanceRecord & { user?: User; branch?: Branch; group?: Group }
     * 表示绩效记录本身的属性 + 可选的关联数据
     */
    const [records, setRecords] = useState<(PerformanceRecord & { user?: User; branch?: Branch; group?: Group })[]>([])

    /** 子公司列表（用于筛选） */
    const [branches, setBranches] = useState<Branch[]>([])

    /** 小组列表（用于筛选） */
    const [groups, setGroups] = useState<Group[]>([])

    /** 加载状态 */
    const [loading, setLoading] = useState(true)

    /** 是否显示详情弹窗 */
    const [showDetailModal, setShowDetailModal] = useState(false)

    /** 选中的记录（用于详情展示） */
    const [selectedRecord, setSelectedRecord] = useState<PerformanceRecord | null>(null)

    /** 筛选条件 - 项目经理默认筛选自己的分公司 */
    const [filterPeriod, setFilterPeriod] = useState('')
    const [filterBranch, setFilterBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [filterGroup, setFilterGroup] = useState('')

    // =========== 周期选项生成 ===========

    /**
     * 生成最近12个月的周期选项
     * 
     * Array.from({ length: 12 }, (_, i) => ...) 创建长度为12的数组
     * _ 表示不使用的参数（值），i 是索引
     * 
     * 例如当前是 2024-03：
     * - i=0: 2024-03
     * - i=1: 2024-02
     * - i=11: 2023-04
     */
    const periodOptions = Array.from({ length: 12 }, (_, i) => {
        const date = new Date()
        // setMonth 设置月份，可以是负数（会自动调整年份）
        date.setMonth(date.getMonth() - i)
        // padStart(2, '0') 将数字补零到2位，如 1 -> '01'
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    })

    // =========== 生命周期 ===========

    useEffect(() => {
        fetchData()
    }, [])

    // =========== 数据获取 ===========

    async function fetchData() {
        try {
            const [recordsRes, branchesRes, groupsRes] = await Promise.all([
                /**
                 * Supabase 嵌套查询语法
                 * 
                 * select('*, user:users(name, email), branch:branches(name), group:groups(name)')
                 * 
                 * 解读：
                 * - * : 获取 performance_records 表的所有字段
                 * - user:users(name, email) : 通过 user_id 关联 users 表，只获取 name 和 email
                 * - branch:branches(name) : 通过 branch_id 关联 branches 表
                 * - group:groups(name) : 通过 group_id 关联 groups 表
                 * 
                 * 冒号前面是结果中的属性名，括号里是要获取的字段
                 */
                supabase.from('performance_records')
                    .select('*, user:users(name, email), branch:branches(name), group:groups(name)')
                    .order('period', { ascending: false }),  // 按周期降序（最新的在前面）
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
            ])

            let recordsData = recordsRes.data || []
            // ===== 数据隔离：项目经理只能看本分公司的绩效记录 =====
            if (currentUser?.role === 'manager') {
                recordsData = recordsData.filter(r => r.branch_id === currentUser.branch_id)
            }
            setRecords(recordsData)
            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    // =========== 详情展示 ===========

    function showDetails(record: PerformanceRecord) {
        setSelectedRecord(record)
        setShowDetailModal(true)
    }

    // =========== 筛选逻辑 ===========

    // 链式筛选：依次应用多个筛选条件
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

    // 联动筛选：根据选择的子公司过滤小组选项
    const availableGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : groups

    // =========== 得分等级计算 ===========

    /**
     * 根据分数计算评价等级
     * 
     * @param score - 绩效得分（可能为 null）
     * @returns 包含 label（中文等级）和 class（CSS类名）的对象
     */
    function getScoreLevel(score: number | null) {
        if (score === null) return { label: '未评', class: 'badge-default' }
        if (score >= 90) return { label: '优秀', class: 'badge-success' }
        if (score >= 75) return { label: '良好', class: 'badge-info' }
        if (score >= 60) return { label: '合格', class: 'badge-warning' }
        return { label: '待改进', class: 'badge-danger' }
    }

    // =========== 渲染 ===========

    return (
        <div className="page-container">
            {/* 页面头部 */}
            <header className="page-header">
                <div>
                    <h1>绩效记录</h1>
                    <p>查看和管理员工绩效评估记录</p>
                </div>
                <button className="btn-primary" onClick={() => alert('功能开发中')}>📊 生成绩效</button>
            </header>

            {/* 筛选栏 */}
            <div className="filter-bar">
                {/* 周期筛选 */}
                <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
                    <option value="">全部周期</option>
                    {periodOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                </select>
                {/* 子公司筛选 - 项目经理不显示 */}
                {currentUser?.role === 'admin' && (
                    <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterGroup('') }}>
                        <option value="">全部子公司</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}
                {/* 小组筛选 */}
                <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
                    <option value="">全部小组</option>
                    {availableGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
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
                                // 获取等级信息
                                const level = getScoreLevel(record.final_score)

                                // 计算准确率
                                // 三元表达式处理除零情况
                                const accuracy = record.total_inspected > 0
                                    ? ((1 - record.total_errors / record.total_inspected) * 100).toFixed(1)
                                    : '-'

                                return (
                                    <tr key={record.id}>
                                        <td><span className="badge">{record.period}</span></td>
                                        <td>{record.user?.name || '-'}</td>
                                        <td>{record.branch?.name || '-'}</td>
                                        <td>{record.group?.name || '-'}</td>
                                        {/* 出勤：实际/应出勤 */}
                                        <td>{record.actual_attendance}/{record.required_attendance}</td>
                                        <td>{record.annotation_count}</td>
                                        <td>{accuracy}%</td>
                                        {/* 得分：保留1位小数 */}
                                        <td className="score-cell">{record.final_score?.toFixed(1) || '-'}</td>
                                        {/* 等级 badge */}
                                        <td><span className={`badge ${level.class}`}>{level.label}</span></td>
                                        <td>
                                            {/* 查看详情按钮 */}
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
                    {/* modal-lg 表示大尺寸弹窗 */}
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <h2>绩效详情 - {selectedRecord.period}</h2>
                        {/* 使用网格布局展示各维度数据 */}
                        <div className="detail-grid">
                            {/* 出勤信息 */}
                            <div className="detail-section">
                                <h3>📊 出勤 (权重 {selectedRecord.weight_attendance}%)</h3>
                                <p>实际出勤: <strong>{selectedRecord.actual_attendance}</strong> 天</p>
                                <p>应出勤: <strong>{selectedRecord.required_attendance}</strong> 天</p>
                                <p>出勤率: <strong>{(selectedRecord.actual_attendance / selectedRecord.required_attendance * 100).toFixed(1)}%</strong></p>
                            </div>
                            {/* 标注数量 */}
                            <div className="detail-section">
                                <h3>📝 标注数量 (权重 {selectedRecord.weight_annotation}%)</h3>
                                <p>完成数量: <strong>{selectedRecord.annotation_count}</strong></p>
                                <p>目标数量: <strong>{selectedRecord.annotation_target}</strong></p>
                                <p>完成率: <strong>{(selectedRecord.annotation_count / selectedRecord.annotation_target * 100).toFixed(1)}%</strong></p>
                            </div>
                            {/* 现场表现 */}
                            <div className="detail-section">
                                <h3>⭐ 现场表现 (权重 {selectedRecord.weight_onsite}%)</h3>
                                <p>评分: <strong>{selectedRecord.onsite_performance}</strong> / 5</p>
                            </div>
                            {/* 准确率 */}
                            <div className="detail-section">
                                <h3>🎯 准确率 (权重 {selectedRecord.weight_accuracy}%)</h3>
                                <p>质检题目: <strong>{selectedRecord.total_inspected}</strong></p>
                                <p>错误题目: <strong>{selectedRecord.total_errors}</strong></p>
                                <p>准确率: <strong>{selectedRecord.total_inspected > 0 ? ((1 - selectedRecord.total_errors / selectedRecord.total_inspected) * 100).toFixed(2) : '-'}%</strong></p>
                            </div>
                            {/* 低级错误 */}
                            <div className="detail-section">
                                <h3>⚠️ 低级错误 (权重 {selectedRecord.weight_errors}%)</h3>
                                <p>错误次数: <strong>{selectedRecord.minor_error_count}</strong></p>
                                <p>扣分: <strong>-{selectedRecord.minor_error_count * 3}</strong> 分</p>
                            </div>
                            {/* 最终得分 */}
                            <div className="detail-section final-score">
                                <h3>📈 最终得分</h3>
                                <p className="big-score">{selectedRecord.final_score?.toFixed(2) || '-'}</p>
                            </div>
                        </div>
                        {/* 备注（如果有） */}
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
