/**
 * 认证上下文 (AuthContext)
 * 
 * 使用数据库 users 表进行认证，而非 Supabase Auth。
 * 会话信息存储在 localStorage 中，24小时后失效。
 */

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'

// 用户信息类型
interface AuthUser {
    id: string
    name: string
    email: string
    role: 'admin' | 'manager' | 'employee'
    branch_id: string | null
    group_id: string | null
}

// 会话数据类型
interface SessionData {
    user: AuthUser
    expiresAt: number  // 过期时间戳
}

// 认证上下文类型
interface AuthContextType {
    user: AuthUser | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<{ error: string | null }>
    signOut: () => void
    changePassword: (newPassword: string) => Promise<{ error: string | null }>
}

const SESSION_KEY = 'pms_session'
const SESSION_DURATION = 24 * 60 * 60 * 1000  // 24小时（毫秒）

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // 检查本地存储的会话
        checkSession()
    }, [])

    function checkSession() {
        try {
            const sessionStr = localStorage.getItem(SESSION_KEY)
            if (!sessionStr) {
                setLoading(false)
                return
            }

            const session: SessionData = JSON.parse(sessionStr)

            // 检查是否过期
            if (Date.now() > session.expiresAt) {
                localStorage.removeItem(SESSION_KEY)
                setUser(null)
            } else {
                setUser(session.user)
            }
        } catch {
            localStorage.removeItem(SESSION_KEY)
        } finally {
            setLoading(false)
        }
    }

    async function signIn(email: string, password: string) {
        try {
            // 调用数据库验证函数
            const { data, error } = await supabase.rpc('verify_user_login', {
                p_email: email,
                p_password: password,
            })

            if (error) {
                console.error('登录错误:', error)
                return { error: '登录失败，请检查邮箱和密码' }
            }

            if (!data || data.length === 0) {
                return { error: '邮箱或密码错误' }
            }

            const userData = data[0]
            const authUser: AuthUser = {
                id: userData.user_id,
                name: userData.user_name,
                email: userData.user_email,
                role: userData.user_role,
                branch_id: userData.user_branch_id,
                group_id: userData.user_group_id,
            }

            // 保存会话到 localStorage
            const session: SessionData = {
                user: authUser,
                expiresAt: Date.now() + SESSION_DURATION,
            }
            localStorage.setItem(SESSION_KEY, JSON.stringify(session))

            setUser(authUser)
            return { error: null }
        } catch (err) {
            console.error('登录异常:', err)
            return { error: '登录失败，请稍后重试' }
        }
    }

    function signOut() {
        localStorage.removeItem(SESSION_KEY)
        setUser(null)
    }

    async function changePassword(newPassword: string) {
        if (!user) {
            return { error: '未登录' }
        }

        try {
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

    const value = {
        user,
        loading,
        signIn,
        signOut,
        changePassword,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth 必须在 AuthProvider 内部使用')
    }
    return context
}
