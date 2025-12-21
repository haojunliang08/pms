/**
 * 数据导入页面 - 导入质检数据
 * 
 * 【功能】
 * - 上传 Excel (.xlsx/.xls) 和 CSV/TXT 文件导入
 * - 手动粘贴文本数据导入
 * - 支持格式：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量
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
    const [selectedBranch, setSelectedBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // 手动输入弹窗
    const [showManualModal, setShowManualModal] = useState(false)
    const [manualText, setManualText] = useState('')

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

    // 处理导入数据（通用）
    async function processImport(rows: ExcelRow[]) {
        const nameToUser = new Map(users.filter(u => u.branch_id === selectedBranch).map(u => [u.name, u]))

        let success = 0, failed = 0
        const errors: string[] = []
        const batchMap = new Map<string, { user_id: string; inspection_date: string; topic: string; batch_name: string; inspected_count: number; error_count: number }>()

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

        for (const data of batchMap.values()) {
            const { error } = await supabase.from('quality_inspections').upsert({ ...data, branch_id: selectedBranch }, { onConflict: 'user_id,inspection_date,batch_name' })
            error ? (errors.push(`导入失败: ${error.message}`), failed++) : success++
        }

        return { success, failed, errors: errors.slice(0, 10) }
    }

    // 处理文件上传
    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !selectedBranch) { alert('请先选择子公司'); return }

        setImporting(true)
        setImportResult(null)

        try {
            const rows = await parseFile(file)
            const result = await processImport(rows)
            setImportResult(result)
            fetchData()
        } catch (err) {
            console.error('导入错误:', err)
            alert('导入失败，请检查文件格式')
        } finally {
            setImporting(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // 处理手动输入
    async function handleManualImport() {
        if (!selectedBranch) { alert('请先选择子公司'); return }
        if (!manualText.trim()) { alert('请输入数据'); return }

        setImporting(true)
        setImportResult(null)

        try {
            const rows = parseCSV(manualText)
            const result = await processImport(rows)
            setImportResult(result)
            setShowManualModal(false)
            setManualText('')
            fetchData()
        } catch (err) {
            console.error('导入错误:', err)
            alert('导入失败，请检查数据格式')
        } finally {
            setImporting(false)
        }
    }

    // ========== 解析函数 ==========

    async function parseFile(file: File): Promise<ExcelRow[]> {
        const fileName = file.name.toLowerCase()
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            return parseExcel(file)
        }
        const text = await readFileAsText(file)
        return parseCSV(text)
    }

    async function parseExcel(file: File): Promise<ExcelRow[]> {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const data: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        if (data.length === 0) return []

        let dataStartIndex = 0
        const firstValue = String(data[0][0] || '')
        if (firstValue === '日期' || !isValidDateFormat(firstValue)) {
            dataStartIndex = 1
        }

        return data.slice(dataStartIndex).filter(row => row.length > 0).map(row => ({
            日期: String(row[0] || ''),
            标注人员姓名: String(row[1] || ''),
            所属topic: String(row[2] || ''),
            批次名称: String(row[3] || ''),
            被质检题目数量: Number(row[4]) || 0,
            错误题目数量: Number(row[5]) || 0,
        }))
    }

    function readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsText(file, 'UTF-8')
        })
    }

    function parseCSV(text: string): ExcelRow[] {
        const lines = text.trim().split('\n').filter(line => line.trim())
        if (lines.length === 0) return []

        let dataStartIndex = 0
        const firstLineValues = lines[0].split(/[,\t]+|\s{2,}/).map(v => v.trim()).filter(Boolean)
        const firstValue = firstLineValues[0]
        if (firstValue === '日期' || !isValidDateFormat(firstValue)) {
            dataStartIndex = 1
        }

        return lines.slice(dataStartIndex).map(line => {
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

    function isValidDateFormat(str: string): boolean {
        if (!str) return false
        return /^\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}$/.test(str) || /^\d+$/.test(str)
    }

    function parseDate(dateStr: string): string | null {
        if (!dateStr) return null
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
            const [y, m, d] = dateStr.split('/')
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(dateStr)) {
            const [y, m, d] = dateStr.split('.')
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
        const num = Number(dateStr)
        if (!isNaN(num) && num > 0) return new Date((num - 25569) * 86400 * 1000).toISOString().split('T')[0]
        return null
    }

    return (
        <div className="page-container">
            <header className="page-header"><div><h1>数据导入</h1><p>导入质检数据</p></div></header>
            <div className="import-section">
                <div className="import-card">
                    <h3>📥 导入质检数据</h3>
                    <p className="import-hint">列格式：日期、标注人员姓名、所属topic、批次名称、被质检题目数量、错误题目数量</p>
                    <div className="import-controls">
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
                        <button className="btn-secondary" onClick={() => setShowManualModal(true)} disabled={importing || !selectedBranch}>
                            ✏️ 手动输入
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

            {/* 手动输入弹窗 */}
            {showManualModal && (
                <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                        <h2>✏️ 手动输入数据</h2>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '16px' }}>
                            每行一条数据，用空格或Tab分隔各列：<br />
                            <code style={{ color: '#10b981' }}>日期  姓名  topic  批次名称  质检数  错误数</code>
                        </p>
                        <textarea
                            value={manualText}
                            onChange={e => setManualText(e.target.value)}
                            placeholder={`示例：\n2025.12.1  张三  强化  测试批次1  30  2\n2025.12.1  李四  强化  测试批次2  35  1`}
                            style={{
                                width: '100%',
                                height: '250px',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.3)',
                                color: '#fff',
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                resize: 'vertical',
                            }}
                        />
                        <div className="form-actions" style={{ marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowManualModal(false)}>取消</button>
                            <button type="button" className="btn-primary" onClick={handleManualImport} disabled={importing || !manualText.trim()}>
                                {importing ? '导入中...' : '确认导入'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
