/**
 * 仪表盘页面
 * 
 * 系统首页，显示关键业务指标：
 * - 员工总数、小组数量
 * - 本月绩效概览
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

interface Stats {
    totalEmployees: number
    totalGroups: number
    totalBranches: number
    avgScore: number
}

export default function Dashboard() {
    const [stats, setStats] = useState<Stats>({
        totalEmployees: 0,
        totalGroups: 0,
        totalBranches: 0,
        avgScore: 0,
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchStats()
    }, [])

    async function fetchStats() {
        try {
            // 并行查询统计数据
            const [employeesRes, groupsRes, branchesRes, performanceRes] = await Promise.all([
                supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'employee'),
                supabase.from('groups').select('id', { count: 'exact', head: true }),
                supabase.from('branches').select('id', { count: 'exact', head: true }),
                supabase.from('performance_records').select('final_score').not('final_score', 'is', null),
            ])

            // 计算平均绩效得分
            const scores = performanceRes.data || []
            const avgScore = scores.length > 0
                ? scores.reduce((sum, r) => sum + (r.final_score || 0), 0) / scores.length
                : 0

            setStats({
                totalEmployees: employeesRes.count || 0,
                totalGroups: groupsRes.count || 0,
                totalBranches: branchesRes.count || 0,
                avgScore: Math.round(avgScore * 10) / 10,
            })
        } catch (error) {
            console.error('获取统计数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    const statCards = [
        { label: '子公司数量', value: stats.totalBranches, icon: '🏢', color: '#667eea' },
        { label: '小组数量', value: stats.totalGroups, icon: '👥', color: '#f093fb' },
        { label: '员工总数', value: stats.totalEmployees, icon: '👤', color: '#4facfe' },
        { label: '平均绩效', value: stats.avgScore, icon: '📈', color: '#43e97b' },
    ]

    return (
        <div className="dashboard">
            <header className="page-header">
                <h1>仪表盘</h1>
                <p>欢迎使用绩效管理系统</p>
            </header>

            <div className="stats-grid">
                {statCards.map((card) => (
                    <div
                        key={card.label}
                        className="stat-card"
                        style={{ '--accent-color': card.color } as React.CSSProperties}
                    >
                        <div className="stat-icon">{card.icon}</div>
                        <div className="stat-info">
                            <span className="stat-value">{loading ? '...' : card.value}</span>
                            <span className="stat-label">{card.label}</span>
                        </div>
                    </div>
                ))}
            </div>


        </div>
    )
}
