/**
 * 数据导入页面
 * 
 * 功能：
 * - 上传 Excel 文件导入质检数据
 * - 支持的格式：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量
 * - 自动合并重复批次
 * - 导入后自动更新绩效记录
 */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch, User, QualityInspection } from '../types/database'
import './PageStyles.css'

// Excel 数据行类型
interface ExcelRow {
    日期: string
    标注人员姓名: string
    所属topic: string
    批次名称: string
    被质检题目数量: number
    错误题目数量: number
}

export default function ImportData() {
    const [branches, setBranches] = useState<Branch[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [recentImports, setRecentImports] = useState<QualityInspection[]>([])
    const [selectedBranch, setSelectedBranch] = useState('')
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            const [branchesRes, usersRes, importsRes] = await Promise.all([
                supabase.from('branches').select('*').order('name'),
                supabase.from('users').select('*').eq('role', 'employee').order('name'),
                supabase.from('quality_inspections')
                    .select('*, user:users(name)')
                    .order('created_at', { ascending: false })
                    .limit(50),
            ])

            setBranches(branchesRes.data || [])
            setUsers(usersRes.data || [])
            setRecentImports(importsRes.data || [])
        } catch (error) {
            console.error('获取数据失败:', error)
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (!selectedBranch) {
            alert('请先选择子公司')
            return
        }

        setImporting(true)
        setImportResult(null)

        try {
            // 使用 FileReader 读取文件
            const text = await readFileAsText(file)
            const rows = parseCSV(text)

            // 创建姓名到用户ID的映射
            const nameToUser = new Map(users.filter(u => u.branch_id === selectedBranch).map(u => [u.name, u]))

            let success = 0
            let failed = 0
            const errors: string[] = []

            // 按批次合并数据
            const batchMap = new Map<string, {
                user_id: string
                inspection_date: string
                topic: string
                batch_name: string
                inspected_count: number
                error_count: number
            }>()

            for (const row of rows) {
                const user = nameToUser.get(row.标注人员姓名)
                if (!user) {
                    errors.push(`找不到员工: ${row.标注人员姓名}`)
                    failed++
                    continue
                }

                // 解析日期
                const date = parseDate(row.日期)
                if (!date) {
                    errors.push(`日期格式错误: ${row.日期}`)
                    failed++
                    continue
                }

                // 生成唯一键（用户+日期+批次）
                const key = `${user.id}-${date}-${row.批次名称}`

                if (batchMap.has(key)) {
                    // 合并同批次数据
                    const existing = batchMap.get(key)!
                    existing.inspected_count += Number(row.被质检题目数量) || 0
                    existing.error_count += Number(row.错误题目数量) || 0
                } else {
                    batchMap.set(key, {
                        user_id: user.id,
                        inspection_date: date,
                        topic: row.所属topic,
                        batch_name: row.批次名称,
                        inspected_count: Number(row.被质检题目数量) || 0,
                        error_count: Number(row.错误题目数量) || 0,
                    })
                }
            }

            // 批量插入或更新
            for (const data of batchMap.values()) {
                const { error } = await supabase
                    .from('quality_inspections')
                    .upsert({
                        ...data,
                        branch_id: selectedBranch,
                    }, {
                        onConflict: 'user_id,inspection_date,batch_name',
                    })

                if (error) {
                    errors.push(`导入失败: ${error.message}`)
                    failed++
                } else {
                    success++
                }
            }

            setImportResult({ success, failed, errors: errors.slice(0, 10) })
            fetchData() // 刷新列表
        } catch (error) {
            console.error('导入失败:', error)
            alert('导入失败，请检查文件格式')
        } finally {
            setImporting(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    // 读取文件为文本
    function readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsText(file)
        })
    }

    // 解析 CSV（简单实现，支持 Tab 和逗号分隔）
    function parseCSV(text: string): ExcelRow[] {
        const lines = text.trim().split('\n')
        if (lines.length < 2) return []

        const headers = lines[0].split(/[,\t]/).map(h => h.trim())
        const rows: ExcelRow[] = []

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(/[,\t]/).map(v => v.trim())
            const row: Record<string, string | number> = {}
            headers.forEach((h, idx) => {
                row[h] = values[idx] || ''
            })
            rows.push(row as unknown as ExcelRow)
        }

        return rows
    }

    // 解析日期（支持多种格式）
    function parseDate(dateStr: string): string | null {
        if (!dateStr) return null

        // 尝试 YYYY-MM-DD 格式
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr
        }

        // 尝试 YYYY/MM/DD 格式
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
            const [y, m, d] = dateStr.split('/')
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }

        // 尝试 Excel 日期序列号
        const num = Number(dateStr)
        if (!isNaN(num) && num > 0) {
            const date = new Date((num - 25569) * 86400 * 1000)
            return date.toISOString().split('T')[0]
        }

        return null
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>数据导入</h1>
                    <p>导入 Excel 质检数据，自动计算准确率</p>
                </div>
            </header>

            {/* 导入区域 */}
            <div className="import-section">
                <div className="import-card">
                    <h3>📥 导入质检数据</h3>
                    <p className="import-hint">
                        支持 CSV 或 Excel 导出的文本文件<br />
                        列格式：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量
                    </p>

                    <div className="import-controls">
                        <select
                            value={selectedBranch}
                            onChange={e => setSelectedBranch(e.target.value)}
                            className="branch-select"
                        >
                            <option value="">选择子公司 *</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt,.tsv"
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />

                        <button
                            className="btn-primary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={importing || !selectedBranch}
                        >
                            {importing ? '导入中...' : '📁 选择文件'}
                        </button>
                    </div>

                    {/* 导入结果 */}
                    {importResult && (
                        <div className={`import-result ${importResult.failed > 0 ? 'has-errors' : ''}`}>
                            <p>✅ 成功导入 <strong>{importResult.success}</strong> 条记录</p>
                            {importResult.failed > 0 && (
                                <>
                                    <p>❌ 失败 <strong>{importResult.failed}</strong> 条</p>
                                    <ul className="error-list">
                                        {importResult.errors.map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 最近导入记录 */}
            <div className="recent-imports">
                <h3>最近导入记录</h3>
                <div className="table-container">
                    {recentImports.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📥</span>
                            <h3>暂无导入记录</h3>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>日期</th>
                                    <th>员工</th>
                                    <th>Topic</th>
                                    <th>批次</th>
                                    <th>质检数</th>
                                    <th>错误数</th>
                                    <th>导入时间</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentImports.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.inspection_date}</td>
                                        <td>{(item as any).user?.name || '-'}</td>
                                        <td>{item.topic || '-'}</td>
                                        <td>{item.batch_name || '-'}</td>
                                        <td>{item.inspected_count}</td>
                                        <td>{item.error_count}</td>
                                        <td>{new Date(item.created_at).toLocaleString('zh-CN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
