
# AIops 开发日志规范（Logging Specification）

> 版本：v1.0
> 更新时间：2026-07-19
> 适用项目：AIops Platform

---

# 一、为什么需要日志规范

随着 AIops 项目不断发展，目前已经包含：

- 用户权限管理
- SSH资产管理
- 数据采集
- 服务发现
- 自动巡检
- AI分析
- AI日志分析
- AI告警
- Dashboard
- 数据分析中心
- 定时任务
- 邮件通知
- RAG知识库

项目已经进入平台级开发阶段。

以前：

- 一个功能只有几个文件
- 出现问题 IDE 全局搜索即可

现在：

一个接口可能经过：

```

Controller
↓

Service
↓

SSH
↓

Collector
↓

Analysis
↓

AI
↓

Database
↓

Response

```

一个定时任务可能经过：

```

Scheduler
↓

Collector
↓

Database
↓

Analysis
↓

AI
↓

Email

```

如果没有完善日志：

- 无法定位异常位置
- 无法知道执行到了哪一步
- 无法分析性能瓶颈
- 后续维护成本越来越高

因此：

> **日志已经成为大型项目最重要的调试工具。**

---

# 二、日志设计原则

## 1、所有入口必须打印日志

任何入口都必须打印：

- 开始
- 完成
- 异常
- 耗时

例如：

- Controller
- Service
- Scheduler
- SSH
- Analysis
- AI
- Email

禁止：

```

开始没有日志
结束没有日志
异常没有日志

```

---

## 2、日志必须能定位模块

禁止：

```python
log.info("执行成功")
```

正确：

```python
log.info("[Collector] 服务采集成功")
```

或者：

```python
log.info("[Analysis] 趋势分析完成")
```

日志第一眼必须知道来自哪个模块。

---

## 3、日志内容必须有业务信息

例如：

```

Server=192.168.1.20

Service=mysql

Task=Collect

Status=Success

```

而不是：

```

成功

```

---

# 三、日志级别规范

## DEBUG

用于开发调试。

例如：

- SQL
- 请求参数
- AI Prompt
- Redis缓存

生产环境默认关闭。

---

## INFO

正常业务流程。

例如：

- 开始采集
- 完成采集
- AI分析完成
- 邮件发送成功
- Dashboard刷新完成

这是项目中最多的日志。

---

## WARNING

业务可以继续执行。

例如：

- Redis连接失败
- SSH重试
- AI超时重试
- 默认值生效

---

## ERROR

业务失败。

例如：

- 数据库异常
- SSH登录失败
- AI调用失败
- JSON解析失败

必须打印完整异常：

```python
log.exception(e)
```

禁止：

```python
log.error("失败")
```

---

# 四、统一日志格式

推荐统一格式：

```

[模块]
[功能]
[对象]
[结果]
[耗时]

```

例如：

```

[Collector]
Server=192.168.1.10
Service=mysql
Collect Success
Cost=180ms

```

例如：

```

[Analysis]
Trend Analysis
Completed
Cost=320ms

```

例如：

```

[AI]
Model=DeepSeek
PromptTokens=3200
CompletionTokens=800
Cost=6.3s

```

---

# 五、各模块日志规范

## 1、Controller

开始：

```python
log.info("[API] GET /collector/list Start")
```

结束：

```python
log.info("[API] GET /collector/list Success Cost=32ms")
```

异常：

```python
log.exception("[API] GET /collector/list Failed")
```

---

## 2、Collector

开始：

```python
log.info(
    f"[Collector] Start "
    f"Server={server_ip} "
    f"Record={record_id}"
)
```

完成：

```python
log.info(
    f"[Collector] Success "
    f"Service={service_name} "
    f"Cost={cost}ms"
)
```

失败：

```python
log.exception(
    f"[Collector] Failed "
    f"Server={server_ip}"
)
```

---

## 3、SSH

连接：

```python
log.info(
    f"[SSH] Connect "
    f"Host={host}"
)
```

执行：

```python
log.debug(
    f"[SSH] Execute "
    f"Command={command}"
)
```

关闭：

```python
log.info("[SSH] Disconnect")
```

---

## 4、Analysis

开始：

```python
log.info("[Analysis] Resource Analysis Start")
```

完成：

```python
log.info(
    f"[Analysis] Resource Analysis "
    f"Items={count} "
    f"Cost={cost}ms"
)
```

异常：

```python
log.exception("[Analysis] Resource Analysis Failed")
```

---

## 5、AI

开始：

```python
log.info("[AI] Start")
```

模型：

```python
log.info("[AI] Model=DeepSeek")
```

Prompt：

```python
log.debug(f"[AI] Prompt={prompt}")
```

结束：

```python
log.info(
    f"[AI] Finish "
    f"Cost={cost}s"
)
```

异常：

```python
log.exception("[AI] Failed")
```

---

## 6、Scheduler

开始：

```python
log.info(
    "[Scheduler] Daily Analysis Start"
)
```

结束：

```python
log.info(
    f"[Scheduler] Completed Cost={cost}s"
)
```

异常：

```python
log.exception("[Scheduler] Failed")
```

---

## 7、Email

发送：

```python
log.info(
    f"[Email] Send To={email}"
)
```

成功：

```python
log.info("[Email] Success")
```

失败：

```python
log.exception("[Email] Failed")
```

---

# 六、日志必须包含的信息

建议每条日志尽量包含：

- Server IP
- Server ID
- Record ID
- Service Name
- Service Type
- User ID
- Task ID
- Analysis Type
- Cost（耗时）
- Error（异常原因）

这样可以快速定位问题。

---

# 七、耗时统计规范

所有重要业务建议记录耗时。

示例：

```python
import time

start = time.perf_counter()

# 业务代码

cost = (time.perf_counter() - start) * 1000

log.info(
    f"[Collector] Finish Cost={cost:.2f}ms"
)
```

建议记录：

- SQL
- SSH
- AI
- Dashboard
- Analysis
- API接口

---

# 八、禁止事项

禁止：

```python
print("Hello")
```

统一使用：

```python
log.info()
```

---

禁止：

```python
log.info("成功")
```

必须：

```python
log.info("[Collector] Success")
```

---

禁止：

```python
log.error(e)
```

必须：

```python
log.exception(e)
```

---

# 九、建议增加 Trace ID（后续版本）

随着项目越来越大，建议每次请求生成唯一 Trace ID。

例如：

```

TraceID=20260719-98A2FD

```

整个调用链：

```

API
↓

Collector
↓

Analysis
↓

AI
↓

Email

```

全部打印：

```

TraceID=20260719-98A2FD

```

以后定位问题只需要搜索 TraceID。

---

# 十、日志目录建议

```

logs/

├── info.log
├── api.log
├── collector.log
├── analysis.log
├── ssh.log
├── ai.log
├── scheduler.log
├── email.log
├── dashboard.log
├── error.log
└── access.log

```

说明：

| 文件 | 说明 |
|------|------|
| info.log | 全局日志 |
| api.log | 接口日志 |
| collector.log | 数据采集 |
| analysis.log | 数据分析 |
| ssh.log | SSH执行 |
| ai.log | AI分析 |
| scheduler.log | 定时任务 |
| email.log | 邮件发送 |
| dashboard.log | Dashboard |
| error.log | 所有异常 |
| access.log | HTTP访问日志 |

---

# 十一、最终目标

日志不仅用于排查 Bug，更应该能够完整还原系统运行过程。

未来开发要求：

> **任何一个功能，如果不能通过日志完整还原执行流程，就说明日志设计仍不完善。**

优秀的平台不是没有 Bug，而是在出现 Bug 后能够通过日志快速定位、快速修复。

---

# 十二、模块日志前缀速查表

| 模块 | 日志前缀 | 说明 |
|------|---------|------|
| 服务巡检 | `[服务巡检]` | 服务器 + 服务级巡检引擎 |
| 数据库巡检 | `[数据库巡检]` | 数据库健康检查巡检 |
| 数据采集 | `[Collector]` / `[采集]` | 服务指标数据采集 |
| AI 分析 | `[AI]` / `[AI分析]` | AI 大模型分析 |
| RAG 知识库 | `[RAG]` | 文档检索增强生成 |
| SSH 执行 | `[SSH]` | 远程命令执行 |
| 邮件通知 | `[Email]` | 邮件发送 |
| 定时调度 | `[Scheduler]` | 定时任务调度 |
| 数据库备份 | `[备份]` | 数据库备份/恢复 |
| 云存储 | `[OSS]` / `[COS]` | 阿里云OSS / 腾讯云COS |
| 统计分析 | `[统计]` / `[分析]` | 数据统计与分析 |
| API 路由 | `[API]` | HTTP 接口请求 |
| 认证授权 | `[认证]` | 用户认证与权限 |
