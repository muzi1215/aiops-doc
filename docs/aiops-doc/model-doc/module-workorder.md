# 工单管理模块文档（WorkOrder）

> **代码行数**: ~800 | **文件数**: 10 | **最后更新**: 2026-08-08 | **状态**: 已上线

---

## 一、模块定位

工单是运维处置的**跟踪载体**：告警触发 → 自动建单 → 处理人处置 → 审核 → 联动告警闭环。解决"告警产生了没人管、不知道谁处理、超没超时"的问题。

```
告警产生（opscenter）
  → 自动创建工单（独立事务）
  → WS 定向推送处理人（红点）+ 飞书@/邮件（notification）
  → 处理人处理 → 提交审核 → 审核通过 → 联动告警置为已处理（★闭环）
  → 超期未处理 → 定时任务置为超时 → 催办通知
```

---

## 二、数据模型（work_order）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | VARCHAR(64) PK | UUID |
| work_order_no | VARCHAR(64) UK | 工单编号（时间戳生成，如 4320260808906197） |
| handler_id | VARCHAR(100) | 处理人（=服务器负责人 leader_id） |
| reviewer_id | VARCHAR(64) | 审核人（=处理人所属部门的负责人） |
| deadline_time | TIMESTAMP | 截止时间（按优先级 SLA 生成） |
| source_id / source_type | VARCHAR | 来源（如 告警ID + "alarm"） |
| priority | INT | 1-紧急 2-高 3-中 4-低 |
| status | INT | 1-待处理 2-待审核 3-超时 4-审核不通过 |
| handle_time / review_time / timeout_time | TIMESTAMP | 各阶段时间点 |
| handle_opinion / review_opinion | VARCHAR(500) | 处理意见/审核意见 |
| create_by | VARCHAR | 创建人（告警自动创建 = system） |

索引：`idx_deadline`(deadline_time)、`idx_status`、`idx_handler`、`idx_reviewer`、`idx_alert_id`(source_id)。

**状态流转图**：

```
                超期 → 3 超时（定时任务每分钟检查）
1 待处理 ──处理──→ 2 待审核 ──通过──→ 完成（联动告警已处理）
    │                │
    │                └──不通过──→ 4 审核不通过 ──重新处理──→ 2 待审核
    └──── 超期 ────→ 3 超时
```

---

## 三、核心流程

### 3.1 告警自动创建工单（work_order_api.create_work_order）

```
create_alarm（alarm_service）
  → create_work_order(source_id=告警ID, source_type="alarm", priority=告警级别,
                      handler_id=服务器负责人, description=告警详情)
      → generate_deadline()     按优先级映射 SLA：紧急2h / 高8h / 中24h / 低72h
      → get_dept_leader_id_by_user_id()   审核人 = 处理人所属部门负责人
      → add_work_order_record() 写"CREATE"流转记录（时间线）
      → work_order_ws_manager.push_to_user()  WS 定向推送处理人
      → dispatch_work_order_created()        飞书@处理人 + 邮件通知
```

**★ 独立事务设计（2026-08-08 优化）**：工单使用独立 `AsyncSessionLocal` 会话提交，不再挂在巡检长事务内——原因：巡检事务（分钟级 SSH 采集）内创建工单会持有 work_order 行锁直到巡检结束，导致工单超时任务每分钟 UPDATE 全部 `Lock wait timeout (1205)`。独立提交后锁立即释放；且工单创建更可靠（巡检失败工单仍在，来源信息完整）。

### 3.2 处理与审核（work_order_service）

```
handle_work_order（处理人提交）
  → 校验 handler_id 与当前用户匹配
  → 写处理意见 → status: 1 → 2（待审核）
  → 写"HANDLE"流转记录 → WS 推审核人 → 通知待审核

review_work_order（审核人审核）
  → 通过：status → 完成；★ 联动告警：source_type="alarm" → 对应告警 status=1（已处理）
  → 不通过：status → 4（审核不通过），处理人可重新处理
  → 写"REVIEW"流转记录 → WS/通知处理人
```

**★ 工单-告警联动规则**：**只有审核通过才把告警置为已处理**；处理中/超时/不通过都不动告警——保证告警状态真实反映"故障是否被解决"。

### 3.3 超时流转（定时任务 mark_work_orders_timeout）

```
每分钟触发
  → 查询 deadline_time < now AND status IN (1, 4) 的超期工单
  → UPDATE 置为 status=3（超时）+ timeout_time
  → 写"TIMEOUT"流转记录 → WS 推处理人 → dispatch_work_order_timeout（飞书@+邮件催办）
```

**★ 锁冲突重试（2026-08-08 优化）**：捕获 `OperationalError`（Lock wait timeout / Deadlock），重试 3 次（间隔 5s/15s/30s）自愈——与巡检长事务并发时不会一次失败就整体异常。

### 3.4 流转记录（work_order_record）

每次状态变更（CREATE/HANDLE/REVIEW/TIMEOUT/UPDATE）写一条记录：操作人/原状态/新状态/变更内容——完整时间线，可审计。

---

## 四、接口清单（/admin/workOrder）

| 接口 | 说明 |
|---|---|
| list/{page}/{limit} | 工单分页（按状态/优先级/处理人/时间筛选） |
| get/{id} | 工单详情 + 流转记录 |
| create | 手动建单 |
| handle | 处理（填写意见 → 待审核） |
| review | 审核（通过联动告警 / 不通过退回） |
| update | 信息调整（写流转记录 + 通知） |
| remove | 删除（软删） |
| stats | 待办统计（Dashboard 用） |

---

## 五、跨模块调用

| 调用 | 方向 | 用途 |
|---|---|---|
| work_order_api.create_work_order | opscenter 告警 → 工单 | 告警自动建单（独立事务） |
| work_order_stats_api | statistics → 工单 | Dashboard 待办/总量统计 |
| auth user_query_api | 工单 → auth | 部门负责人查询 |
| notification dispatcher | 工单 → 通知 | 6 种工单状态通知（飞书@/邮件） |
| work_order_ws | 工单内部 | WS 定向推送处理人/审核人 |

---

## 六、通知矩阵（工单 6 类，统一场景配置 notification.scene.work_order）

| 通知类型 | 触发 | 飞书@ | 邮件 |
|---|---|---|---|
| work_order_created | 建单 | @处理人 | ✅ |
| work_order_pending_review | 提交审核 | @审核人 | ✅ |
| work_order_timeout | 超时流转 | @处理人 | ✅ |
| work_order_rejected | 审核不通过 | @处理人 | ✅ |
| work_order_completed | 审核通过 | @处理人 | ✅ |
| work_order_updated | 信息调整 | @处理人 | ✅ |

---

## 七、要点

1. **闭环设计**：告警→工单→SLA→审核→联动处理，超时自动催办——"发现到处置到验证"完整闭环
2. **只有审核通过才联动告警已处理**：告警状态真实反映故障解决情况
3. **独立事务**：解决巡检长事务的锁冲突（1205）
4. **SLA 优先级映射**：紧急 2h / 高 8h / 中 24h / 低 72h
5. **全链路通知**：WS 红点 + 飞书@ + 邮件三通道
