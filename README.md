# 绩效管理系统 (PMS)

一个现代化的绩效管理系统，基于 React + TypeScript + Supabase 构建，部署在 EdgeOne。

## 🚀 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 7
- **路由**: React Router 7
- **数据库**: Supabase (PostgreSQL)
- **部署平台**: EdgeOne Pages

## 📁 项目结构

```
pms/
├── src/                    # 源代码目录
│   ├── components/         # 通用组件（布局、导航等）
│   ├── lib/                # 工具库（Supabase 客户端等）
│   ├── pages/              # 页面组件（仪表盘、员工管理等）
│   ├── types/              # TypeScript 类型定义
│   ├── main.tsx            # 应用启动入口
│   ├── App.tsx             # 主组件，配置路由
│   └── index.css           # 全局样式
├── supabase/               # 数据库相关
│   └── init.sql            # 数据库初始化脚本
├── public/                 # 静态资源
├── edgeone.json            # EdgeOne 部署配置
├── .env.example            # 环境变量示例
└── package.json            # 项目配置和依赖
```

## 🛠️ 开始使用

### 第一步：安装依赖

```bash
npm install
```

### 第二步：配置 Supabase 数据库

1. 访问 [Supabase 官网](https://supabase.com) 并登录
2. 点击 "New Project" 创建新项目
3. 进入项目后，点击左侧的 "SQL Editor"
4. 将 `supabase/init.sql` 的内容复制粘贴进去并执行
5. 执行成功后，数据库表就创建好了

### 第三步：获取 Supabase 连接信息

1. 在 Supabase 项目中，点击左侧的 "Settings" -> "API"
2. 复制 "Project URL" 和 "anon public" 密钥

### 第四步：配置环境变量

```bash
# 复制示例配置文件
cp .env.example .env

# 编辑 .env 文件，填入你的 Supabase 配置
```

`.env` 文件内容：
```
VITE_SUPABASE_URL=https://你的项目ID.supabase.co
VITE_SUPABASE_ANON_KEY=你的anon_key
```

### 第五步：启动本地开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 查看应用

### 第六步：构建生产版本

```bash
npm run build
```

构建产物会生成在 `dist/` 目录

## 🌐 部署到 EdgeOne

### 方法一：通过 Git 仓库部署（推荐）

1. 将代码推送到 GitHub 或 GitLab
2. 登录 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
3. 进入 "Pages 托管" -> "创建项目"
4. 选择 "连接 Git 仓库"，关联你的代码仓库
5. 配置构建设置：
   - 构建命令：`npm run build`
   - 输出目录：`dist`
6. 添加环境变量：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. 点击部署

### 方法二：手动上传部署

1. 本地执行 `npm run build`
2. 在 EdgeOne 控制台创建项目
3. 选择 "上传文件夹"
4. 上传 `dist/` 目录

## 📊 功能模块说明

### 仪表盘 (Dashboard)
- 显示系统数据概览（员工总数、待处理评估、进行中目标等）
- 提供快速操作入口

### 员工管理 (Employees)
- 查看所有员工列表
- 添加、编辑、删除员工信息

### 绩效评估 (Reviews)
- 创建员工绩效评估
- 管理评估状态（草稿、已提交、已批准）

### 目标管理 (Goals)
- 为员工设定工作目标
- 跟踪目标进度
- 管理目标状态

## 🔧 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run preview  # 预览生产版本
npm run lint     # 代码检查
```

## ❓ 常见问题

### Q: 页面显示 "Missing Supabase environment variables" 错误？
A: 请确保已创建 `.env` 文件并正确填写了 Supabase 配置。

### Q: 数据库表不存在？
A: 请在 Supabase SQL Editor 中执行 `supabase/init.sql` 脚本。

### Q: 本地开发时如何查看数据？
A: 可以在 Supabase 控制台的 "Table Editor" 中查看和编辑数据。

## 📝 开源协议

MIT License
