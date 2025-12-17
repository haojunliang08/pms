/**
 * 员工管理页面
 * 
 * 功能：
 * - 显示所有员工列表（支持按子公司/小组筛选）
 * - 添加、编辑、删除员工
 * - 显示员工角色和所属组织
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Branch, Group, UserRole } from '../types/database'
import { UserRoleLabels } from '../types/database'
import './PageStyles.css'

export default function Employees() {
    const [users, setUsers] = useState<(User & { branch?: Branch; group?: Group })[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'employee' as UserRole,
        branch_id: '',
        group_id: '',
    })
    const [filterBranch, setFilterBranch] = useState('')
    const [filterGroup, setFilterGroup] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            const [usersRes, branchesRes, groupsRes] = await Promise.all([
                supabase.from('users').select('*, branch:branches(*), group:groups(*)').order('name'),
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
            ])

            setUsers(usersRes.data || [])
            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    function openModal(user?: User) {
        if (user) {
            setEditingUser(user)
            setFormData({
                name: user.name,
                email: user.email || '',
                phone: user.phone || '',
                role: user.role,
                branch_id: user.branch_id || '',
                group_id: user.group_id || '',
            })
        } else {
            setEditingUser(null)
            setFormData({
                name: '',
                email: '',
                phone: '',
                role: 'employee',
                branch_id: '',
                group_id: '',
            })
        }
        setShowModal(true)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        try {
            const data = {
                name: formData.name,
                email: formData.email || null,
                phone: formData.phone || null,
                role: formData.role,
                branch_id: formData.branch_id || null,
                group_id: formData.group_id || null,
            }

            if (editingUser) {
                const { error } = await supabase.from('users').update(data).eq('id', editingUser.id)
                if (error) throw error
            } else {
                const { error } = await supabase.from('users').insert(data)
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
        if (!confirm('确定要删除这个员工吗？')) return
        try {
            const { error } = await supabase.from('users').delete().eq('id', id)
            if (error) throw error
            fetchData()
        } catch (error) {
            console.error('删除失败:', error)
            alert('删除失败，请重试')
        }
    }

    // 筛选逻辑
    let filteredUsers = users
    if (filterBranch) {
        filteredUsers = filteredUsers.filter(u => u.branch_id === filterBranch)
    }
    if (filterGroup) {
        filteredUsers = filteredUsers.filter(u => u.group_id === filterGroup)
    }

    // 根据选中的子公司过滤小组列表
    const availableGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : groups

    const formGroups = formData.branch_id
        ? groups.filter(g => g.branch_id === formData.branch_id)
        : groups

    return (
        <div className="page-container">
            <header className="page-header">
                <div>
                    <h1>员工管理</h1>
                    <p>管理所有员工信息和角色</p>
                </div>
                <button className="btn-primary" onClick={() => openModal()}>➕ 添加员工</button>
            </header>

            {/* 筛选栏 */}
            <div className="filter-bar">
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
                ) : filteredUsers.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">👤</span>
                        <h3>暂无员工数据</h3>
                        <p>点击上方按钮添加第一个员工</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>姓名</th>
                                <th>邮箱</th>
                                <th>手机号</th>
                                <th>角色</th>
                                <th>子公司</th>
                                <th>小组</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.name}</td>
                                    <td>{user.email || '-'}</td>
                                    <td>{user.phone || '-'}</td>
                                    <td><span className={`badge badge-${user.role}`}>{UserRoleLabels[user.role]}</span></td>
                                    <td>{user.branch?.name || '-'}</td>
                                    <td>{user.group?.name || '-'}</td>
                                    <td>
                                        <button className="btn-icon" onClick={() => openModal(user)}>✏️</button>
                                        <button className="btn-icon danger" onClick={() => handleDelete(user.id)}>🗑️</button>
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
                        <h2>{editingUser ? '编辑员工' : '添加员工'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>姓名 *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>邮箱</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>手机号</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>角色 *</label>
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                                    required
                                >
                                    <option value="employee">普通员工</option>
                                    <option value="manager">项目经理</option>
                                    <option value="admin">超级管理员</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>所属子公司</label>
                                <select
                                    value={formData.branch_id}
                                    onChange={e => setFormData({ ...formData, branch_id: e.target.value, group_id: '' })}
                                >
                                    <option value="">请选择</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>所属小组</label>
                                <select
                                    value={formData.group_id}
                                    onChange={e => setFormData({ ...formData, group_id: e.target.value })}
                                >
                                    <option value="">请选择</option>
                                    {formGroups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
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
