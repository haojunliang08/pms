/**
 * ============================================================================
 * supabase.ts - Supabase 数据库客户端配置
 * ============================================================================
 * 
 * 【文件作用】
 * 初始化并导出 Supabase 客户端实例。
 * 所有与数据库的增删改查操作都通过这个客户端进行。
 * 
 * 【什么是 Supabase】
 * Supabase 是一个开源的后端即服务（BaaS）平台，提供：
 * - PostgreSQL 数据库托管
 * - 实时数据订阅
 * - 身份验证（本项目未使用，使用自定义认证）
 * - 存储服务
 * - 边缘函数
 * 
 * 【环境变量】
 * Vite 项目中，环境变量必须以 VITE_ 开头才能在客户端代码中访问
 * 敏感信息（如 API 密钥）应该放在 .env 文件中，不要提交到版本控制
 * 
 * 【使用方式】
 * 在其他文件中：import { supabase } from '../lib/supabase'
 * 然后调用：supabase.from('表名').select('*')
 */

// ============================================================================
// 导入依赖
// ============================================================================

/**
 * 从 Supabase JS 库导入 createClient 函数
 * 
 * @supabase/supabase-js 是 Supabase 官方的 JavaScript/TypeScript 客户端库
 * createClient 用于创建一个可以与 Supabase 项目通信的客户端实例
 */
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// 环境变量读取
// ============================================================================

/**
 * 从环境变量读取 Supabase 配置
 * 
 * import.meta.env 是 Vite 提供的访问环境变量的方式
 * - import.meta 是 ES 模块的元信息对象
 * - .env 是 Vite 注入的环境变量对象
 * 
 * VITE_SUPABASE_URL
 * - Supabase 项目的 API 地址
 * - 格式: https://xxxxx.supabase.co
 * - 在 Supabase 控制台的 Settings > API 中获取
 * 
 * VITE_SUPABASE_ANON_KEY
 * - Supabase 项目的匿名公钥（anon key）
 * - 这是一个可以安全暴露在客户端的密钥
 * - 它只允许执行 RLS (Row Level Security) 策略允许的操作
 * - 不是服务端密钥（service_role key），那个不能暴露
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ============================================================================
// 配置检查
// ============================================================================

/**
 * 检查必要的环境变量是否存在
 * 
 * 使用逻辑与 (&&) 确保两个变量都有值
 * 如果任一为 undefined/null/空字符串，isConfigured 为 false
 * 
 * 这种检查很重要，因为：
 * 1. 新克隆项目时可能忘记配置 .env 文件
 * 2. 部署时可能遗漏环境变量配置
 * 3. 提前检查可以给出友好的错误提示
 */
const isConfigured = supabaseUrl && supabaseAnonKey

// 如果没有配置环境变量，在控制台输出警告
// console.warn 输出黄色警告信息，不会中断程序执行
if (!isConfigured) {
    console.warn('缺少 Supabase 环境变量配置，请检查 .env 文件是否正确设置。')
}

// ============================================================================
// 创建客户端实例
// ============================================================================

/**
 * 创建并导出 Supabase 客户端实例
 * 
 * createClient(url, key) 参数说明：
 * @param url - Supabase 项目的 API URL
 * @param key - Supabase 项目的 API Key（使用 anon key）
 * 
 * 为什么使用占位符？
 * - 即使没有配置环境变量，也创建一个客户端实例
 * - 这样应用不会因为缺少配置就崩溃
 * - 我们可以在 UI 层显示友好的配置提示，而不是白屏报错
 * - 占位符 URL 不会导致真正的请求被发送
 * 
 * 使用 export 导出，其他文件可以直接 import 使用：
 * import { supabase } from './lib/supabase'
 */
export const supabase = createClient(
    // 使用短路求值：如果 supabaseUrl 存在则使用它，否则使用占位符
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
)

// ============================================================================
// 辅助函数导出
// ============================================================================

/**
 * 导出配置状态检查函数
 * 
 * 使用箭头函数语法：() => 返回值
 * !! 是双重否定，将值转换为布尔类型：
 * - undefined -> false
 * - null -> false
 * - '' (空字符串) -> false
 * - 'https://...' (有值) -> true
 * 
 * 这个函数用于：
 * - App.tsx 中的 ConfigCheck 组件判断是否显示配置提示
 * - 其他需要判断 Supabase 是否可用的地方
 */
export const isSupabaseConfigured = () => !!isConfigured
