/**
 * ============================================================================
 * Employees.tsx - 员工管理页面
 * ============================================================================
 * 
 * 【文件作用】
 * 管理系统中所有用户（员工、项目经理、管理员）。
 * 提供增删改查功能，支持按子公司和小组筛选。
 * 
 * 【权限控制】
 * 这是本项目中权限控制最复杂的页面：
 * 
 * 1. 数据可见性（数据隔离）：
 *    - admin: 可以看到所有用户
 *    - manager: 可以看到同分公司的普通员工和其他项目经理（不含admin）
 *    - employee: 不能访问此页面（路由层控制）
 * 
 * 2. 操作权限：
 *    - admin: 可以添加、编辑、删除任何用户，重置任何人密码
 *    - manager: 可以编辑、删除同分公司的普通员工，重置其密码
 *              不能修改自己、不能修改其他项目经理、不能添加用户
 * 
 * 【关键技术点】
 * 1. 基于角色的数据过滤
 * 2. 细粒度的权限判断函数
 * 3. 联动筛选（子公司变化时，小组选项也变化）
 * 4. 调用数据库函数创建用户（带密码哈希）
 */

// ============================================================================
// 导入部分
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Branch, Group, UserRole } from '../types/database'
import { UserRoleLabels } from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import './PageStyles.css'

// ============================================================================
// 组件定义
// ============================================================================

export default function Employees() {
    // =========== 获取当前用户信息 ===========

    /**
     * 获取当前登录用户
     * 用于权限判断和数据过滤
     */
    const { user: currentUser } = useAuth()

    // =========== 状态定义 ===========

    /** 用户列表（带关联数据） */
    const [users, setUsers] = useState<(User & { branch?: Branch; group?: Group })[]>([])

    /** 子公司列表 */
    const [branches, setBranches] = useState<Branch[]>([])

    /** 小组列表 */
    const [groups, setGroups] = useState<Group[]>([])

    /** 加载状态 */
    const [loading, setLoading] = useState(true)

    /** 是否显示添加/编辑弹窗 */
    const [showModal, setShowModal] = useState(false)

    /** 是否显示重置密码弹窗 */
    const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)

    /** 要重置密码的用户ID */
    const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null)

    /** 新密码输入 */
    const [newPassword, setNewPassword] = useState('')

    /** 正在编辑的用户 */
    const [editingUser, setEditingUser] = useState<User | null>(null)

    /** 保存中状态 */
    const [saving, setSaving] = useState(false)

    /** 表单数据 */
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',        // 只在添加时使用
        phone: '',
        role: 'employee' as UserRole,
        branch_id: '',
        group_id: '',
    })

    /** 筛选条件 - 项目经理默认筛选自己的分公司 */
    const [filterBranch, setFilterBranch] = useState(currentUser?.role === 'manager' ? (currentUser?.branch_id || '') : '')
    const [filterGroup, setFilterGroup] = useState('')

    // =========== 生命周期 ===========

    useEffect(() => {
        fetchData()
    }, [])

    // =========== 数据获取 ===========

    async function fetchData() {
        try {
            // 并行获取三个表的数据
            const [usersRes, branchesRes, groupsRes] = await Promise.all([
                supabase.from('users').select('*').order('name'),
                supabase.from('branches').select('*').order('name'),
                supabase.from('groups').select('*').order('name'),
            ])

            if (usersRes.error || branchesRes.error || groupsRes.error) return

            // 创建关联映射
            const branchMap = new Map(branchesRes.data?.map(b => [b.id, b]) || [])
            const groupMap = new Map(groupsRes.data?.map(g => [g.id, g]) || [])

            // 手动关联数据
            let usersWithRelations = (usersRes.data || []).map(user => ({
                ...user,
                branch: user.branch_id ? branchMap.get(user.branch_id) : undefined,
                group: user.group_id ? groupMap.get(user.group_id) : undefined,
            }))

            // ===== 数据隔离：根据当前用户角色过滤 =====
            if (currentUser?.role === 'manager') {
                /**
                 * 项目经理的数据可见性规则：
                 * - 可以看到自己
                 * - 可以看到同分公司的普通员工
                 * - 可以看到同分公司的其他项目经理
                 * - 不能看到超级管理员
                 */
                usersWithRelations = usersWithRelations.filter(u =>
                    // 排除超级管理员
                    u.role !== 'admin' &&
                    // 同分公司
                    u.branch_id === currentUser.branch_id
                )
            }
            // admin 无需过滤，可以看到所有员工

            setUsers(usersWithRelations)
            setBranches(branchesRes.data || [])
            setGroups(groupsRes.data || [])
        } finally {
            setLoading(false)
        }
    }

    // =========== 弹窗控制 ===========

    function openModal(user?: User) {
        if (user) {
            setEditingUser(user)
            setFormData({
                name: user.name,
                email: user.email,
                password: '',  // 编辑时不显示密码
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
                password: '',
                phone: '',
                role: 'employee',
                branch_id: '',
                group_id: '',
            })
        }
        setShowModal(true)
    }

    // =========== CRUD 操作 ===========

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)

        try {
            if (editingUser) {
                // ===== 更新用户信息 =====
                // 注意：更新时不包含密码，密码通过单独的重置功能修改
                const { error } = await supabase.from('users').update({
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone || null,
                    role: formData.role,
                    branch_id: formData.branch_id || null,
                    group_id: formData.group_id || null,
                }).eq('id', editingUser.id)

                if (error) throw error
            } else {
                // ===== 创建新用户 =====
                /**
                 * 调用 PostgreSQL 函数 create_user_with_password
                 * 
                 * 为什么用函数？
                 * - 密码需要进行哈希加密
                 * - 加密操作应该在数据库端进行，更安全
                 * - 前端不应该处理原始密码
                 * 
                 * .rpc() 调用数据库存储过程/函数
                 */
                const { error } = await supabase.rpc('create_user_with_password', {
                    p_name: formData.name,
                    p_email: formData.email,
                    p_password: formData.password,
                    p_role: formData.role,
                    p_branch_id: formData.branch_id || null,
                    p_group_id: formData.group_id || null,
                })

                if (error) throw error
            }

            setShowModal(false)
            fetchData()
        } catch (error: unknown) {
            // TypeScript 的错误处理
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            alert('保存失败：' + errorMessage)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('确定要删除这个员工吗？')) return
        try {
            const { error } = await supabase.from('users').delete().eq('id', id)
            if (error) throw error
            fetchData()
        } catch {
            alert('删除失败，请重试')
        }
    }

    // =========== 密码重置 ===========

    function openResetPasswordModal(userId: string) {
        setResetPasswordUserId(userId)
        setNewPassword('')
        setShowResetPasswordModal(true)
    }

    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault()
        if (!resetPasswordUserId || !newPassword) return

        try {
            /**
             * 调用重置密码函数
             * 同样使用数据库函数进行密码哈希
             */
            const { error } = await supabase.rpc('reset_user_password', {
                p_user_id: resetPasswordUserId,
                p_new_password: newPassword,
            })

            if (error) throw error

            alert('密码重置成功！')
            setShowResetPasswordModal(false)
        } catch {
            alert('重置密码失败，请重试')
        }
    }

    // =========== 权限判断函数 ===========

    /**
     * 判断是否可以编辑指定用户
     */
    function canEditUser(targetUser: User): boolean {
        if (!currentUser) return false

        // admin 可以编辑任何人
        if (currentUser.role === 'admin') return true

        if (currentUser.role === 'manager') {
            // 不能编辑自己
            if (targetUser.id === currentUser.id) return false
            // 不能编辑其他项目经理
            if (targetUser.role === 'manager') return false
            // 只能编辑同分公司的普通员工
            return targetUser.branch_id === currentUser.branch_id && targetUser.role === 'employee'
        }

        return false
    }

    /**
     * 判断是否可以删除指定用户
     */
    function canDeleteUser(targetUser: User): boolean {
        if (!currentUser) return false
        if (currentUser.role === 'admin') return true

        if (currentUser.role === 'manager') {
            // 不能删除自己
            if (targetUser.id === currentUser.id) return false
            // 不能删除其他项目经理
            if (targetUser.role === 'manager') return false
            // 只能删除同分公司的普通员工
            return targetUser.branch_id === currentUser.branch_id && targetUser.role === 'employee'
        }

        return false
    }

    /**
     * 判断是否可以重置指定用户的密码
     */
    function canResetPassword(targetUser: User): boolean {
        if (!currentUser) return false
        if (currentUser.role === 'admin') return true

        if (currentUser.role === 'manager') {
            // 不能重置自己的密码
            if (targetUser.id === currentUser.id) return false
            // 不能重置其他项目经理的密码
            if (targetUser.role === 'manager') return false
            // 只能重置同分公司普通员工的密码
            return targetUser.branch_id === currentUser.branch_id && targetUser.role === 'employee'
        }

        return false
    }

    // =========== 筛选逻辑 ===========

    // 根据筛选条件过滤用户列表
    let filteredUsers = users
    if (filterBranch) {
        filteredUsers = filteredUsers.filter(u => u.branch_id === filterBranch)
    }
    if (filterGroup) {
        filteredUsers = filteredUsers.filter(u => u.group_id === filterGroup)
    }

    /**
     * 联动筛选：当选择了子公司后，小组选项只显示该子公司下的小组
     */
    const availableGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : groups

    /** 表单中的小组选项（根据选择的子公司过滤） */
    const formGroups = formData.branch_id
        ? groups.filter(g => g.branch_id === formData.branch_id)
        : groups

    // =========== 渲染 ===========

    return (
        <div className="page-container">
            {/* 页面头部 */}
            <header className="page-header">
                <div>
                    <h1>员工管理</h1>
                </div>
                {/* 只有 admin 可以添加员工 */}
                {currentUser?.role === 'admin' && (
                    <button className="btn-primary" onClick={() => openModal()}>➕ 添加员工</button>
                )}
            </header>

            {/* 筛选栏 - 项目经理不显示子公司选择器 */}
            <div className="filter-bar">
                {currentUser?.role === 'admin' && (
                    <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setFilterGroup('') }}>
                        <option value="">全部子公司</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                )}
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
                                    <td>{user.email}</td>
                                    <td>{user.phone || '-'}</td>
                                    <td>
                                        {/* 
                                            使用 UserRoleLabels 显示中文角色名
                                            badge-${user.role} 动态添加不同角色的样式类
                                        */}
                                        <span className={`badge badge-${user.role}`}>{UserRoleLabels[user.role]}</span>
                                    </td>
                                    <td>{user.branch?.name || '-'}</td>
                                    <td>{user.group?.name || '-'}</td>
                                    <td>
                                        {/* 
                                            根据权限条件渲染操作按钮
                                            使用 && 短路求值进行条件渲染
                                        */}
                                        {canEditUser(user) && (
                                            <button className="btn-icon" onClick={() => openModal(user)} title="编辑">✏️</button>
                                        )}
                                        {canResetPassword(user) && (
                                            <button className="btn-icon" onClick={() => openResetPasswordModal(user.id)} title="重置密码">🔑</button>
                                        )}
                                        {canDeleteUser(user) && (
                                            <button className="btn-icon danger" onClick={() => handleDelete(user.id)} title="删除">🗑️</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* 添加/编辑弹窗 */}
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
                                    placeholder="请输入姓名"
                                />
                            </div>
                            <div className="form-group">
                                <label>邮箱（登录账号）*</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    required
                                    placeholder="请输入邮箱"
                                />
                            </div>
                            {/* 只有添加时显示密码输入框 */}
                            {!editingUser && (
                                <div className="form-group">
                                    <label>初始密码 *</label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        required
                                        minLength={6}
                                        placeholder="至少6位"
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label>手机号</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="可选"
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
                                    <option value="">请选择（可选）</option>
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
                                    disabled={!formData.branch_id}
                                >
                                    <option value="">请选择（可选）</option>
                                    {formGroups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                                {!formData.branch_id && (
                                    <small style={{ color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem', display: 'block' }}>
                                        请先选择子公司
                                    </small>
                                )}
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                                <button type="submit" className="btn-primary" disabled={saving}>
                                    {saving ? '保存中...' : '保存'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 重置密码弹窗 */}
            {showResetPasswordModal && (
                <div className="modal-overlay" onClick={() => setShowResetPasswordModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>🔑 重置密码</h2>
                        <form onSubmit={handleResetPassword}>
                            <div className="form-group">
                                <label>新密码 *</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    placeholder="至少6位"
                                />
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowResetPasswordModal(false)}>取消</button>
                                <button type="submit" className="btn-primary">确认重置</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
