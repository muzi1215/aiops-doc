# AIops 智能运维平台 — API 接口参考文档（企业版）

> **文档版本**：v1.0 | **生成日期**：2026-08-08 | **生成方式**：FastAPI OpenAPI 自动生成
> **接口总数**：238（含登录/后台管理）| 文档与代码一致，接口变更后重新运行 `uv run python scripts/gen_api_docs.py` 同步

---

## 一、通用约定

| 项 | 约定 |
|---|---|
| Base URL | `http://<host>:2029` |
| 接口前缀 | 后台管理 `/admin/**`（需登录），登录 `/login` |
| 认证方式 | `Authorization: Bearer <JWT Token>`（登录接口返回，Cookie 也可） |
| 数据格式 | JSON（UTF-8），字段命名 **camelCase**（驼峰） |
| 时间格式 | `YYYY-MM-DD HH:mm:ss`（ISO8601 兼容） |
| 统一响应 | 见下方响应结构 |
| 权限控制 | 路由级 RBAC：`require_perms("bnt.xxx")`，未授权 403 |

### 1.1 统一响应结构

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": { ... } }
```

| 字段 | 说明 |
|---|---|
| `code` | 业务码：200 成功；非 200 失败（见错误码表） |
| `message` | 提示信息（失败时为具体原因） |
| `totalCount` | 分页接口的总记录数（非分页接口为 0） |
| `data` | 业务数据（分页接口含 `records`/`page`/`limit`） |

### 1.2 通用错误码

| code | 含义 | HTTP |
|---|---|---|
| 200 | 成功 | 200 |
| 401 | 未登录/会话过期（`登录会话已过期`） | 401 |
| 403 | 无权限（未绑定对应角色权限标识） | 403 |
| 404 | 资源不存在 | 404 |
| 422 | 参数校验失败（Validation Error） | 422 |
| 5001 | 业务异常（如大模型限额用尽） | 200 |
| 5000 | 数据异常（通用业务错误） | 200 |

### 1.3 分页约定

```text
路径风格：/list/{page}/{limit}      # 如 /admin/opsServer/list/1/10
返回：{ code, message, totalCount, data: { records: [...], page, limit } }
```

---

## 二、接口总览

| 模块 | 接口数 | 说明 |
|---|---|---|
| 登录 | 2 | 登录/退出 |
| 后台管理 | — | 全部业务接口（需登录） |

---

## 三-1. login（1 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/login` | 后台登录接口 |

### POST /login

**功能**：后台登录接口
**说明**：用户登录接口（JWT + Redis Session + 封禁/锁定检查）
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`LoginParam`

```json
{
  "username": "string",
  "password": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-2. aiAnalysis（3 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/aiAnalysis/generate` | 生成AI智能运维分析报告 |
| `POST` | `/admin/aiAnalysis/sendEmail` | 发送AI分析报告 |
| `POST` | `/admin/aiAnalysis/generate/stream` | 流式生成AI智能运维分析报告 |

### POST /admin/aiAnalysis/generate

**功能**：生成AI智能运维分析报告
**说明**：基于巡检记录和告警记录，调用大模型生成 AI 智能运维分析报告。

报告包含：服务器状态分析、服务巡检分析、告警深度分析、
问题根因诊断、优化建议与解决方案、风险预警、预防预案。
**权限**：`bnt.aiAnalysis.generate`

**请求参数**：

**请求体（application/json）**：`AnalysisReportRequest`

```json
{
  "hours": 24,
  "serverId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aiAnalysis/sendEmail

**功能**：发送AI分析报告
**说明**：发送 AI 分析报告邮件给指定用户
**权限**：`bnt.aiAnalysis.sendEmail`

**请求参数**：

**请求体（application/json）**：`AnalysisEmailParam`

```json
{
  "reportMarkdown": "string",
  "recipientId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aiAnalysis/generate/stream

**功能**：流式生成AI智能运维分析报告
**说明**：流式生成 AI 智能运维分析报告（SSE 格式，data: {content}）
**权限**：`bnt.aiAnalysis.generate`

**请求参数**：

**请求体（application/json）**：`AnalysisReportRequest`

```json
{
  "hours": 24,
  "serverId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-3. aiDataAnalysis（7 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/aiDataAnalysis/generate/stream` | 流式生成AI数据分析报告 |
| `POST` | `/admin/aiDataAnalysis/generate` | 同步生成AI数据分析报告并保存 |
| `GET` | `/admin/aiDataAnalysis/list` | 查询AI数据分析报告历史（分页） |
| `GET` | `/admin/aiDataAnalysis/detail/{report_id}` | 查询AI数据分析报告详情 |
| `DELETE` | `/admin/aiDataAnalysis/delete/{report_id}` | 删除AI数据分析报告 |
| `POST` | `/admin/aiDataAnalysis/exportMd` | 导出AI数据分析报告为Markdown文件 |
| `POST` | `/admin/aiDataAnalysis/exportExcel` | 导出AI数据分析汇总为Excel |

### POST /admin/aiDataAnalysis/generate/stream

**功能**：流式生成AI数据分析报告
**说明**：基于分析记录 + 采集数据，流式生成 AI 数据分析报告（SSE: data: {content} → {meta} → [DONE]）
**权限**：`bnt.aiDataAnalysis.generate`

**请求参数**：

**请求体（application/json）**：`AiDataAnalysisRequest`

```json
{
  "days": 7,
  "serverIp": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aiDataAnalysis/generate

**功能**：同步生成AI数据分析报告并保存
**说明**：同步生成 AI 数据分析报告，报告自动保存到历史列表
**权限**：`bnt.aiDataAnalysis.generate`

**请求参数**：

**请求体（application/json）**：`AiDataAnalysisRequest`

```json
{
  "days": 7,
  "serverIp": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/aiDataAnalysis/list

**功能**：查询AI数据分析报告历史（分页）
**权限**：`bnt.aiDataAnalysis.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Query | `integer` | 否 | 页码 |
| `limit` | Query | `integer` | 否 | 每页条数 |
| `days` | Query | `integer` | 否 | 按分析天数筛选 |
| `keyword` | Query | `string` | 否 | 标题关键字 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/aiDataAnalysis/detail/`{report_id}`

**功能**：查询AI数据分析报告详情
**权限**：`bnt.aiDataAnalysis.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `report_id` | Path | `string` | 是 | 报告ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/aiDataAnalysis/delete/`{report_id}`

**功能**：删除AI数据分析报告
**权限**：`bnt.aiDataAnalysis.delete`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `report_id` | Path | `string` | 是 | 报告ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aiDataAnalysis/exportMd

**功能**：导出AI数据分析报告为Markdown文件
**说明**：导出 Markdown 报告文件（报告内容由前端回传，后端做权限校验后返回文件流）
**权限**：`bnt.aiDataAnalysis.export`

**请求参数**：

**请求体（application/json）**：`AiDataAnalysisExportRequest`

```json
{
  "reportMarkdown": "string",
  "reportId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aiDataAnalysis/exportExcel

**功能**：导出AI数据分析汇总为Excel
**说明**：导出 Excel 汇总（分析记录 + 采集数据两个 sheet），数据取自报告保存的 data_summary 快照
**权限**：`bnt.aiDataAnalysis.export`

**请求参数**：

**请求体（application/json）**：`AiDataAnalysisExportRequest`

```json
{
  "reportMarkdown": "string",
  "reportId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-4. aiDbAssistant（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/aiDbAssistant/chat/{database_id}` | AI数据库助手对话（流式SSE |
| `POST` | `/admin/aiDbAssistant/sendEmail` | 发送AI对话消息推送 |

### GET /admin/aiDbAssistant/chat/`{database_id}`

**功能**：AI数据库助手对话（流式SSE
**说明**：AI 数据库助手流式对话
**权限**：`bnt.aiDbAssistant.generate`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |
| `question` | Query | `string` | 是 | 用户问题 |
| `mode` | Query | `string` | 否 | 对话模式: nl2sql|sql_explain|sql_optimize|ddl_explain|crud_gen|qa |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aiDbAssistant/sendEmail

**功能**：发送AI对话消息推送
**权限**：`bnt.aiDbAssistant.send`

**请求参数**：

**请求体（application/json）**：`EmailParam`

```json
{
  "email": "string",
  "subject": "string",
  "content": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-5. aliyunOss（6 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/aliyunOss/list` | 列举OSS文件 |
| `GET` | `/admin/aliyunOss/head` | 获取OSS对象元信息 |
| `GET` | `/admin/aliyunOss/downloadByKey` | 按Key下载 |
| `GET` | `/admin/aliyunOss/config` | 查看OSS配置 |
| `POST` | `/admin/aliyunOss/upload/{backup_id}` | 手动上传备份 |
| `GET` | `/admin/aliyunOss/download/{backup_id}` | 从OSS下载备份 |

### GET /admin/aliyunOss/list

**功能**：列举OSS文件
**权限**：`bnt.aliyunOss.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `prefix` | Query | `string` | 否 |  |
| `max_keys` | Query | `integer` | 否 |  |
| `marker` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/aliyunOss/head

**功能**：获取OSS对象元信息
**权限**：`bnt.aliyunOss.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `oss_key` | Query | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/aliyunOss/downloadByKey

**功能**：按Key下载
**权限**：`bnt.aliyunOss.download`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `oss_key` | Query | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/aliyunOss/config

**功能**：查看OSS配置
**权限**：`bnt.aliyunOss.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/aliyunOss/upload/`{backup_id}`

**功能**：手动上传备份
**权限**：`bnt.aliyunOss.upload`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `backup_id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/aliyunOss/download/`{backup_id}`

**功能**：从OSS下载备份
**权限**：`bnt.aliyunOss.download`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `backup_id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-6. analysis（10 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/analysis/resource` | 资源分析 — CPU/内存/连接数/QPS/命中率/磁盘统计 |
| `GET` | `/admin/analysis/capacity` | 容量分析 — 容量增长率/剩余天数/预测耗尽时间 |
| `GET` | `/admin/analysis/trend` | 趋势分析 — 7/15/30天多维指标时间序列趋势 |
| `GET` | `/admin/analysis/anomaly` | 异常分析 — Z-score 异常检测 Spike/Drop |
| `GET` | `/admin/analysis/stability` | 稳定性分析 — 采集成功率/服务在线率/失败分布 |
| `GET` | `/admin/analysis/score` | 评分分析 — 健康分计算/等级判定/扣分明细 |
| `GET` | `/admin/analysis/dashboard` | 数据分析综合仪表盘 |
| `POST` | `/admin/analysis/persist` | 执行全量分析并持久化到 ops_analysis_record |
| `GET` | `/admin/analysis/records` | 查询历史分析记录 (从 ops_analysis_record 读取) |
| `GET` | `/admin/analysis/summary` | Dashboard 分析摘要（平均评分/今日异常/成功率） |

### GET /admin/analysis/resource

**功能**：资源分析 — CPU/内存/连接数/QPS/命中率/磁盘统计
**说明**：资源分析：对各服务类型的性能指标统计聚合
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `days` | Query | `integer` | 否 | 统计天数 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/capacity

**功能**：容量分析 — 容量增长率/剩余天数/预测耗尽时间
**说明**：容量分析：每天变化率、增长趋势预测
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `days` | Query | `integer` | 否 | 统计天数 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/trend

**功能**：趋势分析 — 7/15/30天多维指标时间序列趋势
**说明**：趋势分析：多维度指标时间序列趋势
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `service_type` | Query | `string` | 否 | 服务类型 |
| `days` | Query | `integer` | 否 | 统计天数 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/anomaly

**功能**：异常分析 — Z-score 异常检测 Spike/Drop
**说明**：异常分析：基于Z-score检测指标异常值
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `days` | Query | `integer` | 否 | 统计天数 |
| `threshold` | Query | `number` | 否 | Z-score阈值 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/stability

**功能**：稳定性分析 — 采集成功率/服务在线率/失败分布
**说明**：稳定性分析：采集成功率、失败统计、在线率
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `days` | Query | `integer` | 否 | 统计天数 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/score

**功能**：评分分析 — 健康分计算/等级判定/扣分明细
**说明**：评分分析：多维健康分计算
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `days` | Query | `integer` | 否 | 统计天数 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/dashboard

**功能**：数据分析综合仪表盘
**说明**：综合仪表盘：汇总所有分析维度
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/analysis/persist

**功能**：执行全量分析并持久化到 ops_analysis_record
**说明**：执行资源、稳定性、评分、异常分析，将结果写入 ops_analysis_record 表
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/records

**功能**：查询历史分析记录 (从 ops_analysis_record 读取)
**说明**：查询已持久化的历史分析结果
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `analysis_type` | Query | `string` | 否 | 分析类型 resource/stability/score/anomaly |
| `serverIp` | Query | `string` | 否 | 服务器IP |
| `service_type` | Query | `string` | 否 | 服务类型 |
| `days` | Query | `integer` | 否 | 查询天数 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/analysis/summary

**功能**：Dashboard 分析摘要（平均评分/今日异常/成功率）
**说明**：从 ops_analysis_record 读取最新分析快照，供 Dashboard 卡片展示
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-7. codegen（3 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/codegen/tables` | 获取所有数据库表 |
| `POST` | `/admin/codegen/preview` | 预览生成代码 |
| `POST` | `/admin/codegen/download` | 下载生成代码 zip |

### GET /admin/codegen/tables

**功能**：获取所有数据库表
**说明**：获取数据库中所有表和列信息
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/codegen/preview

**功能**：预览生成代码
**说明**：预览指定表生成的代码
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`GenerateRequest`

```json
{
  "table_name": "string",
  "module_name": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/codegen/download

**功能**：下载生成代码 zip
**说明**：下载生成的代码 zip 包
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`DownloadRequest`

```json
{
  "tables": [
    {
      "table_name": null,
      "module_name": null
    }
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-8. dashboard（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/dashboard/summary` | 获取首页汇总数据 |
| `GET` | `/admin/dashboard/backupStats` | 获取备份统计数据 |

### GET /admin/dashboard/summary

**功能**：获取首页汇总数据
**说明**：获取首页大盘汇总数据（告警/巡检/服务器/同步/日志/RAG/AI分析）
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/dashboard/backupStats

**功能**：获取备份统计数据
**说明**：获取备份统计（卡片数据 + 30天趋势）
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-9. info（1 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/info` | 获取当前登录用户信息 |

### GET /info

**功能**：获取当前登录用户信息
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-10. llmInvokeLog（1 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/llmInvokeLog/list/{page}/{limit}` | 大模型调用记录分页查询 |

### POST /admin/llmInvokeLog/list/`{page}`/`{limit}`

**功能**：大模型调用记录分页查询
**说明**：大模型调用记录分页查询（支持模型/场景/用户/成功状态/时间范围筛选）
**权限**：`bnt.llmInvokeLog.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |

**请求体（application/json）**：object

```json
"string"
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-11. llmModel（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/llmModel/sync` | 手动同步大模型列表（厂商接口 → 模型表） |
| `GET` | `/admin/llmModel/list` | 查询模型列表（配置中心下拉数据源） |

### POST /admin/llmModel/sync

**功能**：手动同步大模型列表（厂商接口 → 模型表）
**说明**：手动同步模型：调厂商接口（Ollama /api/tags、云厂商 /v1/models）解析 model + owned_by 写入模型表
**权限**：`bnt.llmModel.sync`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `provider` | Query | `string` | 否 | 指定服务商（ollama/deepseek/openai），不传则同步全部 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/llmModel/list

**功能**：查询模型列表（配置中心下拉数据源）
**说明**：按服务商查询模型列表（数据来自模型表，由手动/定时同步维护）
**权限**：`bnt.llmModel.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `provider` | Query | `string` | 否 | 服务商过滤 |
| `modelName` | Query | `string` | 否 | 模型名模糊过滤 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-12. logAnalysis（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/logAnalysis/analyze` | 上传日志文件并智能分析 |
| `POST` | `/admin/logAnalysis/analyze/stream` | 上传日志文件并流式智能分析 |

### POST /admin/logAnalysis/analyze

**功能**：上传日志文件并智能分析
**说明**：上传日志文件，调用大模型进行智能分析。

- file: 日志文件（.log/.txt/.out 等文本格式）
- prompt: 自然语言分析要求（可选，不填则自动全面分析）
**权限**：`bnt.aiLogAnalysis.generate`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/logAnalysis/analyze/stream

**功能**：上传日志文件并流式智能分析
**说明**：流式分析日志文件（SSE 格式）
**权限**：`bnt.aiLogAnalysis.generate`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-13. logout（1 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/logout` | 退出登录 |

### GET /logout

**功能**：退出登录
**说明**：退出登录：解析 JWT → 删除 Redis Session → 返回成功
下次请求时 auth_deps 检查 Redis Session 不存在 → 401
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `Authorization` | Header | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-14. modelQuota（5 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/modelQuota/list/{page}/{limit}` | 模型限额分页查询 |
| `GET` | `/admin/modelQuota/allRoles` | 获取全部角色（限额配置下拉用） |
| `POST` | `/admin/modelQuota/save` | 新增模型限额 |
| `PUT` | `/admin/modelQuota/update` | 修改模型限额 |
| `DELETE` | `/admin/modelQuota/remove/{quota_id}` | 删除模型限额 |

### POST /admin/modelQuota/list/`{page}`/`{limit}`

**功能**：模型限额分页查询
**说明**：模型限额分页查询（附带已用/剩余次数）
**权限**：`bnt.modelQuota.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |

**请求体（application/json）**：object

```json
"string"
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/modelQuota/allRoles

**功能**：获取全部角色（限额配置下拉用）
**说明**：获取全部未删除角色列表
**权限**：`bnt.modelQuota.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/modelQuota/save

**功能**：新增模型限额
**说明**：为角色分配大模型调用次数
**权限**：`bnt.modelQuota.add`

**请求参数**：

**请求体（application/json）**：`ModelQuotaAddParam`

```json
{
  "roleId": "string",
  "quotaCount": 0,
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/modelQuota/update

**功能**：修改模型限额
**说明**：修改角色的大模型调用次数（可调整额度或清零）
**权限**：`bnt.modelQuota.update`

**请求参数**：

**请求体（application/json）**：`ModelQuotaUpdateParam`

```json
{
  "id": "string",
  "quotaCount": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/modelQuota/remove/`{quota_id}`

**功能**：删除模型限额
**说明**：删除模型限额（软删除，删除后该角色不再受限）
**权限**：`bnt.modelQuota.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `quota_id` | Path | `string` | 是 | 限额ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-15. onlineUser（3 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/onlineUser/list` | 获取在线用户列表 |
| `DELETE` | `/admin/onlineUser/kick/{userId}` | 强制踢下线 |
| `DELETE` | `/admin/onlineUser/kickBatch` | 批量强制踢下线 |

### GET /admin/onlineUser/list

**功能**：获取在线用户列表
**说明**：在线用户列表：Redis 扫描 → 关键字过滤（账号/昵称/IP）→ 分页
**权限**：`bnt.onlineUser.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Query | `integer` | 否 | 页码 |
| `limit` | Query | `integer` | 否 | 每页条数 |
| `keyword` | Query | `string` | 否 | 搜索关键字（账号/昵称/IP） |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/onlineUser/kick/`{userId}`

**功能**：强制踢下线
**说明**：强制踢下线：删除指定用户的 Redis Session
**权限**：`bnt.onlineUser.kick`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `userId` | Path | `string` | 是 | 用户ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/onlineUser/kickBatch

**功能**：批量强制踢下线
**说明**：批量强制踢下线
**权限**：`bnt.onlineUser.kick`

**请求参数**：

**请求体（application/json）**：`KickUserBatchParam`

```json
{
  "userIds": [
    "string"
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-16. opsAlarm（6 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsAlarm/list/{page}/{limit}` | 查询告警记录分页信息 |
| `GET` | `/admin/opsAlarm/get/{id}` | 根据ID查询告警记录 |
| `GET` | `/admin/opsAlarm/relatedWorkOrder/{alarm_id}` | 查询告警关联的工单 |
| `DELETE` | `/admin/opsAlarm/remove/{id}` | 删除告警记录 |
| `DELETE` | `/admin/opsAlarm/batchRemove` | 批量删除告警记录 |
| `GET` | `/admin/opsAlarm/stats` | 查询告警统计数据 |

### GET /admin/opsAlarm/list/`{page}`/`{limit}`

**功能**：查询告警记录分页信息
**说明**：告警记录分页条件查询
**权限**：`bnt.opsAlarm.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `serverId` | Query | `string` | 否 |  |
| `alarmTypeName` | Query | `string` | 否 |  |
| `alarmLevel` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `sendStatus` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsAlarm/get/`{id}`

**功能**：根据ID查询告警记录
**说明**：根据ID查询单个告警记录
**权限**：`bnt.opsAlarm.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 告警记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsAlarm/relatedWorkOrder/`{alarm_id}`

**功能**：查询告警关联的工单
**说明**：查询该告警关联的工单（source_id=告警ID, source_type=alarm），无关联返回 data=null
**权限**：`bnt.opsAlarm.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `alarm_id` | Path | `string` | 是 | 告警记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsAlarm/remove/`{id}`

**功能**：删除告警记录
**说明**：软删除单个告警记录
**权限**：`bnt.opsAlarm.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 告警记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsAlarm/batchRemove

**功能**：批量删除告警记录
**说明**：批量软删除告警记录
**权限**：`bnt.opsAlarm.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsAlarm/stats

**功能**：查询告警统计数据
**说明**：查询告警全表统计数据（总数、按级别、按状态、聚合数）
**权限**：`bnt.opsAlarm.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-17. opsBackupReplication（4 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsBackupReplication/list/{policy_id}` | 查询策略的云端副本列表 |
| `POST` | `/admin/opsBackupReplication/save` | 新增或更新云端副本配置 |
| `DELETE` | `/admin/opsBackupReplication/remove/{id}` | 删除云端副本配置 |
| `GET` | `/admin/opsBackupReplication/logs/{backup_id}` | 查询备份的云端同步日志 |

### GET /admin/opsBackupReplication/list/`{policy_id}`

**功能**：查询策略的云端副本列表
**说明**：查询指定策略的所有副本配置
**权限**：`bnt.opsBackupReplication.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `policy_id` | Path | `string` | 是 | 备份策略ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsBackupReplication/save

**功能**：新增或更新云端副本配置
**说明**：新增或更新云端副本配置
**权限**：`bnt.opsBackupReplication.addOrupdate`

**请求参数**：

**请求体（application/json）**：`OpsBackupReplicationSaveParam`

```json
{
  "id": "string",
  "policyId": "string",
  "targetType": "string",
  "endpoint": "string",
  "bucket": "string",
  "region": "string",
  "accessKeyId": "string",
  "accessKeySecret": "string",
  "baseDirectory": "string",
  "enabled": "string",
  "syncOrder": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsBackupReplication/remove/`{id}`

**功能**：删除云端副本配置
**说明**：软删除云端副本配置
**权限**：`bnt.opsBackupReplication.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 副本配置ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsBackupReplication/logs/`{backup_id}`

**功能**：查询备份的云端同步日志
**说明**：查询指定备份的所有云端同步日志
**权限**：`bnt.opsBackupReplication.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `backup_id` | Path | `string` | 是 | 备份记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-18. opsCollector（8 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsCollector/record/list/{page}/{limit}` | 采集记录分页 |
| `GET` | `/admin/opsCollector/record/get/{id}` | 采集记录详情 |
| `DELETE` | `/admin/opsCollector/record/remove/{id}` | 删除采集记录 |
| `POST` | `/admin/opsCollector/trigger` | 触发采集 |
| `POST` | `/admin/opsCollector/triggerAll` | 全量采集 |
| `GET` | `/admin/opsCollector/config/get` | 获取定时采集配置 |
| `GET` | `/admin/opsCollector/systemConfig/list` | 查询系统配置（按组件标签） |
| `POST` | `/admin/opsCollector/config/save` | 保存定时采集配置 |

### GET /admin/opsCollector/record/list/`{page}`/`{limit}`

**功能**：采集记录分页
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 |  |
| `limit` | Path | `integer` | 是 |  |
| `serverId` | Query | `string` | 否 |  |
| `taskType` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsCollector/record/get/`{id}`

**功能**：采集记录详情
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsCollector/record/remove/`{id}`

**功能**：删除采集记录
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsCollector/trigger

**功能**：触发采集
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`TriggerCollectParam`

```json
{
  "serverId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsCollector/triggerAll

**功能**：全量采集
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsCollector/config/get

**功能**：获取定时采集配置
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsCollector/systemConfig/list

**功能**：查询系统配置（按组件标签）
**说明**：通用系统配置查询：componentTag=数据采集|数据库备份|数据库巡检|服务巡检
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `componentTag` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsCollector/config/save

**功能**：保存定时采集配置
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`CollectorConfigSaveParam`

```json
{
  "enabled": 0,
  "cronExpression": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-19. opsCredential（6 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsCredential/list/{page}/{limit}` | 查询凭据分页信息 |
| `GET` | `/admin/opsCredential/get/{id}` | 根据ID查询凭据 |
| `POST` | `/admin/opsCredential/save` | 添加凭据 |
| `PUT` | `/admin/opsCredential/update` | 修改凭据信息 |
| `DELETE` | `/admin/opsCredential/remove/{id}` | 删除凭据 |
| `DELETE` | `/admin/opsCredential/batchRemove` | 批量删除凭据 |

### GET /admin/opsCredential/list/`{page}`/`{limit}`

**功能**：查询凭据分页信息
**说明**：凭据分页条件查询（关联展示服务器主机名和IP）
**权限**：`bnt.opsCredential.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `credentialName` | Query | `string` | 否 |  |
| `authType` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `serverId` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsCredential/get/`{id}`

**功能**：根据ID查询凭据
**说明**：根据凭据ID查询单个凭据详情
**权限**：`bnt.opsCredential.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 凭据ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsCredential/save

**功能**：添加凭据
**说明**：添加新凭据
**权限**：`bnt.opsCredential.add`

**请求参数**：

**请求体（application/json）**：`OpsCredentialAddParam`

```json
{
  "credentialName": "string",
  "authType": 1,
  "username": "string",
  "port": 22,
  "status": "string",
  "serverId": "string",
  "password": "string",
  "privateKey": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/opsCredential/update

**功能**：修改凭据信息
**说明**：修改凭据信息
**权限**：`bnt.opsCredential.update`

**请求参数**：

**请求体（application/json）**：`OpsCredentialUpdateParam`

```json
{
  "id": "string",
  "credentialName": "string",
  "authType": "string",
  "username": "string",
  "port": "string",
  "status": "string",
  "serverId": "string",
  "password": "string",
  "privateKey": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsCredential/remove/`{id}`

**功能**：删除凭据
**说明**：软删除单个凭据
**权限**：`bnt.opsCredential.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 凭据ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsCredential/batchRemove

**功能**：批量删除凭据
**说明**：批量软删除凭据
**权限**：`bnt.opsCredential.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-20. opsDatabase（7 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabase/list/{page}/{limit}` | 查询数据库资产分页信息 |
| `GET` | `/admin/opsDatabase/get/{id}` | 根据ID查询数据库资产 |
| `POST` | `/admin/opsDatabase/save` | 添加数据库资产 |
| `PUT` | `/admin/opsDatabase/update` | 修改数据库资产信息 |
| `DELETE` | `/admin/opsDatabase/remove/{id}` | 删除数据库资产 |
| `DELETE` | `/admin/opsDatabase/batchRemove` | 批量删除数据库资产 |
| `POST` | `/admin/opsDatabase/sync/{id}` | 同步数据库信息 |

### GET /admin/opsDatabase/list/`{page}`/`{limit}`

**功能**：查询数据库资产分页信息
**说明**：数据库资产分页条件查询（关联展示服务器主机名和IP）
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-200之间 |
| `name` | Query | `string` | 否 |  |
| `dbType` | Query | `string` | 否 |  |
| `tag` | Query | `string` | 否 |  |
| `host` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `syncStatus` | Query | `string` | 否 |  |
| `lastCheckStatus` | Query | `string` | 否 |  |
| `serverId` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabase/get/`{id}`

**功能**：根据ID查询数据库资产
**说明**：根据ID查询单个数据库资产详情
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabase/save

**功能**：添加数据库资产
**说明**：添加新数据库资产
**权限**：`bnt.opsDatabase.add`

**请求参数**：

**请求体（application/json）**：`OpsDatabaseAddParam`

```json
{
  "serverId": "string",
  "name": "string",
  "dbType": "string",
  "tag": "string",
  "host": "string",
  "port": 0,
  "status": "string",
  "syncStatus": "string",
  "lastCheckStatus": "string",
  "version": "string",
  "tableCount": "string",
  "instanceName": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/opsDatabase/update

**功能**：修改数据库资产信息
**说明**：修改数据库资产信息
**权限**：`bnt.opsDatabase.update`

**请求参数**：

**请求体（application/json）**：`OpsDatabaseUpdateParam`

```json
{
  "id": "string",
  "serverId": "string",
  "name": "string",
  "dbType": "string",
  "tag": "string",
  "host": "string",
  "port": "string",
  "status": "string",
  "syncStatus": "string",
  "lastCheckStatus": "string",
  "version": "string",
  "tableCount": "string",
  "instanceName": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabase/remove/`{id}`

**功能**：删除数据库资产
**说明**：软删除单个数据库资产
**权限**：`bnt.opsDatabase.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabase/batchRemove

**功能**：批量删除数据库资产
**说明**：批量软删除数据库资产
**权限**：`bnt.opsDatabase.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabase/sync/`{id}`

**功能**：同步数据库信息
**说明**：同步数据库真实信息（版本、表总数等）
**权限**：`bnt.opsDatabase.sync`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-21. opsDatabaseAuth（10 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabaseAuth/list/{page}/{limit}` | 查询数据库连接账号分页信息 |
| `GET` | `/admin/opsDatabaseAuth/get/{id}` | 根据ID查询数据库连接账号 |
| `POST` | `/admin/opsDatabaseAuth/save` | 添加数据库连接账号 |
| `PUT` | `/admin/opsDatabaseAuth/update` | 修改数据库连接账号信息 |
| `DELETE` | `/admin/opsDatabaseAuth/remove/{id}` | 删除数据库连接账号 |
| `DELETE` | `/admin/opsDatabaseAuth/batchRemove` | 批量删除数据库连接账号 |
| `POST` | `/admin/opsDatabaseAuth/sendCode/{id}` | 发送密码修改验证码 |
| `PUT` | `/admin/opsDatabaseAuth/updatePassword` | 验证码修改密码 |
| `GET` | `/admin/opsDatabaseAuth/usernames` | 获取已有账号列表 |
| `GET` | `/admin/opsDatabaseAuth/decryptPassword/{id}` | 获取账号解密密码 |

### GET /admin/opsDatabaseAuth/list/`{page}`/`{limit}`

**功能**：查询数据库连接账号分页信息
**说明**：数据库连接账号分页条件查询（关联展示数据库名称和类型）
**权限**：`bnt.opsDatabaseAuth.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `databaseId` | Query | `string` | 否 |  |
| `username` | Query | `string` | 否 |  |
| `authType` | Query | `string` | 否 |  |
| `readonly` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseAuth/get/`{id}`

**功能**：根据ID查询数据库连接账号
**说明**：根据ID查询单个数据库连接账号详情
**权限**：`bnt.opsDatabaseAuth.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 数据库连接账号ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseAuth/save

**功能**：添加数据库连接账号
**说明**：添加新数据库连接账号
**权限**：`bnt.opsDatabaseAuth.add`

**请求参数**：

**请求体（application/json）**：`OpsDatabaseAuthAddParam`

```json
{
  "databaseId": "string",
  "username": "string",
  "authType": "string",
  "sslEnable": "string",
  "readonly": "string",
  "isSync": "string",
  "status": "string",
  "password": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/opsDatabaseAuth/update

**功能**：修改数据库连接账号信息
**说明**：修改数据库连接账号信息
**权限**：`bnt.opsDatabaseAuth.update`

**请求参数**：

**请求体（application/json）**：`OpsDatabaseAuthUpdateParam`

```json
{
  "id": "string",
  "databaseId": "string",
  "username": "string",
  "authType": "string",
  "sslEnable": "string",
  "readonly": "string",
  "isSync": "string",
  "status": "string",
  "password": "string",
  "remark": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabaseAuth/remove/`{id}`

**功能**：删除数据库连接账号
**说明**：软删除单个数据库连接账号
**权限**：`bnt.opsDatabaseAuth.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 数据库连接账号ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabaseAuth/batchRemove

**功能**：批量删除数据库连接账号
**说明**：批量软删除数据库连接账号
**权限**：`bnt.opsDatabaseAuth.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseAuth/sendCode/`{id}`

**功能**：发送密码修改验证码
**说明**：发送邮箱验证码用于修改密码
**权限**：`bnt.opsDatabaseAuth.updatePassword`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 数据库连接账号ID |

**请求体（application/json）**：`AuthSendCodeParam`

```json
{
  "email": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/opsDatabaseAuth/updatePassword

**功能**：验证码修改密码
**说明**：通过邮箱验证码修改数据库连接账号密码
**权限**：`bnt.opsDatabaseAuth.updatePassword`

**请求参数**：

**请求体（application/json）**：`AuthUpdatePasswordParam`

```json
{
  "id": "string",
  "code": "string",
  "newPassword": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseAuth/usernames

**功能**：获取已有账号列表
**说明**：获取所有已保存的账号名，供新增时下拉选择
**权限**：`bnt.opsDatabaseAuth.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseAuth/decryptPassword/`{id}`

**功能**：获取账号解密密码
**说明**：获取指定账号的解密密码
**权限**：`bnt.opsDatabaseAuth.add`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 账号ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-22. opsDatabaseBackup（9 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabaseBackup/list/{database_id}/{page}/{limit}` | 分页查询备份记录 |
| `GET` | `/admin/opsDatabaseBackup/get/{id}` | 根据ID查询备份记录 |
| `GET` | `/admin/opsDatabaseBackup/stats/{database_id}` | 获取备份统计数据 |
| `POST` | `/admin/opsDatabaseBackup/backupNow` | 立即执行备份 |
| `GET` | `/admin/opsDatabaseBackup/download/{id}` | 下载备份文件 |
| `GET` | `/admin/opsDatabaseBackup/log/{id}` | 查看备份执行日志 |
| `POST` | `/admin/opsDatabaseBackup/verify/{id}` | 校验备份文件完整性 |
| `DELETE` | `/admin/opsDatabaseBackup/remove/{id}` | 删除备份记录 |
| `DELETE` | `/admin/opsDatabaseBackup/batchRemove` | 批量删除备份记录 |

### GET /admin/opsDatabaseBackup/list/`{database_id}`/`{page}`/`{limit}`

**功能**：分页查询备份记录
**说明**：按数据库ID分页查询备份记录
**权限**：`bnt.opsDatabaseBackup.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库ID |
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |
| `databaseId` | Query | `string` | 否 |  |
| `backupType` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `verifyStatus` | Query | `string` | 否 |  |
| `backupName` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseBackup/get/`{id}`

**功能**：根据ID查询备份记录
**说明**：查询单条备份记录详情
**权限**：`bnt.opsDatabaseBackup.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 备份记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseBackup/stats/`{database_id}`

**功能**：获取备份统计数据
**说明**：获取备份统计卡片数据
**权限**：`bnt.opsDatabaseBackup.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseBackup/backupNow

**功能**：立即执行备份
**说明**：立即执行数据库备份（SSH → mysqldump → gzip）
**权限**：`bnt.opsDatabaseBackup.backup`

**请求参数**：

**请求体（application/json）**：`BackupNowParam`

```json
{
  "databaseId": "string",
  "tableNames": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseBackup/download/`{id}`

**功能**：下载备份文件
**说明**：下载备份文件（本地直接返回，远程通过 SSH SFTP 拉取）
**权限**：`bnt.opsDatabaseBackup.download`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 备份记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseBackup/log/`{id}`

**功能**：查看备份执行日志
**说明**：查看备份执行日志
**权限**：`bnt.opsDatabaseBackup.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 备份记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseBackup/verify/`{id}`

**功能**：校验备份文件完整性
**说明**：校验备份 tar.gz 归档完整性及 SQL 文件结构
**权限**：`bnt.opsDatabaseBackup.verify`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 备份记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabaseBackup/remove/`{id}`

**功能**：删除备份记录
**说明**：软删除备份记录
**权限**：`bnt.opsDatabaseBackup.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 备份记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabaseBackup/batchRemove

**功能**：批量删除备份记录
**说明**：批量软删除备份记录
**权限**：`bnt.opsDatabaseBackup.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-23. opsDatabaseBackupPolicy（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabaseBackupPolicy/get/{database_id}` | 查询备份策略 |
| `POST` | `/admin/opsDatabaseBackupPolicy/save` | 保存备份策略 |

### GET /admin/opsDatabaseBackupPolicy/get/`{database_id}`

**功能**：查询备份策略
**说明**：根据数据库ID查询备份策略
**权限**：`bnt.opsDatabaseBackupPolicy.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseBackupPolicy/save

**功能**：保存备份策略
**说明**：创建或更新备份策略（按 database_id upsert）
**权限**：`bnt.opsDatabaseBackupPolicy.add`

**请求参数**：

**请求体（application/json）**：`OpsDatabaseBackupPolicySaveParam`

```json
{
  "databaseId": "string",
  "cronExpression": "string",
  "retentionDays": "string",
  "enableCompression": "string",
  "enableVerify": "string",
  "verifyCron": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-24. opsDatabaseCheckConfig（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabaseCheckConfig/get/{database_id}` | 根据数据库ID获取巡检配置 |
| `POST` | `/admin/opsDatabaseCheckConfig/save` | 保存/更新巡检配置 |

### GET /admin/opsDatabaseCheckConfig/get/`{database_id}`

**功能**：根据数据库ID获取巡检配置
**权限**：`bnt.opsDatabaseInspection.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseCheckConfig/save

**功能**：保存/更新巡检配置
**权限**：`bnt.opsDatabaseCheckConfig.saveOrupdate`

**请求参数**：

**请求体（application/json）**：`OpsDatabaseCheckConfigSaveParam`

```json
{
  "databaseId": "string",
  "enabled": "string",
  "cronExpression": "string",
  "checkItems": "string",
  "alarmThresholds": "string",
  "enableAiAnalysis": "string",
  "enableEmailNotify": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-25. opsDatabaseCheckRecord（5 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabaseCheckRecord/list/{page}/{limit}` | 分页查询巡检记录 |
| `GET` | `/admin/opsDatabaseCheckRecord/get/{id}` | 查询巡检记录详情（含采集数据） |
| `GET` | `/admin/opsDatabaseCheckRecord/overallStats` | 获取全部数据库巡检的聚合统计 |
| `GET` | `/admin/opsDatabaseCheckRecord/stats/{database_id}` | 获取单库巡检统计卡片 |
| `DELETE` | `/admin/opsDatabaseCheckRecord/remove/{id}` | 删除巡检记录 |

### GET /admin/opsDatabaseCheckRecord/list/`{page}`/`{limit}`

**功能**：分页查询巡检记录
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |
| `databaseId` | Query | `string` | 否 |  |
| `name` | Query | `string` | 否 |  |
| `dbType` | Query | `string` | 否 |  |
| `checkStatus` | Query | `string` | 否 |  |
| `checkTimeStart` | Query | `string` | 否 |  |
| `checkTimeEnd` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseCheckRecord/get/`{id}`

**功能**：查询巡检记录详情（含采集数据）
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseCheckRecord/overallStats

**功能**：获取全部数据库巡检的聚合统计
**权限**：`bnt.opsDatabaseCheckRecord.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseCheckRecord/stats/`{database_id}`

**功能**：获取单库巡检统计卡片
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsDatabaseCheckRecord/remove/`{id}`

**功能**：删除巡检记录
**权限**：`bnt.opsDatabase.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-26. opsDatabaseInspection（5 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/opsDatabaseInspection/run/{database_id}` | 手动触发单个数据库巡检 |
| `POST` | `/admin/opsDatabaseInspection/runBatch` | 批量触发数据库巡检 |
| `POST` | `/admin/opsDatabaseInspection/aiAnalysis/{record_id}` | 对已有巡检记录执行 AI 分析（非流式） |
| `POST` | `/admin/opsDatabaseInspection/aiAnalysisStream/{record_id}` | 对已有巡检记录执行 AI 分析（SSE 流式） |
| `GET` | `/admin/opsDatabaseInspection/report/{record_id}` | 获取巡检报告（用于展示/下载） |

### POST /admin/opsDatabaseInspection/run/`{database_id}`

**功能**：手动触发单个数据库巡检
**权限**：`bnt.opsDatabaseInspection.run`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseInspection/runBatch

**功能**：批量触发数据库巡检
**权限**：`bnt.opsDatabaseInspection.runBatch`

**请求参数**：

**请求体（application/json）**：`RunBatchParam`

```json
{
  "databaseIds": [
    "string"
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseInspection/aiAnalysis/`{record_id}`

**功能**：对已有巡检记录执行 AI 分析（非流式）
**权限**：`bnt.opsDatabaseInspection.aiAnalysis`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `record_id` | Path | `string` | 是 | 巡检记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseInspection/aiAnalysisStream/`{record_id}`

**功能**：对已有巡检记录执行 AI 分析（SSE 流式）
**权限**：`bnt.opsDatabaseInspection.aiAnalysis`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `record_id` | Path | `string` | 是 | 巡检记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseInspection/report/`{record_id}`

**功能**：获取巡检报告（用于展示/下载）
**权限**：`bnt.opsDatabaseInspection.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `record_id` | Path | `string` | 是 | 巡检记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-27. opsDatabaseTable（6 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsDatabaseTable/list/{database_id}/{page}/{limit}` | 查询数据库表元数据分页信息 |
| `GET` | `/admin/opsDatabaseTable/structure/{database_id}` | 查询表结构 |
| `GET` | `/admin/opsDatabaseTable/ddl/{database_id}` | 查询表DDL语句 |
| `POST` | `/admin/opsDatabaseTable/sync/{database_id}` | 同步数据库表元数据 |
| `GET` | `/admin/opsDatabaseTable/export/{database_id}` | 导出表结构为CSV |
| `GET` | `/admin/opsDatabaseTable/exportList/{database_id}` | 导出表列表为Excel |

### GET /admin/opsDatabaseTable/list/`{database_id}`/`{page}`/`{limit}`

**功能**：查询数据库表元数据分页信息
**说明**：数据库表元数据分页查询（支持表名搜索）
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-500之间 |
| `table_name` | Query | `string` | 否 | 表名模糊搜索 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseTable/structure/`{database_id}`

**功能**：查询表结构
**说明**：实时查询目标数据库的表结构
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |
| `table_name` | Query | `string` | 是 | 表名称 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseTable/ddl/`{database_id}`

**功能**：查询表DDL语句
**说明**：实时查询目标数据库的DDL语句
**权限**：`bnt.opsDatabase.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |
| `table_name` | Query | `string` | 是 | 表名称 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsDatabaseTable/sync/`{database_id}`

**功能**：同步数据库表元数据
**说明**：从目标数据库同步表元数据到本地
**权限**：`bnt.opsDatabase.sync`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseTable/export/`{database_id}`

**功能**：导出表结构为CSV
**说明**：导出表结构为 CSV 文件
**权限**：`bnt.opsDatabase.export`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |
| `table_name` | Query | `string` | 是 | 表名称 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsDatabaseTable/exportList/`{database_id}`

**功能**：导出表列表为Excel
**说明**：导出表元数据列表为 Excel 文件
**权限**：`bnt.opsDatabase.export`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `database_id` | Path | `string` | 是 | 数据库资产ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-28. opsPatrolServiceConfig（9 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsPatrolServiceConfig/list/{page}/{limit}` | 查询巡检服务配置分页 |
| `GET` | `/admin/opsPatrolServiceConfig/get/{id}` | 根据ID查询配置 |
| `POST` | `/admin/opsPatrolServiceConfig/save` | 添加巡检服务配置 |
| `PUT` | `/admin/opsPatrolServiceConfig/update` | 修改巡检服务配置 |
| `DELETE` | `/admin/opsPatrolServiceConfig/remove/{id}` | 删除巡检服务配置 |
| `DELETE` | `/admin/opsPatrolServiceConfig/batchRemove` | 批量删除 |
| `POST` | `/admin/opsPatrolServiceConfig/sshDetect` | SSH 远程检测服务是否存在 |
| `POST` | `/admin/opsPatrolServiceConfig/scanServer` | 全量扫描服务器运行/安装的服务 |
| `POST` | `/admin/opsPatrolServiceConfig/saveScanResult` | 保存全量扫描勾选的服务到巡检配置 |

### GET /admin/opsPatrolServiceConfig/list/`{page}`/`{limit}`

**功能**：查询巡检服务配置分页
**权限**：`bnt.opsPatrolServiceConfig.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |
| `serverId` | Query | `string` | 否 |  |
| `serviceName` | Query | `string` | 否 |  |
| `serviceTypeName` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsPatrolServiceConfig/get/`{id}`

**功能**：根据ID查询配置
**权限**：`bnt.opsPatrolServiceConfig.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 配置ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsPatrolServiceConfig/save

**功能**：添加巡检服务配置
**权限**：`bnt.opsPatrolServiceConfig.add`

**请求参数**：

**请求体（application/json）**：`OpsPatrolServiceConfigAddParam`

```json
{
  "serverId": "string",
  "serviceName": "string",
  "serviceTypeName": "string",
  "port": "string",
  "installPath": "string",
  "configPath": "string",
  "logPath": "string",
  "dataPath": "string",
  "servicePath": "string",
  "runningPath": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/opsPatrolServiceConfig/update

**功能**：修改巡检服务配置
**权限**：`bnt.opsPatrolServiceConfig.update`

**请求参数**：

**请求体（application/json）**：`OpsPatrolServiceConfigUpdateParam`

```json
{
  "id": "string",
  "serviceName": "string",
  "serviceTypeName": "string",
  "port": "string",
  "installPath": "string",
  "configPath": "string",
  "logPath": "string",
  "dataPath": "string",
  "servicePath": "string",
  "runningPath": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsPatrolServiceConfig/remove/`{id}`

**功能**：删除巡检服务配置
**权限**：`bnt.opsPatrolServiceConfig.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 配置ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsPatrolServiceConfig/batchRemove

**功能**：批量删除
**权限**：`bnt.opsPatrolServiceConfig.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsPatrolServiceConfig/sshDetect

**功能**：SSH 远程检测服务是否存在
**说明**：通过 SSH 连接服务器，模糊搜索指定服务
返回服务的类型、路径、端口等详细信息
**权限**：`bnt.opsPatrolServiceConfig.add`

**请求参数**：

**请求体（application/json）**：`SshDetectParam`

```json
{
  "serverId": "string",
  "serviceName": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsPatrolServiceConfig/scanServer

**功能**：全量扫描服务器运行/安装的服务
**说明**：通过 SSH 三路探测（systemd 单元 + 进程 + 端口/安装目录），
返回服务器上运行/安装的所有服务（企业主流中间件 + 云原生组件）
**权限**：`bnt.opsPatrolServiceConfig.scan`

**请求参数**：

**请求体（application/json）**：`ScanServerParam`

```json
{
  "serverId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsPatrolServiceConfig/saveScanResult

**功能**：保存全量扫描勾选的服务到巡检配置
**说明**：将全量扫描勾选的服务批量写入巡检配置（含去重）
**权限**：`bnt.opsPatrolServiceConfig.scan`

**请求参数**：

**请求体（application/json）**：`ScanSaveParam`

```json
{
  "serverId": "string",
  "services": [
    {
      "serviceName": null,
      "serviceType": null,
      "port": null
    }
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-29. opsServer（10 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsServer/findAll` | 查询所有服务器 |
| `GET` | `/admin/opsServer/list/{page}/{limit}` | 查询服务器分页信息 |
| `GET` | `/admin/opsServer/get/{id}` | 根据ID查询服务器 |
| `GET` | `/admin/opsServer/startSyncServer` | 手动触发服务器同步 |
| `POST` | `/admin/opsServer/save` | 添加服务器 |
| `PUT` | `/admin/opsServer/update` | 修改服务器信息 |
| `DELETE` | `/admin/opsServer/remove/{id}` | 删除服务器 |
| `DELETE` | `/admin/opsServer/batchRemove` | 批量删除服务器 |
| `GET` | `/admin/opsServer/v1/aliyun/opscenter` | 查询阿里云轻量服务器 |
| `GET` | `/admin/opsServer/v1/aliyun/opscenter/regions` | 遍历所有地域查询轻量服务器 |

### GET /admin/opsServer/findAll

**功能**：查询所有服务器
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServer/list/`{page}`/`{limit}`

**功能**：查询服务器分页信息
**说明**：服务器分页条件查询
**权限**：`bnt.opsServer.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-500之间 |
| `hostname` | Query | `string` | 否 |  |
| `ip` | Query | `string` | 否 |  |
| `intranetIp` | Query | `string` | 否 |  |
| `env` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `tag` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServer/get/`{id}`

**功能**：根据ID查询服务器
**说明**：根据服务器ID查询单个服务器
**权限**：`bnt.opsServer.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 服务器ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServer/startSyncServer

**功能**：手动触发服务器同步
**权限**：`bnt.opsServer.startSync`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/opsServer/save

**功能**：添加服务器
**说明**：添加新服务器
**权限**：`bnt.opsServer.add`

**请求参数**：

**请求体（application/json）**：`OpsServerAddParam`

```json
{
  "hostname": "string",
  "ip": "string",
  "intranetIp": "string",
  "env": "string",
  "tag": "string",
  "leaderId": "string",
  "status": "string",
  "remark": "string",
  "patrolEnabled": "string",
  "alarmEmailEnabled": "string",
  "serverSyncEnabled": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/opsServer/update

**功能**：修改服务器信息
**说明**：修改服务器基本信息
**权限**：`bnt.opsServer.update`

**请求参数**：

**请求体（application/json）**：`OpsServerUpdateParam`

```json
{
  "id": "string",
  "hostname": "string",
  "ip": "string",
  "intranetIp": "string",
  "env": "string",
  "tag": "string",
  "leaderId": "string",
  "status": "string",
  "remark": "string",
  "patrolEnabled": "string",
  "alarmEmailEnabled": "string",
  "serverSyncEnabled": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsServer/remove/`{id}`

**功能**：删除服务器
**说明**：软删除单个服务器
**权限**：`bnt.opsServer.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 服务器ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsServer/batchRemove

**功能**：批量删除服务器
**说明**：批量软删除服务器
**权限**：`bnt.opsServer.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServer/v1/aliyun/opscenter

**功能**：查询阿里云轻量服务器
**说明**：获取阿里云轻量应用服务器列表（指定地域）。
返回阿里云 API 原始实例数据，字段完整。
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `region` | Query | `string` | 否 | 地域ID，如 cn-hangzhou/cn-shanghai |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServer/v1/aliyun/opscenter/regions

**功能**：遍历所有地域查询轻量服务器
**说明**：遍历常用地域，查询所有地域下的轻量应用服务器。
用于诊断实例在哪个地域。
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-30. opsServicePatrol（5 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/opsServicePatrol/list/{page}/{limit}` | 查询巡检记录分页信息 |
| `GET` | `/admin/opsServicePatrol/get/{id}` | 根据ID查询巡检记录 |
| `GET` | `/admin/opsServicePatrol/manualStartPatrol` | 手动触发巡检 |
| `DELETE` | `/admin/opsServicePatrol/remove/{id}` | 删除巡检记录 |
| `DELETE` | `/admin/opsServicePatrol/batchRemove` | 批量删除巡检记录 |

### GET /admin/opsServicePatrol/list/`{page}`/`{limit}`

**功能**：查询巡检记录分页信息
**说明**：巡检记录分页条件查询
**权限**：`bnt.opsServicePatrol.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `serverId` | Query | `string` | 否 |  |
| `serviceName` | Query | `string` | 否 |  |
| `serviceTypeName` | Query | `string` | 否 |  |
| `inspectionResult` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServicePatrol/get/`{id}`

**功能**：根据ID查询巡检记录
**说明**：根据ID查询单个巡检记录
**权限**：`bnt.opsServicePatrol.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 巡检记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/opsServicePatrol/manualStartPatrol

**功能**：手动触发巡检
**权限**：`bnt.opsServicePatrol.start`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsServicePatrol/remove/`{id}`

**功能**：删除巡检记录
**说明**：软删除单个巡检记录
**权限**：`bnt.opsServicePatrol.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 巡检记录ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/opsServicePatrol/batchRemove

**功能**：批量删除巡检记录
**说明**：批量软删除巡检记录
**权限**：`bnt.opsServicePatrol.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-31. rag（6 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/rag/documents/upload` | 上传文档到知识库 |
| `GET` | `/admin/rag/documents/list/{page}/{limit}` | 查询知识库文档列表 |
| `DELETE` | `/admin/rag/documents/remove/{doc_id}` | 删除知识库文档 |
| `DELETE` | `/admin/rag/documents/batchRemove` | 批量删除知识库文档 |
| `POST` | `/admin/rag/chat` | RAG知识库 增强问答 |
| `POST` | `/admin/rag/chat/stream` | RAG知识库 增强问答 |

### POST /admin/rag/documents/upload

**功能**：上传文档到知识库
**说明**：批量上传文档，自动解析 → 切块 → embedding → 存入向量库
**权限**：`bnt.ragDocuments.upload`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/rag/documents/list/`{page}`/`{limit}`

**功能**：查询知识库文档列表
**说明**：分页查询已导入的文档
**权限**：`bnt.ragDocuments.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 |  |
| `limit` | Path | `integer` | 是 |  |
| `filename` | Query | `string` | 否 |  |
| `fileType` | Query | `string` | 否 |  |
| `status` | Query | `integer` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/rag/documents/remove/`{doc_id}`

**功能**：删除知识库文档
**说明**：删除文档及其所有向量块
单个删除 + 批量删除，删除时清理 Chroma 向量 + Redis 缓存 + MySQL 数据 三级
**权限**：`bnt.ragDocuments.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `doc_id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/rag/documents/batchRemove

**功能**：批量删除知识库文档
**说明**：批量物理删除文档（Chroma + Redis + MySQL）
**权限**：`bnt.ragDocuments.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/rag/chat

**功能**：RAG知识库 增强问答
**说明**：RAG 增强问答（非流式）
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`RagChatRequest`

```json
{
  "message": "string",
  "useRag": true,
  "topK": 0
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/rag/chat/stream

**功能**：RAG知识库 增强问答
**说明**：RAG 增强问答（流式）— 混合检索 + 邻居扩展
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`RagChatRequest`

```json
{
  "message": "string",
  "useRag": true,
  "topK": 0
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-32. sshExec（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/sshExec/execute` | 执行SSH命令 |
| `GET` | `/admin/sshExec/blocklist` | 获取禁止执行的命令黑名单 |

### POST /admin/sshExec/execute

**功能**：执行SSH命令
**说明**：在指定凭据关联的服务器上执行 SSH 命令
**权限**：`bnt.sshExec.execute`

**请求参数**：

**请求体（application/json）**：`SshExecRequest`

```json
{
  "credentialId": "string",
  "command": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sshExec/blocklist

**功能**：获取禁止执行的命令黑名单
**说明**：返回当前配置的禁止命令列表（审计展示）
**权限**：`bnt.sshExec.execute`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-33. statistics（5 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/statistics/patrol` | 服务巡检统计 |
| `GET` | `/admin/statistics/backup` | 备份统计 |
| `GET` | `/admin/statistics/dbCheck` | 数据库巡检统计 |
| `GET` | `/admin/statistics/alarm` | 告警统计 |
| `GET` | `/admin/statistics/workOrder` | 工单统计 |

### GET /admin/statistics/patrol

**功能**：服务巡检统计
**说明**：服务巡检统计：巡检总数、正常/异常、服务器数、最近记录
**权限**：`bnt.statistics.patrol`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/statistics/backup

**功能**：备份统计
**说明**：备份统计：总备份数、成功率、今日、30天趋势
**权限**：`bnt.statistics.backup`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/statistics/dbCheck

**功能**：数据库巡检统计
**说明**：数据库巡检统计：总巡检数、成功率、平均分、最近评分
**权限**：`bnt.statistics.dbCheck`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/statistics/alarm

**功能**：告警统计
**说明**：告警统计：总数、按级别、按类型分布
**权限**：`bnt.statistics.alarm`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/statistics/workOrder

**功能**：工单统计
**说明**：工单统计：总览（总数/待处理/待审核/超时/审核不通过/处理率）+ 来源/优先级分布 + 处理人绩效
**权限**：`bnt.statistics.workOrder`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-34. sysAnnouncement（7 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/sysAnnouncement/uploadImage` | 上传公告图片 |
| `GET` | `/admin/sysAnnouncement/list/{page}/{limit}` | 分页查询公告 |
| `GET` | `/admin/sysAnnouncement/latest` | 获取最新即时通知公告（轮询弹窗用） |
| `GET` | `/admin/sysAnnouncement/all` | 获取所有已发布公告（通知铃铛列表） |
| `POST` | `/admin/sysAnnouncement/save` | 发布公告 |
| `PUT` | `/admin/sysAnnouncement/update` | 修改公告 |
| `DELETE` | `/admin/sysAnnouncement/remove/{id}` | 删除公告 |

### POST /admin/sysAnnouncement/uploadImage

**功能**：上传公告图片
**说明**：上传图片，返回访问 URL
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysAnnouncement/list/`{page}`/`{limit}`

**功能**：分页查询公告
**权限**：`bnt.sysAnnouncement.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 |  |
| `limit` | Path | `integer` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysAnnouncement/latest

**功能**：获取最新即时通知公告（轮询弹窗用）
**说明**：获取最新需要弹窗的公告（notify_now=1），供前端轮询
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysAnnouncement/all

**功能**：获取所有已发布公告（通知铃铛列表）
**说明**：获取所有已发布公告，供通知铃铛展示
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysAnnouncement/save

**功能**：发布公告
**权限**：`bnt.sysAnnouncement.add`

**请求参数**：

**请求体（application/json）**：`SysAnnouncementAddParam`

```json
{
  "title": "string",
  "content": "string",
  "annType": "string",
  "notifyNow": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysAnnouncement/update

**功能**：修改公告
**权限**：`bnt.sysAnnouncement.update`

**请求参数**：

**请求体（application/json）**：`SysAnnouncementUpdateParam`

```json
{
  "id": "string",
  "title": "string",
  "content": "string",
  "annType": "string",
  "status": "string",
  "notifyNow": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysAnnouncement/remove/`{id}`

**功能**：删除公告
**权限**：`bnt.sysAnnouncement.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 公告ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-35. sysDept（7 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysDept/findDeptList` | 查询所有部门树 |
| `GET` | `/admin/sysDept/list/{page}/{limit}` | 查询系统部门分页信息 |
| `GET` | `/admin/sysDept/get/{id}` | 根据部门ID查询部门信息 |
| `POST` | `/admin/sysDept/save` | 添加部门 |
| `PUT` | `/admin/sysDept/update` | 修改部门信息 |
| `PUT` | `/admin/sysDept/updateStatus/{id}/{status}` | 修改部门状态 |
| `DELETE` | `/admin/sysDept/remove/{id}` | 删除部门 |

### GET /admin/sysDept/findDeptList

**功能**：查询所有部门树
**说明**：获取所有部门的树形结构数据
:param db: 异步数据库会话
:return: 部门树形列表
**权限**：`bnt.sysDept.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysDept/list/`{page}`/`{limit}`

**功能**：查询系统部门分页信息
**说明**：系统部门分页条件查询
**权限**：`bnt.sysDept.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `name` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `leader` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysDept/get/`{id}`

**功能**：根据部门ID查询部门信息
**说明**：根据部门ID查询单个部门
**权限**：`bnt.sysDept.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 部门ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysDept/save

**功能**：添加部门
**说明**：添加新系统部门
**权限**：`bnt.sysDept.add`

**请求参数**：

**请求体（application/json）**：`SysDeptAddParam`

```json
{
  "name": "string",
  "parentId": "string",
  "sortValue": "string",
  "leader": "string",
  "leaderId": "string",
  "phone": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysDept/update

**功能**：修改部门信息
**说明**：修改部门基本信息
**权限**：`bnt.sysDept.update`

**请求参数**：

**请求体（application/json）**：`SysDeptUpdateParam`

```json
{
  "id": "string",
  "name": "string",
  "parentId": "string",
  "sortValue": "string",
  "leader": "string",
  "leaderId": "string",
  "phone": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysDept/updateStatus/`{id}`/`{status}`

**功能**：修改部门状态
**说明**：启用或停用部门
**权限**：`bnt.sysDept.update`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 |  |
| `status` | Path | `integer` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysDept/remove/`{id}`

**功能**：删除部门
**说明**：软删除单个部门（有子节点不可删除）
**权限**：`bnt.sysDept.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 部门ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-36. sysIcon（1 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysIcon/getIconAll` | 查询所有图标信息 |

### GET /admin/sysIcon/getIconAll

**功能**：查询所有图标信息
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-37. sysLoginLog（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysLoginLog/findAll` | 查询所有登录日志 |
| `GET` | `/admin/sysLoginLog/list/{page}/{limit}` | 分页查询登录日志 |

### GET /admin/sysLoginLog/findAll

**功能**：查询所有登录日志
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysLoginLog/list/`{page}`/`{limit}`

**功能**：分页查询登录日志
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `username` | Query | `string` | 否 | 用户名筛选 |
| `status` | Query | `string` | 否 | 登录状态（0成功 1失败） |
| `createTimeBegin` | Query | `string` | 否 | 开始时间 yyyy-MM-dd HH:mm:ss |
| `createTimeEnd` | Query | `string` | 否 | 截止时间 yyyy-MM-dd HH:mm:ss |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-38. sysMenu（8 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysMenu/toAssign/{role_id}` | 根据角色ID查询关联菜单树 |
| `GET` | `/admin/sysMenu/findNodes` | 查询所有菜单树 |
| `POST` | `/admin/sysMenu/doAssign` | 给角色分配菜单权限 |
| `GET` | `/admin/sysMenu/list/{page}/{limit}` | 查询系统菜单分页信息 |
| `GET` | `/admin/sysMenu/get/{id}` | 根据菜单ID查询菜单信息 |
| `POST` | `/admin/sysMenu/save` | 添加菜单 |
| `PUT` | `/admin/sysMenu/update` | 修改菜单信息 |
| `DELETE` | `/admin/sysMenu/remove/{id}` | 删除菜单 |

### GET /admin/sysMenu/toAssign/`{role_id}`

**功能**：根据角色ID查询关联菜单树
**说明**：获取角色分配菜单的树形结构数据
:param role_id: 角色ID
:param db: 异步数据库会话
:return: 包含选中状态(is_select)的菜单树形列表
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `role_id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysMenu/findNodes

**功能**：查询所有菜单树
**说明**：获取所有菜单的树形结构数据
:param db: 异步数据库会话
:return: 菜单树形列表
**权限**：`bnt.sysMenu.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysMenu/doAssign

**功能**：给角色分配菜单权限
**说明**：给角色分配菜单/按钮权限，会先删除该角色现有的所有菜单关联再重新插入
**权限**：`bnt.sysRole.assignAuth`

**请求参数**：

**请求体（application/json）**：`AssignMenuParam`

```json
{
  "roleId": "string",
  "menuIdList": [
    "string"
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysMenu/list/`{page}`/`{limit}`

**功能**：查询系统菜单分页信息
**说明**：系统菜单分页条件查询
**权限**：`bnt.sysMenu.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `name` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `type` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysMenu/get/`{id}`

**功能**：根据菜单ID查询菜单信息
**说明**：根据菜单ID查询单个菜单
**权限**：`bnt.sysMenu.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 菜单ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysMenu/save

**功能**：添加菜单
**说明**：添加新系统菜单
**权限**：`bnt.sysMenu.add`

**请求参数**：

**请求体（application/json）**：`SysMenuAddParam`

```json
{
  "parentId": "string",
  "name": "string",
  "type": 0,
  "path": "string",
  "component": "string",
  "perms": "string",
  "icon": "string",
  "sortValue": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysMenu/update

**功能**：修改菜单信息
**说明**：修改菜单基本信息
**权限**：`bnt.sysMenu.update`

**请求参数**：

**请求体（application/json）**：`SysMenuUpdateParam`

```json
{
  "id": "string",
  "parentId": "string",
  "name": "string",
  "type": "string",
  "path": "string",
  "component": "string",
  "perms": "string",
  "icon": "string",
  "sortValue": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysMenu/remove/`{id}`

**功能**：删除菜单
**说明**：软删除单个菜单（有子节点不可删除）
**权限**：`bnt.sysMenu.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 菜单ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-39. sysOperLog（2 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysOperLog/findAll` | 查询所有操作日志 |
| `GET` | `/admin/sysOperLog/list/{page}/{limit}` | 分页查询操作日志 |

### GET /admin/sysOperLog/findAll

**功能**：查询所有操作日志
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysOperLog/list/`{page}`/`{limit}`

**功能**：分页查询操作日志
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `operName` | Query | `string` | 否 |  |
| `title` | Query | `string` | 否 |  |
| `applicationName` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `createTimeBegin` | Query | `string` | 否 |  |
| `createTimeEnd` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-40. sysPost（7 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysPost/findAll` | 查询所有岗位信息 |
| `GET` | `/admin/sysPost/list/{page}/{limit}` | 查询系统岗位分页信息 |
| `GET` | `/admin/sysPost/get/{id}` | 根据岗位ID查询岗位信息 |
| `POST` | `/admin/sysPost/save` | 添加岗位 |
| `PUT` | `/admin/sysPost/update` | 修改岗位信息 |
| `PUT` | `/admin/sysPost/updateStatus/{id}/{status}` | 修改岗位状态 |
| `DELETE` | `/admin/sysPost/remove/{id}` | 删除岗位 |

### GET /admin/sysPost/findAll

**功能**：查询所有岗位信息
**权限**：`bnt.sysPost.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysPost/list/`{page}`/`{limit}`

**功能**：查询系统岗位分页信息
**说明**：系统岗位分页条件查询
**权限**：`bnt.sysPost.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `postCode` | Query | `string` | 否 |  |
| `postName` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysPost/get/`{id}`

**功能**：根据岗位ID查询岗位信息
**说明**：根据岗位ID查询单个岗位
**权限**：`bnt.sysPost.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 岗位ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysPost/save

**功能**：添加岗位
**说明**：添加新系统岗位
**权限**：`bnt.sysPost.add`

**请求参数**：

**请求体（application/json）**：`SysPostAddParam`

```json
{
  "postCode": "string",
  "postName": "string",
  "description": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysPost/update

**功能**：修改岗位信息
**说明**：修改岗位基本信息
**权限**：`bnt.sysPost.update`

**请求参数**：

**请求体（application/json）**：`SysPostUpdateParam`

```json
{
  "id": "string",
  "postCode": "string",
  "postName": "string",
  "description": "string",
  "status": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysPost/updateStatus/`{id}`/`{status}`

**功能**：修改岗位状态
**说明**：启用或停用岗位
**权限**：`bnt.sysPost.update`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 |  |
| `status` | Path | `integer` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysPost/remove/`{id}`

**功能**：删除岗位
**说明**：软删除单个岗位
**权限**：`bnt.sysPost.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 岗位ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-41. sysRole（8 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/admin/sysRole/doAssign` | 分配用户角色 |
| `GET` | `/admin/sysRole/toAssign/{userId}` | 根据用户ID查询关联的角色ID |
| `GET` | `/admin/sysRole/list/{page}/{limit}` | 查询系统角色分页信息 |
| `GET` | `/admin/sysRole/get/{id}` | 根据角色ID查询角色信息 |
| `POST` | `/admin/sysRole/save` | 添加角色 |
| `PUT` | `/admin/sysRole/update` | 修改角色信息 |
| `DELETE` | `/admin/sysRole/remove/{id}` | 删除角色 |
| `DELETE` | `/admin/sysRole/batchRemove` | 批量删除角色 |

### POST /admin/sysRole/doAssign

**功能**：分配用户角色
**权限**：`bnt.sysRole.assignAuth`

**请求参数**：

**请求体（application/json）**：`AssginRoleQuery`

```json
{
  "userId": "string",
  "roleIdList": [
    "string"
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysRole/toAssign/`{userId}`

**功能**：根据用户ID查询关联的角色ID
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `userId` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysRole/list/`{page}`/`{limit}`

**功能**：查询系统角色分页信息
**说明**：系统角色分页条件查询
**权限**：`bnt.sysRole.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `roleName` | Query | `string` | 否 |  |
| `roleCode` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysRole/get/`{id}`

**功能**：根据角色ID查询角色信息
**说明**：根据角色ID查询单个角色
**权限**：`bnt.sysRole.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 角色ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysRole/save

**功能**：添加角色
**说明**：添加新系统角色
**权限**：`bnt.sysRole.add`

**请求参数**：

**请求体（application/json）**：`SysRoleAddParam`

```json
{
  "roleName": "string",
  "roleCode": "string",
  "roleType": "string",
  "description": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysRole/update

**功能**：修改角色信息
**说明**：修改角色基本信息
**权限**：`bnt.sysRole.update`

**请求参数**：

**请求体（application/json）**：`SysRoleUpdateParam`

```json
{
  "id": "string",
  "roleName": "string",
  "roleCode": "string",
  "roleType": "string",
  "description": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysRole/remove/`{id}`

**功能**：删除角色
**说明**：软删除单个角色
**权限**：`bnt.sysRole.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 角色ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysRole/batchRemove

**功能**：批量删除角色
**说明**：批量软删除角色
**权限**：`bnt.sysRole.batchRemove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-42. sysUser（17 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/sysUser/list/{page}/{limit}` | 查询系统用户分页信息 |
| `GET` | `/admin/sysUser/findAll` | 查询所有用户信息 |
| `PUT` | `/admin/sysUser/updatePassword/{id}/{password}` | 修改用户密码 |
| `POST` | `/admin/sysUser/sendPasswordCode` | 发送修改密码邮箱验证码 |
| `POST` | `/admin/sysUser/changeMyPassword` | 修改本人密码（邮箱验证码校验） |
| `GET` | `/admin/sysUser/get/{id}` | 根据用户ID查询用户信息 |
| `PUT` | `/admin/sysUser/updateProfile` | 修改当前登录用户个人资料 |
| `PUT` | `/admin/sysUser/update` | 修改用户信息 |
| `POST` | `/admin/sysUser/save` | 添加用户 |
| `DELETE` | `/admin/sysUser/remove/{id}` | 删除用户 |
| `DELETE` | `/admin/sysUser/batchRemove` | 批量删除用户 |
| `GET` | `/admin/sysUser/superAdmins` | 获取超级管理员列表 |
| `PUT` | `/admin/sysUser/ban` | 封禁用户 |
| `PUT` | `/admin/sysUser/unban` | 解封用户 |
| `PUT` | `/admin/sysUser/lock/{id}` | 锁定用户 |
| `PUT` | `/admin/sysUser/unlock/{id}` | 解锁用户 |
| `PUT` | `/admin/sysUser/batchBan` | 批量封禁用户 |

### GET /admin/sysUser/list/`{page}`/`{limit}`

**功能**：查询系统用户分页信息
**说明**：StandardJSONResponse 自动将返回 dict 包装为 {code, message, totalCount, headers, data}
**权限**：`bnt.sysUser.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码，必须大于等于1 |
| `limit` | Path | `integer` | 是 | 每页条数，1-100之间 |
| `username` | Query | `string` | 否 |  |
| `name` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `postId` | Query | `string` | 否 |  |
| `deptId` | Query | `string` | 否 |  |
| `startTime` | Query | `string` | 否 |  |
| `endTime` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysUser/findAll

**功能**：查询所有用户信息
**权限**：`bnt.sysUser.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/updatePassword/`{id}`/`{password}`

**功能**：修改用户密码
**说明**：修改用户密码：需验证旧密码
**权限**：`bnt.sysUser.edit.password`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 |  |
| `password` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysUser/sendPasswordCode

**功能**：发送修改密码邮箱验证码
**说明**：向当前登录用户的邮箱发送 6 位验证码（5 分钟有效，Redis 存储）
**权限**：`bnt.sysUser.edit.password`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysUser/changeMyPassword

**功能**：修改本人密码（邮箱验证码校验）
**说明**：修改本人密码：需邮箱验证码校验；验证码错误 5 次当天禁止修改
**权限**：`bnt.sysUser.edit.password`

**请求参数**：

**请求体（application/json）**：`ChangeMyPasswordParam`

```json
{
  "password": "string",
  "code": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysUser/get/`{id}`

**功能**：根据用户ID查询用户信息
**说明**：根据用户ID查询单个用户
**权限**：`bnt.sysUser.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 用户ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/updateProfile

**功能**：修改当前登录用户个人资料
**说明**：当前登录用户修改自己的个人资料（无需管理员权限）
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`SysUserProfileUpdateParam`

```json
{
  "email": "string",
  "phone": "string",
  "sex": "string",
  "description": "string",
  "headUrl": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/update

**功能**：修改用户信息
**说明**：修改用户基本信息
**权限**：`bnt.sysUser.update`

**请求参数**：

**请求体（application/json）**：`SysUserUpdateInfoParam`

```json
{
  "id": "string",
  "username": "string",
  "name": "string",
  "appointment": "string",
  "phone": "string",
  "email": "string",
  "sex": "string",
  "status": "string",
  "deptId": "string",
  "postId": "string",
  "description": "string",
  "headUrl": "string",
  "feishuId": "string",
  "wecomId": "string",
  "dingtalkId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/sysUser/save

**功能**：添加用户
**说明**：添加新系统用户
**权限**：`bnt.sysUser.add`

**请求参数**：

**请求体（application/json）**：`SysUserAddParam`

```json
{
  "username": "string",
  "name": "string",
  "appointment": "string",
  "phone": "string",
  "email": "string",
  "sex": "string",
  "deptId": "string",
  "postId": "string",
  "description": "string",
  "feishuId": "string",
  "wecomId": "string",
  "dingtalkId": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysUser/remove/`{id}`

**功能**：删除用户
**说明**：软删除单个用户
**权限**：`bnt.sysUser.remove`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 用户ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### DELETE /admin/sysUser/batchRemove

**功能**：批量删除用户
**说明**：批量软删除用户
**权限**：`bnt.sysUser.remove`

**请求参数**：

**请求体（application/json）**：数组[string]

```json
[
  "string"
]
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/sysUser/superAdmins

**功能**：获取超级管理员列表
**说明**：获取所有超级管理员用户（用于邮箱验证等场景）
**权限**：`bnt.sysUser.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/ban

**功能**：封禁用户
**说明**：封禁用户：设置封禁原因和时间
**权限**：`bnt.sysUser.ban`

**请求参数**：

**请求体（application/json）**：`SysUserBanParam`

```json
{
  "id": "string",
  "banReason": "string",
  "banEndTime": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/unban

**功能**：解封用户
**说明**：解封用户：恢复正常状态
**权限**：`bnt.sysUser.ban`

**请求参数**：

**请求体（application/json）**：`SysUserUnbanParam`

```json
{
  "id": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/lock/`{id}`

**功能**：锁定用户
**说明**：手动锁定用户
**权限**：`bnt.sysUser.ban`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 用户ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/unlock/`{id}`

**功能**：解锁用户
**说明**：解锁用户：恢复正常状态
**权限**：`bnt.sysUser.ban`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | 用户ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/sysUser/batchBan

**功能**：批量封禁用户
**说明**：批量封禁用户
**权限**：`bnt.sysUser.ban`

**请求参数**：

**请求体（application/json）**：`SysUserBatchBanParam`

```json
{
  "ids": [
    "string"
  ],
  "banReason": "string",
  "banEndTime": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-43. system（7 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/system/config/list/{page}/{limit}` | 分页查询所有配置 |
| `GET` | `/admin/system/config/component/{component_tag}` | 按模块查询配置 |
| `GET` | `/admin/system/config/tags` | 获取所有配置分类标签 |
| `GET` | `/admin/system/config/{config_key}` | 按 key 查询单条配置 |
| `PUT` | `/admin/system/config` | 更新单条配置 |
| `PUT` | `/admin/system/config/batch` | 批量更新配置 |
| `POST` | `/admin/system/config/reload` | 强制刷新配置缓存 |

### GET /admin/system/config/list/`{page}`/`{limit}`

**功能**：分页查询所有配置
**权限**：`bnt.systemConfig.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 |  |
| `limit` | Path | `integer` | 是 |  |
| `component_tag` | Query | `string` | 否 | 按 component_tag 过滤 |
| `config_key` | Query | `string` | 否 | 按 config_key 模糊搜索 |
| `enabled` | Query | `integer` | 否 | 按 enabled 过滤 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/system/config/component/`{component_tag}`

**功能**：按模块查询配置
**权限**：`bnt.systemConfig.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `component_tag` | Path | `string` | 是 | 模块标签 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/system/config/tags

**功能**：获取所有配置分类标签
**权限**：`bnt.systemConfig.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/system/config/`{config_key}`

**功能**：按 key 查询单条配置
**权限**：`bnt.systemConfig.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `config_key` | Path | `string` | 是 | 配置键 |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/system/config

**功能**：更新单条配置
**权限**：`bnt.systemConfig.update`

**请求参数**：

**请求体（application/json）**：`ConfigUpdateRequest`

```json
{
  "config_key": "string",
  "config_value": "string",
  "component_tag": "string",
  "enabled": "string",
  "description": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/system/config/batch

**功能**：批量更新配置
**权限**：`bnt.systemConfig.update`

**请求参数**：

**请求体（application/json）**：`ConfigBatchUpdateRequest`

```json
{
  "configs": [
    {
      "config_key": null,
      "config_value": null,
      "component_tag": null,
      "enabled": null,
      "description": null
    }
  ]
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/system/config/reload

**功能**：强制刷新配置缓存
**权限**：`bnt.systemConfig.update`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-44. tencentCos（6 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/tencentCos/list` | 列举COS文件 |
| `GET` | `/admin/tencentCos/head` | 获取COS对象元信息 |
| `GET` | `/admin/tencentCos/downloadByKey` | 按Key下载 |
| `GET` | `/admin/tencentCos/config` | 查看COS配置 |
| `POST` | `/admin/tencentCos/upload/{backup_id}` | 手动上传备份 |
| `GET` | `/admin/tencentCos/download/{backup_id}` | 从COS下载备份 |

### GET /admin/tencentCos/list

**功能**：列举COS文件
**权限**：`bnt.tencentCos.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `prefix` | Query | `string` | 否 |  |
| `max_keys` | Query | `integer` | 否 |  |
| `marker` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/tencentCos/head

**功能**：获取COS对象元信息
**权限**：`bnt.tencentCos.list`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `cos_key` | Query | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/tencentCos/downloadByKey

**功能**：按Key下载
**权限**：`bnt.tencentCos.download`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `cos_key` | Query | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/tencentCos/config

**功能**：查看COS配置
**权限**：`bnt.tencentCos.list`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### POST /admin/tencentCos/upload/`{backup_id}`

**功能**：手动上传备份
**权限**：`bnt.tencentCos.upload`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `backup_id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/tencentCos/download/`{backup_id}`

**功能**：从COS下载备份
**权限**：`bnt.tencentCos.download`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `backup_id` | Path | `string` | 是 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-45. workOrder（9 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/admin/workOrder/myList/{page}/{limit}` | 工单列表（仅当前处理人的工单） |
| `GET` | `/admin/workOrder/myReviewList/{page}/{limit}` | 审核列表（仅当前审核人的工单） |
| `GET` | `/admin/workOrder/pendingStats` | 当前处理人的待处理工单统计（首页红点） |
| `GET` | `/admin/workOrder/list/{page}/{limit}` | 任务查询分页（所有人可见） |
| `GET` | `/admin/workOrder/get/{id}` | 根据ID查询工单 |
| `PUT` | `/admin/workOrder/handle` | 处理工单 |
| `PUT` | `/admin/workOrder/update` | 编辑调整工单 |
| `PUT` | `/admin/workOrder/review` | 审核工单 |
| `GET` | `/admin/workOrder/record/list/{workOrderId}` | 查询工单流转记录 |

### GET /admin/workOrder/myList/`{page}`/`{limit}`

**功能**：工单列表（仅当前处理人的工单）
**说明**：工单列表：仅返回当前用户为处理人（handler_id）的工单
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |
| `id` | Query | `string` | 否 |  |
| `workOrderNo` | Query | `string` | 否 |  |
| `handlerId` | Query | `string` | 否 |  |
| `reviewerId` | Query | `string` | 否 |  |
| `sourceType` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `statusList` | Query | `string` | 否 |  |
| `handleTimeNotNull` | Query | `string` | 否 |  |
| `title` | Query | `string` | 否 |  |
| `createTimeStart` | Query | `string` | 否 |  |
| `createTimeEnd` | Query | `string` | 否 |  |
| `deadlineTimeStart` | Query | `string` | 否 |  |
| `deadlineTimeEnd` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/workOrder/myReviewList/`{page}`/`{limit}`

**功能**：审核列表（仅当前审核人的工单）
**说明**：审核列表：仅返回当前用户为审核人（reviewer_id）的工单
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |
| `id` | Query | `string` | 否 |  |
| `workOrderNo` | Query | `string` | 否 |  |
| `handlerId` | Query | `string` | 否 |  |
| `reviewerId` | Query | `string` | 否 |  |
| `sourceType` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `statusList` | Query | `string` | 否 |  |
| `handleTimeNotNull` | Query | `string` | 否 |  |
| `title` | Query | `string` | 否 |  |
| `createTimeStart` | Query | `string` | 否 |  |
| `createTimeEnd` | Query | `string` | 否 |  |
| `deadlineTimeStart` | Query | `string` | 否 |  |
| `deadlineTimeEnd` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/workOrder/pendingStats

**功能**：当前处理人的待处理工单统计（首页红点）
**说明**：当前处理人的待处理(1)/审核不通过(4)/超时(3) 工单数统计
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/workOrder/list/`{page}`/`{limit}`

**功能**：任务查询分页（所有人可见）
**说明**：任务查询：分页条件查询（不限处理人/审核人，所有人可见）
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `page` | Path | `integer` | 是 | 页码 |
| `limit` | Path | `integer` | 是 | 每页条数 |
| `id` | Query | `string` | 否 |  |
| `workOrderNo` | Query | `string` | 否 |  |
| `handlerId` | Query | `string` | 否 |  |
| `reviewerId` | Query | `string` | 否 |  |
| `sourceType` | Query | `string` | 否 |  |
| `status` | Query | `string` | 否 |  |
| `statusList` | Query | `string` | 否 |  |
| `handleTimeNotNull` | Query | `string` | 否 |  |
| `title` | Query | `string` | 否 |  |
| `createTimeStart` | Query | `string` | 否 |  |
| `createTimeEnd` | Query | `string` | 否 |  |
| `deadlineTimeStart` | Query | `string` | 否 |  |
| `deadlineTimeEnd` | Query | `string` | 否 |  |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/workOrder/get/`{id}`

**功能**：根据ID查询工单
**说明**：根据ID查询工单表（含审核流程与软删除）详情
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `id` | Path | `string` | 是 | ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/workOrder/handle

**功能**：处理工单
**说明**：处理工单：填写处理意见，状态流转为待审核
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`WorkOrderHandleParam`

```json
{
  "id": "string",
  "handleOpinion": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/workOrder/update

**功能**：编辑调整工单
**说明**：编辑调整工单：变更内容写入工单流转记录表
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`WorkOrderUpdateParam`

```json
{
  "id": "string",
  "workOrderNo": "string",
  "handlerId": "string",
  "deadlineTime": "string",
  "sourceType": "string",
  "sourceId": "string",
  "title": "string",
  "description": "string",
  "priority": "string",
  "status": "string",
  "handleTime": "string",
  "handleOpinion": "string",
  "reviewerId": "string",
  "reviewTime": "string",
  "reviewOpinion": "string",
  "createBy": "string",
  "isDelete": "string"
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### PUT /admin/workOrder/review

**功能**：审核工单
**说明**：审核工单：通过→已完成(5)，不通过→审核不通过(4)，记录当前登录用户为审核人
**权限**：`需登录（Bearer Token）`

**请求参数**：

**请求体（application/json）**：`WorkOrderReviewParam`

```json
{
  "id": "string",
  "reviewOpinion": "string",
  "reviewResult": 0
}
```

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

### GET /admin/workOrder/record/list/`{workOrderId}`

**功能**：查询工单流转记录
**说明**：查询指定工单的全生命周期流转记录（操作时间倒序）
**权限**：`需登录（Bearer Token）`

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `workOrderId` | Path | `string` | 是 | 工单ID |

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 三-46. 未分组（1 个接口）

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/` | Index |

### GET /

**功能**：Index
**权限**：`需登录（Bearer Token）`

**响应示例**：

```json
{ "code": 200, "message": "success", "totalCount": 0, "data": {} }
```

**失败响应**：`{ "code": 5000, "message": "业务异常说明" }`

---

## 附录：权限标识清单（bnt.xxx）

| 权限标识 | 模块 |
|---|---|
| `bnt.aiDataAnalysis.delete` | /admin/aiDataAnalysis/delete/{report_id} |
| `bnt.modelQuota.remove` | /admin/modelQuota/remove/{quota_id} |
| `bnt.onlineUser.kick` | /admin/onlineUser/kick/{userId} |
| `bnt.onlineUser.kick` | /admin/onlineUser/kickBatch |
| `bnt.opsAlarm.remove` | /admin/opsAlarm/batchRemove |
| `bnt.opsAlarm.remove` | /admin/opsAlarm/remove/{id} |
| `bnt.opsBackupReplication.remove` | /admin/opsBackupReplication/remove/{id} |
| `bnt.opsCredential.remove` | /admin/opsCredential/batchRemove |
| `bnt.opsCredential.remove` | /admin/opsCredential/remove/{id} |
| `bnt.opsDatabase.remove` | /admin/opsDatabase/batchRemove |
| `bnt.opsDatabase.remove` | /admin/opsDatabase/remove/{id} |
| `bnt.opsDatabaseAuth.remove` | /admin/opsDatabaseAuth/batchRemove |
| `bnt.opsDatabaseAuth.remove` | /admin/opsDatabaseAuth/remove/{id} |
| `bnt.opsDatabaseBackup.remove` | /admin/opsDatabaseBackup/batchRemove |
| `bnt.opsDatabaseBackup.remove` | /admin/opsDatabaseBackup/remove/{id} |
| `bnt.opsDatabase.remove` | /admin/opsDatabaseCheckRecord/remove/{id} |
| `bnt.opsPatrolServiceConfig.remove` | /admin/opsPatrolServiceConfig/batchRemove |
| `bnt.opsPatrolServiceConfig.remove` | /admin/opsPatrolServiceConfig/remove/{id} |
| `bnt.opsServer.remove` | /admin/opsServer/batchRemove |
| `bnt.opsServer.remove` | /admin/opsServer/remove/{id} |
| `bnt.opsServicePatrol.remove` | /admin/opsServicePatrol/batchRemove |
| `bnt.opsServicePatrol.remove` | /admin/opsServicePatrol/remove/{id} |
| `bnt.ragDocuments.remove` | /admin/rag/documents/batchRemove |
| `bnt.ragDocuments.remove` | /admin/rag/documents/remove/{doc_id} |
| `bnt.opsCollector.remove` | /admin/record/remove/{id} |
| `bnt.sysUser.remove` | /admin/remove/{id} |
| `bnt.sysAnnouncement.remove` | /admin/sysAnnouncement/remove/{id} |
| `bnt.sysDept.remove` | /admin/sysDept/remove/{id} |
| `bnt.sysMenu.remove` | /admin/sysMenu/remove/{id} |
| `bnt.sysPost.remove` | /admin/sysPost/remove/{id} |
| `bnt.sysRole.batchRemove` | /admin/sysRole/batchRemove |
| `bnt.sysRole.remove` | /admin/sysRole/remove/{id} |
| `bnt.sysUser.remove` | /admin/sysUser/batchRemove |
| `bnt.sysUser.remove` | /admin/sysUser/remove/{id} |
| `bnt.aiDataAnalysis.delete` | /aiDataAnalysis/delete/{report_id} |
| `bnt.modelQuota.remove` | /modelQuota/remove/{quota_id} |
| `bnt.onlineUser.kick` | /onlineUser/kick/{userId} |
| `bnt.onlineUser.kick` | /onlineUser/kickBatch |
| `bnt.opsAlarm.remove` | /opsAlarm/batchRemove |
| `bnt.opsAlarm.remove` | /opsAlarm/remove/{id} |
| `bnt.opsBackupReplication.remove` | /opsBackupReplication/remove/{id} |
| `bnt.opsCredential.remove` | /opsCredential/batchRemove |
| `bnt.opsCredential.remove` | /opsCredential/remove/{id} |
| `bnt.opsDatabase.remove` | /opsDatabase/batchRemove |
| `bnt.opsDatabase.remove` | /opsDatabase/remove/{id} |
| `bnt.opsDatabaseAuth.remove` | /opsDatabaseAuth/batchRemove |
| `bnt.opsDatabaseAuth.remove` | /opsDatabaseAuth/remove/{id} |
| `bnt.opsDatabaseBackup.remove` | /opsDatabaseBackup/batchRemove |
| `bnt.opsDatabaseBackup.remove` | /opsDatabaseBackup/remove/{id} |
| `bnt.opsDatabase.remove` | /opsDatabaseCheckRecord/remove/{id} |
| `bnt.opsPatrolServiceConfig.remove` | /opsPatrolServiceConfig/batchRemove |
| `bnt.opsPatrolServiceConfig.remove` | /opsPatrolServiceConfig/remove/{id} |
| `bnt.opsServer.remove` | /opsServer/batchRemove |
| `bnt.opsServer.remove` | /opsServer/remove/{id} |
| `bnt.opsServicePatrol.remove` | /opsServicePatrol/batchRemove |
| `bnt.opsServicePatrol.remove` | /opsServicePatrol/remove/{id} |
| `bnt.ragDocuments.remove` | /rag/documents/batchRemove |
| `bnt.ragDocuments.remove` | /rag/documents/remove/{doc_id} |
| `bnt.opsCollector.remove` | /record/remove/{id} |
| `bnt.sysUser.remove` | /remove/{id} |
| `bnt.sysAnnouncement.remove` | /sysAnnouncement/remove/{id} |
| `bnt.sysDept.remove` | /sysDept/remove/{id} |
| `bnt.sysMenu.remove` | /sysMenu/remove/{id} |
| `bnt.sysPost.remove` | /sysPost/remove/{id} |
| `bnt.sysRole.batchRemove` | /sysRole/batchRemove |
| `bnt.sysRole.remove` | /sysRole/remove/{id} |
| `bnt.sysUser.remove` | /sysUser/batchRemove |
| `bnt.sysUser.remove` | /sysUser/remove/{id} |
| `bnt.aiDataAnalysis.list` | /admin/aiDataAnalysis/detail/{report_id} |
| `bnt.aiDataAnalysis.list` | /admin/aiDataAnalysis/list |
| `bnt.aiDbAssistant.generate` | /admin/aiDbAssistant/chat/{database_id} |
| `bnt.aliyunOss.list` | /admin/aliyunOss/config |
| `bnt.aliyunOss.download` | /admin/aliyunOss/download/{backup_id} |
| `bnt.aliyunOss.download` | /admin/aliyunOss/downloadByKey |
| `bnt.aliyunOss.list` | /admin/aliyunOss/head |
| `bnt.aliyunOss.list` | /admin/aliyunOss/list |
| `bnt.sysUser.list` | /admin/list |
| `bnt.llmModel.list` | /admin/llmModel/list |
| `bnt.modelQuota.list` | /admin/modelQuota/allRoles |
| `bnt.onlineUser.list` | /admin/onlineUser/list |
| `bnt.opsAlarm.list` | /admin/opsAlarm/get/{id} |
| `bnt.opsAlarm.list` | /admin/opsAlarm/list/{page}/{limit} |
| `bnt.opsAlarm.list` | /admin/opsAlarm/relatedWorkOrder/{alarm_id} |
| `bnt.opsAlarm.list` | /admin/opsAlarm/stats |
| `bnt.opsBackupReplication.list` | /admin/opsBackupReplication/list/{policy_id} |
| `bnt.opsBackupReplication.list` | /admin/opsBackupReplication/logs/{backup_id} |
| `bnt.opsCredential.list` | /admin/opsCredential/get/{id} |
| `bnt.opsCredential.list` | /admin/opsCredential/list/{page}/{limit} |
| `bnt.opsDatabase.list` | /admin/opsDatabase/get/{id} |
| `bnt.opsDatabase.list` | /admin/opsDatabase/list/{page}/{limit} |
| `bnt.opsDatabaseAuth.add` | /admin/opsDatabaseAuth/decryptPassword/{id} |
| `bnt.opsDatabaseAuth.list` | /admin/opsDatabaseAuth/get/{id} |
| `bnt.opsDatabaseAuth.list` | /admin/opsDatabaseAuth/list/{page}/{limit} |
| `bnt.opsDatabaseAuth.list` | /admin/opsDatabaseAuth/usernames |
| `bnt.opsDatabaseBackup.download` | /admin/opsDatabaseBackup/download/{id} |
| `bnt.opsDatabaseBackup.list` | /admin/opsDatabaseBackup/get/{id} |
| `bnt.opsDatabaseBackup.list` | /admin/opsDatabaseBackup/list/{database_id}/{page}/{limit} |
| `bnt.opsDatabaseBackup.list` | /admin/opsDatabaseBackup/log/{id} |
| `bnt.opsDatabaseBackup.list` | /admin/opsDatabaseBackup/stats/{database_id} |
| `bnt.opsDatabaseBackupPolicy.list` | /admin/opsDatabaseBackupPolicy/get/{database_id} |
| `bnt.opsDatabaseInspection.list` | /admin/opsDatabaseCheckConfig/get/{database_id} |
| `bnt.opsDatabase.list` | /admin/opsDatabaseCheckRecord/get/{id} |
| `bnt.opsDatabase.list` | /admin/opsDatabaseCheckRecord/list/{page}/{limit} |
| `bnt.opsDatabaseCheckRecord.list` | /admin/opsDatabaseCheckRecord/overallStats |
| `bnt.opsDatabase.list` | /admin/opsDatabaseCheckRecord/stats/{database_id} |
| `bnt.opsDatabaseInspection.list` | /admin/opsDatabaseInspection/report/{record_id} |
| `bnt.opsDatabase.list` | /admin/opsDatabaseTable/ddl/{database_id} |
| `bnt.opsDatabase.export` | /admin/opsDatabaseTable/export/{database_id} |
| `bnt.opsDatabase.export` | /admin/opsDatabaseTable/exportList/{database_id} |
| `bnt.opsDatabase.list` | /admin/opsDatabaseTable/list/{database_id}/{page}/{limit} |
| `bnt.opsDatabase.list` | /admin/opsDatabaseTable/structure/{database_id} |
| `bnt.opsPatrolServiceConfig.list` | /admin/opsPatrolServiceConfig/get/{id} |
| `bnt.opsPatrolServiceConfig.list` | /admin/opsPatrolServiceConfig/list/{page}/{limit} |
| `bnt.opsServer.list` | /admin/opsServer/get/{id} |
| `bnt.opsServer.list` | /admin/opsServer/list/{page}/{limit} |
| `bnt.opsServer.startSync` | /admin/opsServer/startSyncServer |
| `bnt.opsServicePatrol.list` | /admin/opsServicePatrol/get/{id} |
| `bnt.opsServicePatrol.list` | /admin/opsServicePatrol/list/{page}/{limit} |
| `bnt.opsServicePatrol.start` | /admin/opsServicePatrol/manualStartPatrol |
| `bnt.ragDocuments.list` | /admin/rag/documents/list/{page}/{limit} |
| `bnt.opsCollector.list` | /admin/record/get/{id} |
| `bnt.opsCollector.list` | /admin/record/list/{page}/{limit} |
| `bnt.sshExec.execute` | /admin/sshExec/blocklist |
| `bnt.statistics.alarm` | /admin/statistics/alarm |
| `bnt.statistics.backup` | /admin/statistics/backup |
| `bnt.statistics.dbCheck` | /admin/statistics/dbCheck |
| `bnt.statistics.patrol` | /admin/statistics/patrol |
| `bnt.statistics.workOrder` | /admin/statistics/workOrder |
| `bnt.sysAnnouncement.list` | /admin/sysAnnouncement/list/{page}/{limit} |
| `bnt.sysDept.list` | /admin/sysDept/findDeptList |
| `bnt.sysDept.list` | /admin/sysDept/get/{id} |
| `bnt.sysDept.list` | /admin/sysDept/list/{page}/{limit} |
| `bnt.sysMenu.list` | /admin/sysMenu/findNodes |
| `bnt.sysMenu.list` | /admin/sysMenu/get/{id} |
| `bnt.sysMenu.list` | /admin/sysMenu/list/{page}/{limit} |
| `bnt.sysPost.list` | /admin/sysPost/findAll |
| `bnt.sysPost.list` | /admin/sysPost/get/{id} |
| `bnt.sysPost.list` | /admin/sysPost/list/{page}/{limit} |
| `bnt.sysRole.list` | /admin/sysRole/get/{id} |
| `bnt.sysRole.list` | /admin/sysRole/list/{page}/{limit} |
| `bnt.sysUser.list` | /admin/sysUser/findAll |
| `bnt.sysUser.list` | /admin/sysUser/get/{id} |
| `bnt.sysUser.list` | /admin/sysUser/list/{page}/{limit} |
| `bnt.sysUser.list` | /admin/sysUser/superAdmins |
| `bnt.systemConfig.list` | /admin/system/config/component/{component_tag} |
| `bnt.systemConfig.list` | /admin/system/config/list/{page}/{limit} |
| `bnt.systemConfig.list` | /admin/system/config/tags |
| `bnt.systemConfig.list` | /admin/system/config/{config_key} |
| `bnt.tencentCos.list` | /admin/tencentCos/config |
| `bnt.tencentCos.download` | /admin/tencentCos/download/{backup_id} |
| `bnt.tencentCos.download` | /admin/tencentCos/downloadByKey |
| `bnt.tencentCos.list` | /admin/tencentCos/head |
| `bnt.tencentCos.list` | /admin/tencentCos/list |
| `bnt.aiDataAnalysis.list` | /aiDataAnalysis/detail/{report_id} |
| `bnt.aiDataAnalysis.list` | /aiDataAnalysis/list |
| `bnt.aiDbAssistant.generate` | /aiDbAssistant/chat/{database_id} |
| `bnt.aliyunOss.list` | /aliyunOss/config |
| `bnt.aliyunOss.download` | /aliyunOss/download/{backup_id} |
| `bnt.aliyunOss.download` | /aliyunOss/downloadByKey |
| `bnt.aliyunOss.list` | /aliyunOss/head |
| `bnt.aliyunOss.list` | /aliyunOss/list |
| `bnt.sysUser.list` | /list |
| `bnt.llmModel.list` | /llmModel/list |
| `bnt.modelQuota.list` | /modelQuota/allRoles |
| `bnt.onlineUser.list` | /onlineUser/list |
| `bnt.opsAlarm.list` | /opsAlarm/get/{id} |
| `bnt.opsAlarm.list` | /opsAlarm/list/{page}/{limit} |
| `bnt.opsAlarm.list` | /opsAlarm/relatedWorkOrder/{alarm_id} |
| `bnt.opsAlarm.list` | /opsAlarm/stats |
| `bnt.opsBackupReplication.list` | /opsBackupReplication/list/{policy_id} |
| `bnt.opsBackupReplication.list` | /opsBackupReplication/logs/{backup_id} |
| `bnt.opsCredential.list` | /opsCredential/get/{id} |
| `bnt.opsCredential.list` | /opsCredential/list/{page}/{limit} |
| `bnt.opsDatabase.list` | /opsDatabase/get/{id} |
| `bnt.opsDatabase.list` | /opsDatabase/list/{page}/{limit} |
| `bnt.opsDatabaseAuth.add` | /opsDatabaseAuth/decryptPassword/{id} |
| `bnt.opsDatabaseAuth.list` | /opsDatabaseAuth/get/{id} |
| `bnt.opsDatabaseAuth.list` | /opsDatabaseAuth/list/{page}/{limit} |
| `bnt.opsDatabaseAuth.list` | /opsDatabaseAuth/usernames |
| `bnt.opsDatabaseBackup.download` | /opsDatabaseBackup/download/{id} |
| `bnt.opsDatabaseBackup.list` | /opsDatabaseBackup/get/{id} |
| `bnt.opsDatabaseBackup.list` | /opsDatabaseBackup/list/{database_id}/{page}/{limit} |
| `bnt.opsDatabaseBackup.list` | /opsDatabaseBackup/log/{id} |
| `bnt.opsDatabaseBackup.list` | /opsDatabaseBackup/stats/{database_id} |
| `bnt.opsDatabaseBackupPolicy.list` | /opsDatabaseBackupPolicy/get/{database_id} |
| `bnt.opsDatabaseInspection.list` | /opsDatabaseCheckConfig/get/{database_id} |
| `bnt.opsDatabase.list` | /opsDatabaseCheckRecord/get/{id} |
| `bnt.opsDatabase.list` | /opsDatabaseCheckRecord/list/{page}/{limit} |
| `bnt.opsDatabaseCheckRecord.list` | /opsDatabaseCheckRecord/overallStats |
| `bnt.opsDatabase.list` | /opsDatabaseCheckRecord/stats/{database_id} |
| `bnt.opsDatabaseInspection.list` | /opsDatabaseInspection/report/{record_id} |
| `bnt.opsDatabase.list` | /opsDatabaseTable/ddl/{database_id} |
| `bnt.opsDatabase.export` | /opsDatabaseTable/export/{database_id} |
| `bnt.opsDatabase.export` | /opsDatabaseTable/exportList/{database_id} |
| `bnt.opsDatabase.list` | /opsDatabaseTable/list/{database_id}/{page}/{limit} |
| `bnt.opsDatabase.list` | /opsDatabaseTable/structure/{database_id} |
| `bnt.opsPatrolServiceConfig.list` | /opsPatrolServiceConfig/get/{id} |
| `bnt.opsPatrolServiceConfig.list` | /opsPatrolServiceConfig/list/{page}/{limit} |
| `bnt.opsServer.list` | /opsServer/get/{id} |
| `bnt.opsServer.list` | /opsServer/list/{page}/{limit} |
| `bnt.opsServer.startSync` | /opsServer/startSyncServer |
| `bnt.opsServicePatrol.list` | /opsServicePatrol/get/{id} |
| `bnt.opsServicePatrol.list` | /opsServicePatrol/list/{page}/{limit} |
| `bnt.opsServicePatrol.start` | /opsServicePatrol/manualStartPatrol |
| `bnt.ragDocuments.list` | /rag/documents/list/{page}/{limit} |
| `bnt.opsCollector.list` | /record/get/{id} |
| `bnt.opsCollector.list` | /record/list/{page}/{limit} |
| `bnt.sshExec.execute` | /sshExec/blocklist |
| `bnt.statistics.alarm` | /statistics/alarm |
| `bnt.statistics.backup` | /statistics/backup |
| `bnt.statistics.dbCheck` | /statistics/dbCheck |
| `bnt.statistics.patrol` | /statistics/patrol |
| `bnt.statistics.workOrder` | /statistics/workOrder |
| `bnt.sysAnnouncement.list` | /sysAnnouncement/list/{page}/{limit} |
| `bnt.sysDept.list` | /sysDept/findDeptList |
| `bnt.sysDept.list` | /sysDept/get/{id} |
| `bnt.sysDept.list` | /sysDept/list/{page}/{limit} |
| `bnt.sysMenu.list` | /sysMenu/findNodes |
| `bnt.sysMenu.list` | /sysMenu/get/{id} |
| `bnt.sysMenu.list` | /sysMenu/list/{page}/{limit} |
| `bnt.sysPost.list` | /sysPost/findAll |
| `bnt.sysPost.list` | /sysPost/get/{id} |
| `bnt.sysPost.list` | /sysPost/list/{page}/{limit} |
| `bnt.sysRole.list` | /sysRole/get/{id} |
| `bnt.sysRole.list` | /sysRole/list/{page}/{limit} |
| `bnt.sysUser.list` | /sysUser/findAll |
| `bnt.sysUser.list` | /sysUser/get/{id} |
| `bnt.sysUser.list` | /sysUser/list/{page}/{limit} |
| `bnt.sysUser.list` | /sysUser/superAdmins |
| `bnt.systemConfig.list` | /system/config/component/{component_tag} |
| `bnt.systemConfig.list` | /system/config/list/{page}/{limit} |
| `bnt.systemConfig.list` | /system/config/tags |
| `bnt.systemConfig.list` | /system/config/{config_key} |
| `bnt.tencentCos.list` | /tencentCos/config |
| `bnt.tencentCos.download` | /tencentCos/download/{backup_id} |
| `bnt.tencentCos.download` | /tencentCos/downloadByKey |
| `bnt.tencentCos.list` | /tencentCos/head |
| `bnt.tencentCos.list` | /tencentCos/list |
| `bnt.aiAnalysis.generate` | /admin/aiAnalysis/generate |
| `bnt.aiAnalysis.generate` | /admin/aiAnalysis/generate/stream |
| `bnt.aiAnalysis.sendEmail` | /admin/aiAnalysis/sendEmail |
| `bnt.aiDataAnalysis.export` | /admin/aiDataAnalysis/exportExcel |
| `bnt.aiDataAnalysis.export` | /admin/aiDataAnalysis/exportMd |
| `bnt.aiDataAnalysis.generate` | /admin/aiDataAnalysis/generate |
| `bnt.aiDataAnalysis.generate` | /admin/aiDataAnalysis/generate/stream |
| `bnt.aiDbAssistant.send` | /admin/aiDbAssistant/sendEmail |
| `bnt.aliyunOss.upload` | /admin/aliyunOss/upload/{backup_id} |
| `bnt.opsCollector.config` | /admin/config/save |
| `bnt.llmInvokeLog.list` | /admin/llmInvokeLog/list/{page}/{limit} |
| `bnt.llmModel.sync` | /admin/llmModel/sync |
| `bnt.aiLogAnalysis.generate` | /admin/logAnalysis/analyze |
| `bnt.aiLogAnalysis.generate` | /admin/logAnalysis/analyze/stream |
| `bnt.modelQuota.list` | /admin/modelQuota/list/{page}/{limit} |
| `bnt.modelQuota.add` | /admin/modelQuota/save |
| `bnt.opsAlarm.update` | /admin/opsAlarm/sendEmail/{id} |
| `bnt.opsBackupReplication.addOrupdate` | /admin/opsBackupReplication/save |
| `bnt.opsCredential.add` | /admin/opsCredential/save |
| `bnt.opsDatabase.add` | /admin/opsDatabase/save |
| `bnt.opsDatabase.sync` | /admin/opsDatabase/sync/{id} |
| `bnt.opsDatabaseAuth.add` | /admin/opsDatabaseAuth/save |
| `bnt.opsDatabaseAuth.updatePassword` | /admin/opsDatabaseAuth/sendCode/{id} |
| `bnt.opsDatabaseBackup.backup` | /admin/opsDatabaseBackup/backupNow |
| `bnt.opsDatabaseBackup.verify` | /admin/opsDatabaseBackup/verify/{id} |
| `bnt.opsDatabaseBackupPolicy.add` | /admin/opsDatabaseBackupPolicy/save |
| `bnt.opsDatabaseCheckConfig.saveOrupdate` | /admin/opsDatabaseCheckConfig/save |
| `bnt.opsDatabaseInspection.aiAnalysis` | /admin/opsDatabaseInspection/aiAnalysis/{record_id} |
| `bnt.opsDatabaseInspection.aiAnalysis` | /admin/opsDatabaseInspection/aiAnalysisStream/{record_id} |
| `bnt.opsDatabaseInspection.run` | /admin/opsDatabaseInspection/run/{database_id} |
| `bnt.opsDatabaseInspection.runBatch` | /admin/opsDatabaseInspection/runBatch |
| `bnt.opsDatabase.sync` | /admin/opsDatabaseTable/sync/{database_id} |
| `bnt.opsPatrolServiceConfig.add` | /admin/opsPatrolServiceConfig/save |
| `bnt.opsPatrolServiceConfig.scan` | /admin/opsPatrolServiceConfig/saveScanResult |
| `bnt.opsPatrolServiceConfig.scan` | /admin/opsPatrolServiceConfig/scanServer |
| `bnt.opsPatrolServiceConfig.add` | /admin/opsPatrolServiceConfig/sshDetect |
| `bnt.opsServer.add` | /admin/opsServer/save |
| `bnt.ragDocuments.upload` | /admin/rag/documents/upload |
| `bnt.sshExec.execute` | /admin/sshExec/execute |
| `bnt.sysAnnouncement.add` | /admin/sysAnnouncement/save |
| `bnt.sysDept.add` | /admin/sysDept/save |
| `bnt.sysRole.assignAuth` | /admin/sysMenu/doAssign |
| `bnt.sysMenu.add` | /admin/sysMenu/save |
| `bnt.sysPost.add` | /admin/sysPost/save |
| `bnt.sysRole.assignAuth` | /admin/sysRole/doAssign |
| `bnt.sysRole.add` | /admin/sysRole/save |
| `bnt.sysUser.edit.password` | /admin/sysUser/changeMyPassword |
| `bnt.sysUser.add` | /admin/sysUser/save |
| `bnt.sysUser.edit.password` | /admin/sysUser/sendPasswordCode |
| `bnt.systemConfig.update` | /admin/system/config/reload |
| `bnt.tencentCos.upload` | /admin/tencentCos/upload/{backup_id} |
| `bnt.opsCollector.trigger` | /admin/trigger |
| `bnt.opsCollector.triggerAll` | /admin/triggerAll |
| `bnt.aiAnalysis.generate` | /aiAnalysis/generate |
| `bnt.aiAnalysis.generate` | /aiAnalysis/generate/stream |
| `bnt.aiAnalysis.sendEmail` | /aiAnalysis/sendEmail |
| `bnt.aiDataAnalysis.export` | /aiDataAnalysis/exportExcel |
| `bnt.aiDataAnalysis.export` | /aiDataAnalysis/exportMd |
| `bnt.aiDataAnalysis.generate` | /aiDataAnalysis/generate |
| `bnt.aiDataAnalysis.generate` | /aiDataAnalysis/generate/stream |
| `bnt.aiDbAssistant.send` | /aiDbAssistant/sendEmail |
| `bnt.aliyunOss.upload` | /aliyunOss/upload/{backup_id} |
| `bnt.opsCollector.config` | /config/save |
| `bnt.llmInvokeLog.list` | /llmInvokeLog/list/{page}/{limit} |
| `bnt.llmModel.sync` | /llmModel/sync |
| `bnt.aiLogAnalysis.generate` | /logAnalysis/analyze |
| `bnt.aiLogAnalysis.generate` | /logAnalysis/analyze/stream |
| `bnt.modelQuota.list` | /modelQuota/list/{page}/{limit} |
| `bnt.modelQuota.add` | /modelQuota/save |
| `bnt.opsAlarm.update` | /opsAlarm/sendEmail/{id} |
| `bnt.opsBackupReplication.addOrupdate` | /opsBackupReplication/save |
| `bnt.opsCredential.add` | /opsCredential/save |
| `bnt.opsDatabase.add` | /opsDatabase/save |
| `bnt.opsDatabase.sync` | /opsDatabase/sync/{id} |
| `bnt.opsDatabaseAuth.add` | /opsDatabaseAuth/save |
| `bnt.opsDatabaseAuth.updatePassword` | /opsDatabaseAuth/sendCode/{id} |
| `bnt.opsDatabaseBackup.backup` | /opsDatabaseBackup/backupNow |
| `bnt.opsDatabaseBackup.verify` | /opsDatabaseBackup/verify/{id} |
| `bnt.opsDatabaseBackupPolicy.add` | /opsDatabaseBackupPolicy/save |
| `bnt.opsDatabaseCheckConfig.saveOrupdate` | /opsDatabaseCheckConfig/save |
| `bnt.opsDatabaseInspection.aiAnalysis` | /opsDatabaseInspection/aiAnalysis/{record_id} |
| `bnt.opsDatabaseInspection.aiAnalysis` | /opsDatabaseInspection/aiAnalysisStream/{record_id} |
| `bnt.opsDatabaseInspection.run` | /opsDatabaseInspection/run/{database_id} |
| `bnt.opsDatabaseInspection.runBatch` | /opsDatabaseInspection/runBatch |
| `bnt.opsDatabase.sync` | /opsDatabaseTable/sync/{database_id} |
| `bnt.opsPatrolServiceConfig.add` | /opsPatrolServiceConfig/save |
| `bnt.opsPatrolServiceConfig.scan` | /opsPatrolServiceConfig/saveScanResult |
| `bnt.opsPatrolServiceConfig.scan` | /opsPatrolServiceConfig/scanServer |
| `bnt.opsPatrolServiceConfig.add` | /opsPatrolServiceConfig/sshDetect |
| `bnt.opsServer.add` | /opsServer/save |
| `bnt.ragDocuments.upload` | /rag/documents/upload |
| `bnt.sshExec.execute` | /sshExec/execute |
| `bnt.sysAnnouncement.add` | /sysAnnouncement/save |
| `bnt.sysDept.add` | /sysDept/save |
| `bnt.sysRole.assignAuth` | /sysMenu/doAssign |
| `bnt.sysMenu.add` | /sysMenu/save |
| `bnt.sysPost.add` | /sysPost/save |
| `bnt.sysRole.assignAuth` | /sysRole/doAssign |
| `bnt.sysRole.add` | /sysRole/save |
| `bnt.sysUser.edit.password` | /sysUser/changeMyPassword |
| `bnt.sysUser.add` | /sysUser/save |
| `bnt.sysUser.edit.password` | /sysUser/sendPasswordCode |
| `bnt.systemConfig.update` | /system/config/reload |
| `bnt.tencentCos.upload` | /tencentCos/upload/{backup_id} |
| `bnt.opsCollector.trigger` | /trigger |
| `bnt.opsCollector.triggerAll` | /triggerAll |
| `bnt.modelQuota.update` | /admin/modelQuota/update |
| `bnt.opsCredential.update` | /admin/opsCredential/update |
| `bnt.opsDatabase.update` | /admin/opsDatabase/update |
| `bnt.opsDatabaseAuth.update` | /admin/opsDatabaseAuth/update |
| `bnt.opsDatabaseAuth.updatePassword` | /admin/opsDatabaseAuth/updatePassword |
| `bnt.opsPatrolServiceConfig.update` | /admin/opsPatrolServiceConfig/update |
| `bnt.opsServer.update` | /admin/opsServer/update |
| `bnt.sysAnnouncement.update` | /admin/sysAnnouncement/update |
| `bnt.sysDept.update` | /admin/sysDept/update |
| `bnt.sysDept.update` | /admin/sysDept/updateStatus/{id}/{status} |
| `bnt.sysMenu.update` | /admin/sysMenu/update |
| `bnt.sysPost.update` | /admin/sysPost/update |
| `bnt.sysPost.update` | /admin/sysPost/updateStatus/{id}/{status} |
| `bnt.sysRole.update` | /admin/sysRole/update |
| `bnt.sysUser.ban` | /admin/sysUser/ban |
| `bnt.sysUser.ban` | /admin/sysUser/batchBan |
| `bnt.sysUser.ban` | /admin/sysUser/lock/{id} |
| `bnt.sysUser.ban` | /admin/sysUser/unban |
| `bnt.sysUser.ban` | /admin/sysUser/unlock/{id} |
| `bnt.sysUser.update` | /admin/sysUser/update |
| `bnt.sysUser.edit.password` | /admin/sysUser/updatePassword/{id}/{password} |
| `bnt.systemConfig.update` | /admin/system/config |
| `bnt.systemConfig.update` | /admin/system/config/batch |
| `bnt.modelQuota.update` | /modelQuota/update |
| `bnt.opsCredential.update` | /opsCredential/update |
| `bnt.opsDatabase.update` | /opsDatabase/update |
| `bnt.opsDatabaseAuth.update` | /opsDatabaseAuth/update |
| `bnt.opsDatabaseAuth.updatePassword` | /opsDatabaseAuth/updatePassword |
| `bnt.opsPatrolServiceConfig.update` | /opsPatrolServiceConfig/update |
| `bnt.opsServer.update` | /opsServer/update |
| `bnt.sysAnnouncement.update` | /sysAnnouncement/update |
| `bnt.sysDept.update` | /sysDept/update |
| `bnt.sysDept.update` | /sysDept/updateStatus/{id}/{status} |
| `bnt.sysMenu.update` | /sysMenu/update |
| `bnt.sysPost.update` | /sysPost/update |
| `bnt.sysPost.update` | /sysPost/updateStatus/{id}/{status} |
| `bnt.sysRole.update` | /sysRole/update |
| `bnt.sysUser.ban` | /sysUser/ban |
| `bnt.sysUser.ban` | /sysUser/batchBan |
| `bnt.sysUser.ban` | /sysUser/lock/{id} |
| `bnt.sysUser.ban` | /sysUser/unban |
| `bnt.sysUser.ban` | /sysUser/unlock/{id} |
| `bnt.sysUser.update` | /sysUser/update |
| `bnt.sysUser.edit.password` | /sysUser/updatePassword/{id}/{password} |
| `bnt.systemConfig.update` | /system/config |
| `bnt.systemConfig.update` | /system/config/batch |
