/**
 * 布局组件 - 侧边栏导航
 * 
 * 包含侧边栏导航和顶部用户信息栏。
 */

import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

// 导航菜单配置
const navItems = [
    { path: '/', label: '仪表盘', icon: '📊' },
    { path: '/branches', label: '子公司管理', icon: '🏢' },
    { path: '/groups', label: '小组管理', icon: '👥' },
    { path: '/employees', label: '员工管理', icon: '👤' },
    { path: '/performance', label: '绩效记录', icon: '📈' },
    { path: '/import', label: '数据导入', icon: '📥' },
]

export default function Layout() {
    const location = useLocation()
    const { user, signOut, changePassword } = useAuth()
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [passwordSuccess, setPasswordSuccess] = useState(false)

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault()
        setPasswordError('')

        if (newPassword.length < 6) {
            setPasswordError('密码长度至少6位')
            return
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('两次输入的密码不一致')
            return
        }

        const { error } = await changePassword(newPassword)
        if (error) {
            setPasswordError('修改失败：' + error)
        } else {
            setPasswordSuccess(true)
            setTimeout(() => {
                setShowPasswordModal(false)
                setPasswordSuccess(false)
                setNewPassword('')
                setConfirmPassword('')
            }, 1500)
        }
    }

    async function handleSignOut() {
        await signOut()
    }

    return (
        <div className="app-layout">
            {/* 侧边栏 */}
            <aside className="sidebar">
                <div className="logo">
                    <h1>🏆 绩效管理</h1>
                </div>

                <nav className="nav-menu">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* 主内容区 */}
            <div className="main-wrapper">
                {/* 顶部用户栏 */}
                <header className="top-bar">
                    <div className="top-bar-left">
                        {/* 可以放搜索或其他内容 */}
                    </div>
                    <div className="top-bar-right">
                        <div className="user-menu-container">
                            <button
                                className="user-btn"
                                onClick={() => setShowUserMenu(!showUserMenu)}
                            >
                                <span className="user-avatar">👤</span>
                                <span className="user-email">{user?.email}</span>
                                <span className="dropdown-arrow">▼</span>
                            </button>

                            {showUserMenu && (
                                <div className="user-dropdown">
                                    <button onClick={() => { setShowPasswordModal(true); setShowUserMenu(false); }}>
                                        🔑 修改密码
                                    </button>
                                    <button onClick={handleSignOut} className="logout-btn">
                                        🚪 退出登录
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* 页面内容 */}
                <main className="main-content">
                    <Outlet />
                </main>
            </div>

            {/* 修改密码弹窗 */}
            {showPasswordModal && (
                <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>🔑 修改密码</h2>
                        {passwordSuccess ? (
                            <div className="success-message">✅ 密码修改成功！</div>
                        ) : (
                            <form onSubmit={handleChangePassword}>
                                {passwordError && <div className="error-msg">{passwordError}</div>}
                                <div className="form-group">
                                    <label>新密码</label>
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
