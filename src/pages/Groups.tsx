/**
 * ============================================================================
 * Groups.tsx - 小组管理页面
 * ============================================================================
 * 
 * 【文件作用】
 * 管理各子公司下的工作小组。
 * 提供增删改查功能，支持按子公司筛选。
 * 
 * 【数据关联】
 * - 每个小组属于一个子公司（branch_id 外键）
 * - 每个小组可以有一个负责人（manager_id 外键关联 users 表）
 * 
 * 【本页面的关键技术点】
 * 1. 多表关联查询 - 同时获取 groups、branches、managers
 * 2. 手动数据关联 - 使用 Map 将关联数据合并
 * 3. 筛选功能 - 按子公司过滤小组列表
 * 
 * 【手动关联 vs 自动关联】
 * Supabase 支持自动关联查询（如 select('*, branch:branches(*)')）
 * 但有时需要更灵活的控制，本项目使用手动关联方式
 */

// ============================================================================
// 导入部分
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Group, Branch, User } from '../types/database'
import './PageStyles.css'

// ============================================================================
// 组件定义
// ============================================================================

export default function Groups() {
    // =========== 状态定义 ===========

    /**
     * 小组列表（带关联数据）
     * 
     * (Group & { branch?: Branch; manager?: User })[]
     * 这是 TypeScript 交叉类型 (&) 的应用
     * 表示每个元素既有 Group 的所有属性，又有额外的 branch 和 manager 属性
     */
    const [groups, setGroups] = useState<(Group & { branch?: Branch; manager?: User })[]>([])

    /** 子公司列表（用于筛选下拉和表单选择） */
    const [branches, setBranches] = useState<Branch[]>([])

    /** 可选的负责人列表（manager 或 admin 角色） */
    const [managers, setManagers] = useState<User[]>([])

    /** 加载状态 */
    const [loading, setLoading] = useState(true)

    /** 是否显示弹窗 */
    const [showModal, setShowModal] = useState(false)

    /** 正在编辑的小组（null 表示添加模式） */
    const [editingGroup, setEditingGroup] = useState<Group | null>(null)

    /** 表单数据 */
    const [formData, setFormData] = useState({ name: '', branch_id: '', manager_id: '' })

    /** 筛选条件：子公司 */
    const [filterBranch, setFilterBranch] = useState('')

    // =========== 生命周期 ===========

    useEffect(() => {
        fetchData()
    }, [])

    // =========== 数据获取 ===========

    /**
     * 获取所有数据
     * 
     * 使用 Promise.all 并行获取三个表的数据
     * 然后手动进行数据关联
     */
    async function fetchData() {
        try {
            // 并行查询三个表
            const [groupsRes, branchesRes, managersRes] = await Promise.all([
                supabase.from('groups').select('*').order('created_at'),
                supabase.from('branches').select('*').order('name'),
                /**
                 * 获取可作为负责人的用户
                 * .in('role', ['manager', 'admin']) 表示 role 在给定数组中
                 * 相当于 SQL: WHERE role IN ('manager', 'admin')
                 */
                supabase.from('users').select('*').in('role', ['manager', 'admin']).order('name'),
            ])

            // 检查是否有错误
            if (groupsRes.error || branchesRes.error || managersRes.error) return

            // ===== 手动数据关联 =====

            /**
             * 创建 Map 用于快速查找
             * 
             * Map 是 ES6 的数据结构，比普通对象查找更高效
             * 
             * branchesRes.data?.map(b => [b.id, b]) 将数组转换为 [key, value] 对
             * new Map([...]) 用这些键值对创建 Map
             * 
             * branchMap.get(id) 可以 O(1) 时间查找
             */
            const branchMap = new Map(branchesRes.data?.map(b => [b.id, b]) || [])
            const managerMap = new Map(managersRes.data?.map(m => [m.id, m]) || [])

            /**
             * 为每个小组添加关联数据
             * 
             * .map() 遍历数组，返回新数组
             * 使用展开运算符 ...group 保留原有属性
             * 添加 branch 和 manager 关联对象
             */
            const groupsWithRelations = (groupsRes.data || []).map(group => ({
                ...group,
                branch: group.branch_id ? branchMap.get(group.branch_id) : undefined,
                manager: group.manager_id ? managerMap.get(group.manager_id) : undefined,
            }))

            // 更新状态
            setGroups(groupsWithRelations)
            setBranches(branchesRes.data || [])
            setManagers(managersRes.data || [])
        } catch (error) {
            console.error('获取数据失败:', error)
        } finally {
            setLoading(false)
        }
    }

    // =========== 弹窗控制 ===========

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
            // 默认选择第一个子公司
            setFormData({ name: '', branch_id: branches[0]?.id || '', manager_id: '' })
        }
        setShowModal(true)
    }

    // =========== CRUD 操作 ===========

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        try {
            const data = {
                name: formData.name,
                branch_id: formData.branch_id,
                // 空字符串转为 null（数据库外键不能是空字符串）
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

    // =========== 筛选逻辑 ===========

    /**
     * 根据筛选条件过滤小组列表
     * 
     * 三元表达式：filterBranch 有值时进行过滤，否则返回全部
     * .filter() 返回满足条件的新数组
     */
    const filteredGroups = filterBranch
        ? groups.filter(g => g.branch_id === filterBranch)
        : groups

    // =========== 渲染 ===========

    return (
        <div className="page-container">
            {/* 页面头部 */}
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

            {/* 数据表格 */}
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
                                    {/* 
                                        可选链操作符 (?.)
                                        group.branch?.name 等价于：
                                        group.branch ? group.branch.name : undefined
                                        
                                        || '-' 在结果为 undefined 时显示 '-'
                                    */}
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
