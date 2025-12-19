/**
 * ============================================================================
 * Layout.tsx - 布局组件（侧边栏导航）
 * ============================================================================
 * 
 * 【文件作用】
 * 提供应用的主框架布局：侧边栏导航和顶部用户信息栏。
 * 所有受保护的页面都在这个布局内渲染。
 * 
 * 【布局结构】
 * ┌────────────────────────────────────────────┐
 * │ 侧边栏        │        顶栏（用户信息）     │
 * │              ├──────────────────────────────│
 * │ 🏆 绩效管理   │                              │
 * │              │                              │
 * │ 📊 仪表盘    │        主内容区域            │
 * │ 🏢 子公司    │       （Outlet）             │
 * │ 👥 小组      │                              │
 * │ 👤 员工      │   当前页面在这里渲染        │
 * │ ...         │                              │
 * │              │                              │
 * └────────────────────────────────────────────┘
 * 
 * 【Outlet 组件】
 * React Router 提供的占位符组件。
 * 嵌套路由的子路由内容会在 Outlet 位置渲染。
 * 
 * 例如：
 * - 访问 / -> Outlet 渲染 Dashboard
 * - 访问 /employees -> Outlet 渲染 Employees
 * 
 * 【基于角色的菜单过滤】
 * 导航菜单根据用户角色动态显示/隐藏。
 * 例如：普通员工只能看到仪表盘和绩效页面。
 */

// ============================================================================
// 导入部分
// ============================================================================

/** useState 用于管理弹窗状态、表单状态等 */
import { useState } from 'react'

/**
 * Outlet - 嵌套路由的子路由渲染位置
 * Link - 不刷新页面的导航链接
 * useLocation - 获取当前路由信息的 Hook
 */
import { Outlet, Link, useLocation } from 'react-router-dom'

/** 导入认证 Hook，获取用户信息和退出功能 */
import { useAuth } from '../contexts/AuthContext'

/** 导入布局样式 */
import './Layout.css'

// ============================================================================
// 导航菜单配置
// ============================================================================

/**
 * 导航菜单项配置数组
 * 
 * 集中管理所有导航项，方便维护
 * 
 * 每个菜单项包含：
 * - path: 路由路径
 * - label: 显示文本
 * - icon: emoji 图标
 * - roles: 允许访问的角色数组
 */
const navItems = [
    // 所有角色都可以访问仪表盘
    { path: '/', label: '仪表盘', icon: '📊', roles: ['admin', 'manager', 'employee'] },
    // 只有 admin 可以管理子公司
    { path: '/branches', label: '子公司管理', icon: '🏢', roles: ['admin'] },
    // admin 和 manager 可以管理小组
    { path: '/groups', label: '小组管理', icon: '👥', roles: ['admin', 'manager'] },
    // admin 和 manager 可以管理员工
    { path: '/employees', label: '员工管理', icon: '👤', roles: ['admin', 'manager'] },
    // 所有角色都可以查看质检准确率
    { path: '/qc-accuracy', label: '质检准确率', icon: '🎯', roles: ['admin', 'manager', 'employee'] },
    // 所有角色都可以查看绩效记录
    { path: '/performance', label: '绩效记录', icon: '📈', roles: ['admin', 'manager', 'employee'] },
    // admin 和 manager 可以导入数据
    { path: '/import', label: '数据导入', icon: '📥', roles: ['admin', 'manager'] },
]

// ============================================================================
// Layout 组件
// ============================================================================

export default function Layout() {
    // =========== 获取路由和认证信息 ===========

    /**
     * useLocation 返回当前的 location 对象
     * 包含 pathname（当前路径）、search（查询参数）、hash 等
     */
    const location = useLocation()

    /** 获取用户信息和认证相关函数 */
    const { user, signOut, changePassword } = useAuth()

    // =========== 状态定义 ===========

    /** 是否显示修改密码弹窗 */
    const [showPasswordModal, setShowPasswordModal] = useState(false)

    /** 是否显示用户菜单下拉框 */
    const [showUserMenu, setShowUserMenu] = useState(false)

    /** 修改密码表单：原密码 */
    const [oldPassword, setOldPassword] = useState('')

    /** 修改密码表单：新密码 */
    const [newPassword, setNewPassword] = useState('')

    /** 修改密码表单：确认新密码 */
    const [confirmPassword, setConfirmPassword] = useState('')

    /** 修改密码表单：错误信息 */
    const [passwordError, setPasswordError] = useState('')

    /** 修改密码是否成功 */
    const [passwordSuccess, setPasswordSuccess] = useState(false)

    // =========== 事件处理函数 ===========

    /**
     * 处理修改密码表单提交
     */
    async function handleChangePassword(e: React.FormEvent) {
        // 阻止表单默认提交
        e.preventDefault()
        // 清除之前的错误
        setPasswordError('')

        // ===== 表单验证 =====
        // 验证原密码是否填写
        if (!oldPassword) {
            setPasswordError('请输入原密码')
            return
        }

        // 验证新密码长度
        if (newPassword.length < 6) {
            setPasswordError('新密码长度至少6位')
            return
        }

        // 验证两次输入是否一致
        if (newPassword !== confirmPassword) {
            setPasswordError('两次输入的密码不一致')
            return
        }

        // ===== 调用修改密码 API =====
        const { error } = await changePassword(oldPassword, newPassword)
        if (error) {
            setPasswordError('修改失败：' + error)
        } else {
            // 修改成功
            setPasswordSuccess(true)
            // 1.5秒后自动退出登录（让用户用新密码重新登录）
            // setTimeout 用于延迟执行
            setTimeout(() => {
                signOut()
            }, 1500)
        }
    }

    /**
     * 处理退出登录
     */
    async function handleSignOut() {
        await signOut()
    }

    // =========== 渲染 ===========

    return (
        // 整体布局容器
        <div className="app-layout">
            {/* ========== 侧边栏 ========== */}
            <aside className="sidebar">
                {/* Logo 区域 */}
                <div className="logo">
                    <h1>🏆 绩效管理</h1>
                </div>

                {/* 导航菜单 */}
                <nav className="nav-menu">
                    {/* 
                        遍历导航项并过滤
                        
                        .filter() - 过滤数组，只保留符合条件的项
                        .map() - 遍历数组，将每个元素转换为 JSX
                        
                        链式调用：先过滤再遍历
                    */}
                    {navItems
                        // 只显示当前用户角色允许访问的菜单项
                        .filter(item => item.roles.includes(user?.role || ''))
                        // 渲染菜单项
                        .map((item) => (
                            /**
                             * Link 组件
                             * 
                             * to - 目标路径
                             * className - CSS 类名，使用模板字符串动态添加
                             * 
                             * 模板字符串 `...${表达式}...` 可以嵌入变量
                             * 三元表达式判断当前路径是否匹配，添加 active 类
                             */
                            <Link
                                key={item.path}  /* React 列表渲染需要 key */
                                to={item.path}
                                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                <span className="nav-label">{item.label}</span>
                            </Link>
                        ))}
                </nav>
            </aside>

            {/* ========== 主内容区 ========== */}
            <div className="main-wrapper">
                {/* 顶部用户栏 */}
                <header className="top-bar">
                    <div className="top-bar-left">
                        {/* 左侧可以放搜索或其他内容 */}
                    </div>
                    <div className="top-bar-right">
                        {/* 用户菜单容器 */}
                        <div className="user-menu-container">
                            {/* 用户按钮，点击展开/收起菜单 */}
                            <button
                                className="user-btn"
                                onClick={() => setShowUserMenu(!showUserMenu)}
                            >
                                <span className="user-avatar">👤</span>
                                <span className="user-email">{user?.email}</span>
                                {/* 
                                    下拉箭头，根据菜单状态旋转
                                    className 使用模板字符串动态添加 open 类
                                */}
                                <span className={`dropdown-arrow ${showUserMenu ? 'open' : ''}`}>▼</span>
                            </button>

                            {/* 
                                条件渲染：只有 showUserMenu 为 true 时才渲染
                                使用 Fragment (<>...</>) 包裹多个元素
                            */}
                            {showUserMenu && (
                                <>
                                    {/* 
                                        透明遮罩：点击任意位置关闭菜单
                                        这是一个常见的 UI 模式
                                    */}
                                    <div className="menu-backdrop" onClick={() => setShowUserMenu(false)} />
                                    {/* 下拉菜单 */}
                                    <div className="user-dropdown">
                                        <button onClick={() => { setShowPasswordModal(true); setShowUserMenu(false); }}>
                                            🔑 修改密码
                                        </button>
                                        <button onClick={handleSignOut} className="logout-btn">
                                            🚪 退出登录
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* 页面内容区 */}
                <main className="main-content">
                    {/* 
                        Outlet 是 React Router 提供的占位符
                        嵌套路由的子组件会在这里渲染
                        
                        例如：
                        - 当 URL 是 "/" 时，Dashboard 组件在这里渲染
                        - 当 URL 是 "/employees" 时，Employees 组件在这里渲染
                    */}
                    <Outlet />
                </main>
            </div>

            {/* ========== 修改密码弹窗 ========== */}
            {/* 条件渲染：只有 showPasswordModal 为 true 时显示 */}
            {showPasswordModal && (
                // 遮罩层，点击遮罩关闭弹窗
                <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
                    {/* 
                        弹窗内容
                        e.stopPropagation() 阻止点击事件冒泡
                        防止点击弹窗内容时触发遮罩的关闭事件
                    */}
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>🔑 修改密码</h2>
                        {/* 根据是否成功显示不同内容 */}
                        {passwordSuccess ? (
                            <div className="success-message">✅ 密码修改成功！</div>
                        ) : (
                            <form onSubmit={handleChangePassword}>
                                {/* 错误信息提示 */}
                                {passwordError && <div className="error-msg">{passwordError}</div>}
                                <div className="form-group">
                                    <label>原密码 *</label>
                                    <input
                                        type="password"
                                        value={oldPassword}
                                        onChange={e => setOldPassword(e.target.value)}
                                        placeholder="请输入当前密码"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>新密码 *</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="至少6位"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>确认新密码</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="再次输入新密码"
                                        required
                                    />
                                </div>
                                <div className="form-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setShowPasswordModal(false)}>取消</button>
                                    <button type="submit" className="btn-primary">确认修改</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
