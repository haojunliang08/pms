/**
 * ============================================================================
 * AuthContext.tsx - 认证上下文组件
 * ============================================================================
 * 
 * 【文件作用】
 * 管理用户登录状态，提供登录、登出、修改密码等功能。
 * 使用 React Context API 让整个应用都能访问认证信息。
 * 
 * 【什么是 Context】
 * Context 是 React 的一种跨组件传递数据的方式。
 * 正常情况下，数据需要通过 props 一层一层传递（prop drilling）。
 * Context 可以让深层组件直接访问数据，不需要中间组件传递。
 * 
 * 典型场景：
 * - 用户认证状态（本文件）
 * - 主题设置（深色/浅色模式）
 * - 多语言设置
 * 
 * 【本项目的认证方式】
 * 不使用 Supabase Auth，而是：
 * 1. 用户表(users)存储密码哈希
 * 2. 登录时调用数据库函数验证密码
 * 3. 会话信息存储在 localStorage
 * 4. 24小时后会话过期，需要重新登录
 * 
 * 【文件结构】
 * 1. 类型定义 - 定义用户信息、会话、Context 的结构
 * 2. 常量定义 - localStorage 键名、会话时长
 * 3. AuthProvider - 提供认证功能的组件
 * 4. useAuth - 使用认证功能的 Hook
 */

// ============================================================================
// 导入依赖
// ============================================================================

/**
 * React 核心 API 导入
 * 
 * createContext - 创建 Context 对象
 * useContext - 在组件中使用 Context
 * useEffect - 执行副作用（如组件挂载时检查会话）
 * useState - 管理组件状态
 */
import { createContext, useContext, useEffect, useState } from 'react'

/**
 * ReactNode 类型
 * 表示任何可以渲染的内容：字符串、数字、JSX、数组等
 * 用于定义 children 属性的类型
 */
import type { ReactNode } from 'react'

/** 导入 Supabase 客户端，用于调用数据库验证函数 */
import { supabase } from '../lib/supabase'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 认证用户信息类型
 * 
 * 登录成功后，从数据库获取的用户基本信息
 * 不包含密码等敏感信息
 */
interface AuthUser {
    id: string                              // 用户唯一标识
    name: string                            // 用户姓名
    email: string                           // 邮箱（登录账号）
    role: 'admin' | 'manager' | 'employee'  // 用户角色
    branch_id: string | null                // 所属子公司ID
    group_id: string | null                 // 所属小组ID
}

/**
 * 会话数据类型
 * 
 * 存储在 localStorage 中的数据结构
 * 包含用户信息和过期时间
 */
interface SessionData {
    user: AuthUser          // 用户信息
    expiresAt: number       // 过期时间戳（毫秒）
}

/**
 * 认证上下文类型
 * 
 * 定义 Context 对外提供的所有数据和方法
 * 使用 Context 的组件可以访问这些内容
 */
interface AuthContextType {
    user: AuthUser | null       // 当前登录用户，未登录时为 null
    loading: boolean            // 是否正在检查登录状态

    /**
     * 登录函数
     * @param email - 邮箱
     * @param password - 密码
     * @returns Promise 包含 error 字段，null 表示成功
     * 
     * Promise<{ error: string | null }> 说明：
     * - Promise 表示这是异步函数
     * - { error: string | null } 是返回值类型
     * - error 为 null 表示成功，有值表示失败原因
     */
    signIn: (email: string, password: string) => Promise<{ error: string | null }>

    /** 登出函数，清除会话并重置用户状态 */
    signOut: () => void

    /**
     * 修改密码函数
     * @param oldPassword - 原密码
     * @param newPassword - 新密码
     * @returns Promise 包含 error 字段
     */
    changePassword: (oldPassword: string, newPassword: string) => Promise<{ error: string | null }>
}

// ============================================================================
// 常量定义
// ============================================================================

/** localStorage 中存储会话的键名 */
const SESSION_KEY = 'pms_session'

/**
 * 会话有效期：24小时（毫秒）
 * 
 * 计算：24小时 × 60分钟 × 60秒 × 1000毫秒
 * = 86,400,000 毫秒
 */
const SESSION_DURATION = 24 * 60 * 60 * 1000

// ============================================================================
// Context 创建
// ============================================================================

/**
 * 创建认证 Context
 * 
 * createContext<T>(defaultValue) 参数说明：
 * - T 是 Context 值的类型
 * - defaultValue 是默认值，当组件不在 Provider 内部时使用
 * 
 * undefined 作为默认值的用意：
 * - 如果useAuth 在 AuthProvider 外部被调用
 * - context 为 undefined，下面会抛出错误
 * - 帮助开发者快速发现问题
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ============================================================================
// AuthProvider 组件
// ============================================================================

/**
 * 认证提供者组件
 * 
 * 这是一个 Provider 组件，包裹整个应用
 * 被包裹的组件（及其子组件）都可以通过 useAuth 访问认证状态
 * 
 * @param children - 子组件，React 特殊 prop
 * 
 * 组件结构示意：
 * <AuthProvider>      <- 提供认证 Context
 *   <App>             <- 可以使用 useAuth
 *     <Header>        <- 可以使用 useAuth
 *     <Dashboard>     <- 可以使用 useAuth
 *   </App>
 * </AuthProvider>
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    // =========== 状态定义 ===========

    /**
     * 当前登录用户状态
     * 
     * useState<T>(initialValue) 说明：
     * - T 是状态的类型（这里是 AuthUser | null）
     * - initialValue 是初始值（这里是 null，表示未登录）
     * - 返回 [当前值, 更新函数] 的数组
     * 
     * 解构赋值：const [user, setUser] = useState(...)
     * - user: 当前状态值
     * - setUser: 更新状态的函数
     */
    const [user, setUser] = useState<AuthUser | null>(null)

    /**
     * 加载状态
     * 
     * 用于显示加载指示器，直到会话检查完成
     * 初始值 true，检查完成后设为 false
     */
    const [loading, setLoading] = useState(true)

    // =========== 副作用：组件挂载时检查会话 ===========

    /**
     * useEffect Hook
     * 
     * 用于执行"副作用"操作，如：
     * - API 请求
     * - DOM 操作
     * - 订阅事件
     * - 读写 localStorage
     * 
     * 参数说明：
     * - 第一个参数：执行的函数
     * - 第二个参数：依赖数组 []
     *   - 空数组 [] 表示只在组件挂载时执行一次
     *   - 如果有值如 [userId]，则 userId 变化时重新执行
     */
    useEffect(() => {
        // 组件挂载时，检查 localStorage 中是否有有效会话
        checkSession()
    }, []) // 空数组：仅在挂载时执行

    // =========== 函数定义 ===========

    /**
     * 检查本地存储的会话
     * 
     * 从 localStorage 读取会话数据
     * 验证会话是否过期
     * 根据结果设置用户状态
     */
    function checkSession() {
        try {
            // 从 localStorage 读取会话字符串
            const sessionStr = localStorage.getItem(SESSION_KEY)

            // 如果没有会话数据，直接结束加载
            if (!sessionStr) {
                setLoading(false)
                return
            }

            // 将 JSON 字符串解析为对象
            // localStorage 只能存储字符串，所以需要 JSON.parse
            const session: SessionData = JSON.parse(sessionStr)

            // 检查会话是否过期
            // Date.now() 返回当前时间戳（毫秒）
            if (Date.now() > session.expiresAt) {
                // 会话已过期，清除并重置状态
                localStorage.removeItem(SESSION_KEY)
                setUser(null)
            } else {
                // 会话有效，恢复用户状态
                setUser(session.user)
            }
        } catch {
            // 解析失败（数据损坏），清除会话
            // catch 不带参数是 TypeScript/JavaScript 新语法
            localStorage.removeItem(SESSION_KEY)
        } finally {
            // finally 块始终执行，无论是否有错误
            // 确保加载状态最终被设为 false
            setLoading(false)
        }
    }

    /**
     * 登录函数
     * 
     * async function 表示异步函数，内部可以使用 await
     * 
     * @param email - 用户邮箱
     * @param password - 用户密码
     * @returns { error: string | null } - 错误信息，null 表示成功
     */
    async function signIn(email: string, password: string) {
        try {
            /**
             * 调用数据库验证函数
             * 
             * supabase.rpc('函数名', 参数对象) 调用 PostgreSQL 函数
             * verify_user_login 是在数据库中定义的函数，功能：
             * 1. 根据邮箱查找用户
             * 2. 验证密码哈希是否匹配
             * 3. 返回用户信息或空结果
             * 
             * 参数命名约定：p_ 前缀表示 parameter（参数）
             */
            const { data, error } = await supabase.rpc('verify_user_login', {
                p_email: email,
                p_password: password,
            })

            // 数据库调用出错
            if (error) {
                console.error('登录错误:', error)
                return { error: '登录失败，请检查邮箱和密码' }
            }

            // 未找到匹配的用户（邮箱或密码错误）
            if (!data || data.length === 0) {
                return { error: '邮箱或密码错误' }
            }

            // 登录成功，构建用户对象
            // data[0] 是返回的第一条（也是唯一一条）记录
            const userData = data[0]
            const authUser: AuthUser = {
                id: userData.user_id,
                name: userData.user_name,
                email: userData.user_email,
                role: userData.user_role,
                branch_id: userData.user_branch_id,
                group_id: userData.user_group_id,
            }

            // 构建会话对象，包含过期时间
            const session: SessionData = {
                user: authUser,
                expiresAt: Date.now() + SESSION_DURATION, // 当前时间 + 24小时
            }

            // 保存到 localStorage
            // JSON.stringify 将对象转换为 JSON 字符串
            localStorage.setItem(SESSION_KEY, JSON.stringify(session))

            // 更新状态
            setUser(authUser)

            // 返回成功
            return { error: null }
        } catch (err) {
            // 捕获意外错误
            console.error('登录异常:', err)
            return { error: '登录失败，请稍后重试' }
        }
    }

    /**
     * 登出函数
     * 
     * 简单的同步操作，不需要 async
     */
    function signOut() {
        // 清除 localStorage 中的会话
        localStorage.removeItem(SESSION_KEY)
        // 重置用户状态为 null
        setUser(null)
    }

    /**
     * 修改密码函数
     * 
     * 流程：
     * 1. 验证原密码是否正确
     * 2. 调用数据库函数更新密码
     */
    async function changePassword(oldPassword: string, newPassword: string) {
        // 检查是否已登录
        if (!user) {
            return { error: '未登录' }
        }

        try {
            // 第一步：验证原密码
            // 通过登录验证来确认原密码正确
            const { data: verifyData, error: verifyError } = await supabase.rpc('verify_user_login', {
                p_email: user.email,
                p_password: oldPassword,
            })

            // 原密码验证失败
            if (verifyError || !verifyData || verifyData.length === 0) {
                return { error: '原密码错误' }
            }

            // 第二步：调用修改密码函数
            const { error } = await supabase.rpc('change_user_password', {
                p_user_id: user.id,
                p_new_password: newPassword,
            })

            if (error) {
                console.error('修改密码错误:', error)
                return { error: '修改密码失败' }
            }

            return { error: null }
        } catch (err) {
            console.error('修改密码异常:', err)
            return { error: '修改密码失败，请稍后重试' }
        }
    }

    // =========== Context 值对象 ===========

    /**
     * 将要通过 Context 提供的所有数据和方法
     * 
     * 这个对象会传递给 <AuthContext.Provider value={value}>
     * 所有使用 useAuth() 的组件都能访问这些内容
     */
    const value = {
        user,
        loading,
        signIn,
        signOut,
        changePassword,
    }

    // =========== 渲染 ===========

    /**
     * 返回 Provider 组件
     * 
     * <AuthContext.Provider value={value}>
     * 将 value 对象提供给所有后代组件
     * 
     * {children} 渲染所有子组件
     * 子组件可以是任何内容（如 <App />）
     */
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

// ============================================================================
// useAuth Hook
// ============================================================================

/**
 * 使用认证 Context 的 Hook
 * 
 * 自定义 Hook 的命名约定：以 use 开头
 * 
 * 使用方式：
 * function MyComponent() {
 *   const { user, signIn, signOut } = useAuth()
 *   // ...
 * }
 * 
 * @returns AuthContextType - 认证上下文的所有数据和方法
 * @throws Error - 如果在 AuthProvider 外部使用会抛出错误
 */
export function useAuth() {
    // 获取 Context 值
    const context = useContext(AuthContext)

    // 检查是否在 Provider 内部使用
    // 如果不在，context 会是 undefined（createContext 的默认值）
    if (context === undefined) {
        throw new Error('useAuth 必须在 AuthProvider 内部使用')
    }

    // 返回 Context 值
    return context
}
