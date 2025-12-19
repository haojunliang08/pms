/**
 * ============================================================================
 * main.tsx - 应用程序入口文件
 * ============================================================================
 * 
 * 【文件作用】
 * 这是整个 React 应用的入口点，负责将 App 组件挂载到 HTML 页面中。
 * Vite 构建工具会从这个文件开始打包整个应用。
 * 
 * 【关键概念】
 * 1. createRoot - React 18 新的渲染 API，用于创建根节点
 * 2. StrictMode - React 的严格模式，帮助发现潜在问题
 * 3. 非空断言 (!) - TypeScript 语法，告诉编译器这个值一定存在
 * 
 * 【文件关系】
 * - 入口 HTML (index.html) 中有一个 id="root" 的 div
 * - 本文件将 App 组件渲染到这个 div 中
 * - App 组件是整个应用的根组件
 */

// ============================================================================
// 导入部分
// ============================================================================

// 从 React 库导入 StrictMode 组件
// StrictMode 是一个开发辅助工具，不会渲染任何 UI
// 它会在开发模式下检测以下问题：
// - 识别不安全的生命周期
// - 关于使用过时 API 的警告
// - 检测意外的副作用
import { StrictMode } from 'react'

// 从 react-dom/client 导入 createRoot 函数
// 这是 React 18 引入的新 API，用于创建根渲染容器
// 相比旧的 ReactDOM.render()，它支持并发特性
import { createRoot } from 'react-dom/client'

// 导入全局 CSS 样式
// 这些样式会应用到整个应用（CSS reset、基础样式等）
// 文件路径使用相对路径，./ 表示当前目录
import './index.css'

// 导入主应用组件
// App 组件是应用的根组件，包含路由配置和所有页面
// .tsx 扩展名可以省略，打包工具会自动补全
import App from './App.tsx'

// ============================================================================
// 应用挂载
// ============================================================================

/**
 * 创建根渲染容器并渲染应用
 * 
 * document.getElementById('root')
 * - 获取 index.html 中 id 为 'root' 的 DOM 元素
 * - 这个元素是整个 React 应用的挂载点
 * 
 * ! (非空断言操作符)
 * - TypeScript 语法，告诉编译器 getElementById 的返回值一定不是 null
 * - 因为我们确定 index.html 中存在 id="root" 的元素
 * - 如果不存在，应用会报错（开发时能快速发现问题）
 * 
 * createRoot()
 * - React 18 新 API，创建一个根渲染容器
 * - 支持并发渲染特性（Concurrent Features）
 * 
 * .render()
 * - 将 React 组件树渲染到 DOM 容器中
 * - 这里渲染的是包裹在 StrictMode 中的 App 组件
 */
createRoot(document.getElementById('root')!).render(
  // StrictMode 包裹整个应用
  // 在开发模式下会进行额外的检查和警告
  // 生产模式下不会有任何影响（会被移除）
  <StrictMode>
    {/* App 是应用的主组件，包含路由和所有功能 */}
    <App />
  </StrictMode>,
)
