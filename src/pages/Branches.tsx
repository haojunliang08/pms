/**
 * 子公司管理页面
 * 
 * 功能：
 * - 显示所有子公司/地区列表
 * - 添加、编辑、删除子公司
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types/database'
import './PageStyles.css'

export default function Branches() {
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
    const [formData, setFormData] = useState({ name: '', code: '' })

    useEffect(() => {
        fetchBranches()
    }, [])

    async function fetchBranches() {
        try {
            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .order('created_at', { ascending: true })

            if (error) throw error
            setBranches(data || [])
        } catch (error) {
            console.error('获取子公司列表失败:', error)
        } finally {
            setLoading(false)
        }
    }

    function openModal(branch?: Branch) {
        if (branch) {
            setEditingBranch(branch)
            setFormData({ name: branch.name, code: branch.code || '' })
        } else {
            setEditingBranch(null)
            setFormData({ name: '', code: '' })
        }
        setShowModal(true)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        try {
            if (editingBranch) {
                // 更新
                const { error } = await supabase
                    .from('branches')
                    .update({ name: formData.name, code: formData.code || null })
                    .eq('id', editingBranch.id)
                if (error) throw error
            } else {
                // 新增
                const { error } = await supabase
                    .from('branches')
                    .insert({ name: formData.name, code: formData.code || null })
                if (error) throw error
            }
            setShowModal(false)
            fetchBranches()
        } catch (error) {
            console.error('保存失败:', error)
            alert('保存失败，请重试')
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('确定要删除这个子公司吗？相关的小组和员工数据也会被删除。')) return
        try {
            const { error } = await supabase.from('branches').delete().eq('id', id)
            if (error) throw error
            fetchBranches()
        } catch (error) {
            console.error('删除失败:', error)
            alert('删除失败，请重试')
        }
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>子公司管理</h1>
                    <p>管理公司的各地区分支机构</p>
                </div>
                <button className="btn-primary" onClick={() => openModal()}>➕ 添加子公司</button>
            </header>

            <div className="table-container">
                {loading ? (
                    <div className="loading">加载中...</div>
                ) : branches.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🏢</span>
                        <h3>暂无子公司数据</h3>
                        <p>点击上方按钮添加第一个子公司</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>名称</th>
                                <th>编码</th>
                                <th>创建时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {branches.map((branch) => (
                                <tr key={branch.id}>
                                    <td>{branch.name}</td>
                                    <td><span className="badge">{branch.code || '-'}</span></td>
                                    <td>{new Date(branch.created_at).toLocaleDateString('zh-CN')}</td>
                                    <td>
                                        <button className="btn-icon" onClick={() => openModal(branch)}>✏️</button>
                                        <button className="btn-icon danger" onClick={() => handleDelete(branch.id)}>🗑️</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 弹窗表单 */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>{editingBranch ? '编辑子公司' : '添加子公司'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>名称 *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="例如：北京总部"
                                />
                            </div>
                            <div className="form-group">
                                <label>编码</label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                                    placeholder="例如：BJ"
                                />
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                                <button type="submit" className="btn-primary">保存</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
