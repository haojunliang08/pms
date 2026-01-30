# 构建阶段
FROM node:20-alpine AS build
WORKDIR /app

# 声明构建参数（用于接收 GitHub Actions 传入的环境变量）
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# 设置环境变量（Vite 构建时会读取这些）
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建生产版本（此时 Vite 会将环境变量注入到代码中）
RUN npm run build

# 生产阶段
FROM nginx:alpine

# 复制构建产物到 nginx
COPY --from=build /app/dist /usr/share/nginx/html

# 复制 nginx 配置（支持 SPA 路由）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露 80 端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
