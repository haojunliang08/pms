/**
 * 应用主组件 - 路由配置
 * 
 * 包含认证保护、路由配置和环境检查。
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isSupabaseConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Branches from './pages/Branches'
import Groups from './pages/Groups'
import Employees from './pages/Employees'
import QCAccuracy from './pages/QCAccuracy'
import Performance from './pages/Performance'
import ImportData from './pages/ImportData'
import './App.css'

// 环境配置检查组件
function ConfigCheck({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        color: '#fff',
        padding: '2rem'
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
  return <>{children}</>
}

// 受保护路由组件 - 未登录则跳转到登录页
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

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

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// 基于角色的路由保护组件
function RoleRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user } = useAuth()

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

// 路由配置组件
function AppRoutes() {
  return (
    <Routes>
      {/* 登录页面 - 无需认证 */}
      <Route path="/login" element={<Login />} />

      {/* 受保护的页面 - 需要认证 */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="branches" element={
          <RoleRoute allowedRoles={['admin']}>
            <Branches />
          </RoleRoute>
        } />
        <Route path="groups" element={
          <RoleRoute allowedRoles={['admin', 'manager']}>
            <Groups />
          </RoleRoute>
        } />
        <Route path="employees" element={
          <RoleRoute allowedRoles={['admin', 'manager']}>
            <Employees />
          </RoleRoute>
        } />
        <Route path="qc-accuracy" element={<QCAccuracy />} />
        <Route path="performance" element={<Performance />} />
        <Route path="import" element={
          <RoleRoute allowedRoles={['admin', 'manager']}>
            <ImportData />
          </RoleRoute>
        } />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <ConfigCheck>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ConfigCheck>
  )
}

export default App
