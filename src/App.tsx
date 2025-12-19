/**
 * ============================================================================
 * App.tsx - 应用主组件（路由配置）
 * ============================================================================
 * 
 * 【文件作用】
 * 配置整个应用的路由系统，定义哪个 URL 对应哪个页面。
 * 同时包含认证保护逻辑，未登录用户无法访问受保护页面。
 * 
 * 【什么是路由】
 * 单页应用（SPA）使用前端路由控制页面切换：
 * - /login -> 显示登录页面
 * - / -> 显示仪表盘
 * - /employees -> 显示员工管理页面
 * 
 * 不需要刷新页面，通过 JavaScript 切换显示的内容。
 * 
 * 【React Router 核心概念】
 * - BrowserRouter: 使用浏览器 History API 的路由器
 * - Routes: 路由规则容器
 * - Route: 单条路由规则
 * - Navigate: 重定向组件
 * - Link: 导航链接（不刷新页面）
 * - Outlet: 嵌套路由的占位符
 * 
 * 【组件层次结构】
 * App
 *  └─ ConfigCheck (检查 Supabase 配置)
 *      └─ AuthProvider (提供认证 Context)
 *          └─ BrowserRouter (路由器)
 *              └─ Routes (路由规则)
 *                  ├─ Route /login -> Login
 *                  └─ Route / -> ProtectedRoute -> Layout
 *                      ├─ Route / -> Dashboard
 *                      ├─ Route /branches -> RoleRoute -> Branches
 *                      └─ ... 其他页面
 */

// ============================================================================
// 导入部分
// ============================================================================

/**
 * 从 react-router-dom 导入路由相关组件
 * 
 * BrowserRouter - 使用 HTML5 history API 的路由器容器
 * Routes - 包含所有 Route 的父容器
 * Route - 定义单个路由规则（path 和 element）
 * Navigate - 用于重定向到其他路由
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

/** 导入 Supabase 配置检查函数 */
import { isSupabaseConfigured } from './lib/supabase'

/** 导入认证 Context 的 Provider 和 Hook */
import { AuthProvider, useAuth } from './contexts/AuthContext'

/** 导入布局组件（包含侧边栏和顶栏） */
import Layout from './components/Layout'

// ========== 导入页面组件 ==========
/** 登录页面 */
import Login from './pages/Login'
/** 仪表盘页面（首页） */
import Dashboard from './pages/Dashboard'
/** 子公司管理页面 */
import Branches from './pages/Branches'
/** 小组管理页面 */
import Groups from './pages/Groups'
/** 员工管理页面 */
import Employees from './pages/Employees'
/** 质检准确率查看页面 */
import QCAccuracy from './pages/QCAccuracy'
/** 绩效记录页面 */
import Performance from './pages/Performance'
/** 数据导入页面 */
import ImportData from './pages/ImportData'

/** 导入应用样式 */
import './App.css'

// ============================================================================
// ConfigCheck 组件
// ============================================================================

/**
 * 环境配置检查组件
 * 
 * 检查 Supabase 是否正确配置。
 * 如果未配置，显示配置指引；如果已配置，渲染子组件。
 * 
 * @param children - 子组件（React 特殊 props）
 * 
 * { children }: { children: React.ReactNode }
 * 这是 TypeScript 的解构语法 + 类型注解：
 * - { children } 从 props 对象中解构出 children
 * - : { children: React.ReactNode } 定义参数类型
 */
function ConfigCheck({ children }: { children: React.ReactNode }) {
  // 调用检查函数
  if (!isSupabaseConfigured()) {
    // 未配置时，显示配置指引页面
    // 使用内联样式（style 属性）定义样式
    return (
      <div style={{
        height: '100vh',           // 占满视口高度
        display: 'flex',           // 使用 Flexbox 布局
        flexDirection: 'column',   // 子元素垂直排列
        alignItems: 'center',      // 水平居中
        justifyContent: 'center',  // 垂直居中
        background: '#1a1a2e',     // 深色背景
        color: '#fff',             // 白色文字
        padding: '2rem'            // 内边距
      }}>
        <h1>⚠️ 需要配置数据库连接</h1>
        <p style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.7)' }}>
          检测到 Supabase 环境变量未配置。
        </p>
        <div style={{
          marginTop: '2rem',
          background: 'rgba(255,255,255,0.05)',
          padding: '1.5rem',
          borderRadius: '8px',
          maxWidth: '600px',
          textAlign: 'left'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>如何解决：</h3>
          <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
            <li>复制 <code>.env.example</code> 为 <code>.env</code></li>
            <li>填入 Supabase 的 URL 和 Key</li>
            <li>重启开发服务器</li>
          </ol>
        </div>
      </div>
    )
  }

  // 已配置，渲染子组件
  // <>{children}</> 是 React Fragment 简写，不产生额外 DOM 节点
  return <>{children}</>
}

// ============================================================================
// ProtectedRoute 组件
// ============================================================================

/**
 * 受保护路由组件
 * 
 * 用于包裹需要登录才能访问的页面。
 * 如果用户未登录，自动重定向到登录页面。
 * 
 * @param children - 受保护的页面内容
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // 从认证 Context 获取用户状态和加载状态
  const { user, loading } = useAuth()

  // 正在检查登录状态时，显示加载界面
  // 防止未登录用户短暂看到受保护内容
  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        color: '#fff'
      }}>
        <p>加载中...</p>
      </div>
    )
  }

  // 未登录，重定向到登录页面
  // replace 属性表示替换当前历史记录，防止用户后退回来
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // 已登录，渲染子组件（受保护的页面）
  return <>{children}</>
}

// ============================================================================
// RoleRoute 组件
// ============================================================================

/**
 * 基于角色的路由保护组件
 * 
 * 进一步限制某些页面只有特定角色可以访问。
 * 例如：branches 页面只有 admin 可以访问。
 * 
 * @param children - 页面内容
 * @param allowedRoles - 允许访问的角色数组
 */
function RoleRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user } = useAuth()

  // 用户未登录，或者角色不在允许列表中
  // includes() 检查数组是否包含某个值
  if (!user || !allowedRoles.includes(user.role)) {
    // 重定向回首页
    return <Navigate to="/" replace />
  }

  // 角色验证通过，渲染页面
  return <>{children}</>
}

// ============================================================================
// AppRoutes 组件
// ============================================================================

/**
 * 路由配置组件
 * 
 * 定义所有的路由规则。
 * 使用嵌套路由结构，Layout 作为父路由包含子页面。
 */
function AppRoutes() {
  return (
    <Routes>
      {/* ========== 公开路由：登录页面 ========== */}
      {/* 
        path="/login" - URL 路径
        element={<Login />} - 该路径对应渲染的组件
      */}
      <Route path="/login" element={<Login />} />

      {/* ========== 受保护的路由 ========== */}
      {/* 
        这是一个嵌套路由结构：
        - 父路由 path="/" 渲染 Layout 组件
        - Layout 组件内部使用 <Outlet /> 显示子路由内容
        - 子路由（index, branches, employees 等）在 <Outlet /> 位置渲染
      */}
      <Route
        path="/"
        element={
          // ProtectedRoute 确保用户已登录
          <ProtectedRoute>
            {/* Layout 提供侧边栏和顶栏 */}
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* 
          index 路由是默认子路由
          当访问 "/" 时，显示 Dashboard
        */}
        <Route index element={<Dashboard />} />

        {/* 
          branches 路由
          path="branches" 会与父路由组合成 "/branches"
          RoleRoute 限制只有 admin 可以访问
        */}
        <Route path="branches" element={
          <RoleRoute allowedRoles={['admin']}>
            <Branches />
          </RoleRoute>
        } />

        {/* 
          groups 路由
          admin 和 manager 都可以访问
        */}
        <Route path="groups" element={
          <RoleRoute allowedRoles={['admin', 'manager']}>
            <Groups />
          </RoleRoute>
        } />

        {/* employees 路由 */}
        <Route path="employees" element={
          <RoleRoute allowedRoles={['admin', 'manager']}>
            <Employees />
          </RoleRoute>
        } />

        {/* 
          qc-accuracy 和 performance 路由
          所有角色都可以访问，不需要 RoleRoute
        */}
        <Route path="qc-accuracy" element={<QCAccuracy />} />
        <Route path="performance" element={<Performance />} />

        {/* import 路由 */}
        <Route path="import" element={
          <RoleRoute allowedRoles={['admin', 'manager']}>
            <ImportData />
          </RoleRoute>
        } />
      </Route>
    </Routes>
  )
}

// ============================================================================
// App 主组件
// ============================================================================

/**
 * 应用主组件
 * 
 * 组合所有包装组件，构建完整的应用结构。
 * 
 * 组件嵌套顺序很重要：
 * 1. ConfigCheck - 最外层，确保配置正确
 * 2. AuthProvider - 提供认证 Context
 * 3. BrowserRouter - 启用路由功能
 * 4. AppRoutes - 具体的路由规则
 */
function App() {
  return (
    // 检查 Supabase 配置
    <ConfigCheck>
      {/* 提供认证 Context，让子组件可以使用 useAuth */}
      <AuthProvider>
        {/* 
          BrowserRouter 启用客户端路由
          使用 HTML5 History API，URL 看起来像普通 URL
          如：/dashboard，而不是 /#/dashboard
        */}
        <BrowserRouter>
          {/* 路由规则配置 */}
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ConfigCheck>
  )
}

// ============================================================================
// 导出
// ============================================================================

/**
 * 使用 export default 导出 App 组件
 * 
 * export default 表示这是模块的默认导出
 * 导入时可以使用任意名称：import App from './App'
 * 
 * 与命名导出 (export { App }) 不同：
 * - 默认导出只能有一个
 * - 命名导出可以有多个
 */
export default App
