/**
 * ============================================================================
 * Login.tsx - 登录页面组件
 * ============================================================================
 * 
 * 【文件作用】
 * 系统登录页面，用户输入邮箱和密码进行登录。
 * 这是一个内部系统，用户由管理员创建，无需注册功能。
 * 
 * 【表单处理】
 * React 中有两种处理表单的方式：
 * 1. 受控组件（Controlled）- 表单值由 React state 控制
 * 2. 非受控组件（Uncontrolled）- 使用 ref 直接获取 DOM 值
 * 
 * 本文件使用受控组件方式，每次输入都更新 state。
 * 
 * 【页面流程】
 * 1. 用户输入邮箱和密码
 * 2. 点击登录按钮或按回车提交表单
 * 3. 调用 signIn 函数验证
 * 4. 成功则跳转到首页，失败则显示错误信息
 */

// ============================================================================
// 导入部分
// ============================================================================

/**
 * useState - 状态管理 Hook
 * 用于存储输入框的值、错误信息、加载状态
 */
import { useState, type FormEvent } from 'react'

/**
 * useNavigate - React Router 的导航 Hook
 * 用于在代码中进行页面跳转（不使用 <Link> 组件）
 */
import { useNavigate } from 'react-router-dom'

/** 导入认证 Hook，获取 signIn 函数 */
import { useAuth } from '../contexts/AuthContext'

/** 导入登录页面专用样式 */
import './Login.css'

// ============================================================================
// 组件定义
// ============================================================================

/**
 * 登录页面组件
 * 
 * export default 表示这是模块的默认导出
 * function Login() 是函数式组件的定义方式
 */
// 邮箱后缀选项
const EMAIL_SUFFIX_OPTIONS = [
    { value: '@labelvibe.com', label: '@labelvibe.com' },
    { value: '@qq.com', label: '@qq.com' },
    { value: '@163.com', label: '@163.com' },
    { value: 'custom', label: '自定义' },
]

export default function Login() {
    // =========== 状态定义 ===========

    /**
     * 邮箱前缀输入状态（当选择后缀时使用）
     */
    const [emailPrefix, setEmailPrefix] = useState('')

    /**
     * 邮箱后缀选择状态
     * 默认为 @labelvibe.com
     */
    const [emailSuffix, setEmailSuffix] = useState('@labelvibe.com')

    /**
     * 完整邮箱输入状态（当选择自定义时使用）
     */
    const [fullEmail, setFullEmail] = useState('')

    /** 密码输入状态 */
    const [password, setPassword] = useState('')

    /**
     * 错误信息状态
     * 登录失败时显示错误提示
     */
    const [error, setError] = useState('')

    /**
     * 加载状态
     * 登录请求进行中时为 true
     * 用于禁用登录按钮并显示"登录中..."
     */
    const [loading, setLoading] = useState(false)

    /**
     * 判断是否为自定义邮箱模式
     */
    const isCustomEmail = emailSuffix === 'custom'

    /**
     * 获取最终的完整邮箱地址
     */
    const getFinalEmail = () => {
        if (isCustomEmail) {
            return fullEmail
        }
        return emailPrefix + emailSuffix
    }

    // =========== Hook 使用 ===========

    /**
     * 从 AuthContext 获取 signIn 函数
     * 
     * 使用对象解构：{ signIn } = useAuth()
     * 只取需要的属性，而不是整个对象
     */
    const { signIn } = useAuth()

    /**
     * useNavigate 返回一个导航函数
     * 
     * 可以在代码中调用：navigate('/path')
     * 实现编程式导航（区别于声明式的 <Link>）
     */
    const navigate = useNavigate()

    // =========== 事件处理函数 ===========

    /**
     * 表单提交处理函数
     * 
     * async function - 异步函数，可以使用 await
     * 
     * @param e - FormEvent 类型的事件对象
     *           包含表单事件的相关信息
     */
    async function handleSubmit(e: FormEvent) {
        /**
         * 阻止表单默认提交行为
         * 
         * 默认情况下，表单提交会刷新页面
         * 在 SPA 中，我们不希望页面刷新
         * 使用 preventDefault() 阻止这个行为
         */
        e.preventDefault()

        // 清除之前的错误信息
        setError('')

        // 开始加载状态
        setLoading(true)

        /**
         * 调用登录函数
         * 
         * await 等待异步操作完成
         * signIn 返回 { error: string | null }
         * 使用解构赋值获取 error 属性
         */
        const { error } = await signIn(getFinalEmail(), password)

        // 处理登录结果
        if (error) {
            // 登录失败，显示错误信息
            setError('登录失败：邮箱或密码错误')
            // 关闭加载状态
            setLoading(false)
        } else {
            // 登录成功，跳转到首页
            // '/' 表示根路由（仪表盘页面）
            navigate('/')
            // 注意：成功后不需要 setLoading(false)
            // 因为页面会跳转，组件会卸载
        }
    }

    // =========== 渲染 JSX ===========

    /**
     * return 返回 JSX（JavaScript XML）
     * 
     * JSX 是 React 的语法扩展，看起来像 HTML
     * 但实际上会被编译成 JavaScript 函数调用
     * 
     * JSX 与 HTML 的区别：
     * - class -> className（class 是 JS 保留字）
     * - for -> htmlFor（for 是 JS 保留字）
     * - 驼峰命名：onclick -> onClick
     * - 必须有闭合标签：<input /> 而不是 <input>
     */
    return (
        // 最外层容器，应用登录页面样式
        <div className="login-container">
            {/* 登录卡片 */}
            <div className="login-card">
                {/* 头部区域：标题和副标题 */}
                <div className="login-header">
                    <h1>🏆 绩效管理系统</h1>
                    <p>请使用您的账号登录</p>
                </div>

                {/* 
                    登录表单
                    onSubmit 绑定提交事件处理函数
                */}
                <form onSubmit={handleSubmit} className="login-form">
                    {/* 
                        条件渲染：只有 error 有值时才渲染错误提示
                        
                        {error && <div>...</div>} 是短路求值：
                        - 如果 error 为空字符串（falsy），返回 error
                        - 如果 error 有值（truthy），返回 <div>
                        
                        这是 React 中常用的条件渲染模式
                    */}
                    {error && <div className="error-message">{error}</div>}

                    {/* 邮箱输入框组 */}
                    <div className="form-group">
                        <label htmlFor="email">邮箱</label>
                        <div className="email-input-wrapper">
                            {isCustomEmail ? (
                                /* 自定义模式：输入完整邮箱 */
                                <input
                                    id="email"
                                    type="email"
                                    value={fullEmail}
                                    onChange={(e) => setFullEmail(e.target.value)}
                                    placeholder="请输入完整邮箱"
                                    required
                                    autoComplete="email"
                                    className="email-full-input"
                                />
                            ) : (
                                /* 前缀+后缀模式 */
                                <input
                                    id="email"
                                    type="text"
                                    value={emailPrefix}
                                    onChange={(e) => setEmailPrefix(e.target.value)}
                                    placeholder="请输入邮箱前缀"
                                    required
                                    autoComplete="email"
                                    className="email-prefix-input"
                                />
                            )}
                            <select
                                value={emailSuffix}
                                onChange={(e) => {
                                    setEmailSuffix(e.target.value)
                                    // 切换模式时清空输入
                                    if (e.target.value === 'custom') {
                                        setFullEmail('')
                                    } else {
                                        setEmailPrefix('')
                                    }
                                }}
                                className="email-suffix-select"
                            >
                                {EMAIL_SUFFIX_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 密码输入框组 */}
                    <div className="form-group">
                        <label htmlFor="password">密码</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="请输入密码"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {/* 登录按钮 */}
                    <button
                        type="submit"  /* submit 类型会触发表单的 onSubmit */
                        className="login-btn"
                        disabled={loading}  /* 加载中时禁用按钮 */
                    >
                        {/* 
                            三元表达式条件渲染
                            语法：condition ? 真时内容 : 假时内容
                        */}
                        {loading ? '登录中...' : '登录'}
                    </button>
                </form>

                {/* 页脚提示 */}
                <div className="login-footer">
                    <p>如忘记密码，请联系管理员重置</p>
                </div>
            </div>
        </div>
    )
}
