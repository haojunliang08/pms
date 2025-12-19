/**
 * ============================================================================
 * Dashboard.tsx - 仪表盘页面（首页）
 * ============================================================================
 * 
 * 【文件作用】
 * 系统首页，展示关键业务指标统计卡片。
 * 用户登录后第一个看到的页面。
 * 
 * 【展示内容】
 * - 子公司数量
 * - 小组数量
 * - 员工总数
 * - 平均绩效得分
 * 
 * 【数据获取模式】
 * 使用 useEffect 钩子在组件挂载时发起多个并行查询。
 * Promise.all 同时执行多个异步操作，提高加载效率。
 * 
 * 【性能优化技巧】
 * - 使用 count: 'exact' 只获取数量，不获取数据本身
 * - 使用 head: true 不返回实际数据，只返回统计信息
 * - 并行查询而非串行，减少总等待时间
 */

// ============================================================================
// 导入部分
// ============================================================================

/** useState 管理统计数据和加载状态 */
import { useState, useEffect } from 'react'

/** Supabase 客户端，用于数据库查询 */
import { supabase } from '../lib/supabase'

/** 导入仪表盘专用样式 */
import './Dashboard.css'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 统计数据类型接口
 * 
 * 定义 stats 状态的数据结构
 */
interface Stats {
    totalEmployees: number   // 员工总数
    totalGroups: number      // 小组数量
    totalBranches: number    // 子公司数量
    avgScore: number         // 平均绩效得分
}

// ============================================================================
// 组件定义
// ============================================================================

export default function Dashboard() {
    // =========== 状态定义 ===========

    /**
     * 统计数据状态
     * 
     * 使用 useState<Stats> 指定状态类型
     * 初始值为各项都是 0 的对象
     */
    const [stats, setStats] = useState<Stats>({
        totalEmployees: 0,
        totalGroups: 0,
        totalBranches: 0,
        avgScore: 0,
    })

    /** 加载状态，用于显示加载指示器 */
    const [loading, setLoading] = useState(true)

    // =========== 副作用：加载数据 ===========

    /**
     * useEffect 在组件挂载后执行
     * 
     * 空依赖数组 [] 表示只在挂载时执行一次
     * 类似于 class 组件的 componentDidMount
     */
    useEffect(() => {
        fetchStats()
    }, [])

    // =========== 数据获取函数 ===========

    /**
     * 获取统计数据
     * 
     * 使用 async/await 处理多个异步查询
     */
    async function fetchStats() {
        try {
            /**
             * Promise.all 并行执行多个 Promise
             * 
             * 优点：所有查询同时发起，总时间 = 最慢的一个查询时间
             * 对比：串行执行总时间 = 所有查询时间之和
             * 
             * 解构赋值获取各个查询结果
             */
            const [employeesRes, groupsRes, branchesRes, performanceRes] = await Promise.all([
                /**
                 * 查询员工总数
                 * 
                 * .from('users') - 指定查询的表
                 * .select('id', { count: 'exact', head: true }) - 配置说明：
                 *   - 'id' 是随便选一个字段
                 *   - count: 'exact' 返回精确的行数
                 *   - head: true 不返回实际数据行，只返回统计
                 * .eq('role', 'employee') - 只统计角色为 employee 的用户
                 * 
                 * 结果：{ count: number, data: null }
                 */
                supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'employee'),

                /** 查询小组总数 */
                supabase.from('groups').select('id', { count: 'exact', head: true }),

                /** 查询子公司总数 */
                supabase.from('branches').select('id', { count: 'exact', head: true }),

                /**
                 * 查询绩效记录，用于计算平均分
                 * 
                 * .not('final_score', 'is', null) - 过滤条件：final_score 不为 null
                 * 这样只获取已计算得分的记录
                 * 
                 * 注意：这里没有用 head: true，因为需要数据来计算平均值
                 */
                supabase.from('performance_records').select('final_score').not('final_score', 'is', null),
            ])

            // ===== 计算平均绩效得分 =====

            // 获取成绩数组，如果为 null 则使用空数组
            const scores = performanceRes.data || []

            // 计算平均值
            // reduce 累加所有成绩，然后除以数量
            const avgScore = scores.length > 0
                ? scores.reduce((sum, r) => sum + (r.final_score || 0), 0) / scores.length
                : 0  // 没有数据时返回 0
            /**
             * reduce 方法说明
             * 
             * array.reduce((累加器, 当前元素) => 返回新累加器, 初始值)
             * 
             * 例子：[80, 90, 100].reduce((sum, score) => sum + score, 0)
             * 执行过程：
             * 1. sum=0, score=80, 返回 80
             * 2. sum=80, score=90, 返回 170
             * 3. sum=170, score=100, 返回 270
             * 最终：270 / 3 = 90
             */

            // ===== 更新状态 =====

            setStats({
                // .count 是 Supabase 返回的行数统计
                totalEmployees: employeesRes.count || 0,
                totalGroups: groupsRes.count || 0,
                totalBranches: branchesRes.count || 0,
                // 四舍五入保留一位小数：Math.round(x * 10) / 10
                avgScore: Math.round(avgScore * 10) / 10,
            })
        } catch (error) {
            // 打印错误信息，方便调试
            console.error('获取统计数据失败:', error)
        } finally {
            // finally 块无论成功失败都会执行
            // 确保加载状态被设置为 false
            setLoading(false)
        }
    }

    // =========== 统计卡片配置 ===========

    /**
     * 统计卡片数据配置
     * 
     * 将数据和显示配置分离：
     * - label: 显示标签
     * - value: 显示值（从 stats 中取）
     * - icon: emoji 图标
     * - color: 强调色
     */
    const statCards = [
        { label: '子公司数量', value: stats.totalBranches, icon: '🏢', color: '#667eea' },
        { label: '小组数量', value: stats.totalGroups, icon: '👥', color: '#f093fb' },
        { label: '员工总数', value: stats.totalEmployees, icon: '👤', color: '#4facfe' },
        { label: '平均绩效', value: stats.avgScore, icon: '📈', color: '#43e97b' },
    ]

    // =========== 渲染 ===========

    return (
        <div className="dashboard">
            {/* 页面头部 */}
            <header className="page-header">
                <h1>仪表盘</h1>
                <p>欢迎使用绩效管理系统</p>
            </header>

            {/* 统计卡片网格 */}
            <div className="stats-grid">
                {/* 遍历卡片配置，渲染每个卡片 */}
                {statCards.map((card) => (
                    <div
                        key={card.label}  // 使用 label 作为唯一 key
                        className="stat-card"
                        /**
                         * 使用 CSS 变量设置强调色
                         * 
                         * style={{ '--accent-color': card.color }} 设置 CSS 变量
                         * 在 CSS 中可以用 var(--accent-color) 引用
                         * 
                         * as React.CSSProperties 是类型断言
                         * 告诉 TypeScript 这是有效的样式对象
                         * （因为 CSS 变量不是标准的 CSSProperties 属性）
                         */
                        style={{ '--accent-color': card.color } as React.CSSProperties}
                    >
                        {/* 图标 */}
                        <div className="stat-icon">{card.icon}</div>
                        {/* 数据信息 */}
                        <div className="stat-info">
                            {/* 数值：加载中显示 ...，否则显示实际值 */}
                            <span className="stat-value">{loading ? '...' : card.value}</span>
                            {/* 标签 */}
                            <span className="stat-label">{card.label}</span>
                        </div>
                    </div>
                ))}
            </div>


        </div>
    )
}
