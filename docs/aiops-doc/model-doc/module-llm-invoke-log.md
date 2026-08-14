# 大模型调用记录 + 模型限额模块文档（LLM Invoke Log & Quota）

> **代码行数**: 1058（后端核心 8 文件）| **文件数**: 8 后端 + 3 前端 | **最后更新**: 2026-08-05

---

## 一、全景架构图

```
业务调用方（6 个业务场景，调用时传 scene + user_id + username）
  │
  │  ① 请求入口限额检查（在业务操作之前拦截，不做向量检索/表结构查询等浪费）
  │  ② llm_client 三方法内兜底检查（防新增调用点绕过）
  ▼
llm_client.py（aiops/ai/core/ — ★ 唯一 LLM 出口，所有大模型调用必经）
  ├── asyncio_ainvoke(prompt, scene, user_id, username)      非流式
  ├── asyncio_astream(prompt, scene, user_id, username)      流式（SSE，末尾 yield __meta__ 携带 token）
  └── ainvoke_structured(prompt, response_model, ...)        结构化 JSON 输出
      │
      │  入口: await check_llm_quota(user_id)   ← 超限抛 BusinessException(5001) 拒绝
      │  出口: await record_llm_invoke(...)     ← 独立会话写库，写失败仅告警不影响主流程
      ▼
llm_invoke_recorder.py（aiops/ai/service/llm_invoke_log/）
  ├── check_llm_quota(user_id)         限额检查（严格模式 + 角色共享额度）
  ├── record_llm_invoke(...)           调用记录写入
  ├── query_llm_invoke_log_page(...)   调用记录分页（管理页面）
  └── model_quota CRUD                 限额配置管理（add/update/delete/page）
      │
      │  跨模块角色查询（★ 必须走 auth 的 api/ 子包，禁止直接引 SysRole 模型）
      ▼
role_query_api.py（aiops/auth/service/sys_role/api/）
  ├── query_all_roles(db)               角色下拉（限额配置用）
  ├── query_role_ids_by_user_id(db, uid) 用户关联的角色ID（检查用）
  └── query_users_by_role_ids(db, ids)  角色成员列表（共享额度统计用）
      ▼
MySQL
  ├── llm_invoke_log  大模型调用记录表（模型/耗时/调用者/场景/Token/成败）
  └── model_quota     模型限额表（role_id 唯一，分配总次数）
      ▼
前端（aiops-platform-ui）
  ├── views/ai/llmInvokeLog/list.vue  调用记录页（筛选 + 分页表格）
  ├── views/ai/modelQuota/list.vue    模型限额页（角色配置 CRUD）
  └── api/ai/llmInvokeLog.ts          API 封装
```

---

## 二、完整调用链（从用户提问到拦截/记录）

### 2.1 Step 0：数据表与配置

建表与菜单脚本：`docs/sql/llm_invoke_log_quota.sql`（可重复执行）。

```sql
-- llm_invoke_log：每次调用一条记录
CREATE TABLE llm_invoke_log (
  id varchar(64) PRIMARY KEY,
  model_name varchar(64),        -- 大模型名称（如 deepseek-v4-flash）
  provider varchar(20),          -- 提供商（openai/deepseek/ollama）
  scene varchar(50),             -- 业务场景（见第四章矩阵）
  user_id varchar(64),           -- 调用者（后台任务为空）
  username varchar(64),
  duration_ms int,               -- 耗时（毫秒）
  prompt_tokens int,             -- 输入 Token
  completion_tokens int,         -- 输出 Token
  total_tokens int,              -- 总 Token
  success tinyint(1),            -- 0失败 1成功
  error_msg varchar(500),        -- 失败原因
  create_time timestamp, is_deleted tinyint(1),
  KEY idx_user_id, KEY idx_scene, KEY idx_create_time
);

-- model_quota：一个角色一条限额配置
CREATE TABLE model_quota (
  id varchar(64) PRIMARY KEY,
  role_id varchar(64) UNIQUE,    -- 角色ID（唯一）
  role_name varchar(64),         -- 角色名称（冗余展示）
  quota_count int,               -- 分配的大模型调用总次数
  remark varchar(255),
  create_time/update_time/is_deleted
);
```

菜单：挂在「AI管理」下新增「大模型调用记录」「模型限额」两个菜单 + 按钮权限（`bnt.llmInvokeLog.list` / `bnt.modelQuota.*`）。

### 2.2 Step 1：调用方传参（6 个业务场景）

调用方在调用 `llm_client` 时**必须**传 `scene`（业务场景）+ `user_id`/`username`（当前用户），并先在请求入口做限额检查：

```python
# rag_router.py:181  rag_chat_stream 的 generate() 开头
user_id = current_user.get("user_id", "")
username = current_user.get("username", "")
# 请求入口先做限额检查，无额度直接拦截（不做向量检索，避免浪费资源）
await check_llm_quota(user_id)          # ← 拦截点在 _hybrid_search 之前
sources_data = []
...
async for chunk in llm_client.asyncio_astream(
    prompt, scene=SCENE_RAG_CHAT, user_id=user_id, username=username
):
```

| 场景常量 | scene 值 | 业务场景 | 入口检查位置 |
|---------|----------|---------|-------------|
| `SCENE_ANALYSIS` | analysis | AI 智能分析 | `analysis_service` 两个函数入口 |
| `SCENE_LOG_ANALYSIS` | log_analysis | AI 日志分析 | `log_analysis_service` 两个函数入口 |
| `SCENE_RAG_CHAT` | rag_chat | 知识库问答（流式/非流式） | `rag_router` 两个端点入口（检索之前） |
| `SCENE_RAG_STRUCTURED` | rag_structured | 知识库结构化问答（非 RAG 直聊） | `rag_router.rag_chat` 入口 |
| `SCENE_DB_ASSISTANT` | db_assistant | 数据库助手 | `db_assistant_service.assistant_chat` 入口（SSH 表结构查询之前） |
| `SCENE_DB_INSPECTION` | db_inspection | 数据库巡检 AI 分析 | `ops_database_inspection_service` 两个函数入口 |

### 2.3 Step 2：限额检查（拦截）— check_llm_quota

```python
# llm_invoke_recorder.py:107  check_llm_quota()
async def check_llm_quota(user_id: str) -> None:
    if not user_id:
        raise BusinessException(code=5001, msg="未配置大模型调用额度，无法调用")
    try:
        async with AsyncSessionLocal() as session:
            # ① 查用户关联的角色（跨模块：auth api/ 子包）
            role_ids = await query_role_ids_by_user_id(session, user_id)
            if not role_ids:
                raise BusinessException(5001, "未配置大模型调用额度，请联系管理员分配")

            # ② 查这些角色的限额配置
            quotas = (await session.execute(
                select(ModelQuota).where(
                    and_(ModelQuota.role_id.in_(role_ids), ModelQuota.is_deleted == 0)
                )
            )).scalars().all()
            if not quotas:
                raise BusinessException(5001, "未配置大模型调用额度，请联系管理员分配")

            # ③ ★ 角色共享额度：统计每个已配置角色下【所有成员】的成功调用数
            users_map = await query_users_by_role_ids(session, [q.role_id for q in quotas])
            max_remain = -1
            for q in quotas:
                used = await _count_success_invokes(session, users_map.get(q.role_id, []))
                remain = q.quota_count - used
                if remain > max_remain:
                    max_remain = remain
            # ④ 所有角色剩余额度 <= 0 → 拒绝
            if max_remain <= 0:
                raise BusinessException(5001, "大模型调用次数已用完，请联系管理员调整额度")
    except BusinessException:
        raise
    except Exception:
        # ⑤ 检查自身异常 → 保守拒绝，绝不放开
        raise BusinessException(5001, "额度检查失败，暂时无法调用大模型，请稍后再试")
```

**★ 角色共享额度口径**（与限额管理页面「已用次数」完全一致）：
- 已用次数 = **该角色下所有成员**的成功调用数（不是当前用户个人）
- 角色内任一成员调用都会消耗共享额度 —— 额度 N 次 = 整个角色一共能用 N 次
- 多角色均配置限额时，取**剩余额度最大**的角色判断

### 2.4 Step 3：LLM 调用与埋点（llm_client 三方法）

```python
# llm_client.py:192  asyncio_ainvoke（非流式）
async def asyncio_ainvoke(self, prompt, *, scene="", user_id="", username=""):
    start_time = time.perf_counter()          # ① 计时开始
    await check_llm_quota(user_id)            # ② 兜底限额检查（防新增调用点绕过）
    ...
    try:
        response = await asyncio.to_thread(llm.invoke, prompt)
        raw_info = extract_raw_info(response) if isinstance(response, AIMessage) else {}
        # ③ 提取模型名 + Token（response_metadata / usage_metadata 双通道）
        model_name, tokens = self._extract_invoke_info(llm, raw_info.get("usage_metadata", {}), raw_info)
        return response
    except Exception as e:
        success, error_msg = False, str(e)
        raise
    finally:
        # ④ 出口：无论成败都写记录（独立会话，失败仅告警）
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        await record_llm_invoke(
            model_name=model_name, provider=self.provider, scene=scene,
            user_id=user_id, username=username, duration_ms=duration_ms,
            prompt_tokens=tokens["prompt_tokens"],
            completion_tokens=tokens["completion_tokens"],
            total_tokens=tokens["total_tokens"],
            success=success, error_msg=error_msg,
        )
```

**Token/模型名提取（`_extract_invoke_info`）**：
```
AIMessage.response_metadata.model      ← 非流式（OpenAI/DeepSeek 返回）
AIMessage.usage_metadata.input/output  ← 非流式
流式末尾 chunk.usage_metadata          ← 流式（llm.astream 每个 chunk 携带，取最后一个）
兜底: llm.model_name / llm.model       ← 上述都没有时
```

### 2.5 Step 4：记录写入 — record_llm_invoke

```python
# llm_invoke_recorder.py:48  record_llm_invoke()
async def record_llm_invoke(*, model_name, provider, scene, user_id, username,
                            duration_ms, prompt_tokens, completion_tokens,
                            total_tokens, success, error_msg=""):
    try:
        async with AsyncSessionLocal() as session:   # ★ 独立会话，不依赖调用方的 db
            session.add(LlmInvokeLog(id=generate_secure_numeric_id(), ...))
            await session.commit()
    except Exception:
        log.warning("[大模型调用记录] 写入调用记录失败: ...")   # ★ 写失败不影响主流程
```

**设计要点**：
- 独立 `AsyncSessionLocal` 会话 —— 与调用方的事务完全隔离，即使调用方 db 会话已提交/回滚，记录也能独立写入
- 写入失败只打 `warning` 日志 —— 绝不影响用户的大模型调用

### 2.6 Step 5：流式场景的特殊处理

```python
# llm_client.py:221  asyncio_astream（流式生成器）
async def asyncio_astream(self, prompt, *, scene="", user_id="", username=""):
    start_time = time.perf_counter()
    await check_llm_quota(user_id)                # 首次迭代时执行（SSE 开始前）
    llm = self.get_llm()
    last_usage = {}
    try:
        async for chunk in llm.astream(prompt):
            if hasattr(chunk, 'usage_metadata') and chunk.usage_metadata:
                last_usage = dict(chunk.usage_metadata)   # 累积最后一块的 token
            yield chunk.content
    except Exception as e:
        success, error_msg = False, str(e)
        raise
    finally:
        model_name, tokens = self._extract_invoke_info(llm, last_usage, {})
        await record_llm_invoke(...)              # 流结束/中断/异常都会执行
    if last_usage:
        yield {"__meta__": last_usage}            # 末尾把 token 元数据交给调用方
```

- **Token**：流式 Token 在流末尾的 `__meta__` 里，service 层据此回显 tokenUsage
- **记录时机**：`finally` 保证 —— 正常走完、SSE 中断、异常，三种情况都会写记录
- **业务拒绝转 SSE**：流式接口捕获 `BusinessException` 后输出 `data: {"error": "..."}` + `[DONE]`，前端可直接弹窗（rag_router / analysis_router / log_analysis_router / ops_database_inspection 均已处理）

### 2.7 Step 6：前端展示

**调用记录页**（`views/ai/llmInvokeLog/list.vue`）：筛选（模型/场景/用户/成败/时间范围）+ 分页表格，列：模型名称、业务场景（tag）、调用者、耗时、输入/输出/总 Token（tok）、状态（失败悬停看原因）、调用时间。

**模型限额页**（`views/ai/modelQuota/list.vue`）：按角色配置次数，实时展示已用/分配/剩余（剩余 ≤ 0 红色），新增时角色下拉可搜索且已配置角色禁用。

后端返回统一驼峰（`modelName/durationMs/promptTokens/...`，`to_camel` 转换），与前端 prop 严格对应。

---

## 三、限额拦截规则（★ 严格模式）

**只有配置了额度且角色剩余额度 > 0 的调用才放行，其余一律拒绝：**

| 场景 | 处理 |
|------|------|
| user_id 为空（后台任务） | ❌ 拒绝（未配置大模型调用额度，无法调用） |
| 用户关联角色均未配置限额 | ❌ 拒绝（未配置大模型调用额度，请联系管理员分配） |
| 已用次数 ≥ 分配次数（角色共享口径） | ❌ 拒绝（大模型调用次数已用完，请联系管理员调整额度） |
| 多角色均配置限额 | ✅ 取剩余额度最大的角色判断 |
| 限额检查自身异常 | ❌ 保守拒绝（额度检查失败...），绝不放开 |
| 配置了额度且剩余 > 0 | ✅ 放行并记录 |

**三层防线**：

```
第一层 — 请求入口检查：各 service/router 在业务操作之前 check_llm_quota
   RAG 问答在向量检索之前拦截（不浪费 Ollama embedding）
   DB 助手在 SSH 表结构查询之前拦截
   数据库巡检在巡检记录读取之前拦截

第二层 — llm_client 兜底：三方法内部再次 check_llm_quota
   即使未来新增调用点忘记入口检查，也绕不过这一层

第三层 — 保守拒绝：检查过程自身异常时拒绝调用
   宁可让用户暂时无法调用，也不放开额度限制
```

---

## 四、业务场景 × 调用点矩阵

| scene | 业务场景 | 非流式调用点 | 流式调用点 | 前端入口 |
|-------|---------|-------------|-----------|---------|
| analysis | AI 智能分析 | `analysis_service.generate_analysis_report` | `generate_analysis_report_stream` | views/ai/analysis |
| log_analysis | AI 日志分析 | `log_analysis_service.analyze_log` | `analyze_log_stream` | views/ai/logAnalysis |
| rag_chat | 知识库问答 | `rag_service.search_and_answer` | `rag_router.rag_chat_stream` | views/ai/rag/chat |
| rag_structured | 知识库结构化问答 | `rag_router.rag_chat`（非 RAG 模式） | — | views/ai/rag/chat |
| db_assistant | 数据库助手 | — | `db_assistant_service.assistant_chat` | views/dbconter/aiAssistant |
| db_inspection | 数据库巡检 AI 分析 | `ops_database_inspection_service.run_ai_analysis_for_record` | `run_ai_analysis_stream` | views/dbcenter/opsDatabaseCheck |

---

## 五、关键文件速查

| 文件 | 改动触发 |
|------|---------|
| `aiops/ai/core/llm_client.py` | 埋点核心：三方法加 scene/user_id/username 参数；新增调用方式时同步埋点 |
| `aiops/ai/service/llm_invoke_log/llm_invoke_recorder.py` | 新增业务场景：加 `SCENE_*` 常量；改限额规则：改 `check_llm_quota` |
| `aiops/ai/model/llm_invoke_log.py` | 记录表字段变更（含 DDL 注释） |
| `aiops/ai/model/model_quota.py` | 限额表字段变更（含 DDL 注释） |
| `aiops/ai/schemas/llm_invoke_log.py` | 记录/限额请求参数（★ 继承 BaseVO，蛇形字段自动驼峰） |
| `aiops/ai/router/llm_invoke_log_router.py` | 记录分页 / 限额 CRUD / 角色下拉接口 |
| `aiops/auth/service/sys_role/api/role_query_api.py` | 跨模块角色查询（新增角色相关查询加这里） |
| `docs/sql/llm_invoke_log_quota.sql` | 建表 + 菜单脚本（可重复执行） |
| `aiops-platform-ui/src/views/ai/llmInvokeLog/list.vue` | 调用记录页 |
| `aiops-platform-ui/src/views/ai/modelQuota/list.vue` | 模型限额页 |
| `aiops-platform-ui/src/api/ai/llmInvokeLog.ts` | 前端 API 封装 |

---

## 六、新增一个 LLM 调用场景（完整步骤）

以新增「工单智能回复」为例：

1. **加场景常量**：`llm_invoke_recorder.py` 加 `SCENE_WORK_ORDER_REPLY = "work_order_reply"`
2. **调用点传参**：调用 `llm_client.asyncio_ainvoke(prompt, scene=SCENE_WORK_ORDER_REPLY, user_id=user_id, username=username)`
3. **入口拦截**：在 service/router 业务操作**之前** `await check_llm_quota(user_id)`（不要在 LLM 调用时才检查）
4. **流式场景**：`except BusinessException` 转 SSE `{"error": msg}` + `[DONE]`，并打 `log.error`（带 user_id/msg）
5. **前端记录页**：`llmInvokeLog/list.vue` 的 `sceneMap` 加中文映射
6. **文档**：同步本文档第四章矩阵 + CLAUDE.md 场景清单

**维护红线**：
- 禁止绕过 `llm_client` 三方法直接调用底层 LLM（会漏记录、漏拦截）
- 禁止把限额检查放在 LLM 调用时刻（入口就要检查，避免浪费检索/查询资源）
- 业务拒绝（BusinessException）必须打日志（`log.error`，不要用 `log.exception` 刷栈）
- 查询响应字段驼峰（`_to_camel_dict`），前端 prop 用驼峰

---

## 七、常见问题排查

**Q1：配置了额度，调用时却没有拦截？**
- 检查用户关联的角色是否就是这个角色（`sys_user_role` 表）—— 限额按角色生效
- 检查已用次数是否真的没到额度 —— 已用 = **角色下所有成员**成功调用数，成员多时额度消耗快
- 检查后端是否已重启加载新代码（uvicorn --reload 会自动重载）

**Q2：限额页面显示剩余 0，但还能调用？**
- 此问题已在 2026-08-05 修复：原实现按「个人已用」检查，页面按「角色已用」展示，口径不一致；现统一为角色共享额度，页面显示与拦截行为完全一致

**Q3：调用记录里模型名称/Token 为空？**
- 数据实际已写入，是前端 prop 与后端字段不匹配导致显示空 —— 后端已统一驼峰输出（modelName/durationMs/promptTokens），确认部署的是最新代码

**Q4：流式接口报错但没有具体提示？**
- 后端 `log.error`/`log.exception` 会带 user_id 与错误信息；前端 `[ERROR]` 分支会 `console.error` 并弹窗显示具体原因
