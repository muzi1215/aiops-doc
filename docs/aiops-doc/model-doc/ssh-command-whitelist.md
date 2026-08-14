# SSH 命令白名单（只读巡检账号授权清单）

> **定位**：平台所有 SSH 执行的命令清单（巡检/采集/扫描/备份），用于为**专用只读账号**配置 sudoers 命令白名单——替代 root 账号，实现"凭证泄露也只能执行只读命令，无法破坏/修改服务器"。
>
> **配套脚本**：`scripts/create_patrol_account.sh`（一键创建只读账号 + 白名单 + 自检）
>
> **最后更新**：2026-08-08

---

## 一、命令来源全景（按功能模块）

```
巡检引擎 opscenter/ops_patrol
  ├─ 系统级：CPU/内存/磁盘/负载/inode/Swap/TCP/句柄/僵尸进程/内核日志/版本
  ├─ 服务级：systemd 状态 + MySQL/Nginx/Docker/Redis/Java/Kubelet 专用采集器
  └─ 全量扫描：systemd 单元/进程/端口/安装目录 四路探测
采集引擎 collector/collectors
  └─ 服务发现四层探测 + 各服务深度指标（redis INFO/docker stats/mysql SHOW 等）
数据库中心 dbcenter
  └─ 备份：mysqldump（SSH 隧道远程执行）
交互式 SSH opscenter/ssh_exec
  └─ 用户输入任意命令（危险命令黑名单拦截）
```

---

## 二、命令白名单（按可执行文件分组）

> 授权原则：**能精确就精确，通配只用于只读命令**；管道拆分授权（sudo 只作用于管道首命令，grep/head/cut 等文本处理由普通权限执行）。

### 2.1 系统级巡检（需要 root 信息）

| 命令（sudo 授权） | 用途 | 授权形式 |
|---|---|---|
| `top -bn1` | CPU 使用率 | `/bin/top -bn1 *` |
| `free -m` | 内存/Swap | `/usr/bin/free -m` |
| `df -h` / `df -i` | 磁盘/inode | `/bin/df *` |
| `uptime` | 系统负载 | `/usr/bin/uptime` |
| `cat /etc/os-release` | 系统版本 | `/bin/cat /etc/os-release` |
| `uname -r` | 内核版本 | `/bin/uname -r` |
| `nproc` | CPU 核数 | `/usr/bin/nproc` |
| `cat /proc/sys/fs/file-nr` | 文件句柄 | `/bin/cat /proc/sys/fs/file-nr` |
| `ss -s` / `ss -tlnp` | TCP 连接/端口 | `/usr/bin/ss *` |
| `ps -eo stat` / `ps aux` / `ps -eo pid,comm,args` | 进程/僵尸 | `/bin/ps *` |
| `dmesg -T` | 内核错误日志 | `/bin/dmesg -T *` |
| `hostname` | 主机名 | `/bin/hostname` |
| `ls`（路径探测） | 目录/文件存在性 | `/bin/ls *` |

### 2.2 systemd 服务状态

| 命令 | 授权形式 |
|---|---|
| `systemctl is-active <svc>` | `/usr/bin/systemctl is-active *` |
| `systemctl is-enabled <svc>` | `/usr/bin/systemctl is-enabled *` |
| `systemctl show <svc>` | `/usr/bin/systemctl show *` |
| `systemctl status <svc>` | `/usr/bin/systemctl status *` |
| `systemctl list-unit-files` | `/usr/bin/systemctl list-unit-files *` |
| `systemctl list-units` | `/usr/bin/systemctl list-units *` |

> `systemctl is-active/is-enabled/show/status/list-*` 均为只读查询，无副作用。

### 2.3 服务探测与版本

| 命令 | 授权形式 |
|---|---|
| `which <bin>` | `/usr/bin/which *` |
| `mysqld --version` | `/usr/bin/mysqld --version` |
| `nginx -v` / `nginx -t` | `/usr/sbin/nginx -v`、`/usr/sbin/nginx -t` |
| `docker --version` | `/usr/bin/docker --version` |
| `redis-cli --version` | `/usr/bin/redis-cli --version` |
| `java -version` | `/usr/bin/java -version` |
| `kubelet --version` | `/usr/bin/kubelet --version` |

### 2.4 服务深度采集（只读查询）

| 命令 | 授权形式 |
|---|---|
| `docker ps / docker ps -a` | `/usr/bin/docker ps *` |
| `docker images` | `/usr/bin/docker images *` |
| `docker info` | `/usr/bin/docker info` |
| `docker system df` | `/usr/bin/docker system df *` |
| `docker stats --no-stream` | `/usr/bin/docker stats --no-stream *` |
| `redis-cli INFO`（或 `-p <port> INFO`） | `/usr/bin/redis-cli -p * INFO`、`/usr/bin/redis-cli INFO` |
| `mysql -S <socket> -e "SHOW STATUS..."` | `/usr/bin/mysql -S * -e *` |
| `mysql -u <user> -p... -e "SHOW..."` | `/usr/bin/mysql -u * -e *` |
| `grep -E '^port|^log_error' /etc/my.cnf*` | 普通权限（my.cnf 若 root 可读则降级，可接受） |
| `ls /var/lib/mysql /var/lib/redis /var/run/mysqld` | `/bin/ls *` |

### 2.5 数据库备份（功能必需，注意授权边界）

| 命令 | 授权形式 | 安全说明 |
|---|---|---|
| `mysqldump -u <user> -p... <db>` | `/usr/bin/mysqldump *` | ⚠️ **只读但可导出全库数据**——备份功能必需；建议配合 MySQL 侧**备份专用账号最小权限**（SELECT/LOCK TABLES/RELOAD/SHOW VIEW/TRIGGER/PROCESS），并限制 mysqldump 仅 `-u 备份账号 *` |

### 2.6 全量扫描（patrol_scan_service）

```
systemctl list-unit-files --type=service        → /usr/bin/systemctl list-unit-files *
systemctl list-units --type=service --state=running → /usr/bin/systemctl list-units *
ps -eo pid,comm,args                            → /bin/ps *
ss -tlnp                                        → /usr/bin/ss *
for d in <目录列表>; do test -d $d && echo $d    → /usr/bin/test -d *（for 循环由账号普通权限执行，test -d 无需 root）
```

### 2.7 交互式 SSH（单独隔离）

用户输入命令**不走白名单**，维持现有危险命令黑名单（18 条：rm -rf/mkfs/dd/fdisk/shutdown/reboot/init 0|6/halt/poweroff/chmod 777/kill -9 1 等）。**建议后续升级为白名单模式或二次确认**。

---

## 三、sudoers 白名单文件（脚本生成内容）

```sudoers
# /etc/sudoers.d/aiops-patrol  （脚本自动生成）
aiops_patrol ALL=(root) NOPASSWD: /bin/top -bn1 *, /usr/bin/free -m, /bin/df *, \
  /usr/bin/uptime, /bin/cat /etc/os-release, /bin/uname -r, /usr/bin/nproc, \
  /bin/cat /proc/sys/fs/file-nr, /usr/bin/ss *, /bin/ps *, /bin/dmesg -T *, \
  /bin/hostname, /bin/ls *, /usr/bin/which *, \
  /usr/bin/systemctl is-active *, /usr/bin/systemctl is-enabled *, \
  /usr/bin/systemctl show *, /usr/bin/systemctl status *, \
  /usr/bin/systemctl list-unit-files *, /usr/bin/systemctl list-units *, \
  /usr/bin/mysqld --version, /usr/bin/mysql -S * -e *, /usr/bin/mysql -u * -e *, \
  /usr/bin/mysqldump *, /usr/sbin/nginx -v, /usr/sbin/nginx -t, \
  /usr/bin/docker --version, /usr/bin/docker ps *, /usr/bin/docker images *, \
  /usr/bin/docker info, /usr/bin/docker system df *, /usr/bin/docker stats --no-stream *, \
  /usr/bin/redis-cli -p * INFO, /usr/bin/redis-cli INFO, \
  /usr/bin/java -version, /usr/bin/kubelet --version, /usr/bin/test -d *
```

**授权边界说明**：
- 全部为**只读查询命令**：无 rm/mv/chmod/chown/kill（非 1）/systemctl start|stop|restart/docker rm|run|exec/mysql DML 等任何写操作
- `ps *` 能看全系统进程（含其他用户）——只读信息，可接受
- `ls *` 能列任意目录——只读，可接受
- `grep`/`head`/`cut`/`tail` 未授权 sudo——管道内文本处理用普通权限执行，避免 `grep /etc/shadow` 风险

---

## 三-bis、脚本通用性说明与用法（create_patrol_account.sh v2.0 通用版）

### 3bis.1 通用性保障（脚本内建）

| 机制 | 说明 |
|---|---|
| **命令路径自动探测** | 每条命令用 `command -v` 探测真实路径（不同发行版路径不同：nginx 可能在 /usr/sbin 或 /usr/bin，mysql 可能在 /usr/local/mysql/bin）→ 探测到才写入白名单 |
| **缺失组件自动跳过** | 未安装的命令（如无 redis-cli/kubelet）自动跳过，不影响其他命令授权 |
| **绝对路径强制** | sudoers 要求绝对路径，shell 内置命令（如 test）自动过滤 |
| **仅依赖标准工具** | useradd / chpasswd / usermod / visudo / getent——CentOS/Ubuntu/Debian/Rocky/Alibaba Cloud Linux 全系自带 |
| **安全兜底** | `visudo -cf` 语法校验失败自动回滚（防锁死 sudo）；`set -e` + 显式 return 保证缺失命令不中断脚本 |

### 3bis.2 支持的发行版与场景

**发行版**：CentOS 7/8/9、Ubuntu 18.04+、Debian 10+、Alibaba Cloud Linux 2/3、Rocky/AlmaLinux 等主流 Linux。

**适用场景**：
- 平台巡检/采集/备份账号（替代 root）
- 其他只读监控场景：Prometheus 等监控系统的只读采集账号（复用白名单命令）
- 需要"凭证泄露也不能破坏服务器"的任何自动化账号

**不适用场景**：
- 需要执行写操作的账号（部署/发布账号——那些需要单独评估最小写权限）
- Windows 服务器（脚本仅支持 Linux）

### 3bis.3 用法（三种模式）

```bash
# ① 交互式（推荐）：运行后提示输入账号名，回车用默认 aiops_patrol
sudo bash create_patrol_account.sh

# ② 参数指定（无人值守/批量/CI）：直接指定账号名
sudo bash create_patrol_account.sh patrol_ops

# ③ 非交互环境（管道/CI 无终端）：自动使用默认账号 aiops_patrol
echo | sudo bash create_patrol_account.sh

# 预览（不执行，展示将创建的内容与白名单；可与账号名共存）
sudo bash create_patrol_account.sh --dry-run
sudo bash create_patrol_account.sh --dry-run patrol_ops
```

**用户名规则**：小写字母或下划线开头，仅含小写字母/数字/下划线/连字符，长度 ≤32——非法输入脚本会拦截并提示。

**输出内容**：用户名 + 随机密码（平台凭证用）、白名单命中条数、sudoers 文件路径、自检结果（sudo -l）。

### 3bis.4 迁移 / 卸载 / 轮换

```bash
# 密码轮换（改完同步更新平台凭证）
sudo passwd aiops_patrol

# 卸载（移除账号 + 白名单）
sudo userdel -r aiops_patrol
sudo rm -f /etc/sudoers.d/aiops-patrol

# 临时禁用（保留账号，移除 sudo 权限）
sudo rm -f /etc/sudoers.d/aiops-patrol
```

### 3bis.5 已验证效果（2026-08-08 实测）

- 平台凭证切换 aiops_patrol 后：巡检/采集/告警/工单/通知全链路正常
- MySQL 深度指标恢复（连接池使用率 7.3%）
- 危险命令全部被拒：`rm -rf` / `systemctl stop` / `DROP TABLE` → sudoers 拒绝

---

## 三-ter、MySQL 备份账号最小权限（GRANT 语法与逐项解析）

> 数据库备份/导出使用的账号（如 `ops_aliyum_readonly`）应只授予 **mysqldump 官方规定的最小备份权限集**——纯只读，与业务读写账号隔离。本节给出完整语法并对每条权限逐一解析。

### 3ter.1 授权语句（分两条执行）

```sql
-- ① 库级权限（作用于 ai_ops 库，替换为实际库名）
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER ON ai_ops.* TO 'ops_aliyum_readonly'@'%';

-- ② 全局权限（RELOAD 是全局权限，只能授权在 *.* 上）
GRANT RELOAD ON *.* TO 'ops_aliyum_readonly'@'%';

FLUSH PRIVILEGES;
```

**⚠️ 常见错误 1221**：`GRANT SELECT, LOCK TABLES, RELOAD, SHOW VIEW, TRIGGER ON ai_ops.* ...` 会报
`ERROR 1221 (HY000): Incorrect usage of DB GRANT and GLOBAL PRIVILEGES`——因为 **RELOAD 是全局权限**，
不能与库级权限混在一条 GRANT 里，必须单独 `GRANT RELOAD ON *.*`。

### 3ter.2 权限逐项解析

| 权限 | 授权范围 | 作用（备份中干什么） | 必要性 | 能否修改数据 |
|---|---|---|---|---|
| `SELECT` | 库级 | 读取表数据/结构——mysqldump 导出行数据、SHOW FULL COLUMNS 取表结构 | ✅ 核心 | ❌ 纯读 |
| `LOCK TABLES` | 库级 | 备份时锁表（MyISAM 等非 InnoDB 表的一致性）| ✅ 必需（mysqldump 默认） | ❌ 只加锁不写数据 |
| `RELOAD` | **全局** | 执行 `FLUSH TABLES WITH READ LOCK`——获得一致性快照点 | ✅ 必需（--single-transaction 也要）| ❌ 只是刷新/加锁 |
| `SHOW VIEW` | 库级 | 导出视图定义（mysqldump --routines 时）| ✅ 导出完整 | ❌ 纯读 |
| `TRIGGER` | 库级 | 导出触发器定义 | ✅ 导出完整（--triggers）| ❌ 纯读 |
| `USAGE` | 全局 | 账号默认连接权限（无需显式授权，自带）| — | ❌ 无操作 |

**权限边界结论**：5 项权限 = 读 + 加锁 + 刷新，**全部不包含任何 DML/DDL**——该账号无法
`INSERT/UPDATE/DELETE`（改数据）、无法 `CREATE/ALTER/DROP`（改结构）、无法 `GRANT`（提权）。

### 3ter.3 明确不授予的权限（安全红线）

| 权限 | 为什么不给 |
|---|---|
| INSERT / UPDATE / DELETE | 会改数据——违背只读目标 |
| CREATE / ALTER / DROP / INDEX | 会改表结构/删表——灾难性 |
| GRANT OPTION | 提权——拿到账号者不能给其他人授权 |
| SUPER / ALL PRIVILEGES | 全权限——绝对禁止 |
| PROCESS（可选）| 仅当需要看全局连接数（巡检 Threads_connected 深度指标）时再单独评估 |

### 3ter.4 验证语句

```sql
-- ① 确认授权结果
SHOW GRANTS FOR 'ops_aliyum_readonly'@'%';
-- 期望：
--   GRANT RELOAD ON *.* TO ...
--   GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER ON `ai_ops`.* TO ...

-- ② 以该账号实际执行备份命令验证（服务器上）
mysqldump -u ops_aliyum_readonly -p'xxx' --single-transaction --no-tablespaces \
  --routines --triggers --set-gtid-purged=OFF ai_ops > /tmp/backup_test.sql
-- 成功输出无报错 = 权限齐备；若报 Access denied，对照 3ter.2 补对应权限
```

### 3ter.5 平台侧对应关系

| 平台功能 | 使用的账号 | 需要的权限 |
|---|---|---|
| 数据库备份（mysqldump） | ops_database_auth 配置账号 | SELECT, LOCK TABLES, RELOAD, SHOW VIEW, TRIGGER |
| AI 助手表结构导出（SHOW FULL COLUMNS） | 同上 | SELECT |
| 数据库巡检（SHOW STATUS 等） | 同上 | SELECT（PROCESS 可选，看全局连接数）|
| 导出/查看（页面读数据） | 同上 | SELECT |

---

## 四、平台接入方式（替换 root）— 完整操作流程

### 步骤 1：被管服务器创建只读账号

```bash
# 在被管服务器执行（脚本会：创建账号 + 随机密码 + sudoers 白名单 + docker 组 + 自检）
sudo bash create_patrol_account.sh            # 默认账号 aiops_patrol
# 或：sudo bash create_patrol_account.sh patrol_ops   # 自定义账号名
```

脚本输出：**用户名 + 随机密码**（复制保存，平台凭证使用）、sudoers 白名单路径、自检结果。

### 步骤 2：MySQL 创建同名只读监控账号（深度指标必需）

```sql
-- 在服务器 MySQL 执行：
INSTALL PLUGIN auth_socket SONAME 'auth_socket.so';        -- ① 加载插件（MySQL 8，未加载会报错）
CREATE USER 'aiops_patrol'@'localhost' IDENTIFIED WITH auth_socket;   -- ② 同名账号 + socket 免密
GRANT PROCESS, REPLICATION CLIENT ON *.* TO 'aiops_patrol'@'localhost'; -- ③ 只读监控权限
FLUSH PRIVILEGES;
```

> MariaDB / 无 auth_socket 插件的 MySQL：`CREATE USER 'aiops_patrol'@'localhost' IDENTIFIED VIA unix_socket;`
> 原理：`mysql -S <socket>` 无账号连接时，MySQL 按系统账号名匹配同名用户，auth_socket 校验系统身份 → 免密成功。

### 步骤 3：平台切换凭证

```
① 平台【服务器管理 → SSH 凭据】→ 编辑该服务器凭证
   → 用户名改为 aiops_patrol，密码改为脚本输出的随机密码
② 点"测试连通性"（成功 = SSH + sudo 白名单正常）
③ 手动触发一次【服务巡检】+【全量采集】
④ 检查日志确认无降级：
   - [MySQL P99] 连接池使用率: N%（恢复 = MySQL 监控账号生效）
   - 巡检记录/告警/工单正常生成
   - 采集各服务 success
```

### 步骤 4：验证安全效果

```bash
# 用只读账号尝试危险命令，应全部被 sudoers 拒绝：
sudo -u aiops_patrol sudo rm -rf /tmp/x          # 应报：不在 sudoers 白名单内
sudo -u aiops_patrol sudo systemctl stop mysql   # 应被拒绝（仅授权 is-active/is-enabled 等查询）
sudo -u aiops_patrol mysql -S /var/lib/mysql/mysql.sock -e "DROP TABLE x"   # 应报权限不足
```

> 若需**完全无 sudo**（更严格）：把账号加入 docker 组后大部分采集命令可用普通权限，系统级命令（dmesg/ss 详情）会降级——按实际需求取舍。

### 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| MySQL P99 指标无数据（`maxConnections=0，认证可能失败`） | 未创建 MySQL 同名账号 | 执行步骤 2 |
| `Plugin 'auth_socket' is not loaded` | MySQL 未加载插件 | 先 `INSTALL PLUGIN auth_socket SONAME 'auth_socket.so'` |
| 巡检部分命令输出空 | 白名单外命令权限不足（如读 my.cnf） | 确认巡检数据完整性，可接受的降级 |
| 服务器 fail：未找到启用凭证 | 凭证未配置/未启用 | 平台配置 aiops_patrol 凭证 |

---

## 五、后续扩展命令的接入规范

新增 SSH 命令时必须同步更新本清单与 sudoers 白名单（维护公约）：

1. **先判断只读性**：只读查询 → 可加入白名单；任何写操作命令 → 禁止
2. 管道命令：只给首命令授权 sudo，文本处理用普通权限
3. 新增后执行 `sudo visudo -c` 校验语法 + 用 aiops_patrol 实际执行验证
4. 精确匹配优先：`mysqldump *` 类宽授权需在注释中说明必要性
