# AIops 平台 GitLab CI/CD 流水线文档

## 架构概览

```
本地开发 → git push → GitLab 仓库
                         ↓
                  触发 CI 流水线
                         ↓
              ┌──────────────────┐
              │  build（自动）     │
              │  docker build      │
              │  提前发现编译错误    │
              └────────┬─────────┘
                       ↓
              ┌──────────────────┐
              │  deploy（手动 ▶）  │
              │  Variables → .env  │
              │  docker compose up │
              └──────────────────┘
```

## 涉及文件清单

| 文件 | 位置 | 作用 |
|---|---|---|
| `.gitlab-ci.yml` | 项目根目录 | CI 流水线定义 |
| `.dockerignore` | 项目根目录 | 排除前端等无关文件 |
| `Docker/Dockerfile` | `Docker/` | 优化缓存的构建文件 |
| `Docker/docker-compose.prod.yml` | `Docker/` | 生产环境编排 |

---

## 一、GitLab Runner 安装与注册

### 1.1 在部署服务器上安装 Runner

```bash
# Debian / Ubuntu
curl -L "https://gitlab-runner-downloads.s3.amazonaws.com/latest/deb/gitlab-runner_amd64.deb" -o gitlab-runner.deb
dpkg -i gitlab-runner.deb

# CentOS / RHEL
curl -L "https://gitlab-runner-downloads.s3.amazonaws.com/latest/rpm/gitlab-runner_amd64.rpm" -o gitlab-runner.rpm
rpm -ivh gitlab-runner.rpm
```

### 1.2 注册 Runner

```bash
gitlab-runner register
```

交互式填写：

| 提示项 | 填写内容 |
|---|---|
| GitLab instance URL | 你的 GitLab 地址 |
| Registration token | GitLab 项目 → Settings → CI/CD → Runners → 复制 token |
| Description | `aiops-prod-runner`（自定义名称）|
| Tags | 留空（直接回车）|
| Executor | `shell` |

### 1.3 Runner 加入 docker 组

```bash
usermod -aG docker gitlab-runner
systemctl restart gitlab-runner
```

### 1.4 创建固定部署目录

```bash
mkdir -p /opt/aiops-platform
chown -R gitlab-runner:gitlab-runner /opt/aiops-platform
```

> 目录路径可自定义，修改 `.gitlab-ci.yml` 中 `GIT_CLONE_PATH` 即可。

---

## 二、GitLab CI/CD Variables 配置

### 2.1 入口

**GitLab 项目 → Settings → CI/CD → Variables → Add variable**

### 2.2 需配置的变量清单

**敏感变量（建议勾选 Masked，日志中隐藏值）：**

| 变量名 | 说明 | Masked |
|---|---|---|
| `DB_PASSWORD` | 数据库密码 | ✅ |
| `TOKEN_SIGN_KEY` | JWT 签名密钥 | ✅ |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey | ✅ |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 阿里云 SecretKey | ✅ |
| `FERNET_KEY` | SSH 加密密钥 | ✅ |
| `SMTP_PASSWORD` | 邮箱 SMTP 授权码 | ✅ |
| `OLLAMA_API_KEY` | Ollama API 密钥 | ✅ |

**非敏感变量（不勾选 Masked）：**

| 变量名 | 示例值 |
|---|---|
| `DB_HOST` | `host.docker.internal` |
| `DB_PORT` | `3306` |
| `DB_USER` | `root` |
| `DB_NAME` | `ai_ops` |
| `SERVER_SYNC_INTERVAL` | `30` |
| `PATROL_CRON` | `*/5` |
| `SMTP_HOST` | `smtp.qq.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `your_email@qq.com` |
| `OLLAMA_API_URL` | `http://172.22.0.1:11435` |
| `OLLAMA_MODEL` | `qwen2:7b` |
| `OLLAMA_TEMPERATURE` | `0.7` |
| `EMBEDDING_PROVIDER` | `ollama` |
| `EMBEDDING_MODEL` | `bge-m3:latest` |
| `EMBEDDING_DIMENSION` | `1024` |
| `CHROMA_HOST` | `localhost` |
| `CHROMA_PORT` | `8000` |

> 如果 compose 文件中已设默认值（`${VAR:-default}`），不配 GitLab Variable 则自动使用默认值。

---

## 三、CI 流水线说明

### 3.1 两个阶段

```yaml
stages:
  - build    # 自动执行
  - deploy   # 人工触发
```

### 3.2 build（自动构建）

- **触发时机**：推送到 `main` 分支时自动执行
- **目的**：提前暴露编译错误，不影响线上
- **执行内容**：`docker compose build backend`
- **镜像缓存**：依赖不变 → 复用缓存层（秒级）；依赖有变 → 重建依赖层（uv cache 加速）

### 3.3 deploy（人工部署）

- **触发时机**：必须去 GitLab UI 手动点击 ▶ 按钮
- **执行内容**：
  1. 从 GitLab CI Variables 拼装 `.env` 文件
  2. `docker compose up -d backend`（自动停旧启新）
  3. 输出最后 30 行容器日志

### 3.4 操作流程

```
1. git add → git commit → git push origin main
2. GitLab 自动执行 build（检查能否编译通过）
3. 确认要发布 → 进入 GitLab → CI/CD → Pipelines
4. 找到 deploy 阶段 → 点击 ▶ 按钮
5. 等待部署完成，查看日志确认
```

---

## 四、Dockerfile 缓存优化说明

Dockerfile 分为两层，最大化利用 Docker 层缓存：

```
依赖层（仅 pyproject.toml / uv.lock 变化时重建）
  ├── COPY pyproject.toml uv.lock
  ├── 创建空包骨架
  └── uv pip install（包括 pysqlite3）
       ↑ 使用 --mount=type=cache 保留 uv 下载缓存

代码层（每次代码变更只重建这两层，秒级完成）
  ├── COPY aiops/
  └── COPY main.py
```

| 场景 | 构建耗时 |
|---|---|
| 仅修改代码 | 秒级（依赖层全部缓存命中）|
| 新增/升级依赖 | 比首次快（uv cache 跳过下载）|
| 首次构建 | 全量安装（基准时间）|

---

## 五、恢复手动部署（回退）

如果 CI 出现问题需要紧急手动部署：

```bash
cd /opt/aiops-platform
cp .env.example .env && vim .env    # 手动填写环境变量
docker compose -f Docker/docker-compose.prod.yml up -d --build backend
```

---

## 六、常见问题

**Q：`git push` 后什么都没发生？**

- 确认 Runner 状态：`gitlab-runner status`
- 确认 `.gitlab-ci.yml` 在项目根目录
- 确认推的是 `main` 分支

**Q：build 阶段报权限错误？**

```bash
usermod -aG docker gitlab-runner
systemctl restart gitlab-runner
```

**Q：`.env` 找不到？**

- 确认所有必需变量已在 GitLab → Settings → CI/CD → Variables 中配置
- 哪些变量是"必需"的参照 docker-compose.prod.yml 中没有默认值（`${VAR}` 无 `:-default`）的项

**Q：`docker compose` 提示 "external network lx-app-net not found"？**

```bash
docker network create lx-app-net
```
