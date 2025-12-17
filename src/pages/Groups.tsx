/**
 * 小组管理页面
 * 
 * 功能：
 * - 显示所有小组列表
 * - 按子公司筛选
 * - 添加、编辑、删除小组
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Group, Branch, User } from '../types/database'
import './PageStyles.css'

export default function Groups() {
    const [groups, setGroups] = useState<(Group & { branch?: Branch; manager?: User })[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [managers, setManagers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingGroup, setEditingGroup] = useState<Group | null>(null)
    const [formData, setFormData] = useState({ name: '', branch_id: '', manager_id: '' })
    const [filterBranch, setFilterBranch] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            const [groupsRes, branchesRes, managersRes] = await Promise.all([
                supabase.from('groups').select('*').order('created_at'),
                supabase.from('branches').select('*').order('name'),
                supabase.from('users').select('*').in('role', ['manager', 'admin']).order('name'),
            ])

            if (groupsRes.error || branchesRes.error || managersRes.error) return

            const branchMap = new Map(branchesRes.data?.map(b => [b.id, b]) || [])
            const managerMap = new Map(managersRes.data?.map(m => [m.id, m]) || [])

            const groupsWithRelations = (groupsRes.data || []).map(group => ({
                ...group,
                branch: group.branch_id ? branchMap.get(group.branch_id) : undefined,
                manager: group.manager_id ? managerMap.get(group.manager_id) : undefined,
            }))

            setGroups(groupsWithRelations)
            setBranches(branchesRes.data || [])
            setManagers(managersRes.data || [])
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    function openModal(group?: Group) {
        if (group) {
            setEditingGroup(group)
            setFormData({
                name: group.name,
                branch_id: group.branch_id,
                manager_id: group.manager_id || '',
            })
        } else {
            setEditingGroup(null)
            setFormData({ name: '', branch_id: branches[0]?.id || '', manager_id: '' })
        }
        setShowModal(true)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        try {
            const data = {
                name: formData.name,
                branch_id: formData.branch_id,
                manager_id: formData.manager_id || null,
            }

            if (editingGroup) {
                const { error } = await supabase.from('groups').update(data).eq('id', editingGroup.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('groups').insert(data)
                if (error) throw error
            }
            setShowModal(false)
            fetchData()
        } catch (error) {
            console.error('保存失败:', error)
            alert('保存失败，请重试')
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('确定要删除这个小组吗？')) return
        try {
            const { error } = await supabase.from('groups').delete().eq('id', id)
            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('删除失败:', error)
            alert('删除失败，请重试')
        }
    }

    // 根据筛选条件过滤
    const filteredGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : groups

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>小组管理</h1>
                    <p>管理各子公司下的工作小组</p>
                </div>
                <button className="btn-primary" onClick={() => openModal()}>➕ 添加小组</button>
            </header>

            {/* 筛选栏 */}
            <div className="filter-bar">
                <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                    <option value="">全部子公司</option>
                    {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            </div>

            <div className="table-container">
                {loading ? (
                    <div className="loading">加载中...</div>
                ) : filteredGroups.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">👥</span>
                        <h3>暂无小组数据</h3>
                        <p>点击上方按钮添加第一个小组</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>小组名称</th>
                                <th>所属子公司</th>
                                <th>负责人</th>
                                <th>创建时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredGroups.map((group) => (
                                <tr key={group.id}>
                                    <td>{group.name}</td>
                                    <td><span className="badge">{group.branch?.name || '-'}</span></td>
                                    <td>{group.manager?.name || '-'}</td>
                                    <td>{new Date(group.created_at).toLocaleDateString('zh-CN')}</td>
                                    <td>
                                        <button className="btn-icon" onClick={() => openModal(group)}>✏️</button>
                                        <button className="btn-icon danger" onClick={() => handleDelete(group.id)}>🗑️</button>
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
                        <h2>{editingGroup ? '编辑小组' : '添加小组'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>小组名称 *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="例如：标注一组"
                                />
                            </div>
                            <div className="form-group">
                                <label>所属子公司 *</label>
                                <select
                                    value={formData.branch_id}
                                    onChange={e => setFormData({ ...formData, branch_id: e.target.value })}
                                    required
                                >
                                    <option value="">请选择</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>负责人</label>
                                <select
                                    value={formData.manager_id}
                                    onChange={e => setFormData({ ...formData, manager_id: e.target.value })}
                                >
                                    <option value="">请选择</option>
                                    {managers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
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
