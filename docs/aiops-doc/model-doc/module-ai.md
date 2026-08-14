# AI 智能模块文档（ai）

> **代码行数**: ~5000 | **文件数**: 30 | **最后更新**: 2026-08-08

---

## 一、模块定位

把大模型能力注入运维：**巡检分析报告、日志分析、RAG 知识库问答、自然语言查数据库**。通过统一 LLM 客户端（埋点+限额）、混合检索（向量+BM25+RRF+Reranker）、数据提供层（api/ 子包聚合）实现"分析 → 沉淀 → 可检索"闭环。

```
aiops/ai/
├── core/        LLM/RAG/Reranker/Vector 客户端（单例）
├── data/        ★ 数据提供层（调外部模块 api/ 聚合数据）
├── model/       rag_document/rag_chunk/llm_invoke_log/model_quota/llm_model
├── router/      rag/analysis/log_analysis/db_assistant/llm_invoke_log/llm_model
├── service/     分析编排 + llm_invoke_log（埋点+限额）+ llm_model_service
└── util/        detail_parsers/format_utils/table_context_builder/llm_model_fetcher
```

---

## 二、统一 LLM 客户端（core/llm_client.py）

**单例 + 模型热重建**：`get_llm()` 每次调用对比配置中心 `llm.provider`/`llm.model`，变化即重建实例——**配置中心切换模型零重启生效**。支持 ollama（ChatOllama）/ deepseek/openai（ChatOpenAI）。

**三大方法统一埋点**（每个方法：先 `check_llm_quota` 限额 → 调用 → finally `record_llm_invoke` 埋点）：

| 方法 | 用途 | 关键点 |
|---|---|---|
| `asyncio_ainvoke` | 普通调用 | `asyncio.to_thread` 包同步 invoke，不阻塞事件循环 |
| `asyncio_astream` | 流式（SSE） | 逐 chunk yield 文本；**末尾额外 yield `{"__meta__": usage}`** 携带 token 用量 |
| `ainvoke_structured` | 结构化输出 | JsonOutputParser + Pydantic 强校验，失败记录 error_msg |

**埋点**（llm_invoke_log 表）：model_name/provider/**scene 场景常量**/user_id/duration_ms/prompt+completion tokens/success/error_msg——**独立 AsyncSessionLocal 会话**，写失败只记日志不影响主流程。

**限额**（model_quota 表，按角色）：已用次数 = 该角色下所有用户成功调用数（`query_users_by_role_ids`）→ 多角色取剩余最大 → 全 ≤0 抛业务异常；检查异常**保守拒绝**。

---

## 三、RAG 混合检索流水线（核心亮点）

```
用户问题
  → 向量检索 Top-20（ChromaDB + Embedding，threshold 0.7 过滤）
  + BM25 关键词 Top-20（rank_bm25 + jieba 分词，启动时从 MySQL rag_chunks 重建）
  → RRF 融合：md5(content) 去重，1/(k_rrf=60 + rank + 1) 加权排序
  → BGE-Reranker 精排 Top-5（FlagReranker use_fp16，只在候选上跑省算力）
  → 邻居 chunk 扩展 ±10（MySQL 查相邻块，上下文连贯）
  → Prompt（严格依据资料/无依据明确"未提及"/禁外部知识）
  → LLM 流式 SSE（data: chunk → sources → [DONE]）
```

**BM25 持久化**：Chroma 在磁盘，BM25 是内存索引——启动 `init_bm25_index` 从 MySQL 重建；失败则首次检索 `_ensure_bm25_init` 懒重试；增删文档 `_bm25_dirty` 标记触发重建。

**文档管理**：上传（pdf/docx/md/txt/json/log 解析器 + RecursiveCharacterTextSplitter 1500/300）→ Chroma 批量写 + BM25 语料 + MySQL rag_chunks 三写 → 删文档三级清理。

**★ 报告自动入知识库**：AI 报告按 `## ` 章节切块（`rag_report_storage.store_report_to_vector_db`）回流 RAG——"分析→沉淀→可检索"闭环，失败只记日志不影响主流程。

---

## 四、四大 AI 场景

### 4.1 巡检分析（analysis_router）

```
选择时间范围(hours) + 服务器(serverId)
  → data/analysis_data_provider 聚合（opscenter api/ 三件套）：
      query_servers_for_analysis / query_patrols_for_analysis / query_alarms_for_analysis
  → _build_server_profile：每台服务器画像（配置/磁盘挂载/服务详单/systemd/关联告警/负责人）
  → format_utils 格式化为 Markdown 表格
  → SYSTEM_PROMPT（资深架构师）+ 八章结构 USER_PROMPT
  → 流式 SSE 或一次性生成 → 报告自动入知识库 + 可邮件推送（dispatch_analysis_report）
```

### 4.2 日志分析（log_analysis_router）

上传日志文件 → utf-8/gbk/latin-1 解码 → **MAX_LOG_CHARS=50000 截断**（保头尾各 25000，中间标注截断防 token 溢出）→ 有 prompt 针对性回答 / 无 prompt 自动全面分析（级别汇总/根因/修复建议）。纯大模型能力，不依赖知识库。

### 4.3 RAG 问答（rag_router）

文档上传/列表/删除/检索/问答 + 流式问答（SSE）。前端 fetch + getReader 逐行解析渲染。

### 4.4 DB 助手（db_assistant_router）

```
自然语言问题 + 选择数据库
  → db_assistant_data_provider 聚合（dbcenter api/ 四件套）：
      query_database_for_assistant / query_tables_for_assistant
      / get_db_connection_info / fetch_mysql_columns（连真实库 SHOW FULL COLUMNS）
  → table_context_builder 把真实表结构格式化为 LLM 上下文
  → 按 mode 分发：nl2sql / sql_explain / sql_optimize / ddl_explain / crud_gen / qa
  → SSE 流式回答
```

**★ 防幻觉与安全**：
- 真实表结构注入 + 字段名大小写强制 + "找不到就诚实说不知道"
- RED_LINE_RULES：允许 SELECT/INSERT/UPDATE（UPDATE 必须带 WHERE）；禁 DELETE/REPLACE/DROP/TRUNCATE/ALTER/CREATE/SHOW/GRANT/KILL/SLEEP/LOAD_FILE/INTO OUTFILE 等
- 注意：本模块只生成 SQL 不执行（执行能力在 dbcenter 侧另有权衡）——安全设计取舍点

---

## 五、模型管理（llm_model）

- 模型列表从厂商 API 实时拉取：ollama `/api/tags`（本机已装）、deepseek/openai `models.list()`
- `sync_llm_models` 按 `(model_name, provider)` 幂等 upsert，页面可手动同步/定时同步（llm.model_sync_cron）
- 模型管理页下拉数据源 = llm_model 表；实际调用热切换 = 配置中心 llm.model——二者通过配置中心联动

---

## 六、跨模块调用

| API | 用途 |
|---|---|
| opscenter server/patrol/alarm query_api | 分析数据聚合 |
| dbcenter database/table/mysql_column api | DB 助手 |
| auth user_query_api（负责人→用户名）/ role_query_api（限额按角色） | 画像/限额 |
| configuration config_query_api（llm.provider/model） | 模型热重建 |
| notification dispatcher（analysis/database_assistant） | 报告/问答推送 |

反向：statistics 通过 `service/api/rag_query_api.py` 引用 RagDocument/RagChunk 统计知识库规模。

---

## 七、要点

1. **模型热切换**：配置中心 + 单例 + 懒重建，零重启
2. **三方法统一埋点/限额**：scene 常量 + user_id + token，独立会话失败隔离
3. **混合检索管线**：向量+BM25 → RRF 融合 → Reranker 精排 → 邻居扩展——召回率与精度兼得，Reranker 只在候选上跑控算力
4. **DB 助手零幻觉**：真实表结构注入 + 字段大小写强制 + 红线规则
5. **报告自动入知识库**：分析→沉淀→可检索闭环
6. **角色共享限额**：按角色下所有用户成功调用统计，多角色取剩余最大，异常保守拒绝
7. **SSE token 元数据**：`__meta__` 特殊帧携带 usage
8. **大文件日志分析**：头尾截断防 token 溢出
