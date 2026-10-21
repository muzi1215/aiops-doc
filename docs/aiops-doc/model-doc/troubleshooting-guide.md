# 开发问题排查手册（Troubleshooting Guide）

> **定位**：记录平台开发过程中遇到的实际问题、排查思路、根因与解决方案。既是团队排障手册，也是面试中展示"问题排查能力"的核心材料。
>
> **最后更新**：2026-10-22

---

## 一、问题清单总览

| # | 问题现象 | 根因类别 | 解决方式 |
|---|---------|---------|---------|
| 1 | 配置中心改了巡检 cron 不生效 | 架构缺陷：调度 cron 只在启动时读一次 | 调度器热同步机制（SchedulerSync） |
| 2 | 巡检日志有告警/工单但巡检数据 0 入库 | SSH 命令无超时 → 任务卡死 → 事务永不提交 | 命令级 120s 超时 + 逐台 commit |
| 3 | 巡检整轮挂掉：`Duplicate entry` 主键冲突 | ID 生成碰撞（6-8 位随机） | 进程内递增毫秒时间戳 ID（11 位绝对唯一） |
| 4 | 工单超时任务每分钟报 `Lock wait timeout (1205)` | 巡检长事务持有 work_order 行锁 | 工单独立事务 + 超时流转锁冲突重试 |
| 5 | 巡检任务持续 `skipped: maximum instances reached` | 频率(*)与耗时(4分钟)失衡 | 巡检/采集并发优化（一轮降到 1 分钟内） |
| 6 | 备份 cron 时间点没触发备份 | 备份策略 status=0 被静默跳过（无日志） | 排查经验：先看策略开关 |
| 7 | 备份日志"执行 0 张表备份" | 全库模式日志文案误导（非异常） | 日志文案区分指定表/全库 |
| 8 | 通知日志刷屏淹没巡检日志 | 通知链路每步都打 INFO | 细节降 DEBUG，保留"最终渠道"一条 INFO |
| 9 | 大屏工单优先级"暂无数据" | BaseVO 驼峰序列化：`by_priority`→`byPriority` | 前端按接口实际输出取字段 |
| 10 | 大屏巡检动态空（库里有 2 万条） | `nullslast()` MySQL 5.7 不支持 → 异常被 except 吞掉 | 去掉 NULLS LAST + 排查被吞异常 |
| 11 | 前端构建报 `Unexpected }` | 编辑样式块时残留孤立代码 | 修复 CSS 块结构 |
| 12 | 采集任务一直 skip（定时每天一次正常触发后） | 任务 107s 未跑完，每分钟调度被防重叠拦截 | 预期行为（max_instances=1），无需处理 |
| 13 | 只读账号切换后 MySQL 深度指标丢失（连接池/慢查询无数据） | `mysql -S` 无账号连接依赖系统账号同名免密，新账号无 MySQL 账号 | MySQL 安装 auth_socket 插件 + 创建同名只读账号 |
| 14 | `CREATE USER ... IDENTIFIED WITH auth_socket` 报 `Plugin 'auth_socket' is not loaded` | MySQL 未加载 auth_socket 插件 | 先 `INSTALL PLUGIN auth_socket SONAME 'auth_socket.so'` |
| 15 | 巡检 CPU 使用率恒定 100%，但服务器负载仅 0.05（明显空闲） | 系统级 gather 并发采集，top 采样窗口被并发命令瞬时打满 | CPU 单独顺序采样 + `top -bn2` 取瞬时值 |
| 16 | 只读账号切换后远程备份失败：`mkdir ... Permission denied` | 远程备份在目标机写备份目录，只读账号无目录写权限 | 备份根目录属主交给只读账号（写权限限定在落盘目录） |
| 17 | 前端日期选择器传参乱值（`yyyy-08-Sa 00:00:00`）且无法选截止时间 | Vue2→Vue3 迁移后 moment 小写格式令牌未适配 dayjs | `value-format` 改大写 + 换 `datetimerange` 单组件 |
| 18 | 告警自动为已处理，但关联工单仍待处理/超时 | 旧代码未部署 + 系统级告警命名不一致导致误恢复 | 系统级类型集合 + 重新构建部署 |
| 19 | 操作日志明文记录登录密码（库 / binlog / 备份可查） | 密码经 URL 传参 + `@Log` 原样序列化参数落库 | 写时脱敏 + 密码改请求体 + 查询兜底 + 存量刷库脚本 |

---

## 二、问题详解

### 问题 1：配置中心改了巡检 cron 不生效

**现象**：在配置中心把 `patrol_cron` 从 `*/2` 改成 `*/30`（或反之），服务不重启就永远按旧频率跑；且巡检"没有按配置触发"。

**排查过程**：
1. 查配置表：`patrol_cron = */30, enabled=1`——配置本身没问题
2. 读 `main.py`：`patrol_cron` 在 lifespan **启动时读取一次**，`scheduler.add_job()` 一次性注册
3. 读 `run_patrol_inspection()`：内部**没有任何运行时读取 cron/enabled 的逻辑**
4. 对比其他任务：采集/备份/校验是"每分钟唤醒 + 内部 match_cron"，天然热生效；巡检/分析/模型同步是"trigger 驱动"，只认启动时的值

**根因**：调度器 cron 只在启动时读取注册，运行期修改配置不重新调度——**配置中心"支持动态调整"的说法与实现不符**（采集类任务热生效，巡检类不生效）。

**解决**：新建 `aiops/util/scheduler_sync.py` 统一热同步机制：
- **双通道**：配置保存/刷新回调（`set_config`/`reload_cache` → `_notify_change`）即时同步 + 60 秒守护任务兜底（覆盖 SQL 直改）
- **两种驱动模式**：trigger 模式（巡检/分析/模型同步）→ cron 变化 `reschedule_job`（暂停中也更新 trigger，恢复即新频率）；internal 模式（采集/备份/校验/DB巡检）→ 只动 enabled 做 pause/resume（cron 由内部 match_cron 天然热生效）
- 幂等：无变化零操作，不刷日志

**经验**：**"配置化了"不等于"热生效"**——要区分配置在哪个环节被读取（启动时 vs 每次执行）。写文档说"支持动态调整"前先验证运行时路径。

---

### 问题 2：巡检日志有告警/工单，但巡检数据 0 入库

**现象**：巡检日志显示"创建告警-告警ID:xxx、创建工单-编号:xxx"，但查库 `ops_service_patrol` 该时间点 0 条记录。

**排查过程**：
1. 查库确认：告警/工单/巡检记录**全部没有**（不只是巡检）——日志只是"创建了"，数据库没提交
2. 读 `run_patrol_inspection`：整个任务共用一个 session，**全部服务器巡检完才 `db.commit()`**
3. 读 `ssh_client.exec`：`stdout.read()` **无超时**——远端命令 hang 时无限期阻塞
4. 日志时间线：系统级 21 秒完成 → 服务级 16 个服务逐个 SSH 采集 → 某条命令 hang → 任务卡死 → commit 永远执行不到

**根因**：SSH 命令无超时 + 大事务（最后一次性提交）→ 单条命令卡死拖垮整轮，所有数据不落库。

**解决**（两层）：
1. `ssh.exec` 增加 `channel.settimeout(120)`：远端命令 hang 快速失败，返回错误标记不抛异常（命令级失败隔离）
2. `run_patrol_inspection` 改为**每台服务器巡检完立即 commit**：单台卡住/异常只丢该台（且有"巡检异常"兜底记录）

**经验**：**长事务 + 外部 IO（SSH/HTTP）是危险组合**。外部调用必须有超时；批量任务提交粒度要细，避免"全部完成才提交"。

---

### 问题 3：巡检整轮挂掉：`Duplicate entry '233621' for key 'ops_service_patrol.PRIMARY'`

**现象**：巡检报主键冲突，`autoflush` 失败 → session 进入 PendingRollback → 连锁报 `MissingGreenlet` → 整轮 0 条入库。

**排查过程**：
1. 查库：`233621` 这条记录**早在 7 月 12 日就存在**（mysqld），今天巡检又随机生成了同一个 ID
2. 读 `random_util.generate_secure_numeric_id`：**6-8 位纯随机数字**（最多 1 亿组合），全项目 72 处共用
3. 巡检表已 2 万+ 条 → 生日悖论碰撞概率显著；且巡检每轮批量生成 17 条 ID
4. 顺带发现连锁 bug：inspect_server 的 except 里 `db.add(error_patrol)` 前**没有 rollback**（PendingRollback 状态下继续用 session）；run_patrol_inspection 的 except 访问 `server.hostname` 触发过期属性懒加载 → MissingGreenlet

**根因**：ID 生成碰撞（纯随机位数不足）+ 异常后会话未回滚的连锁错误。

**解决**：
1. `generate_secure_numeric_id` 改为**进程内单调递增的相对毫秒时间戳（2026 起，11 位）**：同毫秒批量生成自动 +1，进程内绝对唯一；线程锁保护；重启后时间单调不重复
2. `inspect_server` except 里**先 `db.rollback()`** 再写"巡检异常"记录
3. `run_patrol_inspection` except 里 **rollback 前先取 hostname**（rollback 会 expire 属性，之后访问触发懒加载 IO）

**经验**：
- **随机 ID 位数不足是大坑**：6-8 位随机在万级数据量就危险，纯随机方案碰撞率随数据量增长
- **SQLAlchemy 异常后必须 rollback 才能继续用 session**；rollback 后 ORM 属性过期，访问会触发懒加载（async 下抛 MissingGreenlet）
- **except 里别吞/别忽略**，把兜底链路也测一遍——第一层 except 崩了还有第二层，两层都崩才暴露

---

### 问题 4：工单超时任务每分钟报 `Lock wait timeout exceeded (1205)`

**现象**：`mark_work_orders_timeout`（每分钟执行）的 UPDATE 工单语句持续报 1205，任务异常退出。

**排查过程**：
1. 看报错 SQL：`UPDATE work_order WHERE deadline_time < now AND status IN (1,4)`——UPDATE 需要行锁
2. 看同时段巡检日志：巡检任务从 18:22 跑到 18:26（4 分钟长事务）
3. 读 `create_alarm` → `create_work_order`：**工单在巡检事务内创建（flush 未提交）** → 持有 work_order 新行行锁直到巡检结束
4. 工单超时任务被该锁阻塞 → 超过 MySQL `innodb_lock_wait_timeout`（默认 50s）→ 1205

**根因**：分钟级长事务（巡检 SSH 采集）内创建工单，行锁持有时间被拉长到巡检结束；高频任务（每分钟 UPDATE）被阻塞。

**解决**（两层）：
1. **工单独立事务**：`create_alarm` 里用独立 `AsyncSessionLocal` 会话创建工单并提交——锁立即释放；附带语义改进：工单创建更可靠（巡检失败工单仍在，来源信息完整）
2. **锁冲突重试**：`mark_work_orders_timeout` 捕获 OperationalError（Lock wait timeout/Deadlock），重试 3 次（间隔 5s/15s/30s）自愈

**经验**：
- **长事务里只做"该事务的事"**：外部系统写入（工单/通知）独立提交
- 高频 UPDATE 任务要做**锁冲突重试**兜底，不能一次失败就整体异常
- 排查锁问题看 `SHOW PROCESSLIST` / `information_schema.innodb_trx` 找持有锁的长事务

---

### 问题 5：巡检任务持续 `skipped: maximum number of running instances reached (1)`

**现象**：巡检频率 `*/2`（每 2 分钟），但日志一直 skip——任务永远跑不完，每轮都被防重叠拦截。

**排查过程**：
1. 实测一轮巡检耗时：系统级 21 秒 + 服务级 16 个服务**串行** SSH 采集 ≈ 4 分钟
2. `max_instances=1`：上一轮没结束，下一轮触发被跳过（防重叠是**保护**，不是 bug）
3. 结论：**频率 < 耗时时，任务永远无法完成**——不是调度问题，是耗时问题

**解决**：巡检引擎并发改造：
- 系统级 14 条命令 `asyncio.gather` + Semaphore(6) 并发：21 秒 → 3 秒
- 服务级每服务独立 SSH 连接 + Semaphore(6) 并发采集（`_collect_single_service`），采集完**串行**判警写库（db session 不可并发共享）
- 单服务失败隔离：`is_running=None` 不误报"服务已停止"
- 效果：一轮 4 分钟 → **1 分钟内**，`*/2` 频率可正常跑

**经验**：
- **看到 skipped 先算账**：任务耗时 vs 调度间隔，耗时 > 间隔时 skip 是必然
- **并发采集的正确姿势**：IO 密集（SSH）并行、写库串行；并发数受 sshd MaxSessions（默认 10）约束
- 采集引擎同款改造：3 分钟 → 1 分 47 秒（docker system df 等重命令 120s 窗口内完整执行）

---

### 问题 6：备份 cron 时间点没触发备份

**现象**：配置 `db_backup_cron = "0 54 18 * * ?"`（每天 18:54），到点没有任何备份动作，**也没有任何日志**。

**排查过程**：
1. 查配置表：cron 正确、enabled=1、18:53 刚修改过（配置没问题）
2. 读 `run_scheduled_backups`：先查**启用的备份策略**（`status=1`），策略为空 → **直接 `return`（不打日志）**
3. 查备份策略表：唯一一条策略 `status=0`（禁用）

**根因**：备份调度器要求"至少一条启用的备份策略"才执行；策略禁用时静默 return——**无日志是排查困难的根本原因**。

**解决**：启用策略（status=1）；日志优化（策略为空时打一条 INFO）。

**经验**：**静默 return 是最坑的排查场景**——分支提前返回前至少打 DEBUG 日志；排查"定时任务没触发"按链路逐层确认：调度注册 → 开关 → cron 匹配 → 数据前置条件。

---

### 问题 7：备份日志"执行 0 张表备份"

**现象**：备份成功（mysqldump 全库 14.9MB），但日志"执行 0 张表备份"让人以为漏了表。

**排查过程**：读执行器：`tables = _table_names if _table_names else []`——**策略触发没传指定表列表 → 空 → 走全库分支**（mysqldump 不带表名 = 整库）。"0 张表"只是打印 `len(tables)`，紧接着的"mysqldump 全部完成"才是真正动作。

**解决**：日志文案区分：指定表 → "执行 N 张指定表备份"；全库 → "未指定表列表，执行全库备份（mysqldump xxx）"。

**经验**：**日志要表达语义而不是打印变量**——`len(tables)` 对空列表打 0 是误导性日志，这种日志会在未来无数次让人误判。

---

### 问题 8：通知日志刷屏淹没巡检日志

**现象**：一次告警通知打 15-20 行 INFO（通道注册/邮箱开关/场景配置 JSON/渠道过滤/各渠道发送成功/飞书成功...），巡检日志被淹没。

**解决**：
- 成功路径细节全部降 DEBUG（通道注册、邮箱开关、场景配置、渠道过滤、各通道发送成功、飞书成功）
- 保留一条 INFO："通知类型 xxx 最终发送渠道: [feishu, dingtalk, work_wecom]"（确认通知链路）
- 巡检侧合并为一行结果日志："通知发送成功 - 服务器=xxx, 类型=xxx, 级别=xxx"
- 失败路径（WARNING/ERROR）全部保留
- 控制台 handler level DEBUG → INFO（loguru `log_config.py`），需要排查时改回 DEBUG

**经验**：**日志级别是治理工具**——成功路径 INFO 一条足够，细节 DEBUG；失败路径永远保留；批量任务场景尤其要控制每条链路的日志量。

---

### 问题 9：大屏工单优先级"暂无数据"

**现象**：大屏"工单优先级分布 共 60 张"（overview 正常）但列表空；统计中心页面却有数据（高 46/紧急 3/中 10/低 1）。

**排查过程**：
1. 后端直接调函数：`by_priority` 有 4 条数据——函数层正常
2. 看接口层：`return WorkOrderStatsVo(**stats)`——**BaseVO 序列化**
3. `WorkOrderStatsVo.by_priority` 有 `alias="byPriority"` + BaseVO `serialize_by_alias=True` → **接口输出驼峰 `byPriority`**
4. 前端取 `workOrder.value.by_priority`（snake）→ undefined；而 `overview` 是嵌套 dict 不转驼峰 → 显示正常

**根因**：**BaseVO 驼峰别名对顶层字段生效、对嵌套 dict 不生效**——混用时字段名按接口实际输出为准。

**解决**：前端取 `byPriority`（兼容兜底 `by_priority`）。

**经验**：前后端联调时，**以接口实际返回（F12 Network）为准**，不要想当然按函数返回或模型定义取字段；BaseVO + 嵌套 dict 混用是字段名不一致的高发区。

---

### 问题 10：大屏巡检动态空（数据库有 2 万多条）

**现象**：大屏"最近巡检动态"无数据，但 `ops_service_patrol` 表 2 万+ 条。

**排查过程**：
1. 前端取 `patrolRecent` → 实测接口字段是 `patrolLatest`——先修字段名
2. 修完仍空 → 直接调后端函数：`patrolLatest` 返回**空列表**！
3. 复现查询：`ORDER BY last_check_time DESC NULLS LAST` → **MySQL 5.7 不支持 NULLS LAST（1064 语法错误）**
4. 代码里 `except Exception: latest_rows = []` **把异常吞了** → 永远返回空、无日志

**根因**：SQL 方言不兼容（`nullslast()`）+ 异常被 except 吞掉 = **静默空数据**。

**解决**：去掉 `nullslast()`（MySQL 默认 NULL 排前，last_check_time 基本有值，影响可忽略）；全局 grep 确认仅此一处。

**经验**：
- **MySQL 5.7 不支持 `NULLS LAST`**（8.0 才支持）——SQLAlchemy 的 `nullslast()` 生成该语法
- **except 吞异常前先想清楚**：静默失败比报错更难排查；至少 `log.warning` 记录
- 排查"接口空但库里有数据"：直接调后端函数看返回值 → 复现查询看报错 → 找 except

---

### 问题 11：前端构建报 `Unexpected }`

**现象**：`vite` 编译 dashboard/index.vue 报 `:23:1 Unexpected }`。

**排查过程**：读报错位置——编辑大屏入口样式时，把 `.dashboard-container {` 替换成了单行（`{ position: relative; }`），原样式块的 `padding/background/min-height` 属性残留成**孤立代码块**（无选择器），CSS 结构损坏。

**解决**：合并回完整样式块。

**经验**：**用 Edit 工具替换样式选择器行时要带上整个块**（或替换后立即构建验证）；构建报错先看报错行附近最近一次编辑。

---

### 问题 12：采集任务一直 skipped

**现象**：每天定时采集正常触发后，日志出现多次 `skipped`。

**排查过程**：任务 107 秒未跑完，期间每分钟的调度被 `max_instances=1` 拦截——**防重叠保护正常工作**（正在执行的采集会正常完成），被跳过的是"空调度"。

**结论**：预期行为，无需处理（任务耗时 > 1 分钟时中间分钟跳过是保护机制）。

---

### 问题 13：只读账号切换后 MySQL 深度指标丢失（连接池/慢查询无数据）

**背景**：按安全加固要求，把平台 SSH 凭证从 root 切换为**专用只读巡检账号**（`scripts/create_patrol_account.sh` 创建，sudoers 白名单授权只读命令）。

**现象**：切换后巡检/采集/告警全部正常，但 MySQL P99 深度指标丢失：

```
[MySQL P99] socket 路径: /var/lib/mysql/mysql.sock, 基础命令: mysql -S /var/lib/mysql/mysql.sock
[MySQL P99] 当前连接数: 0 (无数据)
[MySQL P99] 最大连接数: 0 (无数据)
[MySQL P99] maxConnections=0，无法计算使用率（MySQL 认证可能失败）
[MySQL P99] 慢查询数: 0 (无数据)
```

**排查过程**：
1. 看采集器代码（`collect/mysql.py`）：`mysql_base = f"mysql -S {socket_path}"`——**无 -u/-p 参数**，靠系统账号同名免密认证
2. 之前 root 系统账号 → MySQL `root@localhost`（auth_socket 免密）→ 认证成功
3. 切换为 `aiops_patrol` → MySQL 中不存在 `aiops_patrol@localhost` 账号 → 认证失败 → 三个指标全空
4. 确认影响范围：仅连接池使用率/慢查询指标缺失；`conn_usage`/`slow_queries` 规则因指标为 None 被跳过（**不误报**），巡检本身 0 异常

**根因**：`mysql -S` 无账号连接依赖"系统账号与 MySQL 账号同名"的免密机制；新账号在 MySQL 侧无对应账号。

**解决方案**（零代码改动，利用 MySQL socket 免密认证）：

```sql
-- ① 在被管服务器的 MySQL 上执行（MySQL 8.x）：
INSTALL PLUGIN auth_socket SONAME 'auth_socket.so';   -- ★ 先装插件（否则报错见问题 14）

CREATE USER 'aiops_patrol'@'localhost' IDENTIFIED WITH auth_socket;
GRANT PROCESS, REPLICATION CLIENT ON *.* TO 'aiops_patrol'@'localhost';
FLUSH PRIVILEGES;
```

权限说明：`PROCESS`（SHOW STATUS 看线程/连接数）、`REPLICATION CLIENT`（复制状态）——**纯只读监控权限，无任何数据读写**。

**验证**（服务器上以该账号实际执行）：
```bash
sudo -u aiops_patrol mysql -S /var/lib/mysql/mysql.sock -e "SHOW STATUS LIKE 'Threads_connected'"
# 应输出 Threads_connected  11（有值 = 认证成功）
```

**效果**（切换后真实日志）：
```
[MySQL P99] 当前连接数: 11 (原始: 11)
[MySQL P99] 最大连接数: 151 (原始: 151)
[MySQL P99] 连接池使用率: 7.3%
[MySQL P99] 慢查询数: 0 (原始: 0)
```

**经验**：
- 系统账号切换后，凡是"无账号连接"的组件都要检查（MySQL socket 免密、Docker 组、文件权限）
- MySQL 只读监控账号最小权限 = `PROCESS + REPLICATION CLIENT`，够用且安全
- 指标为 None 时规则引擎自动跳过不误报——**"无数据"与"异常"的区分设计**在这里体现了价值

---

### 问题 14：`CREATE USER ... IDENTIFIED WITH auth_socket` 报 `Plugin 'auth_socket' is not loaded`

**现象**：
```
mysql> CREATE USER 'aiops_patrol'@'localhost' IDENTIFIED WITH auth_socket;
ERROR 1524 (HY000): Plugin 'auth_socket' is not loaded
```

**根因**：MySQL 8 的 auth_socket 插件**默认未加载**，需要先 INSTALL。

**解决**（按顺序执行）：
```sql
-- ① 加载插件（MySQL 8 自带该 .so；成功后再建用户）
INSTALL PLUGIN auth_socket SONAME 'auth_socket.so';

-- ② 创建同名只读账号
CREATE USER 'aiops_patrol'@'localhost' IDENTIFIED WITH auth_socket;
GRANT PROCESS, REPLICATION CLIENT ON *.* TO 'aiops_patrol'@'localhost';
FLUSH PRIVILEGES;
```

**如果 `INSTALL PLUGIN` 也失败**（插件文件缺失，常见于精简版 MySQL 5.7 / MariaDB）：
- MariaDB 用 `unix_socket` 插件：`CREATE USER 'aiops_patrol'@'localhost' IDENTIFIED VIA unix_socket;`
- 或改用通用方案：**采集器配置化**（配置中心加 MySQL 监控账号，`mysql -S <socket> -u <user> -p'<pass>'` 带账号连接），不依赖任何插件
- 确认版本：`SELECT VERSION();`

**经验**：`IDENTIFIED WITH <plugin>` 要求插件已加载——建用户前先确认插件状态（`SHOW PLUGINS;` / `SELECT * FROM mysql.plugin;`）。

---

### 问题 15：巡检 CPU 使用率恒定 100%，但服务器实际空闲（负载仅 0.05）

**现象**：巡检记录 CPU 使用率恒为 `100.0%`（触发 CPU 超阈值高危告警），但同一条记录的负载 `0.00, 0.02, 0.05`（2 核机器空闲 97%+）——**两个指标严重矛盾**。

**排查过程**：
1. 查库统计：8/8 并发改造后（19:37 起）cpu_usage 全部 100.0%，负载全部 <0.65——矛盾成立
2. 对比时间线：并发改造前 CPU 显示 71.9%/97.1%（串行采样），改造后恒定 100%——**改动是诱因**
3. 读代码：8/8 把系统级 14 条命令改为 `asyncio.gather` 并发执行，`top -bn1` 与其他 13 条命令（dmesg/ss/ps...）**同一时刻并发跑**
4. 确认机制：`top -bn1` 的采样窗口内，其他命令正在 2 核机器上并发执行 → **瞬时 CPU 被并发命令打满** → top 采到假 100%；且 `-bn1` 首次采样对瞬时负载敏感（无基准帧）
5. 排除干扰：内核错误（dmesg OOM 记录）与 CPU 是**两个独立指标**——OOM 告警真实，CPU 100% 是采样假象

**根因**：并发采集让 `top` 的采样窗口与"其他命令执行"竞争——采样时刻 CPU 被自己发起的并发命令打满，采到的是"采集动作本身的瞬时负载"而非"服务器真实负载"。

**解决**（两层）：
```python
# ① CPU 从 gather 并发中拆出，单独顺序采样（采样时无其他命令竞争）
_cpu_stdout, _ = await ssh_exec_async(ssh, "top -bn2 -d 1 | grep 'Cpu(s)' | tail -1")

# ② 其余 13 条命令照常 gather 并发
```

- `top -bn2 -d 1`：第一帧丢弃（-bn1 首帧为启动以来累计平均，服务器曾满负荷会拉高成假 100%），**第二帧 = 最近 1s 瞬时值**
- CPU 采样独占时段执行，不再被并发命令干扰

**经验**：
- **性能采集类指标（CPU/内存瞬时值）必须单独采样**——与批量命令并发执行会采到"采集动作自身"的负载
- **数据交叉验证**：CPU 100% 与负载 0.05 矛盾 → 先怀疑采样/解析，再怀疑真实负载
- `top -bn1` 首帧是"启动以来累计平均"，瞬时值要用 `-bn2` 第二帧（top 经典坑）

---

## 三、通用排查方法论（沉淀）

### 3.1 定时任务排查链路（按层确认）

```
① 调度是否注册？        → 启动日志"定时调度 xxx | 表达式=..."
② 开关是否开启？        → 配置中心 enabled 字段
③ cron 是否匹配？       → 手工 match_cron 验证（单段简写 vs 5-6 段格式）
④ 数据前置条件是否满足？ → 如备份策略 status=1、服务器在线+有凭证
⑤ 任务内部是否正常执行？ → 任务日志（被 except 吞的异常要单独查）
```

### 3.2 数据"接口空但库里有"排查链路

```
① 直接调后端函数（绕开接口层）→ 确认数据层是否有数据
② 复现 SQL 查询 → 找方言兼容问题（NULLS LAST / GROUP BY 规则 / 排序规则）
③ 检查接口层包装 → BaseVO 驼峰别名 / StandardJSONResponse 结构
④ 检查前端字段名 → 以 F12 Network 实际返回为准
⑤ 检查被吞的异常 → grep "except Exception" 附近是否有静默 return []
```

### 3.3 锁冲突排查

```
① 报错 1205/1213 → 找持有锁的长事务：SHOW PROCESSLIST / information_schema.innodb_trx
② 定位长事务来源 → 长任务（巡检/备份）内是否嵌了外部写入（工单/通知）
③ 解决方向 → 独立事务 / 缩短事务 / 重试兜底
```

### 3.4 定时任务"频率 vs 耗时"账本

```
任务耗时 > 调度间隔 → max_instances=1 必然 skip → 优先优化耗时（并发），而不是改频率
```

---

### 问题 16：只读账号切换后远程备份失败 `mkdir: Permission denied`

**现象**：定时备份报错：
```
RuntimeError: 远程备份执行失败: mkdir: cannot create directory
'/data/backup/mysql/ai_ops/_tmp_20260816_040000': Permission denied
```

**排查过程**：
1. 时间线：8/8 平台 SSH 凭证从 root 切换为只读账号 `aiops_patrol` → 8/16 备份首次触发即失败
2. 读远程备份命令（`ops_database_backup_executor.py`）：`mkdir -p {tmp_dir}` → `mysqldump > {tmp_dir}/file` → `tar -czf {backup_path}` → `rm -rf {tmp_dir}`——**全部需要备份目录写权限**
3. 关键机制：即使 mysqldump 走 sudo（root 执行），**`>` 重定向由 shell（aiops_patrol）打开文件**——目录属主是 root 时依然无写权限。**光加 sudoers 白名单不够，目录属主才是关键**

**根因**：只读账号对备份根目录（BACKUP_ROOT_DIR，默认 `/data/backup/mysql`）无写权限——只读加固与备份功能（目标机落盘）冲突。

**解决**（写权限限定在落盘目录，其余位置仍只读）：
```bash
sudo mkdir -p /data/backup/mysql
sudo chown -R aiops_patrol:aiops_patrol /data/backup/mysql
# 或重跑 create_patrol_account.sh（v2.1+ 内置备份目录授权步骤）
```
脚本 `create_patrol_account.sh` v2.1 新增第 5 步：探测 `BACKUP_ROOT_DIR`（环境变量或默认 /data/backup/mysql）→ 创建 + chown。

**经验**：
- **只读账号 ≠ 全盘只读**：功能需要落盘时（备份/导出），写权限应**精确限定在数据目录**，系统其余位置保持只读——这是"最小写权限"的正确边界
- 排查"切换账号后某功能挂"：逐个检查该功能的**写路径**（文件/目录/进程），不只是命令权限
- 重定向（`>`）由调用方 shell 执行，sudo 只作用于命令本身——**目录属主比 sudo 白名单更关键**

---

### 问题 17：前端日期选择器传参乱值（`yyyy-08-Sa 00:00:00`）且无法选截止时间

**现象**：操作日志页查询 URL 出现乱值参数：
```
/admin/sysOperLog/list/1/10?createTimeBegin=yyyy-08-Sa+00:00:00&createTimeEnd=yyyy-08-Sa+00:00:00
```
且时间选择器选了开始时间后，无法再选择其它日期作为截止时间。

**排查过程**：
1. 看 URL 参数：`yyyy-08-Sa` 是 **value-format 模板字符串被当字面量输出**的产物——日期组件根本没把格式解析生效
2. 看模板：`el-date-picker` 用了 `value-format="yyyy-MM-dd HH:mm:ss"`
3. 确认技术栈：项目已从 Vue2（Element UI + moment）升级到 Vue3（Element Plus + **dayjs**）——**格式令牌大小写体系不同**：
   - Element UI（moment）：小写 `yyyy-MM-dd HH:mm:ss`
   - Element Plus（dayjs）：**大写 `YYYY-MM-DD HH:mm:ss`**
   小写格式在 dayjs 下不被识别 → 返回字面量乱值
4. 交互问题同源：v-model 值非法 → date-picker 组件状态异常 → 第二个 picker 无法正常选择

**根因**：Vue2→Vue3 迁移时日期格式未适配（moment 小写 → dayjs 大写）；两个独立 date-picker 的绑定值非法导致交互异常。

**解决**（3 个页面统一修复）：
- `sysOperLog/list.vue`、`sysLoginLog/list.vue`、`sysUser/list.vue`：两个独立"开始/截止"picker → **一个 `datetimerange` 范围选择器**（开始/截止一体，交互标准无冲突）
- `value-format` 改为 dayjs 大写：`YYYY-MM-DD HH:mm:ss`
- fetchData 从范围数组映射 `createTimeBegin/End`（或 `startTime/endTime`）

**经验**：
- **Element Plus 日期格式令牌必须大写**（YYYY/MM/DD/HH/mm/ss）——迁移 Vue3 后全项目 grep `value-format="yyyy` 排查同类问题（本次一次修复 3 页 6 处）
- 日期范围查询优先用 `datetimerange` 单组件，避免独立 picker 的联动/状态问题
- 排查"URL 参数是格式模板乱值"→ 直接定位 value-format 大小写

### 问题 18：告警自动为已处理，但关联工单仍待处理/超时（系统级命名不一致 + 旧代码未部署）

**现象**：告警 status=1（已处理），但关联工单仍待处理/超时未闭环——**8/18 修复（恢复去抖+工单联动）后仍出现**。数据特征：
- 告警每 30 分钟一条，status 交替 0/1（25 条已处理 + 25 条未处理）
- **handled_after_min=0**：告警创建后几秒内即被置已处理（同一轮巡检内）
- 已处理告警内容**无任何标记**（无"[已恢复]"、无"[待工单处置]"）

**排查过程**：
1. 查已处理告警内容：无恢复标记 → 不是 recover_alarms（恢复会写标记）？——但 500 字符截断可能吞掉标记，需进一步确认
2. 查 handled_after_min=0 → **同一轮巡检内恢复** → 新代码有恢复去抖（第 1 次不恢复），只有**旧代码**才可能同轮恢复 → **8/18 修复未部署到 Docker 容器（/app）**
3. 查 triggered_types 与告警命名：**系统级告警 alarm_type_name 统一存"系统资源"（inspect_server 硬编码），而 triggered_types 存规则细分名**（CPU/内存→"系统资源"，内核→"内核"，网络→"网络"）
4. 推演：内核规则触发时 triggered_types={"内核"} → 恢复判断 `"系统资源" in {"内核"}` = False → **误判"未触发"→ 刚创建的告警被立即恢复**；CPU 规则触发时 triggered_types 含"系统资源" → 保持——**这就是 25/25 交替的原因**（CPU/Swap 去抖周期导致触发类型变化）

**根因**（两个叠加）：
1. **部署的是 8/18 修复前的旧代码**（无恢复去抖/无工单联动）——Docker 未重新构建
2. **系统级告警命名不一致**：告警表存统一名"系统资源"，triggered_types 存规则细分名（"内核"）→ 恢复判断恒误判——**即使部署新代码也会误恢复**

**解决**：
1. `alarm_recovery.py` 新增 `SYSTEM_LEVEL_TYPES = {"系统资源", "内核", "网络"}` + `_is_system_alarm_still_triggered()`：系统资源类告警只要触发类型含任一系统级细分名 → 视为仍触发，保持告警
2. **重新构建部署 Docker**（代码修复必须部署才生效）

**经验**：
- **修复后必须部署/重启验证**——"改了吗？部署了吗？"是最常见的第一层坑
- **跨源命名不一致是隐性地雷**：同一实体的"存储名"与"判断名"（告警表 vs 触发类型）必须同源或显式映射；数据特征（handled_after_min=0、交替 0/1）是定位的关键线索
- 排查"告警状态与预期不符"：先看 update_time（谁在何时改的）→ 内容标记（哪个路径改的）→ 命名映射（判断是否匹配）

### 问题 19：操作日志明文记录了用户密码（库 / binlog / 慢日志 / 备份全部可查）

**现象**：例行安全自查时翻操作日志表，发现「修改密码」这条记录里明文躺着密码：

```json
{
  "title": "用户管理",
  "businessType": "UPDATE_PASSWORD",
  "requestMethod": "PUT",
  "operName": "lmz",
  "operUrl": "/admin/sysUser/updatePassword/114231066/lx@aiops",
  "operParam": "{\"id\": \"114231066\", \"password\": \"lx@aiops\"}",
  "jsonResult": "{\"code\": 200, \"message\": \"成功\"}"
}
```

`operUrl` 和 `operParam` 里各有一份明文密码。

**排查过程**：
1. 先确认数据来源：`operParam` 是 `@Log` 装饰器对路由函数 kwargs 的整体序列化 → 路由签名 `updatePassword(id: str, password: str)` 把密码当**路径参数**，必然进参数快照
2. 再确认 URL：`operUrl` 取的是 `request.url.path` → 密码拼在 URL 里，**同一条明文又存了一份**
3. 扩散面评估（关键）：明文不只在一张表 ——
   - MySQL 表 `sys_oper_log.oper_param/oper_url`
   - MySQL **binlog**（`ROW` 格式原样记录行变更）
   - MySQL **慢查询日志**（超时 SQL 里带参数值）
   - **数据库备份文件**（mysqldump 明文 SQL，还上传到了 OSS/COS）
   - Nginx **access log**（记录完整 request_uri）
4. 因此"只在前端或查询接口打码"的方案直接被否掉 —— DBA、能连库的人、拿到备份的人照样能看到，多数合规审计（等保 2.0 审计项）直接判高危

**根因**（两层叠加）：
1. **接口设计**：密码走 URL 路径参数，从源头上就无法避免落进各种日志
2. **日志实现**：`@Log` 序列化 kwargs 时无任何敏感字段识别，原样落库

**解决**（P0/P1/P2 三段，缺一段都不算修完）：

| 优先级 | 动作 | 效果 |
|---|---|---|
| P0 | `@Log` 赋值前调用 `mask_json_str()` / `mask_url()` 脱敏 | 新日志从写入口就干净（库/日志/备份都不留明文） |
| P0 | `PUT /sysUser/updatePassword` 改请求体 `{id, password}` | 从根源消灭 URL 明文（顺带不再进 Nginx access log、浏览器历史） |
| P0 | `add_sys_oper_log`（唯一入库入口）再兜底脱敏 | 任何调用方都绕不过去，防漏 |
| P1 | `SysOperLogVo` 用 `field_serializer` 输出前二次脱敏 | 兼容改造前的存量脏数据，页面立即看不到明文 |
| P2 | `scripts/mask_oper_log.py` 存量刷库 | 一次性清掉历史明文，幂等可重跑（默认演练；`--host/--database` 指定环境，`--table` 可指向归档表/分表） |

脱敏实现要点：`password/pwd/passwd/token/secret/apiKey/privateKey/credential/signature` + 业务前缀变体（`newPassword`、`oldPassword`、`dbPwd`）统一替换成固定 `***`（不用部分掩码，避免泄露长度）；URL 则把敏感关键字之后的路径段全替换掉 → `/admin/sysUser/updatePassword/***/***`。

**验收**：
```sql
-- 全表扫一遍，命中即为漏网
SELECT id, oper_url, oper_param FROM sys_oper_log
WHERE oper_param LIKE '%"password": "%' AND oper_param NOT LIKE '%"password": "***%"'
   OR oper_url LIKE '%/updatePassword/%/%';
-- 期望：0 行
```

**经验**：
- **"查询时脱敏"是伪安全**：数据本身还是明文，binlog / 慢日志 / 备份 / DBA 视角全部暴露 —— 脱敏必须发生在**写入前**，而且要有唯一写入口兜底
- **密码永远不进 URL**：路径参数、查询串都会进 access log、浏览器历史、Referer、网关日志，排查泄露面时按"一次输入、N 处留存"来算
- 安全整改要按"数据生命周期"过一遍：产生（接口设计）→ 存储（表）→ 复制（binlog/备份）→ 读取（查询接口），每段都要有对策，只堵一段等于没堵
- 存量数据必须单独刷一遍 —— 代码改了不代表历史记录变干净

## 四、面试可讲的问题排查案例（按价值排序）

1. **静默空数据**（问题 10）：方言不兼容 + except 吞异常——最有代表性的排查案例
2. **长事务锁冲突**（问题 4）：事务边界设计 + 行锁 + 重试
3. **SSH 无超时卡死**（问题 2）：外部 IO 超时治理 + 提交粒度
4. **随机 ID 碰撞**（问题 3）：数据量思维 + 唯一性设计
5. **配置热生效名不副实**（问题 1）：验证"运行时路径"而非"文档说法"
6. **驼峰序列化字段坑**（问题 9）：前后端约定以实际返回为准
7. **日志明文密码**（问题 19）：安全整改按数据生命周期（产生→存储→复制→读取）逐段堵，讲清"写时脱敏 vs 查询时脱敏"的本质区别

---

