/**
 * Supabase 客户端配置
 * 
 * 这个文件用于初始化 Supabase 客户端，所有与数据库的交互都通过这个客户端进行。
 * 
 * 使用前需要在 .env 文件中配置：
 * - VITE_SUPABASE_URL: Supabase 项目的 URL
 * - VITE_SUPABASE_ANON_KEY: Supabase 项目的匿名公钥
 */

import { createClient } from '@supabase/supabase-js'

// 从环境变量读取 Supabase 配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 检查必要的环境变量是否存在
const isConfigured = supabaseUrl && supabaseAnonKey

if (!isConfigured) {
    console.warn('缺少 Supabase 环境变量配置，请检查 .env 文件是否正确设置。')
}

// 创建并导出 Supabase 客户端实例
// 如果没有配置，这里会创建一个无法正常工作的客户端，但不会导致应用崩溃
// 这样我们可以在 UI 层展示友好的提示，而不是直接白屏
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
)

// 导出配置状态检查函数
export const isSupabaseConfigured = () => !!isConfigured
