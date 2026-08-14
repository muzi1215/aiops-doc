# 智能机器人扩展模块文档（Robot）

> **最后更新**: 2026-08-07

---

## 一、模块定位

为「群聊 @机器人 回答问题」预留的统一扩展框架。当前为**骨架阶段**：抽象层（消息模型 / 适配器基类 / 注册表）已就绪，各平台适配器为占位实现，待接入具体平台的 Webhook 回调即可启用。

**目标能力（后续实现）**：在飞书/钉钉/企业微信群中 @机器人 → 机器人调 AI（LLM + 知识库）回答运维问题（巡检状态 / 告警查询 / 知识库问答 / 工单咨询）。

## 二、架构

```
各平台群消息（@机器人）
  │  Webhook 回调（平台开放平台 → 后端回调路由）
  ▼
后端回调路由（待实现，如 POST /api/robot/{platform}/callback）
  │  校验签名 → 构造原始 payload
  ▼
robot_manager.handle_incoming(platform=..., raw_payload=...)
  │  ① 按平台取适配器（register 注册的）
  │  ② 适配器 parse_message → RobotMessage（统一消息模型）
  │  ③ 适配器 is_at_me → 判断是否 @ 机器人
  │  ④ 适配器 handle_message → 走 AI 问答（llm_client，scene=robot_qa）
  │  ⑤ 适配器 send_reply → 回复群聊
  ▼
平台 API / Webhook 发送回复
```

## 三、文件结构

| 文件 | 说明 |
|------|------|
| `aiops/robot/base.py` | `RobotMessage`（平台无关消息模型）+ `RobotAdapter`（抽象基类，含通用 `ai_answer` AI 问答入口） |
| `aiops/robot/manager.py` | `RobotManager` 注册表 + 统一入口 `handle_incoming` |
| `aiops/robot/adapters/feishu_robot.py` | 飞书适配器骨架（parse_message/is_at_me/handle_message 已实现，send_reply 待接入） |
| `aiops/robot/adapters/dingtalk_robot.py` | 钉钉适配器骨架 |
| `aiops/robot/adapters/wecom_robot.py` | 企微适配器骨架 |

## 四、接入步骤（以飞书为例）

1. **平台侧**：飞书开放平台创建机器人，配置事件订阅（`im.message.receive_v1`）
2. **后端回调路由**（新增 `aiops/robot/router.py`）：
   ```python
   @router.post("/robot/feishu/callback")
   async def feishu_callback(request: Request):
       payload = await request.json()
       reply = await robot_manager.handle_incoming(platform="feishu", raw_payload=payload)
       return {"code": 0}   # 飞书要求快速应答
   ```
3. **发送回复**：实现 `FeishuRobot.send_reply`（调飞书 im 消息发送 API，或复用 `notification/feishu/feishu_send.py` 的发送能力）
4. **注册**（main.py lifespan）：
   ```python
   from aiops.robot.adapters import FeishuRobot
   robot_manager.register(FeishuRobot())
   ```

## 五、AI 问答约定

- 所有问答**必须走 `llm_client`**（`ai_answer` 已封装），带 `scene="robot_qa"` 埋点（调用记录/限额自动生效）
- 后续扩展知识库问答：在适配器 `handle_message` 中先走 RAG 检索（`rag_service.search_and_answer`）再拼 prompt
- 群场景无用户上下文时 `user_id` 可传空（限额检查会拒绝空 user_id —— 若需群机器人免限额，需在限额检查中为 robot 场景单独放行或为机器人账号配置额度）

## 六、维护约定

- 新增平台：新建 `adapters/xxx_robot.py` 实现 `RobotAdapter` 三个抽象方法，注册到 `adapters/__init__.py`
- 新增问答能力：在适配器 `handle_message` 中扩展分支（关键词路由：查状态/查告警/知识库问答）
