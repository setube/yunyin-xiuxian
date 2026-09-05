# ===== Stage 1: 构建阶段 =====
FROM oven/bun:1-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package.json bun.lock* ./

# 安装依赖(--frozen-lockfile 保证依赖锁定)
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 构建生产版本
RUN bun run build

# ===== Stage 2: 生产阶段(Nginx 服务) =====
FROM nginx:alpine

# 安装 tzdata 设置时区
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# 暴露端口
EXPOSE 80

# 启动 Nginx(前台运行)
CMD ["nginx", "-g", "daemon off;"]
