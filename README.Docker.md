# 云隐修仙录 Docker 部署指南

## 快速开始

### 构建镜像

```bash
# 构建镜像(标签 latest)
docker build -t yunyin-xiuxian:latest .

# 构建时指定版本号
docker build -t yunyin-xiuxian:1.0.0 .
```

### 运行容器

#### 方式 1: docker run

```bash
# 前台运行
docker run -p 8080:80 yunyin-xiuxian:latest

# 后台运行
docker run -d \
  --name yunyin-xiuxian \
  --restart unless-stopped \
  -p 8080:80 \
  yunyin-xiuxian:latest

# 访问
open http://localhost:8080
```

#### 方式 2: docker-compose (推荐)

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 访问
open http://localhost:8080
```

## 镜像架构

- **基础镜像**: `node:20-alpine` (构建) + `nginx:alpine` (生产)
- **多阶段构建**: 减少最终镜像体积(~40MB vs ~1GB)
- **时区**: Asia/Shanghai
- **端口**: 80 (容器内) → 8080 (宿主机)

## 生产部署建议

### 1. 配置文件

修改 `.env.production`:

```bash
VITE_APP_TITLE=云隐修仙录
VITE_BASE_URL=/xiuxian/  # 部署到子路径时
```

### 2. Nginx 优化

`nginx.conf` 已包含:

- Gzip 压缩(文本资源压缩率 ~70%)
- 静态资源缓存(JS/CSS/图片缓存 1 年)
- 安全头(XSS/点击劫持防护)
- Vue Router 兜底(刷新不 404)

### 3. 资源限制

`docker-compose.yml` 已设置:

- CPU 限制: 最多 1 核,预留 0.25 核
- 内存限制: 最多 512MB,预留 128MB
- 日志滚动: 单文件 10MB,保留 3 个

### 4. 反向代理(可选)

使用 Traefik / Nginx Proxy Manager / Caddy 时:

```yaml
# docker-compose.yml 增加 labels
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.yunyin.rule=Host(`xiuxian.example.com`)"
  - "traefik.http.routers.yunyin.tls=true"
```

### 5. HTTPS 配置

方案 A: 反向代理层终止 SSL(推荐)

方案 B: 容器内启用 HTTPS(需挂载证书)

```bash
docker run -d \
  -p 443:443 \
  -v /path/to/cert.pem:/etc/nginx/ssl/cert.pem:ro \
  -v /path/to/key.pem:/etc/nginx/ssl/key.pem:ro \
  yunyin-xiuxian:latest
```

## 健康检查

容器内置健康检查,每 30 秒探测一次:

```bash
# 查看健康状态
docker inspect --format='{{.State.Health.Status}}' yunyin-xiuxian

# 手动探测
docker exec yunyin-xiuxian wget -qO- http://localhost/
```

## 存档数据说明

**重要**: 游戏存档存储在客户端浏览器 localStorage,不在容器内。

- 存档位置: 浏览器本地存储(`yunyin.*` 键)
- 容器重建: 不影响已有存档
- 迁移方法: 游戏内导出 `.save` 文件,新环境导入

## 故障排查

### 容器启动失败

```bash
# 查看日志
docker logs yunyin-xiuxian

# 进入容器检查
docker exec -it yunyin-xiuxian sh
ls -lh /usr/share/nginx/html/
```

### 端口冲突

```bash
# 修改映射端口
docker run -p 3000:80 yunyin-xiuxian:latest

# 或修改 docker-compose.yml
ports:
  - "3000:80"
```

### 资源不足

```bash
# 检查容器资源使用
docker stats yunyin-xiuxian

# 调整限制(docker-compose.yml)
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 1G
```

## 开发与生产分离

开发环境(热重载):

```bash
bun run dev
```

生产构建测试:

```bash
# 本地构建
bun run build
bun run preview

# Docker 构建
docker build -t yunyin-xiuxian:dev .
docker run -p 8080:80 yunyin-xiuxian:dev
```

## 清理资源

```bash
# 停止并删除容器
docker-compose down

# 删除镜像
docker rmi yunyin-xiuxian:latest

# 清理未使用的镜像和缓存
docker system prune -a
```

## CI/CD 集成示例

### GitHub Actions

```yaml
name: Build Docker Image
on:
  push:
    tags:
      - 'v*'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build image
        run: docker build -t yunyin-xiuxian:${{ github.ref_name }} .
      - name: Push to registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker push yunyin-xiuxian:${{ github.ref_name }}
```

## 许可证

本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans) 许可协议。

允许自由共享和演绎，但 **未经作者书面授权，禁止用于任何商业目的**。详见 [LICENSE](LICENSE) 文件。
