/**
 * ============================================================================
 * Branches.tsx - 子公司管理页面
 * ============================================================================
 * 
 * 【文件作用】
 * 管理公司的各地区分支机构（子公司）。
 * 提供增删改查（CRUD）功能。
 * 
 * 【CRUD 操作说明】
 * - Create（创建）：添加新子公司
 * - Read（读取）：显示子公司列表
 * - Update（更新）：编辑子公司信息
 * - Delete（删除）：删除子公司
 * 
 * 【页面结构】
 * 1. 头部：标题 + 添加按钮
 * 2. 表格：显示子公司列表
 * 3. 弹窗：添加/编辑表单
 * 
 * 【弹窗复用技巧】
 * 同一个弹窗同时用于"添加"和"编辑"：
 * - editingBranch 为 null 时：添加模式
 * - editingBranch 有值时：编辑模式
 * 
 * 【访问权限】
 * 只有 admin 角色可以访问此页面（在路由层控制）
 */

// ============================================================================
// 导入部分
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types/database'
import './PageStyles.css'

// ============================================================================
// 组件定义
// ============================================================================

export default function Branches() {
    // =========== 状态定义 ===========

    /**
     * 子公司列表数据
     * 
     * useState<Branch[]>([]) 说明：
     * - Branch[] 是类型：Branch 对象的数组
     * - [] 是初始值：空数组
     */
    const [branches, setBranches] = useState<Branch[]>([])

    /** 是否正在加载数据 */
    const [loading, setLoading] = useState(true)

    /** 是否显示弹窗（添加/编辑） */
    const [showModal, setShowModal] = useState(false)

    /**
     * 正在编辑的子公司
     * 
     * - null 表示添加模式（新建）
     * - 有值表示编辑模式（修改现有数据）
     */
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

    /**
     * 表单数据
     * 
     * 包含表单中所有输入字段的值
     */
    const [formData, setFormData] = useState({ name: '', code: '' })

    // =========== 生命周期：加载数据 ===========

    /**
     * 组件挂载时获取子公司列表
     */
    useEffect(() => {
        fetchBranches()
    }, [])

    // =========== 数据获取函数 ===========

    /**
     * 获取子公司列表
     */
    async function fetchBranches() {
        try {
            /**
             * Supabase 查询链式调用
             * 
             * .from('branches') - 从 branches 表查询
             * .select('*') - 选择所有字段
             * .order('created_at', { ascending: true }) - 按创建时间升序排序
             * 
             * ascending: true 表示升序（从小到大，从旧到新）
             * ascending: false 表示降序（从大到小，从新到旧）
             */
            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .order('created_at', { ascending: true })

            // 如果有错误，抛出异常
            if (error) throw error

            // 更新状态
            // data || [] 表示如果 data 为 null 则使用空数组
            setBranches(data || [])
        } catch (error) {
            console.error('获取子公司列表失败:', error)
        } finally {
            setLoading(false)
        }
    }

    // =========== 弹窗控制函数 ===========

    /**
     * 打开弹窗（添加或编辑模式）
     * 
     * @param branch - 可选参数，传入时为编辑模式
     */
    function openModal(branch?: Branch) {
        if (branch) {
            // 编辑模式：设置正在编辑的对象，并填充表单数据
            setEditingBranch(branch)
            setFormData({ name: branch.name, code: branch.code || '' })
        } else {
            // 添加模式：清空编辑对象和表单
            setEditingBranch(null)
            setFormData({ name: '', code: '' })
        }
        // 显示弹窗
        setShowModal(true)
    }

    // =========== CRUD 操作函数 ===========

    /**
     * 处理表单提交（创建或更新）
     * 
     * @param e - 表单事件
     */
    async function handleSubmit(e: React.FormEvent) {
        // 阻止表单默认提交行为
        e.preventDefault()

        try {
            if (editingBranch) {
                // ===== 更新操作 =====
                /**
                 * .update() 更新数据
                 * .eq('id', editingBranch.id) 指定更新哪条记录
                 * 
                 * 完整写法：UPDATE branches SET name=?, code=? WHERE id=?
                 */
                const { error } = await supabase
                    .from('branches')
                    .update({ name: formData.name, code: formData.code || null })
                    .eq('id', editingBranch.id)
                if (error) throw error
            } else {
                // ===== 创建操作 =====
                /**
                 * .insert() 插入新数据
                 * 
                 * code: formData.code || null
                 * 如果 code 为空字符串，存储 null
                 */
                const { error } = await supabase
                    .from('branches')
                    .insert({ name: formData.name, code: formData.code || null })
                if (error) throw error
            }

            // 操作成功：关闭弹窗，刷新列表
            setShowModal(false)
            fetchBranches()
        } catch (error) {
            console.error('保存失败:', error)
            // 使用 alert 显示简单错误提示
            alert('保存失败，请重试')
        }
    }

    /**
     * 处理删除操作
     * 
     * @param id - 要删除的子公司 ID
     */
    async function handleDelete(id: string) {
        // confirm() 显示确认对话框
        // 返回 true 用户点击了"确定"
        // 返回 false 用户点击了"取消"
        if (!confirm('确定要删除这个子公司吗？相关的小组和员工数据也会被删除。')) return

        try {
            /**
             * .delete() 删除数据
             * .eq('id', id) 指定删除哪条记录
             * 
             * 完整写法：DELETE FROM branches WHERE id=?
             */
            const { error } = await supabase.from('branches').delete().eq('id', id)
            if (error) throw error
            // 删除成功，刷新列表
            fetchBranches()
        } catch (error) {
            console.error('删除失败:', error)
            alert('删除失败，请重试')
        }
    }

    // =========== 渲染 ===========

    return (
        <div className="page-container">
            {/* ========== 页面头部 ========== */}
            <header className="page-header">
                <div>
                    <h1>子公司管理</h1>
                    <p>管理公司的各地区分支机构</p>
                </div>
                {/* 
                    添加按钮
                    onClick={() => openModal()} 不传参数，进入添加模式
                */}
                <button className="btn-primary" onClick={() => openModal()}>➕ 添加子公司</button>
            </header>

            {/* ========== 数据表格 ========== */}
            <div className="table-container">
                {/* 
                    条件渲染三种状态：
                    1. 加载中
                    2. 空数据
                    3. 有数据（显示表格）
                */}
                {loading ? (
                    // 状态1：加载中
                    <div className="loading">加载中...</div>
                ) : branches.length === 0 ? (
                    // 状态2：空数据
                    <div className="empty-state">
                        <span className="empty-icon">🏢</span>
                        <h3>暂无子公司数据</h3>
                        <p>点击上方按钮添加第一个子公司</p>
                    </div>
                ) : (
                    // 状态3：有数据，显示表格
                    <table className="data-table">
                        {/* 表头 */}
                        <thead>
                            <tr>
                                <th>名称</th>
                                <th>编码</th>
                                <th>创建时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        {/* 表格内容 */}
                        <tbody>
                            {/* 遍历 branches 数组，渲染每一行 */}
                            {branches.map((branch) => (
                                // key 是 React 列表渲染必需的
                                <tr key={branch.id}>
                                    <td>{branch.name}</td>
                                    <td>
                                        {/* 
                                            badge 样式的标签
                                            branch.code || '-' 如果没有编码显示 -
                                        */}
                                        <span className="badge">{branch.code || '-'}</span>
                                    </td>
                                    <td>
                                        {/* 
                                            日期格式化
                                            new Date(string) 将字符串转为日期对象
                                            toLocaleDateString('zh-CN') 转为中文格式日期
                                        */}
                                        {new Date(branch.created_at).toLocaleDateString('zh-CN')}
                                    </td>
                                    <td>
                                        {/* 编辑按钮 */}
                                        <button className="btn-icon" onClick={() => openModal(branch)}>✏️</button>
                                        {/* 删除按钮 */}
                                        <button className="btn-icon danger" onClick={() => handleDelete(branch.id)}>🗑️</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ========== 弹窗表单 ========== */}
            {/* 条件渲染：只有 showModal 为 true 时显示 */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    {/* 
                        e.stopPropagation() 阻止事件冒泡
                        点击弹窗内容时不会触发遮罩的 onClick（关闭弹窗）
                    */}
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        {/* 根据模式显示不同标题 */}
                        <h2>{editingBranch ? '编辑子公司' : '添加子公司'}</h2>
                        <form onSubmit={handleSubmit}>
                            {/* 名称输入框 */}
                            <div className="form-group">
                                <label>名称 *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    /**
                                     * 受控组件的 onChange
                                     * 
                                     * 使用展开运算符保留其他属性，只更新 name
                                     * { ...formData, name: e.target.value }
                                     * 等价于：{ name: e.target.value, code: formData.code }
                                     */
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="例如：北京总部"
                                />
                            </div>
                            {/* 编码输入框 */}
                            <div className="form-group">
                                <label>编码</label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                                    placeholder="例如：BJ"
                                />
                            </div>
                            {/* 按钮组 */}
                            <div className="form-actions">
                                {/* 
                                    type="button" 表示普通按钮，不触发表单提交
                                    (默认 type 是 "submit")
                                */}
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
