# AIops 智能运维平台 — 架构图全集

> 所有图表使用 Mermaid 语法，支持 GitHub / GitLab / Typora / VS Code 等工具直接渲染。

---

## 1. 总体架构图（System Architecture）

```mermaid
flowchart TB
    subgraph 用户层
        Browser[浏览器]
        AdminUI[Vue3 管理后台<br/>Vite + TypeScript + Element Plus]
    end

    subgraph 接入层
        Nginx[Nginx 反向代理]
    end

    subgraph 应用层["应用层 — FastAPI (Port 2029)"]
        direction LR
        subgraph 核心模块
            Auth[认证授权模块<br/>JWT + RBAC]
            Server[服务器管理模块<br/>巡检引擎]
            AI[AI 智能分析模块<br/>RAG + LLM]
            DBCenter[数据库中心模块<br/>备份/巡检]
            Collector[数据采集模块<br/>服务发现]
            Statistics[统计分析模块<br/>趋势/异常]
            Codegen[代码生成器<br/>开发工具]
        end
        subgraph 基础设施
            Scheduler[APScheduler<br/>7个定时任务]
            WSManager[WebSocket<br/>公告推送]
            LogSystem[Loguru<br/>日志系统]
            EmailService[SMTP<br/>邮件通知]
        end
    end

    subgraph 数据层
        MySQL[(MySQL 8.0<br/>30张业务表)]
        Redis[(Redis<br/>缓存/RAG)]
        ChromaDB[(ChromaDB<br/>向量存储)]
        FileSystem[文件系统<br/>日志/静态资源]
    end

    subgraph 外部服务
        Ollama[Ollama<br/>本地LLM推理]
        DeepSeek[DeepSeek API<br/>云端LLM]
        AliyunOSS[阿里云 OSS<br/>备份存储]
        TencentCOS[腾讯云 COS<br/>备份存储]
        QQSMTP[QQ邮箱 SMTP<br/>告警通知]
        AliyunECS[阿里云 ECS<br/>服务器同步]
    end

    subgraph 目标服务器
        LinuxServer1[Linux 服务器 A<br/>Java/Nginx/Docker]
        LinuxServer2[Linux 服务器 B<br/>MySQL/Redis]
        LinuxServerN[Linux 服务器 N<br/>K8s/微服务]
    end

    Browser --> Nginx
    AdminUI --> Nginx
    Nginx -->|HTTP REST| Auth
    Nginx -->|HTTP REST| Server
    Nginx -->|HTTP REST| AI
    Nginx -->|HTTP REST| DBCenter
    Nginx -->|HTTP REST| Collector
    Nginx -->|HTTP REST| Statistics
    Nginx -->|WebSocket| WSManager

    Auth --> MySQL
    Server --> MySQL
    AI --> MySQL
    AI --> ChromaDB
    AI --> Redis
    DBCenter --> MySQL
    Collector --> MySQL
    Statistics --> MySQL
    Codegen --> MySQL

    Scheduler -->|巡检| Server
    Scheduler -->|采集| Collector
    Scheduler -->|分析| Statistics
    Scheduler -->|备份| DBCenter
    Scheduler -->|DB巡检| DBCenter

    Server -->|SSH/Paramiko| LinuxServer1
    Server -->|SSH/Paramiko| LinuxServer2
    Server -->|SSH/Paramiko| LinuxServerN
    Collector -->|SSH/Paramiko| LinuxServer1
    Collector -->|SSH/Paramiko| LinuxServer2

    AI -->|LLM调用| Ollama
    AI -->|LLM调用| DeepSeek
    DBCenter -->|文件上传| AliyunOSS
    DBCenter -->|文件上传| TencentCOS
    EmailService -->|SMTP SSL| QQSMTP
    Server -->|ECS API| AliyunECS
    LogSystem --> FileSystem
```

---

## 2. 模块架构图（Module Architecture）

```mermaid
flowchart TB
    subgraph 路由层["路由层 Router — 参数校验 + 调用 Service"]
        direction LR
        AuthRouter["auth/routes/<br/>13个路由文件<br/>用户/角色/菜单/部门/岗位<br/>公告/日志/仪表盘"]
        ServerRouter["server/router/<br/>8个路由文件<br/>服务器/凭证/SSH/阿里云<br/>巡检/告警/规则/配置"]
        AIRouter["ai/router/<br/>3个路由文件<br/>AI分析/RAG/日志分析<br/>DB助手"]
        DBCenterRouter["dbcenter/router/<br/>12个路由文件<br/>数据库/认证/表/备份<br/>策略/复制/校验/巡检<br/>OSS/COS"]
        CollectorRouter["collector/router/<br/>1个路由文件<br/>采集任务/统计"]
        StatisticsRouter["statistics/router/<br/>2个路由文件<br/>统计查询/分析记录"]
        CodegenRouter["codegen/router/<br/>1个路由文件<br/>表查询/预览/下载"]
    end

    subgraph 业务层["业务层 Service — 核心业务逻辑"]
        direction LR
        AuthService["auth/service/<br/>用户CRUD/角色管理<br/>菜单树/部门树<br/>登录认证/审计日志"]
        ServerService["server/service/<br/>巡检引擎/告警聚合<br/>规则评估/邮件通知<br/>SSH执行/阿里云同步"]
        AIService["ai/service/<br/>RAG引擎/AI分析<br/>日志分析/DB助手<br/>LLM编排"]
        DBCenterService["dbcenter/service/<br/>备份调度/恢复<br/>校验/清理/巡检<br/>云存储适配"]
        CollectorService["collector/service/<br/>采集调度/服务发现<br/>指标解析"]
        StatisticsService["statistics/service/<br/>统计聚合/趋势分析<br/>异常检测/评分"]
        CodegenService["codegen/service/<br/>表反射/Jinja2渲染<br/>Zip打包"]
    end

    subgraph 数据模型层["数据模型层 Model — SQLAlchemy 2.0 异步ORM"]
        direction LR
        AuthModel["auth/model/<br/>11张表<br/>sys_user/sys_role<br/>sys_menu/sys_dept<br/>sys_post/sys_icon<br/>关联表/日志表/公告表"]
        ServerModel["server/model/<br/>6张表<br/>ops_server/ops_credential<br/>ops_service_patrol<br/>ops_alarm/ops_patrol_rule<br/>ops_patrol_service_config"]
        AIModel["ai/model/<br/>2张表<br/>rag_documents<br/>rag_chunks"]
        DBCenterModel["dbcenter/model/<br/>9张表<br/>ops_database/auth/table<br/>backup/policy/replication<br/>check_config/check_record"]
        CollectorModel["collector/model/<br/>2张表<br/>ops_collector_record<br/>ops_collector_detail"]
        StatisticsModel["statistics/model/<br/>1张表<br/>ops_analysis_record"]
        CommonModel["common/model/<br/>1张表<br/>ops_system_config"]
    end

    subgraph 公共基础设施["公共基础设施"]
        direction LR
        CommonBase["common/<br/>BaseVO/异常处理<br/>WebSocket管理器<br/>统一响应封装"]
        Config["config/<br/>MySQL/Redis/LLM<br/>日志/OSS/COS/备份"]
        Util["util/<br/>JWT工具/日志装饰器<br/>SSH客户端/SSH隧道<br/>随机工具"]
    end

    AuthRouter --> AuthService
    ServerRouter --> ServerService
    AIRouter --> AIService
    DBCenterRouter --> DBCenterService
    CollectorRouter --> CollectorService
    StatisticsRouter --> StatisticsService
    CodegenRouter --> CodegenService

    AuthService --> AuthModel
    ServerService --> ServerModel
    AIService --> AIModel
    DBCenterService --> DBCenterModel
    CollectorService --> CollectorModel
    StatisticsService --> StatisticsModel
    CodegenService --> CommonModel

    AuthService --> CommonBase
    ServerService --> Util
    AIService --> Config
    DBCenterService --> Util
    CollectorService --> Util
```

---

## 3. 数据流图（Data Flow）

```mermaid
flowchart LR
    subgraph 数据源["数据源"]
        LinuxServers[Linux 服务器集群]
        UserUpload[用户上传文档]
        UserQuery[用户提问/分析请求]
    end

    subgraph 采集层["采集层"]
        SSHPatrol[SSH 巡检采集<br/>系统指标+服务指标]
        SSHCollect[SSH 数据采集<br/>服务发现+指标解析]
        SSHBackup[SSH 隧道备份<br/>mysqldump]
        SSHDBCheck[SSH DB巡检<br/>连接/慢查询/锁]
        DocParser[文档解析<br/>PDF/DOCX/TXT]
    end

    subgraph 处理层["处理层"]
        RuleEngine[规则引擎<br/>阈值评估]
        AlarmAgg[告警聚合<br/>30分钟窗口]
        VectorEmbed[向量化<br/>Embedding]
        BM25Index[BM25索引<br/>jieba分词]
        RRF[RRF融合排序]
        Reranker[BGE-Reranker<br/>精排]
        LLMProcess[LLM处理<br/>结构化输出]
        TrendAnalysis[趋势分析<br/>异常检测]
    end

    subgraph 存储层["存储层"]
        MySQL[(MySQL<br/>30张业务表)]
        ChromaDB[(ChromaDB<br/>向量库)]
        Redis[(Redis<br/>缓存)]
        CloudStorage[(阿里云OSS<br/>腾讯云COS)]
    end

    subgraph 输出层["输出层"]
        Dashboard[仪表盘<br/>统计图表]
        AlarmNotify[告警邮件<br/>SMTP通知]
        AIReport[AI分析报告<br/>SSE流式]
        BackupFile[备份文件<br/>云端存储]
        WSAnnounce[WebSocket<br/>实时公告]
    end

    LinuxServers -->|SSH连接| SSHPatrol
    LinuxServers -->|SSH连接| SSHCollect
    LinuxServers -->|SSH隧道| SSHBackup
    LinuxServers -->|SSH隧道| SSHDBCheck
    UserUpload --> DocParser

    SSHPatrol --> RuleEngine
    RuleEngine -->|超出阈值| AlarmAgg
    AlarmAgg -->|写入| MySQL
    AlarmAgg -->|触发| AlarmNotify
    SSHPatrol -->|巡检结果| MySQL

    SSHCollect -->|采集记录| MySQL
    SSHCollect -->|指标数据| TrendAnalysis
    TrendAnalysis -->|分析记录| MySQL

    SSHBackup -->|备份文件| CloudStorage
    SSHBackup -->|备份记录| MySQL
    SSHDBCheck -->|巡检记录| MySQL

    DocParser --> VectorEmbed
    DocParser --> BM25Index
    VectorEmbed --> ChromaDB
    BM25Index --> Redis

    UserQuery -->|向量检索 Top-20| ChromaDB
    UserQuery -->|BM25检索 Top-20| Redis
    ChromaDB --> RRF
    Redis --> RRF
    RRF --> Reranker
    Reranker -->|Top-5 + 邻居扩展| LLMProcess
    LLMProcess -->|流式响应| AIReport

    MySQL --> Dashboard
    MySQL --> WSAnnounce
```

---

## 4. AI 分析流程图（核心卖点）

```mermaid
flowchart TD
    subgraph 输入["① 用户输入"]
        UserQuestion[用户提问]
        UploadDoc[上传知识库文档]
    end

    subgraph 文档处理["② 文档预处理（上传时）"]
        ParseDoc["文档解析<br/>PyPDF / docx2txt / TXT / MD / JSON"]
        Chunk["文本分块<br/>RecursiveCharacterTextSplitter<br/>1500字符 / 300重叠"]
        Embed["向量化<br/>Ollama / OpenAI Embedding"]
        StoreVec["存入 ChromaDB<br/>向量集合: aiops_rag"]
        StoreChunk["存入 MySQL<br/>rag_documents + rag_chunks"]
        BuildBM25["构建 BM25 索引<br/>jieba 中文分词"]
    end

    subgraph 混合检索["③ 混合检索（查询时）"]
        VecSearch["向量相似度检索<br/>ChromaDB Top-20"]
        BM25Search["BM25 关键词检索<br/>Top-20"]
        RRFFusion["RRF 融合排序<br/>score = Σ 1/(k + rankᵢ)<br/>k = 60"]
    end

    subgraph 精排["④ 精排与扩展"]
        BGECross["BGE-Reranker 交叉编码<br/>bge-reranker-v2-m3<br/>Top-5"]
        NeighborExpand["邻居 Chunk 扩展<br/>前后各 ±10 个 Chunk<br/>增强上下文连贯性"]
    end

    subgraph LLM生成["⑤ LLM 生成"]
        BuildPrompt["构建 Prompt<br/>系统提示 + 检索上下文<br/>+ 用户问题"]
        LLMProvider{"LLM 提供商"}
        OllamaLocal["Ollama 本地推理<br/>qwen2:7b / 隐私优先"]
        DeepSeekAPI["DeepSeek API<br/>云端高性能"]
        OpenAIAPI["OpenAI 兼容 API<br/>通用备选"]
        StreamGen["流式生成<br/>SSE (Server-Sent Events)"]
    end

    subgraph 输出["⑥ 输出"]
        AIAnswer[AI 回答<br/>Markdown 格式]
        EmailReport[邮件报告<br/>HTML 格式]
    end

    subgraph 专项分析["⑦ 专项 AI 分析"]
        PatrolAnalysis["巡检数据分析<br/>读取 ops_service_patrol<br/>+ ops_alarm"]
        LogAnalysis["日志智能分析<br/>异常模式识别"]
        DBAssistant["数据库助手<br/>NL2SQL / SQL优化<br/>DDL解释 / CRUD生成"]
        TrendPredict["趋势预测<br/>容量规划建议"]
    end

    UploadDoc --> ParseDoc --> Chunk --> Embed
    Embed --> StoreVec
    Embed --> StoreChunk
    Chunk --> BuildBM25

    UserQuestion --> VecSearch
    UserQuestion --> BM25Search
    VecSearch --> RRFFusion
    BM25Search --> RRFFusion
    RRFFusion --> BGECross
    BGECross --> NeighborExpand
    NeighborExpand --> BuildPrompt
    BuildPrompt --> LLMProvider
    LLMProvider -->|local| OllamaLocal
    LLMProvider -->|cloud| DeepSeekAPI
    LLMProvider -->|openai| OpenAIAPI
    OllamaLocal --> StreamGen
    DeepSeekAPI --> StreamGen
    OpenAIAPI --> StreamGen
    StreamGen --> AIAnswer
    StreamGen --> EmailReport

    PatrolAnalysis -->|数据注入| BuildPrompt
    LogAnalysis -->|数据注入| BuildPrompt
    DBAssistant -->|数据注入| BuildPrompt
    TrendPredict -->|数据注入| BuildPrompt
```

---

## 5. 数据库 ER 图（Entity Relationship）

```mermaid
erDiagram
    %% ========== AUTH 模块 ==========
    sys_user {
        bigint id PK
        varchar username UK
        varchar password
        varchar name
        varchar email
        varchar phone
        int sex
        varchar head_url
        bigint dept_id FK
        bigint post_id FK
        int status
        int is_deleted
    }
    sys_role {
        bigint id PK
        varchar role_name
        int role_type
        varchar role_code
        varchar description
    }
    sys_menu {
        bigint id PK
        bigint parent_id FK
        varchar name
        int type "0目录 1菜单 2按钮"
        varchar path
        varchar component
        varchar perms
        varchar icon
        int sort_value
    }
    sys_dept {
        bigint id PK
        bigint parent_id FK
        varchar name
        varchar tree_path
        int sort_value
        varchar leader
    }
    sys_post {
        bigint id PK
        varchar post_code
        varchar post_name
        int status
    }
    sys_user_role {
        bigint id PK
        bigint user_id FK
        bigint role_id FK
        bigint application_id
    }
    sys_role_menu {
        bigint id PK
        bigint role_id FK
        bigint menu_id FK
    }
    sys_announcement {
        bigint id PK
        varchar title
        text content
        varchar publisher
        varchar ann_type "daily/biz/iteration"
        int notify_now
        int status
    }
    sys_login_log {
        bigint id PK
        varchar username
        varchar ipaddr
        varchar address
        int status
        varchar browser
        datetime access_time
    }
    sys_oper_log {
        bigint id PK
        varchar title
        int business_type
        varchar method
        varchar oper_url
        varchar oper_ip
        int status
        text error_msg
        datetime oper_time
    }

    %% ========== SERVER 模块 ==========
    ops_server {
        bigint id PK
        varchar hostname
        varchar ip
        varchar intranet_ip
        varchar env
        int status "0离线 1在线 2维护"
        int patrol_enabled
        int alarm_email_enabled
        bigint leader_id
    }
    ops_credential {
        bigint id PK
        bigint server_id FK
        varchar credential_name
        int auth_type "1密码 2密钥"
        varchar username
        text password "AES加密"
        int port
    }
    ops_service_patrol {
        bigint id PK
        bigint server_id FK
        varchar service_name
        int status "0停止 1运行"
        int inspection_result "1正常 2异常"
        decimal cpu_usage
        decimal memory_usage
        decimal disk_usage
        datetime last_check_time
    }
    ops_alarm {
        bigint id PK
        bigint server_id FK
        varchar alarm_type_name
        varchar alarm_level "high/medium/low"
        text alarm_content
        int status "0未处理 1已处理"
        bigint service_patrol_id FK
        varchar aggregation_key
        int aggregation_count
    }
    ops_patrol_rule {
        bigint id PK
        varchar rule_name
        varchar rule_type "system/service/mysql/redis"
        varchar metric_key
        varchar operator
        decimal threshold_value
        varchar alarm_level
        int enabled
    }
    ops_patrol_service_config {
        bigint id PK
        bigint server_id FK
        varchar service_name
        varchar service_type_name
        int port
        varchar install_path
        varchar log_path
    }

    %% ========== AI 模块 ==========
    rag_documents {
        bigint id PK
        varchar filename
        varchar file_type
        bigint file_size
        int chunk_count
        int status "0处理中 1就绪 2失败"
    }
    rag_chunks {
        bigint id PK
        bigint document_id FK
        int chunk_index
        text content
        varchar chroma_id
        int token_count
    }

    %% ========== DBCENTER 模块 ==========
    ops_database {
        bigint id PK
        bigint server_id FK
        varchar name
        varchar db_type
        varchar host
        int port
        int status
        varchar version
        int table_count
    }
    ops_database_auth {
        bigint id PK
        bigint database_id FK
        varchar username
        text password "AES加密"
        int auth_type
        int ssl_enable
    }
    ops_database_table {
        bigint id PK
        bigint database_id FK
        varchar table_name
        bigint table_rows
        bigint data_length
        varchar engine
        varchar table_comment
    }
    ops_database_backup {
        bigint id PK
        bigint database_id FK
        varchar backup_name
        varchar backup_type "full/incremental"
        varchar backup_path
        bigint file_size
        int status "0运行 1成功 2失败"
        int verify_status
    }
    ops_database_backup_policy {
        bigint id PK
        bigint database_id FK "1:1"
        int retention_days
        int enable_compression
        int enable_verify
        int status
    }
    ops_backup_replication {
        bigint id PK
        bigint policy_id FK
        varchar target_type "oss/cos/minio/s3"
        varchar endpoint
        varchar bucket
        varchar region
        int enabled
    }
    ops_backup_replication_log {
        bigint id PK
        bigint backup_id FK
        bigint replication_id FK
        int sync_status "0未同步 1成功 2失败"
        varchar target_key
    }
    ops_database_check_config {
        bigint id PK
        bigint database_id FK "1:1"
        int enabled
        json check_items
        int enable_ai_analysis
    }
    ops_database_check_record {
        bigint id PK
        bigint database_id FK
        datetime check_time
        int duration_ms
        int health_score
        int check_status
        text ai_analysis_result
    }

    %% ========== COLLECTOR 模块 ==========
    ops_collector_record {
        bigint id PK
        bigint server_id FK
        varchar task_type "manual/scheduled"
        varchar status "running/completed/failed"
        json services_discovered
        int total_services
        datetime start_time
    }
    ops_collector_detail {
        bigint id PK
        bigint record_id FK
        bigint server_id FK
        varchar service_name
        varchar service_type
        json metrics_info
        json config_info
    }

    %% ========== STATISTICS 模块 ==========
    ops_analysis_record {
        bigint id PK
        bigint collector_record_id FK
        bigint server_id FK
        varchar service_type
        varchar analysis_type "resource/capacity/trend"
        decimal analysis_value
        int health_score
        varchar trend "up/down/stable/spike"
        varchar warning_level
    }

    %% ========== COMMON 模块 ==========
    ops_system_config {
        bigint id PK
        varchar config_key UK
        text config_value
        varchar component_tag
        int enabled
        varchar description
    }

    %% ========== 关系 ==========
    sys_user }o--o{ sys_dept : "dept_id"
    sys_user }o--o{ sys_post : "post_id"
    sys_user }o--o{ sys_role : "sys_user_role"
    sys_role }o--o{ sys_menu : "sys_role_menu"
    sys_menu ||--o{ sys_menu : "parent_id"
    sys_dept ||--o{ sys_dept : "parent_id"

    ops_server ||--o{ ops_credential : "server_id"
    ops_server ||--o{ ops_service_patrol : "server_id"
    ops_server ||--o{ ops_alarm : "server_id"
    ops_server ||--o{ ops_patrol_service_config : "server_id"
    ops_service_patrol ||--o{ ops_alarm : "service_patrol_id"

    rag_documents ||--o{ rag_chunks : "document_id"

    ops_server ||--o{ ops_database : "server_id"
    ops_database ||--o{ ops_database_auth : "database_id"
    ops_database ||--o{ ops_database_table : "database_id"
    ops_database ||--o{ ops_database_backup : "database_id"
    ops_database ||--|| ops_database_backup_policy : "database_id 1:1"
    ops_database ||--|| ops_database_check_config : "database_id 1:1"
    ops_database ||--o{ ops_database_check_record : "database_id"
    ops_database_backup_policy ||--o{ ops_backup_replication : "policy_id"
    ops_database_backup ||--o{ ops_backup_replication_log : "backup_id"
    ops_backup_replication ||--o{ ops_backup_replication_log : "replication_id"

    ops_server ||--o{ ops_collector_record : "server_id"
    ops_collector_record ||--o{ ops_collector_detail : "record_id"
    ops_server ||--o{ ops_collector_detail : "server_id"

    ops_server ||--o{ ops_analysis_record : "server_id"
    ops_collector_record ||--o{ ops_analysis_record : "collector_record_id"
```

---

## 6. 时序图（Sequence Diagram）

### 6.1 服务巡检完整流程

```mermaid
sequenceDiagram
    participant APScheduler as APScheduler<br/>定时任务
    participant PatrolSvc as 巡检服务<br/>patrol_inspection_service
    participant DB as MySQL<br/>数据库
    participant SSH as SSH客户端<br/>Paramiko
    participant Server as Linux 服务器
    participant RuleEngine as 规则引擎<br/>ops_patrol_rule_service
    participant AlarmSvc as 告警服务<br/>ops_alarm_service
    participant EmailSvc as 邮件服务<br/>email_service
    participant SMTP as QQ邮箱 SMTP

    APScheduler->>+PatrolSvc: 触发巡检（每5分钟）
    
    PatrolSvc->>DB: 查询启用巡检的服务器<br/>(patrol_enabled=1, status=在线)
    DB-->>PatrolSvc: 返回服务器列表

    loop 逐台服务器
        PatrolSvc->>DB: 查询凭证信息
        DB-->>PatrolSvc: 返回加密凭证
        PatrolSvc->>PatrolSvc: AES解密密码/密钥

        PatrolSvc->>SSH: 建立SSH连接
        SSH->>Server: 连接服务器

        PatrolSvc->>SSH: 执行系统指标采集命令
        SSH->>Server: top/free/df/uptime
        Server-->>SSH: CPU/内存/磁盘/负载
        SSH-->>PatrolSvc: 返回系统指标

        PatrolSvc->>SSH: 执行服务检测命令
        SSH->>Server: systemctl/which/docker ps
        Server-->>SSH: 服务运行状态
        SSH-->>PatrolSvc: 返回服务列表

        loop 逐服务采集
            PatrolSvc->>SSH: 采集服务专属指标
            SSH->>Server: Nginx状态/MySQL状态/Redis信息
            Server-->>SSH: 服务指标数据
            SSH-->>PatrolSvc: 返回服务指标
        end

        PatrolSvc->>SSH: 关闭SSH连接

        PatrolSvc->>RuleEngine: 评估指标 vs 告警规则
        RuleEngine->>DB: 查询启用的告警规则
        DB-->>RuleEngine: 返回规则列表

        RuleEngine->>RuleEngine: 逐规则判断阈值
        RuleEngine-->>PatrolSvc: 返回触发的告警

        alt 触发告警
            PatrolSvc->>AlarmSvc: 创建告警记录
            AlarmSvc->>DB: 查询30分钟内同类型告警
            DB-->>AlarmSvc: 返回聚合结果

            alt 存在可聚合告警
                AlarmSvc->>DB: 更新聚合计数<br/>aggregation_count++
            else 新告警
                AlarmSvc->>DB: 插入新告警记录
                AlarmSvc->>EmailSvc: 发送告警邮件
                EmailSvc->>SMTP: SMTP SSL 发送邮件
                SMTP-->>EmailSvc: 发送成功
                EmailSvc-->>AlarmSvc: 更新发送状态
            end
        end

        PatrolSvc->>DB: 写入巡检结果<br/>ops_service_patrol
    end

    PatrolSvc-->>-APScheduler: 巡检完成
```

### 6.2 用户登录与权限校验

```mermaid
sequenceDiagram
    participant User as 用户浏览器
    participant Frontend as Vue3 前端
    participant API as FastAPI 后端
    participant DB as MySQL
    participant Redis as Redis

    User->>Frontend: 输入用户名+密码
    Frontend->>API: POST /login {username, password}
    
    API->>DB: 查询 sys_user (username)
    DB-->>API: 返回用户记录
    
    API->>API: bcrypt 验证密码
    alt 密码错误且尝试MD5
        API->>API: MD5兼容验证
        alt MD5匹配
            API->>DB: 升级密码为bcrypt哈希
        end
    end
    
    API->>API: 生成JWT Token<br/>(HS512, 7天过期)
    API->>DB: 记录登录日志<br/>sys_login_log
    API-->>Frontend: 返回 {token, username}
    Frontend->>Frontend: 存储Token到localStorage

    Frontend->>API: GET /info (Bearer Token)
    API->>API: 解析JWT Token
    API->>DB: 查询用户+角色+菜单
    DB-->>API: 返回完整权限树
    
    API-->>Frontend: 返回 {menus, permissions, avatar}
    Frontend->>Frontend: 构建动态路由
    Frontend-->>User: 渲染管理界面

    Note over User,Redis: 后续API请求权限校验
    User->>Frontend: 操作功能（如删除用户）
    Frontend->>API: DELETE /admin/sysUser/remove<br/>(Bearer Token)
    API->>API: get_current_user() 解析Token
    API->>API: require_perms("bnt.sysUser.remove")
    alt 权限不足
        API-->>Frontend: 403 无权限
        Frontend-->>User: 提示无权限
    else 权限通过
        API->>DB: 执行删除操作
        API->>DB: @Log记录操作日志
        API-->>Frontend: 200 操作成功
        Frontend-->>User: 提示成功
    end
```

---

## 7. 部署图（Deployment）

```mermaid
graph TB
    subgraph 用户端["用户端"]
        PC[PC 浏览器]
        Mobile[移动端浏览器]
    end

    subgraph 反向代理["反向代理层"]
        Nginx["Nginx<br/>静态资源 + API 转发<br/>SSL 终结"]
    end

    subgraph DockerHost["Docker 宿主机"]
        subgraph Container["Docker Container: aiops-backend"]
            FastAPI["FastAPI + Uvicorn<br/>Port 2029<br/>多Worker模式"]
            APScheduler2["APScheduler<br/>7个定时任务"]
            WebSocket2["WebSocket<br/>公告推送"]
            Loguru2["Loguru<br/>日志输出"]
        end
        Volume["Volume 挂载<br/>logs/ → /app/logs"]
    end

    subgraph 宿主机服务["宿主机服务（非容器化）"]
        MySQL2["MySQL 8.0<br/>Port 3306<br/>30张业务表"]
        Redis2["Redis 6.0+<br/>Port 6379<br/>缓存 + RAG"]
        Ollama2["Ollama<br/>Port 11435<br/>本地LLM推理"]
    end

    subgraph 目标服务器集群["目标服务器集群（SSH管理）"]
        ServerA["服务器 A<br/>Java / Nginx / Docker"]
        ServerB["服务器 B<br/>MySQL / Redis"]
        ServerC["服务器 C<br/>K8s / 微服务"]
    end

    subgraph 云服务["外部云服务"]
        OSS["阿里云 OSS<br/>备份文件存储"]
        COS["腾讯云 COS<br/>备份文件存储"]
        AliyunECS2["阿里云 ECS API<br/>服务器自动同步"]
        DeepSeek2["DeepSeek API<br/>云端LLM"]
        QQMail["QQ邮箱 SMTP<br/>告警邮件"]
    end

    subgraph 持久化存储["持久化存储"]
        ChromaDBDir["chroma_db/<br/>ChromaDB 向量持久化"]
        StaticDir["static/<br/>公告图片/静态资源"]
        LogDir["logs/<br/>info.log / error.log<br/>按天滚动, 30天保留"]
    end

    PC --> Nginx
    Mobile --> Nginx
    Nginx -->|"/ → Vue3 SPA"| FastAPI
    Nginx -->|"/admin/* → API"| FastAPI

    FastAPI -->|host.docker.internal| MySQL2
    FastAPI -->|异步连接| Redis2
    FastAPI -->|HTTP| Ollama2
    FastAPI -->|HTTP| DeepSeek2

    APScheduler2 -->|SSH/Paramiko| ServerA
    APScheduler2 -->|SSH/Paramiko| ServerB
    APScheduler2 -->|SSH/Paramiko| ServerC

    FastAPI -->|SDK| OSS
    FastAPI -->|SDK| COS
    FastAPI -->|REST API| AliyunECS2
    FastAPI -->|SMTP SSL| QQMail

    FastAPI --> ChromaDBDir
    FastAPI --> StaticDir
    Loguru2 --> LogDir
    Container --- Volume
```

---

## 8. 日志架构图（Logging Architecture）

```mermaid
flowchart TD
    subgraph 日志源["日志源 — 各业务模块"]
        PatrolLog["[服务巡检] 巡检日志"]
        DBPatrolLog["[数据库巡检] DB巡检日志"]
        CollectorLog["[Collector] 采集日志"]
        AILog["[AI] AI分析日志"]
        RAGLog["[RAG] RAG检索日志"]
        SSHLog["[SSH] SSH连接日志"]
        EmailLog["[Email] 邮件日志"]
        BackupLog["[备份] 备份日志"]
        AuthLog["[认证] 认证日志"]
        APILog["[API] 接口日志"]
        SchedulerLog["[Scheduler] 调度日志"]
    end

    subgraph 装饰器["@Log 装饰器 — 操作审计"]
        LogDecorator["@Log(title, businessType)<br/>自动记录: URL/方法/IP/参数/响应/耗时"]
        OperLogTable[("ops_oper_log<br/>操作日志表")]
        LoginLogTable[("ops_login_log<br/>登录日志表")]
    end

    subgraph 日志引擎["Loguru 日志引擎"]
        Console["控制台输出<br/>DEBUG+ 彩色格式<br/>实时显示"]
        InfoFile["logs/info.log<br/>严格 INFO 级别<br/>按天滚动<br/>30天保留<br/>ZIP压缩<br/>异步队列"]
        ErrorFile["logs/error.log<br/>ERROR + CRITICAL<br/>按天滚动<br/>30天保留<br/>ZIP压缩<br/>异步队列"]
    end

    subgraph 规范["日志规范"]
        Prefix["模块前缀规范<br/>[服务巡检] [数据库巡检]<br/>[Collector] [AI] ..."]
        ExceptionRule["异常日志规范<br/>必须用 log.exception()<br/>包含完整堆栈信息"]
        PerfRule["性能追踪规范<br/>关键操作记录耗时<br/>SQL/SSH/AI/API"]
    end

    PatrolLog --> Console
    PatrolLog --> InfoFile
    DBPatrolLog --> Console
    DBPatrolLog --> InfoFile
    CollectorLog --> Console
    CollectorLog --> InfoFile
    AILog --> Console
    AILog --> InfoFile
    RAGLog --> Console
    RAGLog --> InfoFile
    SSHLog --> Console
    SSHLog --> InfoFile
    EmailLog --> Console
    EmailLog --> InfoFile
    BackupLog --> Console
    BackupLog --> InfoFile
    AuthLog --> Console
    AuthLog --> InfoFile
    APILog --> Console
    APILog --> InfoFile
    SchedulerLog --> Console
    SchedulerLog --> InfoFile

    Console -->|ERROR+| ErrorFile

    LogDecorator --> OperLogTable
    LogDecorator --> LoginLogTable

    Prefix -.->|约束| Console
    Prefix -.->|约束| InfoFile
    ExceptionRule -.->|约束| ErrorFile
    PerfRule -.->|约束| InfoFile
```

---

## 9. 告警流程图（Alert/Alarm Flow）

```mermaid
flowchart TD
    Start([定时巡检触发<br/>每5分钟])

    Start --> QueryServers["查询启用巡检的服务器<br/>patrol_enabled=1<br/>status=在线(1)<br/>有可用凭证"]

    QueryServers --> HasServers{有服务器?}
    HasServers -->|否| End1([本轮结束])

    HasServers -->|是| SSHConnect["SSH连接服务器<br/>AES解密凭证<br/>Paramiko建立连接"]

    SSHConnect --> CollectMetrics["采集系统指标<br/>CPU使用率<br/>内存使用率<br/>磁盘使用率<br/>系统负载"]

    CollectMetrics --> DetectServices["检测运行中的服务<br/>systemctl / docker ps<br/>which / netstat"]

    DetectServices --> CollectServiceMetrics["采集服务指标<br/>MySQL: 连接数/慢查询<br/>Redis: 内存/命中率<br/>Nginx: 请求数/状态<br/>Docker: 容器状态"]

    CollectServiceMetrics --> QueryRules["查询启用的告警规则<br/>ops_patrol_rule<br/>enabled=1"]

    QueryRules --> EvaluateLoop{"逐规则评估"}

    EvaluateLoop -->|CPU > 80%| HighAlarm1["⚠️ 高危: CPU过载"]
    EvaluateLoop -->|内存 > 85%| HighAlarm2["⚠️ 高危: 内存过载"]
    EvaluateLoop -->|磁盘 > 90%| HighAlarm3["⚠️ 高危: 磁盘空间不足"]
    EvaluateLoop -->|服务停止| MediumAlarm1["🔶 中危: 服务异常停止"]
    EvaluateLoop -->|连接池 > 80%| MediumAlarm2["🔶 中危: MySQL连接池过载"]
    EvaluateLoop -->|慢查询 > 0| LowAlarm1["🔹 低危: 存在慢查询"]
    EvaluateLoop -->|全部正常| WriteNormal["写入巡检结果<br/>inspection_result=1(正常)"]

    HighAlarm1 --> AggCheck
    HighAlarm2 --> AggCheck
    HighAlarm3 --> AggCheck
    MediumAlarm1 --> AggCheck
    MediumAlarm2 --> AggCheck
    LowAlarm1 --> AggCheck

    subgraph 告警聚合["告警聚合机制"]
        AggCheck{"30分钟内<br/>同服务器+同类型<br/>是否存在未处理告警?"}
        AggCheck -->|是| Aggregate["聚合到已有告警<br/>aggregation_count++<br/>追加告警内容<br/>不重复发送邮件"]
        AggCheck -->|否| NewAlarm["创建新告警记录<br/>ops_alarm<br/>status=0(未处理)<br/>send_status=0(待发送)"]
    end

    Aggregate --> WritePatrol
    NewAlarm --> SendEmail

    subgraph 邮件通知["邮件通知"]
        SendEmail{"服务器开启<br/>邮件通知?"}
        SendEmail -->|是| BuildHTML["构建HTML邮件<br/>服务器信息<br/>告警详情<br/>处理建议"]
        SendEmail -->|否| UpdateStatus["更新发送状态<br/>send_status=跳过"]
        BuildHTML --> SMTPSend["SMTP SSL 发送<br/>QQ邮箱 465端口"]
        SMTPSend -->|成功| UpdateSent["更新 send_status=1<br/>记录收件人"]
        SMTPSend -->|失败| UpdateFailed["更新 send_status=2<br/>记录错误信息"]
    end

    UpdateStatus --> WritePatrol
    UpdateSent --> WritePatrol
    UpdateFailed --> WritePatrol

    subgraph 写入结果["持久化"]
        WritePatrol["写入巡检结果<br/>ops_service_patrol<br/>inspection_result=2(异常)"]
        WriteNormal --> End2([继续下一台服务器])
        WritePatrol --> End2
    end

    subgraph 告警处理["告警处理（人工）"]
        HandleAlarm["运维人员查看告警<br/>ops_alarm 列表"]
        HandleAlarm --> MarkHandled["标记已处理<br/>status=1"]
        MarkHandled --> AddNote["添加处理备注"]
    end
```

---

## 10. 权限 RBAC 图（Role-Based Access Control）

```mermaid
flowchart TD
    subgraph 用户管理["用户管理"]
        User1["管理员 (admin)<br/>user_id=1<br/>超级管理员"]
        User2["运维人员 A<br/>运维角色"]
        User3["开发人员 B<br/>开发角色"]
        User4["只读用户 C<br/>访客角色"]
    end

    subgraph 组织架构["组织架构"]
        Dept1["技术部"]
        Dept2["运维组"]
        Dept3["开发组"]
        Dept1 --> Dept2
        Dept1 --> Dept3
    end

    subgraph 岗位["岗位"]
        Post1["运维工程师"]
        Post2["开发工程师"]
        Post3["技术经理"]
    end

    subgraph 角色["角色 (sys_role)"]
        Role1["超级管理员<br/>role_type=0<br/>所有权限"]
        Role2["运维管理员<br/>role_type=2<br/>服务器/巡检/告警"]
        Role3["DBA管理员<br/>role_type=2<br/>数据库/备份"]
        Role4["普通用户<br/>role_type=1<br/>只读权限"]
    end

    subgraph 菜单权限["菜单权限 (sys_menu)"]
        direction TB
        subgraph 目录["目录 (type=0)"]
            Menu_System["系统管理"]
            Menu_Server["服务器管理"]
            Menu_AI["AI 智能"]
            Menu_DB["数据库中心"]
            Menu_Stats["统计分析"]
        end

        subgraph 菜单["菜单 (type=1)"]
            Menu_User["用户管理"]
            Menu_Role["角色管理"]
            Menu_Menu["菜单管理"]
            Menu_ServerList["服务器列表"]
            Menu_Patrol["巡检记录"]
            Menu_Alarm["告警管理"]
            Menu_Rule["告警规则"]
            Menu_RAG["知识库"]
            Menu_Analysis["AI分析"]
            Menu_DBList["数据库列表"]
            Menu_Backup["备份管理"]
            Menu_Inspection["DB巡检"]
            Menu_Dashboard["数据看板"]
        end

        subgraph 按钮权限["按钮权限 (type=2)"]
            Btn_UserList["bnt.sysUser.list"]
            Btn_UserAdd["bnt.sysUser.add"]
            Btn_UserEdit["bnt.sysUser.edit"]
            Btn_UserDel["bnt.sysUser.remove"]
            Btn_ServerAdd["bnt.server.add"]
            Btn_ServerEdit["bnt.server.edit"]
            Btn_ServerDel["bnt.server.remove"]
            Btn_PatrolList["bnt.patrol.list"]
            Btn_AlarmHandle["bnt.alarm.handle"]
            Btn_BackupAdd["bnt.backup.add"]
            Btn_BackupDel["bnt.backup.remove"]
            Btn_RAGUpload["bnt.rag.upload"]
        end
    end

    subgraph 权限校验["运行时权限校验"]
        JWTDecode["JWT Token 解析<br/>get_current_user()"]
        PermCheck["权限检查<br/>require_perms()<br/>超管(user_id=1)跳过"]
        Allow["✅ 允许操作"]
        Deny["❌ 403 拒绝"]
    end

    User1 --> Role1
    User2 --> Role2
    User3 --> Role3
    User4 --> Role4

    User2 --> Dept2
    User3 --> Dept3
    User2 --> Post1
    User3 --> Post2

    Role1 -.->|所有菜单| Menu_System
    Role1 -.->|所有菜单| Menu_Server
    Role1 -.->|所有菜单| Menu_AI
    Role1 -.->|所有菜单| Menu_DB
    Role1 -.->|所有菜单| Menu_Stats

    Role2 --> Menu_Server
    Role2 --> Menu_Patrol
    Role2 --> Menu_Alarm
    Role2 --> Menu_Rule

    Role3 --> Menu_DBList
    Role3 --> Menu_Backup
    Role3 --> Menu_Inspection

    Role4 --> Menu_Dashboard
    Role4 --> Btn_PatrolList

    Menu_User --> Btn_UserList
    Menu_User --> Btn_UserAdd
    Menu_User --> Btn_UserEdit
    Menu_User --> Btn_UserDel
    Menu_ServerList --> Btn_ServerAdd
    Menu_ServerList --> Btn_ServerEdit
    Menu_ServerList --> Btn_ServerDel
    Menu_Alarm --> Btn_AlarmHandle
    Menu_Backup --> Btn_BackupAdd
    Menu_Backup --> Btn_BackupDel
    Menu_RAG --> Btn_RAGUpload

    Btn_UserList --> JWTDecode
    Btn_ServerAdd --> JWTDecode
    JWTDecode --> PermCheck
    PermCheck -->|有权限| Allow
    PermCheck -->|无权限| Deny
```

---

> **维护说明**：
> - 数据流图（第3张）随模块交互变更需优先更新
> - AI分析流程图（第4张）为核心卖点，新增分析能力时同步更新
> - ER图（第5张）随数据库表变更需同步更新
> - 所有图表最后更新：2026-07-19
