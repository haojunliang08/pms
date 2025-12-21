/**
 * 数据导入页面 - 导入 Excel 质检数据
 * 
 * 【功能】
 * - 支持上传 Excel (.xlsx/.xls) 和 CSV/TXT 文件
 * - 支持格式：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量
 * - 自动合并同批次数据
 * 
 * 【技术点】
 * - xlsx 库解析 Excel 文件
 * - FileReader API 读取文件
 * - 日期格式转换（支持多种格式）
 * - Supabase upsert（有则更新，无则插入）
 */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch, User, QualityInspection } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import * as XLSX from 'xlsx'
import './PageStyles.css'

interface ExcelRow { 日期: string; 标注人员姓名: string; 所属topic: string; 批次名称: string; 被质检题目数量: number; 错误题目数量: number }

export default function ImportData() {
    const { user: currentUser } = useAuth()

    const [branches, setBranches] = useState<Branch[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [recentImports, setRecentImports] = useState<QualityInspection[]>([])
    // 项目经理默认选择自己的分公司
    const [selectedBranch, setSelectedBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null) // useRef 用于获取 DOM 元素引用

    useEffect(() => { fetchData() }, [])

    async function fetchData() {
        const [branchesRes, usersRes, importsRes] = await Promise.all([
            supabase.from('branches').select('*').order('name'),
            supabase.from('users').select('*').eq('role', 'employee').order('name'),
            supabase.from('quality_inspections').select('*, user:users(name)').order('created_at', { ascending: false }).limit(50),
        ])
        setBranches(branchesRes.data || [])
        setUsers(usersRes.data || [])
        setRecentImports(importsRes.data || [])
    }

    // 处理文件上传
    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !selectedBranch) { alert('请先选择子公司'); return }

        setImporting(true)
        setImportResult(null)

        try {
            // 根据文件类型选择解析方式
            const rows = await parseFile(file)
            const nameToUser = new Map(users.filter(u => u.branch_id === selectedBranch).map(u => [u.name, u]))

            let success = 0, failed = 0
            const errors: string[] = []
            const batchMap = new Map<string, { user_id: string; inspection_date: string; topic: string; batch_name: string; inspected_count: number; error_count: number }>()

            // 解析并合并数据
            for (const row of rows) {
                const user = nameToUser.get(row.标注人员姓名)
                if (!user) { errors.push(`找不到员工: ${row.标注人员姓名}`); failed++; continue }
                const date = parseDate(row.日期)
                if (!date) { errors.push(`日期格式错误: ${row.日期}`); failed++; continue }

                const key = `${user.id}-${date}-${row.批次名称}`
                if (batchMap.has(key)) {
                    const existing = batchMap.get(key)!
                    existing.inspected_count += Number(row.被质检题目数量) || 0
                    existing.error_count += Number(row.错误题目数量) || 0
                } else {
                    batchMap.set(key, { user_id: user.id, inspection_date: date, topic: row.所属topic, batch_name: row.批次名称, inspected_count: Number(row.被质检题目数量) || 0, error_count: Number(row.错误题目数量) || 0 })
                }
            }

            // 批量导入（upsert = 有则更新，无则插入）
            for (const data of batchMap.values()) {
                const { error } = await supabase.from('quality_inspections').upsert({ ...data, branch_id: selectedBranch }, { onConflict: 'user_id,inspection_date,batch_name' })
                error ? (errors.push(`导入失败: ${error.message}`), failed++) : success++
            }

            setImportResult({ success, failed, errors: errors.slice(0, 10) })
            fetchData()
        } catch (err) {
            console.error('导入错误:', err)
            alert('导入失败，请检查文件格式')
        }
        finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = '' }
    }

    /**
     * 解析文件（支持 Excel 和 CSV/TXT）
     */
    async function parseFile(file: File): Promise<ExcelRow[]> {
        const fileName = file.name.toLowerCase()

        // Excel 文件 (.xlsx, .xls)
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            return parseExcel(file)
        }

        // CSV/TXT 文件
        const text = await readFileAsText(file)
        return parseCSV(text)
    }

    /**
     * 解析 Excel 文件
     */
    async function parseExcel(file: File): Promise<ExcelRow[]> {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        // 转换为二维数组
        const data: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        if (data.length === 0) return []

        // 判断第一行是否是表头
        let dataStartIndex = 0
        const firstValue = String(data[0][0] || '')
        if (firstValue === '日期' || !isValidDateFormat(firstValue)) {
            dataStartIndex = 1
        }

        // 按列位置解析
        return data.slice(dataStartIndex).filter(row => row.length > 0).map(row => ({
            日期: String(row[0] || ''),
            标注人员姓名: String(row[1] || ''),
            所属topic: String(row[2] || ''),
            批次名称: String(row[3] || ''),
            被质检题目数量: Number(row[4]) || 0,
            错误题目数量: Number(row[5]) || 0,
        }))
    }

    // 读取文件为文本（Promise 包装 FileReader）
    function readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsText(file)
        })
    }

    /**
     * 解析 CSV/TSV（支持逗号、Tab、多空格分隔）
     * 
     * 数据格式要求（按列顺序）：
     * 日期 | 标注人员姓名 | 所属topic | 批次名称 | 被质检题目数量 | 错误题目数量
     * 
     * 如果第一行是表头（以"日期"开头），则自动跳过
     */
    function parseCSV(text: string): ExcelRow[] {
        const lines = text.trim().split('\n').filter(line => line.trim())
        if (lines.length === 0) return []

        // 判断第一行是否是表头（如果第一个字段是"日期"或不是有效日期格式，则认为是表头）
        let dataStartIndex = 0
        const firstLineValues = lines[0].split(/[,\t]+|\s{2,}/).map(v => v.trim()).filter(Boolean)
        const firstValue = firstLineValues[0]
        if (firstValue === '日期' || !isValidDateFormat(firstValue)) {
            dataStartIndex = 1  // 跳过表头
        }

        // 按列位置解析数据
        return lines.slice(dataStartIndex).map(line => {
            // 支持逗号、Tab、多个空格作为分隔符
            const values = line.split(/[,\t]+|\s{2,}/).map(v => v.trim()).filter(Boolean)
            return {
                日期: values[0] || '',
                标注人员姓名: values[1] || '',
                所属topic: values[2] || '',
                批次名称: values[3] || '',
                被质检题目数量: Number(values[4]) || 0,
                错误题目数量: Number(values[5]) || 0,
            } as ExcelRow
        })
    }

    // 检查是否是有效的日期格式
    function isValidDateFormat(str: string): boolean {
        if (!str) return false
        // 支持 YYYY-MM-DD, YYYY/M/D, YYYY.M.D, Excel日期序号
        return /^\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}$/.test(str) || /^\d+$/.test(str)
    }

    /**
     * 解析日期（支持多种格式）
     * - YYYY-MM-DD
     * - YYYY/M/D
     * - YYYY.M.D
     * - Excel日期序号
     */
    function parseDate(dateStr: string): string | null {
        if (!dateStr) return null
        // 标准格式 YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
        // 斜杠格式 YYYY/M/D
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
            const [y, m, d] = dateStr.split('/')
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        // 点号格式 YYYY.M.D
        if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(dateStr)) {
            const [y, m, d] = dateStr.split('.')
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        // Excel日期序号
        const num = Number(dateStr)
        if (!isNaN(num) && num > 0) return new Date((num - 25569) * 86400 * 1000).toISOString().split('T')[0]
        return null
    }

    return (
        <div className="page-container">
            <header className="page-header"><div><h1>数据导入</h1><p>导入 Excel 质检数据</p></div></header>
            <div className="import-section">
                <div className="import-card">
                    <h3>📥 导入质检数据</h3>
                    <p className="import-hint">列格式：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量</p>
                    <div className="import-controls">
                        {/* 项目经理不显示子公司选择器 */}
                        {currentUser?.role === 'admin' && (
                            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="branch-select">
                                <option value="">选择子公司 *</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        )}
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.tsv" onChange={handleFileUpload} style={{ display: 'none' }} />
                        <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={importing || !selectedBranch}>
                            {importing ? '导入中...' : '📁 选择文件'}
                        </button>
                    </div>
                    {importResult && (
                        <div className={`import-result ${importResult.failed > 0 ? 'has-errors' : ''}`}>
                            <p>✅ 成功 <strong>{importResult.success}</strong> 条</p>
                            {importResult.failed > 0 && <><p>❌ 失败 <strong>{importResult.failed}</strong> 条</p><ul className="error-list">{importResult.errors.map((err, i) => <li key={i}>{err}</li>)}</ul></>}
                        </div>
                    )}
                </div>
            </div>
            <div className="recent-imports">
                <h3>最近导入记录</h3>
                <div className="table-container">
                    {recentImports.length === 0 ? <div className="empty-state"><span className="empty-icon">📥</span><h3>暂无导入记录</h3></div> : (
                        <table className="data-table">
                            <thead><tr><th>日期</th><th>员工</th><th>Topic</th><th>批次</th><th>质检数</th><th>错误数</th><th>导入时间</th></tr></thead>
                            <tbody>{recentImports.map((item) => <tr key={item.id}><td>{item.inspection_date}</td><td>{(item as any).user?.name || '-'}</td><td>{item.topic || '-'}</td><td>{item.batch_name || '-'}</td><td>{item.inspected_count}</td><td>{item.error_count}</td><td>{new Date(item.created_at).toLocaleString('zh-CN')}</td></tr>)}</tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
