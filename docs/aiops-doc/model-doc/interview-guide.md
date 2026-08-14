# AIops 智能运维平台 — 系统架构与面试讲解文档

> **定位**：本文档是面试讲解的核心材料。围绕「系统解决什么问题 → 每个模块的思路与实现 → 模块之间的链路 → 面试官会问什么」四层展开，覆盖全平台所有核心功能与亮点，要求能讲透思路、讲出细节。
>
> **最后更新**：2026-08-08

---

## 目录

1. [项目全景：一句话讲清楚](#一项目全景)
2. [系统架构总览](#二系统架构总览)
3. [核心模块逐一讲解（思路 → 实现 → 亮点）](#三核心模块逐一讲解)
4. [模块间链路调用图](#四模块间链路调用图)
5. [问题与解答（48 题）](#问题与解答)
6. [项目亮点速记](#六项目亮点速记)

## 一、项目全景

**一句话**：这是一个**AI 驱动的智能运维平台（AIOps）**——通过 SSH 协议对服务器做自动化巡检与数据采集，用规则引擎触发告警，用大模型做智能分析（巡检报告/日志分析/RAG 知识库/自然语言查数据库），并把告警自动转为工单形成"发现 → 告警 → 处置 → 验证"的运维闭环。

**它解决的核心问题**（传统运维的痛点）：

| 传统运维痛点 | 本平台的解法 |
|---|---|
| 服务器多、靠人盯，故障发现慢 | 巡检引擎每 2-5 分钟自动 SSH 采集系统级+服务级指标，规则引擎秒级判警 |
| 误报多、告警轰炸 | 去抖机制（连续 N 次超阈值才告警）+ 30 分钟窗口聚合 + 告警自动恢复 |
| 告警没人管、无处置跟踪 | 告警自动生成工单，按优先级映射 SLA 截止时间，超时自动流转+催办 |
| 运维靠经验，知识沉淀难 | 大模型自动生成巡检分析报告并**回流 RAG 知识库**，形成"分析→沉淀→可检索"闭环 |
| 数据库备份靠人工 | 备份调度器按 cron 自动 mysqldump，上传阿里云 OSS/腾讯云 COS，完整性校验+过期清理 |
| 查数据库要会 SQL | AI 数据库助手：自然语言 → SQL 生成/解释/优化，连接真实库注入表结构防幻觉 |
| 通知渠道单一 | 四渠道（邮件/飞书/钉钉/企微）统一通知体系，配置中心动态控制渠道开关 |

**技术栈**：Python 3.10 + FastAPI（异步） + SQLAlchemy 2.0 + MySQL(asyncmy) + Redis + APScheduler + Paramiko(SSH) + LangChain/OpenAI SDK + ChromaDB + Reranker；前端 Vue3 + Vite + TypeScript + ElementPlus + Pinia + ECharts。

---

## 二、系统架构总览

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端 aiops-platform-ui（Vue3 + TS + ElementPlus + Pinia）    │
│  动态路由 / 按钮权限 / TagsView / SSE 流式渲染 / ECharts 看板   │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST (Authorization: Bearer JWT) + WebSocket + SSE
┌──────────────────────────▼──────────────────────────────────┐
│  main.py（应用入口 + lifespan）                                │
│  ├─ 10 个 APScheduler 定时任务（巡检/采集/分析/备份/校验/清理/  │
│  │    DB巡检/工单超时/模型同步/调度配置热同步）                  │
│  ├─ 服务器状态后台同步（云 API + SSH 主机名）                   │
│  └─ 统一路由挂载 /admin/**（全部需登录）                        │
└──────────────────────────┬──────────────────────────────────┘
┌──────────────────────────▼──────────────────────────────────┐
│  业务模块（Router → Service → Model 三层，跨模块走 api/ 子包） │
│                                                              │
│  auth(认证权限)  opscenter(巡检)  dbcenter(数据库)            │
│  collector(采集)  ai(大模型)      statistics(统计)            │
│  workorder(工单)  configuration(配置中心)  notification(通知) │
│  storage(云存储)  robot(机器人)   codegen(代码生成器)          │
└──────────────────────────┬──────────────────────────────────┘
┌──────────────────────────▼──────────────────────────────────┐
│  基础设施层（common / util / config）                          │
│  BaseVO(驼峰) / StandardJSONResponse / BusinessException     │
│  @Log 操作日志 / ssh_client / cron_utils / crypto_util       │
│  asyncmy 连接池 / Redis 连接池 / loguru 日志                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 定时任务全景（10 个）

| 任务 | 驱动方式 | 说明 |
|---|---|---|
| 服务巡检 patrol_inspection | 配置 `patrol_cron`（默认 */5）| SSH 采集系统级+服务级 → 规则判警 → 告警/工单 |
| 数据采集 collector_scheduled | 每分钟唤醒 + 内部 cron 匹配 | 服务发现 + 并发采集指标入库 |
| 数据分析持久化 | 配置 `analysis_cron`（*/5）| 采集数据 → 资源/容量/趋势/评分分析 → 落库 |
| 数据库备份 | 每分钟唤醒 + 内部 cron 匹配 | mysqldump → OSS/COS 上传 → 校验 → 清理 |
| 备份完整性校验 | 同上 | 恢复式校验备份文件 |
| 过期备份清理 | 每小时 | 超过 retention_days 移入回收站 |
| 数据库巡检 | 每分钟唤醒 + 内部 cron 匹配 | SQL 健康检查项 |
| 工单超时流转 | 每分钟 | 超期未处理/未通过的工单 → 超时 + 通知 |
| 大模型列表同步 | 配置 cron | 从 Ollama/DeepSeek/OpenAI 拉模型目录 |
| **调度配置热同步** | 每 60 秒 | 比对配置中心 cron/enabled，变化即 reschedule |

### 2.3 两种调度驱动模式（设计亮点）

- **trigger 模式**（巡检/分析/模型同步）：频率由 APScheduler trigger 决定，cron 变化 → `reschedule_job` 热更新
- **internal 模式**（采集/备份/校验/DB巡检）：每分钟唤醒一次，内部用 `match_cron` 匹配当前时间，cron 天然热生效

所有任务 cron/enabled 统一从配置中心读取，**修改后无需重启**（配置保存即时生效 + 60 秒守护兜底）。

### 2.4 跨模块调用规范（api/ 子包）

**任何模块不得直接引用其他模块的 Model/Service**，统一通过目标模块的 `api/` 子包（如 `opscenter/.../api/server_query_api.py`）调用——保证模块解耦、可独立演进、避免循环依赖。

---

## 三、核心模块逐一讲解

### 3.1 认证与权限模块（auth）

**解决什么问题**：企业级 RBAC 权限 + 登录安全（防爆破、会话管理）。

**核心流程**：

```
登录 POST /login
  → check_account_status()       停用/封禁检查（封禁到期自动解封）
  → check_login_allowed()        Redis 降级锁定检查
  → verify_password()            bcrypt 校验（旧 MD5 密码自动升级为 bcrypt）
  → 失败 → handle_login_fail()   递增降级锁定：5次→锁5分钟 → 3次→15分钟 → 2次→30分钟 → 2次→1天
  → 成功 → create_session()      Redis Session (login:user:{id}, TTL 12h)
  → 成功 → handle_login_success() 清除全部锁定状态

每次请求 auth_deps.get_current_user
  → JWT 解析 userId → Redis 检查会话存在 → 放行；不存在 → 401"登录会话已过期"

权限校验 require_perms("bnt.sysUser.list")
  → sys_user_role → sys_role_menu → sys_menu 关联查询（无硬编码放行，超管也走角色）
```

**亮点**：
1. **密码体系平滑升级**：新密码 bcrypt，旧 MD5 登录成功后自动升级，无感迁移
2. **递增降级锁定**：失败次数越多锁越久，比固定锁更防暴力破解；锁定到期自动解封
3. **Redis Session 双因子**：JWT 只做身份凭证，会话状态在 Redis——踢下线/封禁/多端控制即时生效
4. **公告 WebSocket 实时推送**：ws_manager 单例管理连接池，公告发布广播，死连接自动剔除

---

### 3.2 配置中心（configuration）

**解决什么问题**：全平台运行参数（cron/告警规则/通知渠道/模型选择）**动态可调、即时生效**，替代散落的 .env 和代码常量。

**三级缓存**：

```
读配置 get_config(key)
  → 内存缓存（~0.001ms）→ Redis（aiops:config:key）→ MySQL（兜底）
写配置 set_config(key, value)
  → 写 MySQL + 更新 Redis + 更新内存 + 触发变更回调（调度器热同步等）
```

**亮点**：
1. **三级缓存**：内存为热路径、Redis 跨进程一致、MySQL 持久化
2. **变更回调机制**：配置保存后回调注册方（如调度器热同步、Session TTL 踢下线），解耦且即时
3. **alarm.rules JSON**：14 条告警规则（阈值/级别/去抖次数）全在配置中心，改规则不用改代码
4. **notification.scene.\***：每个通知场景（告警/备份失败/工单...）独立控制哪些渠道发送

---

### 3.3 服务巡检引擎（opscenter）★核心

**解决什么问题**：无人值守地发现服务器故障（资源耗尽/服务停止/内核异常），并驱动告警与工单闭环。

**完整流程**：

```
APScheduler 触发（*/5 分钟）
  → get_servers_with_credentials()    筛选：在线 + 巡检开启 + 有启用凭证
  → 逐台 inspect_server：
      ├─ 系统级采集（并发 6 通道，3 秒完成）：
      │    CPU(top) / 内存(free) / 磁盘(df) / inode(df -i) / 负载(uptime)
      │    / Swap / TCP连接(ss) / 文件句柄(proc) / 僵尸进程(ps) / 内核错误(dmesg) ...
      ├─ evaluate_metric_rules()       规则引擎（配置中心 alarm.rules）
      │    ├─ 去抖：Redis INCR，连续 continue_periods 次超阈值才告警
      │    └─ 命中 → create_alarm → 聚合检查 → 工单（独立事务）→ 通知（并发多渠道）
      ├─ 服务级巡检（并发 6 路，每服务独立 SSH 连接）：
      │    systemctl 状态（备选名适配 mysql→mysqld）
      │    + 专用采集器（MySQL 连接池/慢查询、Nginx、Docker、Redis、Java）
      │    + 规则判警（服务停止/连接池过高/慢查询）
      └─ recover_alarms()              本次未触发的未处理告警 → 自动恢复 + 通知
  → 每台服务器巡检完立即 commit（逐台提交，单台异常不丢整轮）
```

**告警防轰炸三层机制**：

| 机制 | 实现 | 效果 |
|---|---|---|
| 去抖 | Redis `patrol:rule_hits:{scope}:{metric}` INCR + continue_periods（默认 2 次）| CPU 瞬时抖动不误报 |
| 聚合 | 同服务器+同类型+30 分钟窗口未处理 → aggregation_count+1 | 持续故障只发 1 条 |
| 恢复 | 每轮记录 triggered_types，未再触发 → 自动置为已恢复 | 故障解决自动闭环 |

**亮点**：
1. **并发采集**：系统级 14 条命令 gather 并发（3 秒），服务级每服务独立连接 + 信号量限流（一轮 4 分钟 → 1 分钟内）
2. **命令级超时**：SSH 每条命令 120s 超时，远端命令 hang 快速失败返回错误标记，不卡死整个巡检
3. **全量扫描**：systemd 单元/进程/端口/安装目录四路探测，18 类中间件规则表，一键发现服务器上的服务并生成巡检配置
4. **ID 生成**：进程内单调递增的相对毫秒时间戳，11 位绝对唯一（曾因 6-8 位随机 ID 主键冲突）
5. **告警自动转工单**：优先级映射 SLA（紧急 2h/高 8h/中 24h/低 72h），处理人=服务器负责人，审核人=负责人所属部门主管
6. **工单独立事务**：避免巡检长事务持有 work_order 行锁导致工单超时任务 Lock wait timeout

---

### 3.4 数据采集引擎（collector）

**解决什么问题**：与服务巡检互补——巡检是"健康快照"，采集是"深度指标"（QPS/命中率/连接数/容器状态等），为趋势分析和容量预测提供数据。

**流程**：

```
定时/手动触发
  → trigger_collection：SSH 连接 → 服务发现（4 路探测并行，3 秒）
  → 服务并发采集（每服务独立连接 + Semaphore(4)）：
       Java/Nginx/Docker/Redis/MySQL 各采集器
       命令级失败标记：CollectorResult.errors（redis INFO 无返回等不静默写 0）
  → 串行写库：ops_collector_record（汇总）+ ops_collector_detail（明细 JSON）
  → statistics 模块消费明细做趋势/容量/评分分析
```

**亮点**：
1. **四层服务发现**（systemctl → ps → 端口 → 配置文件）降低误判
2. **命令级失败标记**：单条命令失败不影响整体，数据不静默写 0（与"无数据"评分标记配合防误判）
3. **并发采集**：原串行 3 分钟/台 → 并发 1 分 47 秒（docker system df 等重命令 120s 窗口内完整执行）

---

### 3.5 数据库管理中心（dbcenter）

**解决什么问题**：数据库资产的备份/恢复/校验/巡检全生命周期 + 云存储。

**备份全流程**：

```
APScheduler（cron 匹配）
  → 查启用的备份策略（数据库 + 保留天数）
  → 排除本地库（127.0.0.1 不支持备份自身）
  → SSH 隧道连接远程数据库 → mysqldump（--single-transaction 一致性读、--routines/--triggers）
  → 指定表模式：逐表导出 全量/结构/数据 三份 → 全库模式：直接整库 dump
  → tar.gz 打包 → 上传 OSS/COS（按策略选择）→ 云端异地副本（备份复制）
  → 完整性校验（恢复式）→ 过期备份清理（retention_days + 回收站）
  → 失败自动通知（备份失败/云端同步失败各自渠道）
```

**亮点**：
1. **SSH 隧道 + 远程备份**：备份不落在本地，直接在目标机执行 mysqldump
2. **云端双存储**：阿里云 OSS / 腾讯云 COS 可配，备份文件异地容灾 + 跨云复制
3. **数据库巡检**：SQL 健康检查项定时执行，结果入库可追踪
4. **DB 助手联动**：向 AI 模块提供表结构/连接信息（api/ 子包）

---

### 3.6 AI 智能模块（ai）★核心

**解决什么问题**：把大模型能力注入运维——报告生成、日志分析、知识库问答、自然语言查库。

**统一 LLM 客户端（llm_client）**：
- 单例 + 配置中心驱动：provider/model 变更**热重建实例**，无需重启
- 三大方法统一埋点：`asyncio_ainvoke`（普通）/ `asyncio_astream`（流式，末尾 yield `__meta__` 带 token 用量）/ `ainvoke_structured`（结构化输出，Pydantic 强校验）
- 每个方法：先 `check_llm_quota`（限额）→ 调用 → finally `record_llm_invoke`（埋点，独立会话写失败不影响主流程）

**RAG 混合检索流水线**（核心亮点）：

```
用户问题
  → 向量检索 Top-20（ChromaDB + Embedding）
  + BM25 关键词检索 Top-20（jieba 分词，启动时从 MySQL 重建索引）
  → RRF 融合（md5 去重 + 1/(60+rank) 加权）
  → BGE-Reranker 精排 Top-5（FlagReranker, fp16）
  → 邻居 chunk 扩展 ±10（保留上下文连贯）
  → Prompt（严格依据资料，无依据明确说"未提及"）→ LLM 流式 SSE
```

**四大 AI 场景**：

| 场景 | 数据来源 | 输出 |
|---|---|---|
| 巡检分析 | opscenter api/ 聚合服务器/巡检/告警 → 服务器画像 | 八章 Markdown 报告，自动入知识库 |
| 日志分析 | 用户上传日志（头尾截断防 token 溢出）| 级别汇总/根因/修复建议 |
| RAG 问答 | ChromaDB + BM25 + Reranker | 流式回答 + 来源引用 |
| DB 助手 | 连接真实 MySQL SHOW FULL COLUMNS 注入表结构 | NL→SQL 生成/解释/优化/DDL 解释/CRUD 代码 |

**DB 助手防幻觉与安全**：
- 真实表结构注入 Prompt + 字段名大小写强制 + "找不到就诚实说不知道"
- 红线规则：允许 SELECT/INSERT/UPDATE（UPDATE 必须带 WHERE），禁止 DELETE/DROP/TRUNCATE/SHOW 等
- 注意：本模块只生成 SQL 不执行，执行侧另有权衡

**调用记录与限额**：每次调用记录模型/场景/用户/token/耗时/成败；限额按**角色共享额度**（该角色下所有用户成功调用数），多角色取剩余最大，异常保守拒绝。

**报告自动入知识库**：Markdown 按 `## ` 章节切块 → 走 Chroma+BM25+MySQL 三写 → 形成"分析→沉淀→可检索"闭环。

---

### 3.7 统计与分析（statistics）

**解决什么问题**：把采集的海量指标变成可读的态势与趋势。

- **Dashboard**：告警/巡检/服务器/登录/操作日志/RAG/AI 七维度统计，聚合各模块 api/ 子包
- **分析体系**：资源分析（CPU 均值/峰值/P95）、容量分析（增长量/剩余天数）、趋势分析（7/15/30 天，±15% 方向判定）、异常分析（**Z-score 方法**，|z|>2 判异常，z>3 高危）、稳定性分析（采集成功率）、**评分分析**
- **评分公式**（每服务 100 分起扣）：命中率<90% -5 / <80% -10；采集失败 -10/次 封顶 -20；CPU>90% -10；内存>90% -10；磁盘>85% -10；无数据 -30
- **"无数据"防误判**：审计指标任一非零即算有数据（防采集命令失败静默写 0 被当健康）；noData 不参与等级分布与平均分
- **AI 数据分析**：分析记录+采集数据聚合 → 大模型生成九章报告（scene=data_analysis）→ 落库 ops_ai_analysis_report（含 data_summary 快照）→ MD/Excel 导出

---

### 3.8 消息通知（notification）

**解决什么问题**：所有业务事件（告警/备份失败/工单流转/验证码...）统一、可控、多渠道触达。

**架构**：

```
业务模块 → dispatcher.dispatch_xxx()（14 个业务语义函数）
  → channel_manager.broadcast(type, ...)（单例）
      ├─ 代码层过滤：channel.supported_types + is_enabled（.env 开关）
      ├─ 配置层过滤：notification.scene.* JSON（配置中心，即时生效）
      └─ asyncio.gather 并发发送，异常隔离
  → EmailChannel(SMTP SSL) / FeishuChannel / DingtalkChannel / WorkWeixinChannel
```

**三层防线**：配置层（要不要发）→ 代码层（能不能发，如验证码永远只走邮件）→ 异常层（配置缺失保守不发送，不退化为全渠道）。

**15 种消息模板**：告警/备份失败/同步失败/策略变更/验证码/AI 报告/DB助手/DB巡检 + 6 种工单状态，钉钉企微共用 Markdown 模板。

**日志治理**：每次通知只打一条 INFO（"最终发送渠道"），细节降 DEBUG——不干扰巡检日志。

---

### 3.9 工单管理（workorder）

**解决什么问题**：告警后的处置跟踪——谁处理、何时截止、是否超时。

**状态流转**：待处理(1) → 处理中(2) → 完成(3)；超时(3)；审核不通过(4) 可重新处理。流程图：

```
告警触发 → 自动创建工单（处理人=服务器负责人，审核人=部门主管）
  → 处理人处理 → 提交审核 → 审核通过 → 告警联动置为已处理（★闭环）
  → 超期未处理 → 定时任务置为超时 → WS 推送 + 飞书@ + 邮件催办
```

**亮点**：
1. **工单-告警闭环**：只有审核通过才联动告警"已处理"，其他状态不动告警
2. **SLA 驱动**：优先级映射截止时间，超时自动流转
3. **独立事务创建**：告警巡检长事务中创建工单会导致锁冲突 → 工单独立事务提交，可靠且不阻塞
4. **流转记录**：每次状态变更写 WorkOrderRecord 时间线
5. **实时提醒**：WebSocket 定向推送处理人（红点）

---

### 3.10 基础设施层

| 组件 | 亮点 |
|---|---|
| BaseVO | pydantic `alias_generator=to_camel` + `populate_by_name=True` + `serialize_by_alias=True`——蛇形字段自动驼峰序列化，前后端统一 camelCase |
| StandardJSONResponse | 重写 render()，统一 `{code, message, totalCount, data}`，分页元数据自动提升 |
| BusinessException | 统一异常体系，全局 handler 格式化；code 兼容枚举自动归一化 |
| @Log 装饰器 | AOP 切面：自动记录操作日志（URL/IP/地理位置/用户名/参数），try/finally 成败都写 |
| ssh_client | Paramiko 封装：连接 15s 超时 + **命令 120s 超时** + 线程池异步化（run_in_executor） |
| cron_utils | 手写 Quartz cron 匹配器（5-7 段、*/N、N-M/N、名称映射、weekday 偏移） |
| crypto_util | Fernet 对称加密凭证，解密失败降级空串兼容旧数据 |
| 日志 | loguru 三 handler（控制台 INFO/ info.log INFO+WARNING/ error.log ERROR+），按天滚动 30 天 zip 压缩 |

---

### 3.11 前端（aiops-platform-ui）

**技术栈**：Vue3 + Vite5 + TS5 + ElementPlus + Pinia + VueRouter4 + Axios + ECharts，由 vue-element-admin（Vue2）大规模升级而来。

**核心链路——后端驱动的动态路由**：

```
登录 → userStore.login() → token 存 Cookie
  → 路由守卫（permission.ts，Vue Router 4 return 范式，不用 next）
  → userStore.getInfo() → GET /info 返回 {name, buttons, routers}
  → filterAsyncRouter()：component 字符串 → import.meta.glob 动态导入组件
  → router.addRoute() 逐个注册 + 404 兜底 → 重导航放行
按钮权限：hasBtnPermission('bnt.xxx') + v-if（buttons 由 /info 返回）
```

**亮点**：
1. **keep-alive 缓存 trick**：`<script setup>` 组件无 name，`keep-alive include` 匹配不到 → 用 `defineComponent({name, render})` 动态包装注入路由名（深入 Vue3 渲染机制的体现）
2. **SSE 流式问答**：原生 fetch + getReader + TextDecoder 逐行解析 `data:` 事件，marked 实时渲染 + 打字动画 + 代码块复制
3. **WebSocket 公告**：断线重连心跳 + 轮询兜底
4. **主题系统**：CSS 变量 + `[data-theme]` 覆盖 ElementPlus 设计令牌，深浅色秒切
5. **Axios 工程化**：拦截器内取 store（避免循环依赖）、统一解包 `{code,message,data}`、blob 下载特判 JSON 错误、HTTP 状态码中文映射
6. **构建优化**：manualChunks 三方分包（element-plus/echarts/vue-vendor）
7. **★ 数据大屏**（2026-08-08）：深色科技风 ECharts 看板（告警等级/工单优先级与状态/服务器状态/巡检状态/30 天登录操作趋势/备份趋势/接入模型/分析快照），首页醒目按钮新标签页打开，60s 自动刷新，单接口失败不影响其他板块（allSettled）

---

## 3.12 安全体系（P0 级）★生产环境重中之重

> 生产环境安全是第一优先级。本平台的核心攻击面是：**SSH 凭证（能登录被管服务器）**、**数据库账号（能读/写业务库）**、**平台自身（认证/越权/注入）**。下面按「攻击面 → 现有防护 → 诚实评估 → 改进方向」展开——要能讲透"为什么这样设计"和"哪里还不够"。

### 3.12.1 攻击面盘点

```
攻击者视角（拿到什么能干什么）：
  ① 平台账号 → 登录平台 → 看所有服务器/告警/数据 + 用交互式 SSH 执行命令
  ② SSH 凭证（DB 泄露/日志泄露/备份泄露）→ 登录被管服务器 → 任意命令（最危险）
  ③ 数据库账号 → 读/写业务库
  ④ 加密密钥 FERNET_KEY → 解密全部凭证（一锅端）
  ⑤ 备份文件 → 数据库全量数据（拖库）
```

### 3.12.2 SSH 凭证安全（最高风险点）

**现有防护（真实实现）**：

| 层 | 实现 |
|---|---|
| 存储加密 | 密码/私钥 **Fernet 对称加密**后入库（`crypto_util`），密钥 `FERNET_KEY` 在 .env（独立于数据库）|
| 按需解密 | `get_decrypted_credential` 仅在使用时解密，其余环节全是密文 |
| 传输加密 | Paramiko SSH 全程加密通道；私钥支持 RSA/Ed25519/ECDSA |
| 命令白名单 | 巡检/采集执行的命令**全部代码内置**（top/free/df/uptime/ss/ps/systemctl status/mysql SHOW...），不接收任何用户输入 → **无命令注入面** |
| 命令黑名单 | 交互式 SSH 执行（sshExec）有 18 条危险命令正则拦截：`rm -rf`/`mkfs`/`dd if=`/`fdisk`/`shutdown`/`reboot`/`init 0|6`/`halt`/`poweroff`/`chmod 777`/`kill -9 1` 等，命中即拒绝 |
| 命令级超时 | 每条命令 120s 超时 + 连接 15s 超时，防利用慢命令拖垮平台 |
| 执行审计 | 交互式执行记录操作日志（谁/哪台/什么命令/结果）|
| 状态约束 | 仅查询启用凭证；凭证与服务器绑定，无凭据不巡检 |

**✅ 已整改（2026-08-08 安全加固）**：
- ✅ **专用只读巡检账号已上线**（`scripts/create_patrol_account.sh` 通用版）：20 位随机密码 + sudoers 命令白名单（top/free/df/ss/ps/systemctl 查询等全只读）+ docker 组 + visudo 自检
- ✅ **MySQL 同名只读监控账号**：auth_socket 免密 + `PROCESS, REPLICATION CLIENT` 最小权限——深度指标（连接池/慢查询）恢复且无数据读写能力
- ✅ **实测验证**：平台凭证切换 aiops_patrol 后全链路正常；危险命令（rm -rf / systemctl stop / DROP TABLE）全部被 sudoers 拒绝
- ✅ **爆炸半径**：从"root 全权限（服务器沦陷）"缩小到"白名单只读查询（只读窥探）"

**诚实评估**：
- ⚠️ `FERNET_KEY` 仍在 .env 文件——文件泄露即全部凭证可解密（P0 待办：上 KMS）
- ⚠️ 黑名单是**事后拦截**；交互式执行仍可能执行黑名单外的命令（待办：白名单模式/二次确认）
- ⚠️ 凭证轮换无自动化（待办：平台批量更新 + 定期轮换提醒）

**剩余改进方向（P0-P1）**：
```
① 密钥管理：FERNET_KEY 从 KMS/密钥管理服务注入，不放代码仓库与服务器文件
② 交互式执行改白名单模式或增加二次确认/双人复核
③ 凭证轮换：定期更换巡检账号密码，平台支持批量更新
④ 每个服务器独立凭证（不共用），泄露一台不影响其他
```

### 3.12.3 数据库账号安全（巡检/备份/同步）

**现有防护**：

| 场景 | 实现 |
|---|---|
| 存储 | 数据库连接账号密码同样 **Fernet 加密**入库（ops_database_auth）|
| 备份执行 | mysqldump 在**目标机本地执行**（SSH 隧道），`--single-transaction` 一致性读（只读，不加锁）；备份账号只做 dump 不做 DML |
| 巡检 | SQL 健康检查项为只读查询（连接/慢查询/表空间/版本）|
| AI 助手 | 只生成 SQL 不执行；RED_LINE 禁 DELETE/DROP/TRUNCATE/SHOW 等；真实表结构注入防注入 SQL |
| 备份文件 | 上传 OSS/COS（私有桶 + AK 权限），跨云复制 |

**✅ 已整改（2026-08-08）**：
- ✅ **备份账号最小权限已落地**：`ops_aliyum_readonly` 实测 `SHOW GRANTS` 只有 `SELECT, LOCK TABLES, SHOW VIEW, TRIGGER ON ai_ops.*` + `RELOAD ON *.*`（RELOAD 是全局权限需单独 GRANT，混写报 1221）——mysqldump 最小权限集，**纯只读，无任何 DML/DDL**，与业务读写账号隔离

**诚实评估**：
- ⚠️ 备份文件明文存云（未加密）——云桶权限（AK 泄露）= 拖库（待办：gpg/云 KMS 加密）
- ⚠️ 无恢复演练 SOP、云桶权限无定期审计

**改进方向**：备份文件加密（gpg/云 KMS）+ 桶策略最小化 + 下载链路审计 + 定期恢复演练。

### 3.12.4 平台自身安全（纵深防御）

| 层 | 实现 |
|---|---|
| 认证 | JWT(HS512) + **Redis Session 双因子**：JWT 只是身份凭证，会话状态在 Redis——踢下线/封禁/多端控制即时生效 |
| 密码 | bcrypt（旧 MD5 自动升级）；修改密码校验 |
| 防爆破 | **递增降级锁定**：5 失败→5分钟 → 3次→15分钟 → 2次→30分钟 → 2次→1天；封禁到期自动解封 |
| 权限 | RBAC 三表关联（user_role → role_menu → menu），**超管也走角色**（无硬编码放行，防权限绕过）；新增接口必须登记 sys_menu 否则 403 |
| 越权 | 路由级 `require_perms` + 数据级（如工单处理人校验 handler_id 匹配当前用户）|
| 注入 | 全 SQLAlchemy 参数化查询（无字符串拼接 SQL）；前端 XSS 靠 Vue 模板转义 + 富文本白名单 |
| 审计 | 登录日志（IP/OS/浏览器/成败/耗时）、操作日志（@Log 切面：URL/IP/地理位置/用户名/参数/结果）、SSH 执行审计 |
| 会话 | 登出清 token + Redis 会话；在线用户可见可踢 |
| 传输 | HTTPS 部署（Nginx）+ SSH 加密通道 |

### 3.12.5 安全总结框架（P0 视角）

```
问自己三个问题：
  ① 凭证在哪？怎么存？怎么用？（加密存储 + 按需解密 + 密钥独立管理）
  ② 最小权限做到没有？（专用只读账号 / 命令白名单 / 备份账号隔离）
  ③ 出事能不能发现、能不能止血？（全链路审计 / 会话即时失效 / 凭证轮换 / 爆炸半径控制）

回答任何安全问题都按：攻击面 → 现有防护 → 诚实短板 → 改进方向 四段式
```

---

## 四、模块间链路调用图

### 4.1 告警闭环（主链路）

```
巡检引擎（opscenter）
  → 规则命中 → create_alarm（opscenter）
      ├─ 工单（workorder，独立事务）→ WS 推处理人 + 飞书/钉钉/企微通知（notification）
      ├─ 通知广播（notification，配置中心控制渠道）
      └─ 服务器负责人校验（auth api/）
  → 工单处理 → 审核通过 → 回调告警置已处理（闭环）
  → 超时流转（定时任务）→ 催办通知
```

### 4.2 数据链路

```
巡检/采集（SSH）→ ops_service_patrol / ops_collector_detail
  → statistics 分析（资源/容量/趋势/评分，双通道：采集明细 + 巡检系统级）
  → ops_analysis_record（upsert 稳定 ID）
  → AI 分析报告（ai 模块，聚合服务器/巡检/告警）
      → 报告自动入 RAG 知识库（Chroma+BM25+MySQL）
      → 邮件/飞书推送（notification）
```

### 4.3 配置链路

```
配置中心（configuration，三级缓存）
  ├─ alarm.rules → 巡检规则引擎
  ├─ notification.scene.* → 通知渠道过滤
  ├─ patrol_cron / analysis_cron → 调度器（热同步）
  ├─ llm.provider / llm.model → LLM 客户端热重建
  └─ 变更回调 → 调度器 reschedule / Session TTL 踢下线
```

### 4.4 跨模块 api/ 子包清单（解耦关键）

| 消费方 | 通过 api/ 获取 |
|---|---|
| ai 模块 | opscenter（服务器/巡检/告警）、dbcenter（库/表/列）、auth（用户/角色）、configuration（配置） |
| statistics | opscenter（告警/巡检）、dbcenter（备份/巡检记录）、workorder（工单统计）、auth（登录/操作日志） |
| opscenter | configuration（alarm.rules）、notification（dispatch）、workorder（建单）、auth（用户校验） |
| notification | configuration（场景配置）、auth（收件人）、storage（报告上传） |
| collector | opscenter（服务器/凭证） |

---

## 五、问题与解答（48 题）

### 5.1 项目整体

**Q1：这个项目解决了什么问题？**
传统运维靠人盯服务器：故障发现慢（几小时）、误报多、告警没人跟、数据库备份靠人工、运维经验沉淀不下来。平台做三件事：①自动化——SSH 巡检+采集+规则判警+备份全自动；②智能化——大模型生成巡检报告/日志分析/RAG 知识库/NL 查库；③闭环化——告警自动转工单、SLA 跟踪、超时催办、审核通过联动告警处理。

**Q2：架构上有什么设计决策？**
①FastAPI 全异步（asyncmy + 线程池包 SSH）；②模块严格解耦——跨模块只走 api/ 子包，谁都不许直接引用别人的 Model；③配置中心化——cron/规则/渠道/模型全部动态可调；④统一基础设施——驼峰序列化、统一响应、统一异常、统一操作日志。

**Q3：定时任务怎么管理的？为什么不用 Celery？**
APScheduler（AsyncIOScheduler）+ 配置中心驱动。10 个任务 cron/enabled 全在配置表，改配置热生效（reschedule_job/pause/resume）。不用 Celery 是因为：单机部署、任务都是轻量异步协程、不需要分布式队列；Celery 引入 Redis broker + worker 运维成本，对当前规模是过度设计。

**Q4：SSH 采集怎么处理阻塞？**
Paramiko 是同步阻塞库。用 `asyncio.get_running_loop().run_in_executor(None, ssh.exec, cmd)` 把每条命令扔线程池，事件循环不阻塞；同时每条命令 120s 超时（channel.settimeout），远端命令 hang 快速失败返回错误标记，不拖垮整个任务。

**Q5：单机部署能支撑多少服务器？**
当前是 1 台服务器巡检+采集约 1-2 分钟/轮。SSH 并发限流 6 路，瓶颈在网络往返和命令耗时。水平扩展方向：多 worker 分片（按服务器分组）、或独立采集节点。设计上模块 api/ 解耦 + 配置中心已为拆分预留了空间。

### 5.2 巡检与告警

**Q6：告警是怎么防误报和防轰炸的？**
三层：①去抖——Redis INCR 连续 N 次（默认 2）超阈值才告警，CPU 瞬时抖动不误报；②聚合——同服务器同类型 30 分钟窗口内未处理告警合并（aggregation_count+1），持续故障不轰炸；③恢复——每轮巡检记录 triggered_types，本次未再触发自动置已恢复，故障解决自动闭环。

**Q7：巡检一轮要多久？怎么优化的？**
原实现串行：系统级 14 条命令 20 秒 + 服务级 16 个服务逐个 SSH 采集 3-4 分钟。优化：①系统级 gather 并发（信号量 6，3 秒）；②服务级每服务独立 SSH 连接 + Semaphore 并发采集，采集完串行判警写库（db 不并发共享 session）。一轮降到 1 分钟内，*/2 频率可跑。

**Q8：如果某条 SSH 命令 hang 了怎么办？**
命令级 120s 超时（channel.settimeout），超时返回错误标记而不是抛异常——单条命令失败不影响其他命令；同时逐台服务器 commit，单台异常（已捕获并写"巡检异常"记录）不影响整轮数据落库。

**Q9：告警规则怎么配置？改阈值要重启吗？**
规则在配置中心 alarm.rules JSON（14 条默认：CPU>80% 高危、内存>85% 高危、inode>90% 中危、僵尸进程>5 低危、服务停止中危、MySQL 连接池>80% 中危等），每条含 metric_key/operator/threshold/level/continue_periods/template。规则引擎每次巡检读配置，改完即时生效。

**Q10：MySQL 连接池告警怎么采集的？**
专用采集器：探测 socket 路径（/var/run/mysqld/mysqld.sock）→ `SHOW STATUS LIKE 'Threads_connected'` + `SHOW VARIABLES LIKE 'max_connections'` 算连接使用率 → 触发 conn_usage 规则；`SHOW STATUS LIKE 'Slow_queries'` 触发慢查询规则。socket 失败回退默认连接。

**Q11：服务器"在线"状态是怎么维护的？**
不是即时探活——后台 run_sync_loop（默认 5 分钟）调阿里云 SWAS API 拉实例状态（Running→1/Stopped→0 映射）+ SSH 取主机名修正，写 ops_server.status。巡检以 status=1 + patrol_enabled + 有凭证 三重条件筛选。

### 5.3 数据采集

**Q12：采集和巡检有什么区别？**
巡检是"健康快照"（系统资源+服务启停+规则判警），采集是"深度指标"（QPS/命中率/连接数/容器数等，供趋势和容量分析）。采集更重，所以 cron 分开配置；采集有命令级失败标记（CollectorResult.errors），不静默写 0。

**Q13：服务发现怎么做？**
四层探测：systemctl 单元 → ps 进程 → 监听端口 → 配置文件，任一层命中即认为已安装，降低误判；5 类服务并行探测 3 秒完成。

### 5.4 数据库备份

**Q14：备份怎么保证一致性？**
mysqldump `--single-transaction`（InnoDB 一致性读，不加锁）+ `--routines/--triggers`（导存储过程和触发器）+ `--set-gtid-purged=OFF`（便于导入其他实例）。指定表模式还会逐表导"全量/结构/数据"三份。

**Q15：备份文件存哪？怎么保证安全？**
本地 + 云端双份：按策略上传阿里云 OSS 或腾讯云 COS（SDK 直传），支持跨云复制（异地容灾）。完整性校验（恢复式）定时执行，过期备份按 retention_days 清理进回收站。

**Q16：备份失败怎么感知？**
调度器 catch 异常 → 通知模块 dispatch_backup_failed（邮件/飞书按配置）→ 同时记录备份状态；云端同步失败单独检测（从同步日志判断）单独通知。

### 5.5 AI 与 RAG

**Q17：RAG 为什么用混合检索？单向量检索不够吗？**
向量检索擅长语义（"内存爆了"），但精确关键词（"Threads_connected"）容易丢；BM25 擅长关键词。两者 Top-20 用 RRF 融合（1/(60+rank) 加权），再用 BGE-Reranker 精排 Top-5——召回率和精度都更高。Reranker 只在候选上跑，算力可控。

**Q18：BM25 索引重启怎么恢复？**
Chroma 向量库持久化在磁盘；BM25 是内存索引（jieba 分词 BM25Okapi），启动时从 MySQL rag_chunks 表重建（MySQL 是权威存储），失败则首次检索时懒加载重试。

**Q19：怎么防止大模型瞎编（幻觉）？**
三层：①Prompt 强约束——"严格依据资料，没有依据明确回答资料未提及，不得使用外部知识"；②来源引用——回答带 [文档片段 i | 来源:filename]；③Reranker 精排提高命中质量。DB 助手则是连真实库 SHOW FULL COLUMNS 注入真实表结构 + 字段名大小写强制 + "找不到就诚实说不知道"。

**Q20：大模型调用怎么计费和限额？**
llm_client 三方法统一埋点：场景常量（SCENE_RAG_CHAT 等）+ user_id + token 用量 + 耗时 + 成败写 llm_invoke_log 表（独立会话，写失败不影响主流程）。限额按角色共享额度：该角色下所有用户成功调用数统计，多角色取剩余最大，超限抛业务异常，检查异常时保守拒绝。

**Q21：模型切换要重启吗？**
不用。LLMClient 单例 + get_llm() 每次对比配置中心 llm.provider/llm.model，变了就重建实例；模型列表从厂商 API 拉取（ollama /api/tags、deepseek/openai models.list）自动同步。

**Q22：AI 分析报告的数据从哪来？**
数据提供层（ai/data/）通过 opscenter 的 api/ 子包聚合：服务器列表（query_servers_for_analysis）、巡检记录（query_patrols_for_analysis）、告警（query_alarms_for_analysis）→ 构建每台服务器画像（配置/磁盘挂载/服务详单/systemd/关联告警）→ 格式化成 Markdown → 大模型按八章结构生成。

**Q23：SSE 流式输出怎么做的？**
后端 StreamingResponse(text/event-stream)，生成器逐 chunk yield "data: {content}\n\n"，末尾 "__meta__" 带 token 用量 + [DONE]。前端 fetch + getReader + TextDecoder 逐行解析，流式渲染。

### 5.6 配置中心与调度

**Q24：三级缓存怎么保证一致？**
写路径统一：set_config → 写 MySQL → cache_set（Redis+内存）→ 变更回调。读路径：内存 → Redis → MySQL。reload_cache 全量重载兜底。一致性靠"所有写都走同一入口"保证。

**Q25：调度器怎么热生效？**
SchedulerSync 双通道：①配置保存/刷新回调（set_config 后 _notify_change）立即 sync_all；②60 秒守护任务兜底（覆盖 SQL 直改）。sync_all 比对 cron/enabled 变化：trigger 模式 reschedule_job（暂停中也更新 trigger，恢复即新频率），enabled 1↔0 pause/resume，internal 模式只动开关。幂等——无变化零操作。

**Q26：内部自匹配和 trigger 驱动有什么区别？为什么两套？**
采集/备份/校验/DB巡检内部还有策略级/策略表 cron（如每个备份策略自己的 cron），所以设计成"每分钟唤醒一次 + match_cron 匹配"，天然热生效；巡检/分析/模型同步频率就是全局配置，直接由 APScheduler trigger 决定，需要 reschedule。两套都纳入统一热同步。

### 5.7 工单闭环

**Q27：工单和告警怎么联动的？**
告警创建即自动生成工单（处理人=服务器负责人，审核人=部门主管，SLA 按优先级 2h/8h/24h/72h）。处置流程：处理 → 提交审核 → 审核通过 → **联动把告警置为已处理**；其他状态（处理中/超时/不通过）不动告警——保证告警状态真实反映故障是否解决。超时由定时任务流转并催办。

**Q28：为什么工单要用独立事务创建？**
巡检是分钟级长事务，若工单在同一事务创建，会持有 work_order 行锁直到巡检结束，导致工单超时任务每分钟的 UPDATE 全部 Lock wait timeout（1205）。独立事务提交后锁立即释放；且工单创建更可靠（巡检失败工单仍在，来源信息完整）。

### 5.8 权限与安全

**Q29：权限校验链路？新增接口怎么加权限？**
require_perms("bnt.xxx") 依赖注入 → sys_user_role → sys_role_menu → sys_menu 关联查询，超管也走角色（无硬编码放行，防止权限绕过）。新增接口必须：路由加 require_perms + sys_menu 插按钮记录（type=2）+ 关联全量角色，否则所有人 403。

**Q30：登录安全做了哪些？**
bcrypt 密码 + 旧 MD5 自动升级；失败递增降级锁定（5次→5分钟 → 3次→15分钟 → 2次→30分钟 → 2次→1天）；Redis Session（JWT+会话双因子，踢下线/封禁即时生效）；操作日志 + 登录日志全量记录；SSH 交互执行有危险命令黑名单（rm -rf/mkfs/reboot 等 18 条正则）。

**Q31：凭证密码怎么存的？**
Fernet 对称加密（密钥在 .env）后入库，仅连接时解密；SSH 支持密码/私钥（RSA/Ed25519/ECDSA）双认证。

### 5.9 基础设施与工程化

**Q32：前后端字段命名怎么统一的？**
后端 Schema 统一继承 BaseVO：字段蛇形命名，pydantic alias_generator=to_camel 自动生成驼峰别名——前端传 camelCase 可接收（populate_by_name）、响应输出 camelCase（serialize_by_alias），一套 Schema 双端无感。

**Q33：统一响应是怎么实现的？**
重写 FastAPI JSONResponse.render()：业务返回 dict → 自动包装 {code, message, totalCount, data}；分页元数据（total/page/limit）自动提升到外层，data 只留业务载荷——对非分页接口零侵入。

**Q34：操作日志怎么自动记录的？**
@Log 装饰器（AOP）：包装函数，从 kwargs 提取 request/db，解析 URL/IP（X-Forwarded-For 优先）/地理位置（ip-api.com）/Bearer token 用户名/请求参数，try/finally 无论成败写 sys_oper_log，失败分支构造标准错误 JSON。

**Q35：文件超 500 行怎么拆？**
按功能拆文件（如采集模块：collector_service 编排 / collector_trigger 触发 / collector_parallel 并发辅助；巡检引擎：parsers/collectors/inspection/rule 分文件），路由只做参数校验+调 Service。

**Q36：ID 为什么是 11 位数字？**
曾用 6-8 位随机数字，表数据量上来后主键冲突（Duplicate entry）。现改为进程内单调递增的相对毫秒时间戳（2026 起，11 位）：同毫秒批量生成自动 +1，进程内绝对唯一，长度短（前端展示友好），重启后时间单调不重复。

### 5.10 前端

**Q37：动态路由怎么做？权限怎么控？**
后端 /info 返回菜单树+按钮码 → 守卫里 filterAsyncRouter（component 字符串 → import.meta.glob 动态导入）→ router.addRoute 注册 → 404 兜底。按钮权限用 hasBtnPermission + v-if。登出 resetRouter 清理动态路由。

**Q38：keep-alive 缓存页面为什么需要包装组件？**
keep-alive include 匹配的是组件 name 而非路由名；`<script setup>` 默认无 name。用 defineComponent({name, render(){ return h(Component) }}) 动态包装，把路由名注入组件名，include 才能命中。

**Q39：SSE 流式在前端怎么解析？**
fetch 原生流：response.body.getReader() + TextDecoder 增量解码，按 \n 分割，识别 "data: " 前缀 / [DONE] 结束 / [ERROR] 错误，逐字符 append 并用 marked 渲染。

**Q40：有什么工程上的坑？**
①token 在 Cookie 有 XSS 隐患（现代方案 httpOnly/double token）；②分页走路径参数 list/1/10 而非 query；③Dashboard/AI 页面还是 Options API 待迁移；④WebSocket 断线重连+心跳+轮询兜底三层保障。

### 5.11 安全（P0，生产环境重中之重）

**Q41：SSH 凭证怎么保证安全？攻击者拿到凭证能登录服务器执行任意命令，怎么防？**
四层：①**存储加密**——密码/私钥 Fernet 对称加密入库（密钥 FERNET_KEY 在 .env 独立于数据库），仅使用时解密；②**命令白名单**——巡检/采集命令全部代码内置（只读查询命令），不接收用户输入，无注入面；③**命令黑名单**——交互式 SSH 有 18 条危险命令正则拦截（rm -rf/mkfs/dd/reboot 等）；④**执行审计**——谁/哪台/什么命令全记录。**已整改（2026-08-08）**：root 已替换为专用只读巡检账号（sudoers 命令白名单，全只读）+ MySQL 同名只读账号（PROCESS/REPLICATION CLIENT）——凭证泄露也只能执行只读查询；实测危险命令（rm -rf/systemctl stop/DROP TABLE）全部被拒。剩余待办：密钥上 KMS、交互式执行白名单化、凭证自动轮换。

**Q42：巡检/采集只做数据获取，怎么保证不会误操作/被恶意利用执行破坏性命令？**
设计上：① 巡检执行的都是**只读查询命令**（top/free/df/uptime/ss/ps/dmesg/systemctl status/mysql SHOW STATUS），代码写死、参数化，无任何用户输入注入点；② 命令 120s 超时 + 连接 15s 超时，防慢命令/资源耗尽；③ 采集器有命令级失败标记，失败不静默写 0；④ 交互式执行（Web 终端）单独隔离：黑名单拦截 + 操作日志审计。更进一步：给巡检账号配 sudoers 命令白名单（只允许只读命令），即使凭证泄露攻击者也执行不了破坏性命令。

**Q43：数据库备份/巡检/同步的账号安全怎么做？会不会被用来改数据？**
① 数据库账号密码 Fernet 加密存储（同 SSH 凭证）；② 备份用 mysqldump `--single-transaction` 一致性**只读**快照，备份账号无 DML 能力需求；③ 巡检 SQL 检查项全只读查询；④ AI 助手只生成 SQL 不执行，红线禁 DELETE/DROP/TRUNCATE/SHOW 等。P0 改进：**备份专用账号最小权限**（SELECT/LOCK TABLES/RELOAD/SHOW VIEW/TRIGGER/PROCESS），与业务读写账号隔离——即使备份账号泄露也只能读和导出，改不了数据。

**Q44：平台自身怎么防攻击？（认证/越权/注入）**
① 认证：JWT + Redis Session 双因子，踢下线/封禁即时生效；② 防爆破：递增降级锁定（5次→5分钟→15分钟→30分钟→1天）；③ 权限：RBAC 三表关联、超管也走角色无硬编码放行、新增接口未登记菜单即 403；④ 越权：路由级 require_perms + 数据级校验（工单处理人必须匹配当前用户）；⑤ 注入：全 SQLAlchemy 参数化，无字符串拼接 SQL；⑥ 审计：登录日志/操作日志（@Log 切面带 IP/参数/结果）/SSH 执行审计全覆盖。

**Q45：如果平台被攻破，怎么缩小爆炸半径？**
① 凭证按服务器独立（不共用），泄露一台不影响其他；② 凭证与服务器绑定、只查询启用状态；③ 加密密钥独立于数据库（拿库拿不到明文）；④ **已落地专用只读账号**（sudoers 白名单全只读 + MySQL 最小权限）——即使平台沦陷，被管服务器也只能被只读访问，无法破坏；⑤ 会话即时失效（Redis Session 可踢）；⑥ 全链路审计可追溯谁做了什么。

**Q46：加密密钥（FERNET_KEY）泄露了怎么办？**
这是最坏情况：全部凭证可解密。应对：① 立即轮换所有服务器凭证 + 数据库账号密码；② 更换 FERNET_KEY 并批量重加密存量密文（平台支持批量更新凭证）；③ 审计登录日志/操作日志排查异常；④ 改进：密钥上 KMS、启动注入、不入代码仓库。

**Q47：备份数据安全（传输/存储/完整性）？**
① 传输：SSH 加密通道 + 云 SDK HTTPS；② 存储：OSS/COS 私有桶 + AK 最小权限；③ 完整性：定时恢复式校验；④ 改进：备份文件加密（gpg/云 KMS）、桶策略最小化、下载审计。

**Q48：前端安全？**
① Vue 模板默认转义防 XSS；② 富文本（WangEditor）白名单过滤；③ token 存 Cookie 有 XSS 风险（诚实承认），改进方向 httpOnly Cookie / 双 token / 短期 access + 刷新；④ 敏感操作（删除/批量/踢下线）前端二次确认 + 后端权限校验双保险。

---

## 六、项目亮点速记

**自动化**：SSH 巡检+采集全自动，10 个定时任务配置中心驱动、热生效
**智能化**：LLM 统一客户端（埋点+限额）、RAG 混合检索（向量+BM25+RRF+Reranker）、DB 助手防幻觉、报告自动沉淀知识库
**闭环化**：告警→工单→SLA→审核→联动处理，超时自动催办
**可靠性**：告警去抖+聚合+恢复、命令级超时、逐台提交、工单独立事务、锁冲突重试
**可维护**：模块 api/ 解耦、配置中心三级缓存、统一响应/异常/日志、500 行文件约束
**工程化**：BaseVO 驼峰、@Log AOP、Fernet 加密、前端动态路由+keep-alive trick+SSE 流式+数据大屏
**安全性**：凭证 Fernet 加密+只读巡检账号+sudoers 命令白名单+MySQL 最小权限（P0 已闭环）、递增降级锁定、RBAC 无硬编码放行、全链路审计

---

<!-- > 面试时建议按此顺序讲：**项目定位（30 秒）→ 架构图（1 分钟）→ 挑 2-3 个核心模块深讲（巡检闭环 / AI-RAG / 告警工单联动）→ 等面试官提问**。 -->
