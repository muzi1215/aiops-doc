# AIOps 智能运维平台

基于 **FastAPI + SQLAlchemy 2.0 + AI 大模型** 的智能运维平台，提供服务器资产管理、服务巡检监控、智能告警、AI 智能分析报告、RAG 知识库问答、数据采集分析、数据库备份管理、SSH 远程执行等能力。

**架构特色**：各模块通过 `api/` 子包进行跨模块通信，不直接引用外部 Model/Service，为后续微服务拆分做好准备。

---

## 目录

- [技术栈](#技术栈)
- [功能模块](#功能模块)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [1. 配置环境变量](#1-配置环境变量)
  - [2. 本地开发运行](#2-本地开发运行)
  - [3. Docker 部署](#3-docker-部署)
- [模块详细说明](#模块详细说明)
  - [认证授权模块 (auth)](#认证授权模块-auth)
  - [服务器管理模块 (server)](#服务器管理模块-server)
  - [AI 智能分析模块 (ai)](#ai-智能分析模块-ai)
  - [公共模块 (common)](#公共模块-common)
  - [配置模块 (config)](#配置模块-config)
  - [工具模块 (util)](#工具模块-util)
- [API 接口一览](#api-接口一览)
- [二次开发指南](#二次开发指南)
  - [开发规范](#开发规范)
  - [新增一个业务模块](#新增一个业务模块)
  - [新增一个 API 接口](#新增一个-api-接口)
  - [数据库变更](#数据库变更)
  - [配置管理](#配置管理)
- [部署架构](#部署架构)
- [相关文档](#相关文档)

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **Web 框架** | FastAPI 0.136+ | 异步 Web 框架，自动生成 OpenAPI 文档 |
| **ORM** | SQLAlchemy 2.0 | 异步 ORM，Mapped 类型安全映射 |
| **数据库驱动** | asyncmy | MySQL 异步驱动 |
| **数据库迁移** | Alembic | 数据库版本管理 |
| **认证** | PyJWT (HS512) | JWT Token 认证，7 天有效期 |
| **密码加密** | bcrypt 4.0+ | 密码哈希，兼容 MD5 旧密码自动升级 |
| **定时任务** | APScheduler 3.10+ | 10 个定时调度（巡检/采集/分析/备份/校验/清理/DB巡检/工单超时/模型同步/调度热同步），cron 配置中心驱动、**修改热生效无需重启** |
| **SSH** | Paramiko 5.0+ | SSH 远程连接与命令执行 |
| **邮件** | smtplib | QQ邮箱 SMTP SSL 发送告警通知 |
| **日志** | Loguru | 结构化日志，按天滚动，INFO/ERROR 分离，全平台统一 `[模块名]` 前缀 |
| **AI 大模型** | LangChain + OpenAI SDK | 支持 Ollama / DeepSeek / OpenAI 多提供商 |
| **向量数据库** | ChromaDB | 文档向量存储与检索 |
| **RAG 检索** | BM25 + BGE-Reranker | 混合检索 + 重排序 + 邻居扩展 |
| **文档解析** | PyPDF + docx2txt | PDF / DOCX / TXT / JSON 解析 |
| **文本切分** | LangChain Text Splitters | RecursiveCharacterTextSplitter |
| **缓存** | Redis | 查询结果缓存（异步连接） |
| **云 SDK** | Alibaba Cloud SWAS / OSS | 阿里云服务器同步 + 对象存储 |
| **云存储** | 腾讯云 COS SDK | 数据库备份远程存储 |
| **重试机制** | Tenacity | 外部 API 调用自动重试 |
| **模板引擎** | Jinja2 | 代码生成器模板渲染 |
| **Excel** | openpyxl | 数据导入导出 |
| **WebSocket** | FastAPI WebSocket | 公告实时推送（广播+心跳） |
| **部署** | Docker + Docker Compose | 容器化部署，多阶段构建 |
| **前端** | Vue3 + Vite + TypeScript + Element Plus | 独立前端项目 (aiops-platform-ui/) |

---

## 功能模块

### 1. 认证授权 (auth)
- JWT Token 登录/登出 + **Redis Session 双重鉴权**
- 用户/角色/菜单/部门/岗位 CRUD
- 按钮级 RBAC 权限控制
- **在线用户管理（实时列表 + 强制踢下线 + 批量踢下线）**
- **封禁/锁定管理（单用户封禁 + 批量封禁 + 锁定/解锁）**
- **递增降级锁定引擎（5次→5分钟→15分钟→30分钟→1天，自动解封）**
- **多端登录控制**
- 操作日志 + 登录日志自动记录（含登录耗时）
- 图标管理

### 2. 系统管理 (system)
- 系统公告管理（富文本编辑、迭代时间线、WebSocket 实时推送）
- 首页大盘汇总（告警/巡检/服务器/同步/日志/RAG/AI 多维统计）

### 3. 服务器管理 (server)
- 服务器资产 CRUD（主机名/IP/环境/标签/负责人）
- 阿里云 ECS 自动同步
- SSH 凭证管理（密码/密钥加密存储）
- SSH 远程命令执行（含命令黑名单）
- 服务器状态后台同步

### 4. 服务巡检 (patrol)
- 定时自动巡检（CPU/内存/磁盘/系统负载）
- 多服务类型检测（Nginx/Docker/MySQL/Redis/Java/K8s）
- MySQL P99 级联指标（连接池使用率/慢查询）
- 巡检异常自动告警（含告警聚合防风暴）
- 邮件通知（QQ 邮箱 SMTP）
- ★ 全量扫描（`/admin/opsPatrolServiceConfig/scanServer`）：SSH 三路探测（systemd 单元/进程/端口/安装目录）发现服务器运行的服务，覆盖 18 类企业主流中间件 + 云原生组件（mysql/redis/nginx/docker/java/k8s/rabbitmq/elasticsearch/kafka/zookeeper/mongodb/postgresql/consul/etcd/minio/nacos/prometheus/grafana），勾选后一键加入巡检配置

### 5. AI 智能分析 (ai)
- 基于巡检+告警数据的 AI 智能运维分析报告
- 日志文件上传 + AI 智能分析
- 分析报告邮件发送
- 支持流式（SSE）和非流式输出
- 支持下载 PDF / DOCX 报告
- ★ 大模型调用记录（模型名称/耗时/调用者/业务场景/Token/成败）+ 模型限额（按角色分配调用次数，超限拒绝，详见 `docs/module-llm-invoke-log.md`）
- ★ 模型管理：服务商/当前模型进配置中心（页面切换即时生效，LLMClient 热重建）；模型列表手动/定时同步厂商接口（Ollama /api/tags、云厂商 /v1/models），配置中心下拉选择

### 6. RAG 知识库 (rag)
- 文档上传自动解析（PDF/DOCX/TXT/MD/JSON）
- 智能切块 → Embedding → 向量存储
- 混合检索（向量 + BM25 → RRF 融合 → BGE-Reranker 精排）
- 邻居 Chunk 上下文扩展
- 知识库问答（流式 SSE + 非流式）
- Redis 缓存加速

### 7. 数据采集 (collector)
- 自动发现运行中的服务（Java/Nginx/Docker/Redis/MySQL）
- 通过 SSH 远程采集服务运行指标
- 定时采集调度（cron 从配置表动态读取）
- 支持自定义采集策略和阈值

### 8. 数据统计与分析 (statistics) — ★ 已全面解耦
- 全模块零跨模块 Model 直引，所有数据访问走 api/ 子包
- 6 大分析引擎（资源/容量/趋势/异常/稳定性/评分）
- ★ 资源/容量/评分分析双通道：巡检系统级指标（CPU/内存/磁盘真实值）+ 采集服务级指标
- 评分分析：指标全 0 的服务标记"无数据"不参与评分；系统资源超阈值（CPU>90%/内存>90%/磁盘>85%）每项扣 10 分
- 首页大盘汇总（告警/巡检/备份/数据库检查/RAG 多维统计）

### 8. 工单管理 (workorder) — ★ 已上线
- 告警自动生成工单（独立事务，防锁冲突）：处理人=服务器负责人，审核人=部门主管
- SLA 驱动：优先级映射截止时间（紧急 2h / 高 8h / 中 24h / 低 72h），超时自动流转+催办
- **闭环设计**：审核通过才联动告警置为已处理（告警状态真实反映故障解决情况）
- 流转记录时间线 + WS 定向推送处理人 + 飞书@/邮件全链路通知
- 详见 `docs/module-workorder.md`
- 采集指标趋势分析与异常检测
- 多维度统计面板（告警/巡检/备份/数据库检查）
- 分析记录持久化与历史回溯
- 资源分析、容量分析、稳定性分析、趋势分析等子模块

### 9. 数据库管理中心 (dbcenter)
- 数据库资产管理（主机/端口/类型/环境/标签）
- SSH 隧道连接远程数据库
- 定时备份（mysqldump）+ 上传至阿里云 OSS / 腾讯云 COS
- 备份完整性校验 + 过期备份自动清理
- 备份跨区域复制同步
- 数据库巡检（连接检查/慢查询/表空间/连接数等）
- DB 智能助手（自然语言查询数据库）
- 对象存储管理（OSS/COS 文件浏览）
- 邮件通知（→ notification 模块）

### 10. 消息通知 (notification)
- 统一通知派发入口（`dispatcher.py`，8 个 `dispatch_xxx` 函数，8 种 `NotificationType` 枚举）
- **三层防线**：配置层（`notification.scene.*` 控制渠道开关）→ 代码层（`channel.supported_types` 硬排除）→ 回退层（异常不发送）
- 邮件：SMTP SSL → `email/api/email_common_send.py`（通用底层）→ 业务模板
- 飞书：Webhook 签名校验 → 文本/卡片消息，AI 返回 HTML 自动转纯文本
- 渠道管理器（`channels/`）：插件化注册，各渠道异常隔离互不影响

### 11. 配置中心 (configuration)
- `ConfigService` 单例：统一配置读写入口
- 三级缓存：内存 dict → Redis → MySQL，读取耗时 0.001ms
- **当前管理 13 条配置**：5 个调度 cron + 8 个通知场景配置
- 前端可视化配置页面，中文分类标签，JSON 编辑，支持热修改无需重启
- 软删除 `is_deleted`，启用状态排序优先

### 12. 统一存储 (storage) ★ 新增
- `StorageBackend` 抽象基类：统一 upload/download/exists/delete/get_url 接口
- 已实现：`LocalBackend` / `OSSBackend` / `COSBackend`
- 工厂模式：`get_backend("oss")` 按名称获取实例
- 异步包装：`asyncio.to_thread` 避免阻塞事件循环
- 可扩展：`register_backend("minio", MinioBackend)`

---

## 项目结构

```
aiops-platform/
├── main.py                              # FastAPI 应用入口
├── pyproject.toml                       # 项目依赖管理 (uv)
├── .env / .env.example                  # 环境变量配置
│
├── aiops/                               # 后端核心代码
│   ├── config/                          # 配置模块（MySQL/LLM/Redis/Log/COS/OSS/Backup）
│   ├── common/                          # 公共基础设施（BaseVO/Exception/WSManager/ResultResponse/SystemConfig）
│   │
│   ├── auth/                            # 认证授权 + 登录管理体系
│   │   ├── model/                       #   数据模型（11个表）
│   │   ├── routes/                      #   API 路由（14个文件）
│   │   ├── schemas/                     #   Pydantic 模型
│   │   └── service/                     #   业务逻辑 + ★ api/ 子包（供外部模块调用的用户查询接口）
│   │
│   ├── opscenter/                       # 服务器管理 + 巡检引擎（原 server/）
│   │   ├── model/                       #   数据模型（6个表）
│   │   ├── router/                      #   API 路由（8个文件）
│   │   ├── schemas/                     #   Pydantic 模型
│   │   └── service/                     #   巡检编排 + 告警 + ★ api/ 子包
│   │       ├── opserver/api/            #     服务器查询 API（供 AI/采集/通知调用）
│   │       ├── ops_patrol/api/          #     巡检查询 API（供 AI 调用）
│   │       ├── ops_alarm/api/           #     告警查询 API（供 AI 调用）
│   │       └── ops_credential/api/      #     凭证查询 API（供采集器调用）
│   │
│   ├── ai/                              # AI 智能模块
│   │   ├── core/                        #   LLM/RAG/Reranker/Vector 客户端
│   │   ├── data/                        #   ★ 数据提供层（调用外部 api/ 获取数据）
│   │   ├── model/                       #   RAG 文档模型
│   │   ├── router/                      #   API 路由（analysis/rag/log_analysis/db_assistant）
│   │   ├── schemas/                     #   Pydantic 模型
│   │   ├── service/                     #   核心分析编排（精简后 ~420行/文件）
│   │   └── util/                        #   ★ 工具函数（detail_parsers/format_utils/table_context_builder）
│   │
│   ├── dbcenter/                        # 数据库管理中心
│   │   ├── model/                       #   数据模型（10个表）
│   │   ├── router/                      #   API 路由（12个文件）
│   │   ├── schemas/                     #   Pydantic 模型
│   │   └── service/                     #   备份/巡检/云存储 + ★ api/ 子包
│   │
│   ├── notification/                    # ★ 消息通知模块
│   │   ├── dispatcher.py                #   统一通知派发入口
│   │   ├── email/api/                   #   邮件发送：通用 SMTP + 业务模板
│   │   ├── channels/                    #   渠道管理器
│   │   └── config/                      #   通知渠道配置
│   │
│   ├── configuration/                   # ★ 配置中心
│   │   ├── model/                       #   ORM 模型 + 配置常量 + DDL
│   │   ├── service/                     #   ConfigService + 三级缓存 + 兼容层
│   │   ├── api/                         #   跨模块查询接口
│   │   └── router/                      #   REST API 路由
│   │
│   ├── storage/                         # ★ 统一文件存储
│   │   ├── base.py                      #   StorageBackend ABC + OSS/COS/Local 实现
│   │   ├── registry.py                  #   后端注册表（工厂模式）
│   │   └── service.py                   #   异步包装层
│   │
│   ├── statistics/                      # 数据统计与分析模块
│   ├── collector/                       # 数据采集引擎
│   ├── codegen/                         # 代码生成器（开发工具）
│   │
│   └── util/                            # 工具模块（JWT/Log/SSH/SSH隧道/Random/Cron/Crypto）
│       ├── cron_utils.py                #   统一 cron 匹配
│       └── crypto_util.py               #   统一 Fernet 加解密
│
├── Docker/                              # Docker 部署文件
├── alembic/                             # 数据库迁移
├── chroma_db/                           # ChromaDB 向量数据库持久化
├── logs/                                # 应用日志
├── static/                              # 静态文件
├── aiops-platform-ui/                   # 前端项目 (Vue3 + Vite + TS + Element Plus)
│
├── scripts/                            # 运维脚本（create_patrol_account.sh 只读巡检账号一键创建）
└── docs/                                # 项目文档（面试讲解/排查手册/安全评估/SSH白名单/各模块文档）
```

---

## 快速开始

### 环境要求

| 组件 | 版本要求 |
|------|----------|
| Python | >= 3.10 |
| MySQL | 5.7+ / 8.0+ |
| Redis | 6.0+ |
| Ollama（可选） | 本地 AI 推理 |
| ChromaDB（可选） | 向量数据库 |
| Docker（部署） | 20.10+ |

### 1. 配置环境变量

```bash
cp .env.example .env
vim .env
```

**必填配置：**

```ini
# 数据库
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ai_ops

# JWT 密钥（务必修改为随机字符串）
TOKEN_SIGN_KEY=your-secret-key-change-me

# SMTP 邮件（告警通知）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_qq@qq.com
SMTP_PASSWORD=your_smtp_auth_code

# SSH 凭证加密密钥（务必修改）
FERNET_KEY=your-fernet-key

# 巡检调度间隔（分钟），默认 5
PATROL_CRON=*/5

# 运行环境：development / production（production 关闭 API 文档）
ENV=development
```

**可选 AI 配置：**

```ini
# 大模型提供商：ollama / deepseek / openai
LLM_PROVIDER=ollama

# Ollama 本地模型
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=qwen2:7b

# 或使用 DeepSeek
# LLM_PROVIDER=deepseek
# DEEPSEEK_API_KEY=sk-xxx
# DEEPSEEK_MODEL=deepseek-chat

# Embedding 模型（用于 RAG 知识库）
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=bge-m3:latest
EMBEDDING_DIMENSION=1024

# 阿里云 OSS（数据库备份远程存储，可选）
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET_NAME=xxx
OSS_REGION=cn-guangzhou

# 腾讯云 COS（数据库备份远程存储，可选）
COS_SECRET_ID=xxx
COS_SECRET_KEY=xxx
COS_REGION=ap-guangzhou
COS_BUCKET=xxx
```

### 2. 本地开发运行

```bash
# 1. 安装依赖（使用 uv）
pip install uv
uv pip install -e .

# 2. 初始化数据库（创建表结构）
# 参考 aiops/ai/model/rag_document.py 文件头部的 DDL 语句

# 3. 启动服务
uvicorn main:app --host 0.0.0.0 --port 2029 --reload

# 4. 访问 API 文档
open http://127.0.0.1:2029/docs
```

### 3. Docker 部署

```bash
# 进入 Docker 目录
cd Docker

# 确保 .env 文件存在
cp ../.env.example .env && vim .env

# 一键部署
bash deploy.sh

# 查看日志
docker compose -f docker-compose.prod.yml logs -f backend

# 重启服务
docker compose -f docker-compose.prod.yml restart backend

# 停止服务
docker compose -f docker-compose.prod.yml down
```

**Docker 部署架构说明：**

```
┌─────────────────────────────────────────┐
│  Docker Container: aiops-backend        │
│  ┌───────────────────────────────────┐  │
│  │  FastAPI (port 2029)              │  │
│  │  + APScheduler (巡检调度)          │  │
│  │  + asyncio background tasks       │  │
│  └───────────────────────────────────┘  │
│         │           │           │        │
│    host.docker    Redis    Ollama/API   │
│    .internal      (外部)    (外部)      │
│         │                               │
└─────────┼───────────────────────────────┘
          │
    宿主机 MySQL (3306)
```

---

## 模块详细说明

### 认证授权模块 (auth)

**数据表：** `sys_user`, `sys_role`, `sys_menu`, `sys_dept`, `sys_post`, `sys_user_role`, `sys_role_menu`, `sys_announcement`, `sys_login_log`, `sys_oper_log`, `sys_icon`

**核心流程：**

1. **登录（已升级）** → 封禁/锁定检查 → 递增降级锁定检查 → 密码校验 → JWT Token + **Redis Session (TTL 12h)** → 记录登录日志（含耗时）
2. **请求鉴权（已升级）** → HTTPBearer 解析 Token → 查询用户 → **Redis Session 存在性校验** → 注入 `current_user`
3. **登出（已升级）** → **删除 Redis Session** → 下次请求自动 401
4. **权限校验** → `require_perms("bnt.xxx.xxx")` → 查询用户权限列表 → 比对
5. **密码安全** → bcrypt 哈希 + 旧 MD5 密码自动升级

**权限标识命名规范：** `bnt.{模块}.{操作}`，如 `bnt.sysUser.list`, `bnt.sysUser.remove`

**用户管理追加功能：**
- `PUT /admin/sysUser/updateProfile` — 当前登录用户修改个人资料（邮箱、手机、性别、头像），无需管理员权限
- `PUT /admin/sysUser/updatePassword/{id}/{password}` — 管理员修改指定用户密码
- `PUT /admin/sysUser/updateStatus/{id}/{status}` — 启用/停用用户
- `DELETE /admin/sysUser/batchRemove` — 批量软删除用户

**系统公告功能：**
- 公告类型：日常公告（daily）、业务调整（biz）、迭代日志（iteration）
- 富文本编辑器支持图片上传（存储在 `/static/uploads/`）
- 发布时可通过 WebSocket 实时推送到所有在线客户端
- 支持发布/撤回状态切换，撤回后禁止编辑

### 首页大盘模块 (dashboard)

**路由：** `GET /admin/dashboard/summary`

聚合以下维度的统计数据进行集中展示：

| 维度 | 统计项 | 数据来源 |
|------|--------|---------|
| 告警统计 | 总数、高危/中危/低危数量、已处理/未处理、按类型分布 | `ops_alarm` |
| 巡检统计 | 总数、正常/异常数、按服务类型分布、最新 5 条记录 | `ops_service_patrol` |
| 服务器统计 | 总数、在线/离线/维护中、按环境分布、按云厂商分布 | `ops_server` |
| 同步统计 | 成功/未同步/失败数量 | `ops_server.sync_status` |
| 日志统计 | 今日登录数、本月登录数、近 30 天登录/操作趋势 | `sys_login_log`, `sys_oper_log` |
| RAG 统计 | 文档总数、就绪/处理中/失败、知识块总数、按文件类型分布 | `rag_document`, `rag_chunk` |
| AI 分析 | AI 分析报告生成次数 | `sys_oper_log` |

### 服务器管理 + 巡检引擎 (opscenter)

**数据表：** `ops_server`, `ops_credential`, `ops_service_patrol`, `ops_alarm`, `ops_patrol_service_config`

**跨模块 API**：提供 `api/` 子包供 AI/采集/通知模块调用（server_query_api / patrol_query_api / alarm_query_api / credential_query_api）

**巡检引擎工作流程：**

```
APScheduler (每5分钟)
  ├─→ 查询启用巡检且在线且有凭证的服务器列表
  ├─→ 逐台 SSH 连接
  │     ├─ 系统级采集：CPU / 内存 / 磁盘 / 负载 / OS 版本
  │     ├─ 服务检测：Nginx / Docker / MySQL / Redis / Java / K8s
  │     └─ MySQL P99 指标：连接数 / 连接池使用率 / 慢查询
  ├─→ 规则判断 → 超出阈值 → 创建告警
  │     ├─ 告警聚合：同服务器+同类型+30分钟窗口内 → 合并
  │     └─ 邮件通知：→ notification 模块统一发送 HTML 告警邮件
  └─→ 写入巡检记录 (ops_service_patrol) + 告警记录 (ops_alarm)
```

**告警类型：**
- 系统资源（CPU > 80% / 内存 > 85% / 磁盘 > 90%）
- 服务异常（关键服务停止运行）
- MySQL 连接池（使用率 > 80%）
- MySQL 慢查询（累计数 > 0）
- 巡检异常（SSH 连接失败）

**SSH 命令黑名单：**
```python
FORBIDDEN_COMMANDS = [
    (r"rm\s+-rf\s+/",      "禁止删除根目录"),
    (r"shutdown|reboot|halt", "禁止关机/重启"),
    (r"mkfs\.|dd\s+if=",   "禁止格式化/覆写磁盘"),
    (r">\s*/dev/sd",        "禁止覆写块设备"),
    (r"chmod\s+-R\s+777\s+/","禁止递归修改根目录权限"),
]
```

### AI 智能分析模块 (ai)

**子模块：**

| 子模块 | 功能 | 路由前缀 |
|--------|------|----------|
| RAG 知识库 | 文档上传/检索/智能问答 | `/admin/rag/` |
| AI 智能分析 | 巡检告警数据生成分析报告 | `/admin/aiAnalysis/` |
| 日志分析 | 上传日志文件 AI 分析 | `/admin/logAnalysis/` |

**RAG 检索流程（混合检索）：**

```
用户问题
  │
  ├─→ 向量检索 (ChromaDB, Top-20)
  ├─→ BM25 关键词检索 (Top-20)
  │
  ├─→ RRF (Reciprocal Rank Fusion) 融合去重
  │
  ├─→ BGE-Reranker 精排 (Top-5)
  │
  ├─→ 邻居 Chunk 扩展 (±10 个相邻块)
  │
  └─→ 构建 Prompt → LLM 生成回答（流式 SSE）
```

**支持的文档格式：** PDF, DOCX, TXT, MD, JSON, LOG

**LLM 提供商支持：**
- **Ollama**（本地部署，推荐 qwen2:7b + bge-m3）
- **DeepSeek**（云端 API）
- **OpenAI**（兼容接口）

### 公共模块 (common)

| 文件 | 作用 |
|------|------|
| `base_vo.py` | Pydantic 基类：`from_attributes=True` + 自动驼峰转换 |
| `base_model_mixin.py` | ORM 基类：`to_dict()` / `to_json()` / `__repr__` / `__str__` |
| `constant.py` | 业务响应码枚举（SUCCESS/FAIL/LOGIN_AUTH/PERMISSION 等） |
| `exception.py` | `BusinessException` + 4 个全局异常处理器 |
| `result_response.py` | `StandardJSONResponse` 统一响应格式包装 |
| `ws_manager.py` | WebSocket 连接管理器：连接/断开/广播/心跳，单例模式 |
| `model/ops_system_config.py` | 统一系统配置表（存储所有调度器 cron + 开关） |
| `service/system_config_service.py` | 系统配置读写服务 |

**日志规范：** 全平台统一使用 Loguru，所有日志遵循 `docs/logging-spec.md` 规范：
- 所有模块日志带 `[模块名]` 前缀（如 `[服务巡检]`、`[数据库巡检]`、`[API]` 等）
- 异常日志使用 `log.exception()`（自动含完整堆栈），禁止 `log.error(f"...{e}")`
- 关键操作记录耗时，路由入口/出口打印 `log.info`
- 禁止使用 `print()` 输出日志

**统一响应格式：**
```json
{
  "code": 200,
  "message": "success",
  "totalCount": 100,
  "page": 1,
  "limit": 10,
  "data": [...]
}
```

### 配置模块 (config)

| 文件 | 作用 |
|------|------|
| `create_mysql.py` | MySQL 异步引擎（pool_size=5, max_overflow=10）+ Session 依赖注入 |
| `llm_config.py` | LLM 多提供商配置（Pydantic Settings, 自动读取 .env） |
| `redis_config.py` | ★ Redis 异步连接池（Session 管理 + 递增锁定 + RAG 缓存） |
| `log_config.py` | Loguru 日志：控制台彩色 + 文件按天滚动 + INFO/ERROR 分离 |
| `cos_config.py` | 腾讯云 COS 对象存储配置 |
| `aliyun_oss_config.py` | 阿里云 OSS 对象存储配置 |
| `backup_config.py` | 数据库备份策略配置 |

### 数据库管理中心 (dbcenter)

**数据表：** `ops_database`, `ops_database_auth`, `ops_database_table`, `ops_database_backup`, `ops_database_backup_policy`, `ops_backup_replication`, `ops_backup_replication_log`, `ops_database_check_config`, `ops_database_check_record`

**定时调度（共 4 个任务，每分钟唤醒 + 内部 match_cron 匹配，cron 热生效）：**

1. **定时备份** — 查询启用备份策略的数据库 → SSH 隧道连接 → mysqldump（--single-transaction 一致性读）→ 上传 OSS/COS → 失败自动通知
2. **备份校验** — 校验备份文件完整性（文件存在 + 大小校验）
3. **过期清理** — 每小时清理 retention_days=0 且超过 1 天的备份文件（回收站机制）
4. **数据库巡检** — 连接检查 / 慢查询 / 表空间 / 连接数 / 版本信息巡检

**云存储支持：**
- 阿里云 OSS：上传/下载/删除/列表
- 腾讯云 COS：上传/下载/删除/列表
- 通过 `cloud_storage_adapter.py` 统一适配器模式

### 数据采集引擎 (collector)

**工作流程：**

```
服务发现（discovery.py）
  → 识别运行中的 Java/Nginx/Docker/Redis/MySQL 服务
  → 逐服务 SSH 采集运行指标
  → 解析指标数据 → 写入 ops_collector 表
  → 后续由分析调度器进行趋势分析和异常检测
```

**支持的采集器：** Java（JVM 堆内存/GC/线程）、Nginx（连接数/QPS）、Docker（容器状态/资源，含 total_mem_usage 汇总）、Redis（内存/连接/命中率）、MySQL（连接数/QPS/慢查询）

**命令级失败标记：** 核心命令执行失败（redis INFO/CONFIG 无返回、nginx stub_status 未开启、docker stats 无输出、mysql SHOW 无返回等）不再静默写 0 —— `CollectorResult.errors` 记录失败原因，采集明细 `collect_status=failed` + `error_message` 落库（已采到的数据保留），稳定性分析/失败分布/评分"无数据"自动生效

### 数据统计与分析 (statistics)

- **统计查询**：多维度聚合统计（告警/巡检/备份/数据库检查）
- **数据分析**：采集指标趋势分析、异常检测、资源/容量/稳定性分析（资源/容量/评分支持巡检系统级 + 采集服务级双通道）
- **记录持久化**：分析结果写入 `ops_analysis_record`，支持历史回溯
- **★ AI 数据分析**：分析记录 + 采集数据 → 大模型生成 Markdown 报告，保存到 `ops_ai_analysis_report` 可回看，MD/Excel 导出走后端接口权限校验（`bnt.aiDataAnalysis.generate/list/export`）

### 代码生成器 (codegen)

轻量级 CRUD 代码生成工具，从数据库表自动生成：
- 后端：Model / Router / Service / Schemas（4 个文件）
- 前端：API 接口 / Vue 列表页（2 个文件）
- API 端点：`/admin/codegen/tables`、`/admin/codegen/preview`、`/admin/codegen/download`
- 前端页面：`/#/codegen`（可视化操作页）
- 模板引擎：Jinja2（6 个模板）

### 工具模块 (util)

| 文件 | 作用 |
|------|------|
| `token_util.py` | JWT Token 生成/解析（HS512, 7天过期） |
| `log_util.py` | `@Log` AOP 装饰器（自动记录操作日志）+ UA 解析 + IP 定位 |
| `ssh_client.py` | Paramiko SSH 连接上下文管理器 + 异步命令执行 |
| `ssh_tunnel_util.py` | SSH 隧道连接工具（数据库远程连接） |
| `random_util.py` | `secrets` 安全随机数字 ID 生成（6-8位） |

---

## API 接口一览

### 认证接口
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/login` | 用户登录 | 无 |
| GET | `/info` | 获取当前用户信息 | Token |
| GET | `/logout` | 退出登录 | 无 |

### 系统管理 (需管理员权限)

#### 用户管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/sysUser/list/{page}/{limit}` | 用户分页查询 |
| GET | `/admin/sysUser/findAll` | 查询所有用户 |
| GET | `/admin/sysUser/get/{id}` | 根据 ID 查询用户详情 |
| POST | `/admin/sysUser/save` | 添加用户 |
| PUT | `/admin/sysUser/update` | 修改用户基本信息 |
| PUT | `/admin/sysUser/updateProfile` | 当前用户修改个人资料（无需管理员） |
| PUT | `/admin/sysUser/updatePassword/{id}/{password}` | 修改用户密码 |
| PUT | `/admin/sysUser/updateStatus/{id}/{status}` | 启用/停用用户 |
| DELETE | `/admin/sysUser/remove/{id}` | 删除单个用户 |
| DELETE | `/admin/sysUser/batchRemove` | 批量删除用户 |
| PUT | `/admin/sysUser/ban` | **封禁用户（★ 新增）** |
| PUT | `/admin/sysUser/unban` | **解封用户（★ 新增）** |
| PUT | `/admin/sysUser/lock/{id}` | **锁定用户（★ 新增）** |
| PUT | `/admin/sysUser/unlock/{id}` | **解锁用户（★ 新增）** |
| PUT | `/admin/sysUser/batchBan` | **批量封禁（★ 新增）** |
| ... | `/admin/sysRole/...` | 角色 CRUD（含权限分配） |
| ... | `/admin/sysMenu/...` | 菜单 CRUD（树形结构） |
| ... | `/admin/sysDept/...` | 部门 CRUD（树形结构） |
| ... | `/admin/sysPost/...` | 岗位 CRUD |

#### 系统公告
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/sysAnnouncement/list/{page}/{limit}` | 公告分页查询 |
| GET | `/admin/sysAnnouncement/latest` | 获取最新即时通知公告 |
| GET | `/admin/sysAnnouncement/all` | 获取所有已发布公告 |
| POST | `/admin/sysAnnouncement/save` | 发布公告（含 WebSocket 推送） |
| PUT | `/admin/sysAnnouncement/update` | 修改公告（含状态变更推送） |
| DELETE | `/admin/sysAnnouncement/remove/{id}` | 删除公告 |
| POST | `/admin/sysAnnouncement/uploadImage` | 上传公告图片 |
| **WebSocket** | `/ws/announcement` | 公告实时推送（无需认证） |

#### 在线用户管理（★ 新增）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/onlineUser/list` | 在线用户列表 |
| DELETE | `/admin/onlineUser/kick/{userId}` | 强制踢下线 |
| DELETE | `/admin/onlineUser/kickBatch` | 批量踢下线 |

#### 首页大盘
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/dashboard/summary` | 获取首页汇总数据（告警/巡检/服务器/同步/日志/RAG/AI） |

### 服务器管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/opsServer/list/{page}/{limit}` | 服务器分页 |
| POST | `/admin/opsServer/save` | 添加服务器 |
| PUT | `/admin/opsServer/update` | 修改服务器 |
| DELETE | `/admin/opsServer/remove/{id}` | 删除服务器 |
| POST | `/admin/opsServer/sync` | 手动同步阿里云 |
| GET | `/admin/opsServer/get/{id}` | 服务器详情 |
| POST | `/admin/sshExec/execute` | SSH 执行命令 |
| GET | `/admin/sshExec/blocklist` | 命令黑名单 |

### 巡检与告警
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/opsServicePatrol/list/{page}/{limit}` | 巡检记录 |
| GET | `/admin/opsAlarm/list/{page}/{limit}` | 告警列表 |
| GET | `/admin/opsAlarm/statistics` | 告警统计 |

### AI 智能分析
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/aiAnalysis/generate` | 生成 AI 分析报告 |
| POST | `/admin/aiAnalysis/generate/stream` | 流式生成报告 |
| POST | `/admin/aiAnalysis/sendEmail` | 发送报告邮件 |

### AI 数据分析（数据分析中心）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/aiDataAnalysis/generate/stream` | 流式生成 AI 数据分析报告（分析记录+采集数据） |
| POST | `/admin/aiDataAnalysis/generate` | 同步生成并保存报告 |
| GET | `/admin/aiDataAnalysis/list` | 报告历史分页 |
| GET | `/admin/aiDataAnalysis/detail/{id}` | 报告详情 |
| DELETE | `/admin/aiDataAnalysis/delete/{id}` | 删除报告 |
| POST | `/admin/aiDataAnalysis/exportMd` | 导出 MD 报告（权限校验） |
| POST | `/admin/aiDataAnalysis/exportExcel` | 导出 Excel 汇总（权限校验） |

### RAG 知识库
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/rag/documents/upload` | 上传文档 |
| GET | `/admin/rag/documents/list/{page}/{limit}` | 文档列表 |
| DELETE | `/admin/rag/documents/remove/{doc_id}` | 删除文档 |
| DELETE | `/admin/rag/documents/batchRemove` | 批量删除 |
| POST | `/admin/rag/chat` | RAG 问答（非流式） |
| POST | `/admin/rag/chat/stream` | RAG 问答（SSE 流式） |

### 日志分析
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/logAnalysis/analyze` | 上传日志并分析 |
| POST | `/admin/logAnalysis/analyze/stream` | 流式日志分析 |

### 巡检与告警规则
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/opsPatrolRule/list/{page}/{limit}` | 告警规则分页 |
| POST | `/admin/opsPatrolRule/save` | 添加规则 |
| PUT | `/admin/opsPatrolRule/update` | 修改规则 |
| DELETE | `/admin/opsPatrolRule/remove/{id}` | 删除规则 |
| PUT | `/admin/opsPatrolRule/updateStatus/{id}/{status}` | 启用/禁用规则 |

### 数据库管理中心
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/opsDatabase/list/{page}/{limit}` | 数据库资产分页 |
| POST | `/admin/opsDatabase/save` | 添加数据库 |
| GET | `/admin/opsDatabase/get/{id}` | 数据库详情 |
| GET | `/admin/opsDatabase/tables/{id}` | 查询数据库表列表 |
| POST | `/admin/opsDatabase/backup/{id}` | 手动备份 |
| GET | `/admin/opsDatabase/backupRecords/{id}` | 备份记录查询 |
| GET | `/admin/opsDatabase/backupStats` | 备份统计 |
| GET | `/admin/opsDatabaseBackupPolicy/list/{page}/{limit}` | 备份策略 |
| POST | `/admin/opsDatabaseBackupPolicy/save` | 添加策略 |
| GET | `/admin/opsDatabaseCheckConfig/list` | 巡检配置 |
| GET | `/admin/opsDatabaseCheckRecord/list/{page}/{limit}` | 巡检记录 |
| POST | `/admin/opsDatabaseInspection/run/{id}` | 手动执行巡检 |
| ... | `/admin/aliyunOss/...` | 阿里云 OSS 文件管理 |
| ... | `/admin/tencentCos/...` | 腾讯云 COS 文件管理 |
| ... | `/admin/dbAssistant/...` | DB 智能助手 |

### 数据采集
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/opsCollector/list/{page}/{limit}` | 采集记录分页 |
| POST | `/admin/opsCollector/collect/{serverId}` | 手动触发采集 |
| GET | `/admin/opsCollector/stats` | 采集统计 |

### 统计与分析
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/statistics/center` | 统计仪表盘数据 |
| GET | `/admin/analysisRecords/list/{page}/{limit}` | 分析记录分页 |
| GET | `/admin/analysisRecords/get/{id}` | 分析记录详情 |

### 代码生成器
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/codegen/tables` | 获取数据库表列表 |
| POST | `/admin/codegen/preview` | 预览生成代码 |
| POST | `/admin/codegen/download` | 下载生成代码（zip） |

---

## 二次开发指南

### 开发规范

1. **分层架构：** Router → Service → Model（路由不写业务逻辑，Service 不写 SQL 拼接）
2. **异步优先：** 所有数据库操作、HTTP 请求、文件 IO 使用 async/await
3. **软删除：** 所有表使用 `is_deleted` 标记，查询必须过滤 `is_deleted == 0`
4. **异常处理：** 业务异常抛 `BusinessException`，由全局 handler 统一格式化
5. **SQLAlchemy 2.0 风格：** 使用 `Mapped` + `mapped_column` 类型注解
6. **Pydantic V2：** 响应模型继承 `BaseVO`，自动驼峰序列化

### 新增一个业务模块

以新增"网络设备管理"模块为例：

**Step 1: 创建数据模型**

```python
# aiops/network/model/network_device.py
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, TIMESTAMP, text
from aiops.common.base_model_mixin import BaseModelMixin

class Base(DeclarativeBase):
    pass

class NetworkDevice(Base, BaseModelMixin):
    __tablename__ = 'network_device'
    __table_args__ = {'comment': '网络设备表'}

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_name: Mapped[str] = mapped_column(String(100), nullable=False)
    ip: Mapped[str] = mapped_column(String(45), nullable=False)
    device_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # ... 其他字段
    is_deleted: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("'0'"))
```

**Step 2: 创建 Pydantic Schema**

```python
# aiops/network/schemas/network_device.py
from typing import Optional
from pydantic import BaseModel
from aiops.common.base_vo import BaseVO

class NetworkDeviceQuery(BaseModel):
    device_name: Optional[str] = None
    ip: Optional[str] = None

class NetworkDeviceVo(BaseVO):
    id: Optional[str] = None
    device_name: Optional[str] = None
    ip: Optional[str] = None
    device_type: Optional[str] = None

class NetworkDeviceAddParam(BaseModel):
    device_name: str
    ip: str
    device_type: str
```

**Step 3: 创建 Service**

```python
# aiops/network/service/network_device_service.py
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

async def query_network_device_page(db: AsyncSession, page: int, limit: int, params):
    base_stmt = select(NetworkDevice).where(NetworkDevice.is_deleted == 0)
    if params.device_name:
        base_stmt = base_stmt.where(NetworkDevice.device_name.ilike(f"%{params.device_name}%"))
    
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()
    
    data_stmt = base_stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(data_stmt)
    
    return {"total": total, "items": result.scalars().all()}
```

**Step 4: 创建 Router**

```python
# aiops/network/router/network_device.py
from fastapi import APIRouter, Depends, Path

router = APIRouter()

@router.get("/networkDevice/list/{page}/{limit}", tags=["网络设备管理"])
async def list_devices(
    page: int = Path(ge=1), limit: int = Path(ge=1, le=100),
    query_params: NetworkDeviceQuery = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await query_network_device_page(db, page, limit, query_params)
    records = [NetworkDeviceVo.model_validate(item) for item in result["items"]]
    return {"page": page, "limit": limit, "total": result["total"], "records": records}
```

**Step 5: 注册路由**

```python
# main.py
from aiops.network.router import network_device

# 在 admin_router 下挂载
admin_router.include_router(network_device.router)
```

### 新增一个 API 接口

```python
# 在已有 Router 文件中添加

# 1. 查询接口：路径参数 + 查询参数 + 分页
@router.get("/resource/list/{page}/{limit}", tags=["标签"],
            dependencies=[Depends(require_perms("bnt.resource.list"))])
async def list_resource(
    page: int = Path(ge=1), limit: int = Path(ge=1, le=100),
    query_params: ResourceQuery = Depends(),
    db: AsyncSession = Depends(get_db)
) -> dict:
    result = await query_resource_page(db, page, limit, query_params)
    return {"page": page, "limit": limit, "total": result["total"], "records": records}

# 2. 新增接口：POST + Body + 操作日志
@router.post("/resource/save", tags=["标签"],
             dependencies=[Depends(require_perms("bnt.resource.add"))])
@Log(title="资源管理", businessType=BusinessType.INSERT)
async def add_resource(
    request: Request,
    param: ResourceAddParam = Body(...),
    db: AsyncSession = Depends(get_db)
):
    await add_resource(db, param)
    return {"code": ResponseCode.SUCCESS.code, "message": ResponseCode.SUCCESS.msg}

# 3. 修改接口：PUT + Body
@router.put("/resource/update", tags=["标签"],
            dependencies=[Depends(require_perms("bnt.resource.update"))])
@Log(title="资源管理", businessType=BusinessType.UPDATE)
async def update_resource(
    request: Request,
    param: ResourceUpdateParam = Body(...),
    db: AsyncSession = Depends(get_db)
):
    await update_resource(db, param)
    return {"code": ResponseCode.SUCCESS.code, "message": ResponseCode.SUCCESS.msg}

# 4. 删除接口：DELETE + 路径参数
@router.delete("/resource/remove/{id}", tags=["标签"],
               dependencies=[Depends(require_perms("bnt.resource.remove"))])
@Log(title="资源管理", businessType=BusinessType.DELETE)
async def delete_resource(
    request: Request,
    id: str = Path(...),
    db: AsyncSession = Depends(get_db)
):
    await delete_resource(db, id)
    return {"code": ResponseCode.SUCCESS.code, "message": ResponseCode.SUCCESS.msg}
```

### 数据库变更

**方式一：手动 DDL（当前使用）**

在对应 Model 文件的注释中维护 CREATE TABLE 语句，手动执行。

**方式二：使用 Alembic（推荐）**

```bash
# 1. 配置 alembic.ini 中的数据库连接
vim alembic.ini
# sqlalchemy.url = mysql+pymysql://user:pass@host:3306/db

# 2. 修改 alembic/env.py，设置 target_metadata
# from aiops.config.create_mysql import Base
# target_metadata = Base.metadata

# 3. 自动生成迁移
alembic revision --autogenerate -m "add network_device table"

# 4. 执行迁移
alembic upgrade head

# 5. 回滚
alembic downgrade -1
```

### 配置管理

**项目有两种配置来源**：`.env` 文件（本地密钥基础连接）和配置中心 `ops_system_config` 表（热修改业务参数）。

#### 读配置中心（13 条，前端可视化修改，即时生效）

| config_key | component_tag | 用途 |
|-----------|--------------|------|
| `patrol_cron` | SCHEDULE | 服务巡检 cron |
| `collector_cron` | SCHEDULE | 数据采集 cron |
| `db_backup_cron` | SCHEDULE | 数据库备份 cron |
| `db_verify_cron` | SCHEDULE | 备份校验 cron |
| `db_check_cron` | SCHEDULE | 数据库巡检 cron |
| `notification.scene.alarm` | NOTIFICATION | 告警通知渠道 |
| `notification.scene.db_backup_failed` | NOTIFICATION | 备份失败通知渠道 |
| `notification.scene.db_sync_failed` | NOTIFICATION | 同步失败通知渠道 |
| `notification.scene.db_policy_change` | NOTIFICATION | 策略变更通知渠道 |
| `notification.scene.password_verification` | NOTIFICATION | 密码验证通知渠道（仅邮件） |
| `notification.scene.patrol_analysis` | NOTIFICATION | 巡检AI分析通知渠道 |
| `notification.scene.database_assistant` | NOTIFICATION | DB助手通知渠道 |
| `notification.scene.db_inspection` | NOTIFICATION | 数据库巡检通知渠道 |

#### 读 .env（55 个环境变量）

项目中有 55 个环境变量仍从 `.env` 读取，分为三类：
- **永久 .env**（10 个）：数据库连接、Redis 连接、JWT/加密密钥、运行环境 —— 循环依赖或安全敏感
- **建议迁移**（15 个）：登录安全参数、存储配置、备份目录、通知渠道开关 —— 运维调整频繁
- **密钥留 .env**（30 个）：SMTP 密码、飞书/钉钉/企微 Webhook URL、云服务 AK/SK、AI API Key

> 完整详表（含文件:行号 + 默认值 + 分类 + 迁移评估）见 [`docs/module-configuration.md` 第八节](model-doc/module-configuration.md#八项目全部配置读取全景图读配置中心-vs-读-env)。

---

## 部署架构

```
┌──────────────────────────────────────────────────────────┐
│              前端 (Vue3 + Vite + Element Plus)              │
│              Nginx 静态托管 / Vite Dev Server               │
└────────────┬──────────────────┬────────────────────────────┘
             │ HTTP API (2029)  │ WebSocket (2029)
┌────────────▼──────────────────▼───────────────────────────┐
│                  Docker: aiops-backend                      │
│  ┌──────────────────────────────────────────────────┐     │
│  │  FastAPI App                                       │     │
│  │  ├─ Lifespan: asyncio background sync              │     │
│  │  ├─ Lifespan: System config init + Default rules   │     │
│  │  ├─ Lifespan: APScheduler (10 个定时任务，配置热生效) │     │
│  │  │   ├─ 服务巡检 (cron 配置)                        │     │
│  │  │   ├─ 数据采集 (cron 配置)                        │     │
│  │  │   ├─ 数据分析持久化 (每5分钟)                    │     │
│  │  │   ├─ 数据库备份 (cron 配置)                      │     │
│  │  │   ├─ 备份完整性校验 (cron 配置)                  │     │
│  │  │   ├─ 过期备份清理 (每小时)                       │     │
│  │  │   └─ 数据库巡检 (cron 配置)                      │     │
│  │  ├─ Lifespan: Redis pool init (Session/锁定管理)    │     │
│  │  ├─ Lifespan: RAG BM25 index init                  │     │
│  │  ├─ WebSocket: announcement real-time push          │     │
│  │  ├─ StaticFiles: /static uploads                    │     │
│  │  ├─ StandardJSONResponse wrapper                   │     │
│  │  └─ Exception handlers                             │     │
│  └──────────────────────────────────────────────────┘     │
└──────┬──────────┬──────────┬──────────┬───────────────────┘
       │          │          │          │
  ┌────▼────┐ ┌──▼───┐ ┌───▼────┐ ┌───▼────────────┐
  │  MySQL   │ │Redis │ │Ollama  │ │ 阿里云 OSS /    │
  │ (宿主机)  │ │Session│ │(外部)  │ │ 腾讯云 COS      │
  │          │ │+ 锁管理│ │        │ │                │
  └─────────┘ └──────┘ └────────┘ └────────────────┘
```

---

## 相关文档

### 平台规范
- [**系统架构与面试讲解**](model-doc/interview-guide.md) — ★ 全平台架构/模块思路/链路调用/48 个面试问答（面试核心竞争力）
- [**问题排查手册**](model-doc/troubleshooting-guide.md) — ★ 开发中实际遇到的问题坑/排查思路/根因/解决（12 个案例 + 通用方法论）
- [**安全成熟度评估**](model-doc/security-assessment.md) — ★ 企业安全标准十维度评级（L3 企业基线）+ P0/P1/P2 整改路线图
- [**SSH 命令白名单**](model-doc/ssh-command-whitelist.md) — 巡检/采集/备份全部 SSH 命令清单 + 只读账号 sudoers 授权边界（配套脚本 `scripts/create_patrol_account.sh`）
- [平台日志规范](model-doc/logging-spec.md) — 全平台日志规范（模块前缀/异常格式/耗时统计/禁止事项）
- 后端开发规范 — 后端项目级指令文件（编码约定 + 架构决策 + 常用命令）
- 前端开发规范 — 前端项目级指令文件（编码约定 + 页面清单 + 命令速查）

### 模块文档
- [auth 认证授权](model-doc/module-auth.md) — 基石模块：用户/角色/菜单/部门/岗位/公告/JWT/RBAC
- [**登录管理体系**](model-doc/module-login-management.md) — ★ Redis Session + 在线用户 + 递增降级锁定 + 封禁管理
- [opscenter 服务管理与巡检](model-doc/module-server.md) — 服务器资产/SSH凭证/服务巡检引擎/告警聚合 + 跨模块 API
- [AI 智能分析](model-doc/module-ai.md) — LLM/RAG/混合检索/DB助手/日志分析 + 数据提供层
- [notification 消息通知](model-doc/module-notification.md) — ★ 统一邮件发送/告警/分析/备份/验证码邮件模板
- [前端升级改造](model-doc/module-frontend.md) — Vue2→Vue3+Vite+TS+ElementPlus 升级全过程
- [codegen 代码生成器](model-doc/module-codegen.md) — Jinja2模板/表反射/CRUD生成/Zip打包
- [dbcenter 数据库管理中心](model-doc/module-dbcenter.md) — 备份引擎/巡检引擎/云存储/SSH隧道
- [collector 数据采集引擎](model-doc/module-collector.md) — 四层服务发现/并发采集/命令级失败标记
- [workorder 工单管理](model-doc/module-workorder.md) — ★ 告警自动建单/审核闭环/SLA 超时流转/独立事务
- [statistics 数据统计与分析](model-doc/module-statistics.md) — 趋势分析/容量预测/异常检测/稳定性评分

### 教程与指南
- FastAPI 实战教程 — 基于本项目代码的 FastAPI 全面教程
- SQLAlchemy 实战教程 — 基于本项目代码的 SQLAlchemy 2.0 异步教程
- [GitLab CI/CD 配置](model-doc/gitlab-cicd.md) — CI/CD 流水线配置说明

### 前端相关
- 前端升级改造文档 — 前端 Vue2→Vue3 完整升级报告
- 前端 Vue2/Vue3 差异对照 — 前端语法迁移速查表
