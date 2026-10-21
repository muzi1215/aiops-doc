# Git 推送故障排查手册

> 适用场景：`git push` 报错、推不上 GitHub / Gitee。
> 本文档为「照着做就能修好」的操作手册，不解释原理，只给判断依据 + 可复制命令。
> 首次编写：2026-10-22（起因：lx-blog 项目 push 报 `Permission denied (publickey)`）
> 关联文档：[GitHubPages部署指南.md](./GitHubPages部署指南.md) 第 5 章 SSH 认证专题

---

## 0. 先看这里：30 秒定位

**第一步，别看报错全文，只看最后一个 `fatal:` 行。** 这是唯一的判断依据：

| 报错特征（fatal 行） | 真实病因 | 直接跳到 |
|---|---|---|
| `Permission denied (publickey)` | 密钥问题：GitHub 不认你这把钥匙 | [场景 A](#场景-apermission-denied-publickey) |
| `Connection closed by 198.18.x.x port 443` / `port 22` | 网络问题：代理把 SSH 连接掐了 | [场景 B](#场景-bconnection-closed-by-19818xx代理掐断) |
| `Repository not found` | 地址错 / 账号无权限 / 仓库改名 | [场景 C](#场景-crepository-not-found) |
| `Host key verification failed` | 服务器指纹变了 | [场景 D](#场景-dhost-key-verification-failed) |
| `Could not read from remote repository`（**单独出现、无 publickey**） | 是上面某条的伴生行，看它**上面**那一行 | 回看上一行 |

> **最关键的一条区分**：
> `Connection closed` = 网络层被断，**密钥根本没被验证**，查密钥毫无意义，重试或换端口。
> `Permission denied (publickey)` = 网络通、服务器在正常回应，但**拒绝了你提供的密钥**，必须换/补密钥。

---

## 1. 一键诊断（复制整段执行）

把这整段粘进终端，一次性把三件事查清楚：远程地址、本机密钥清单、真实握手结果。

```bash
cd $(git rev-parse --show-toplevel 2>/dev/null) && \
echo "=== 1. 远程地址 ===" && git remote -v && \
echo && echo "=== 2. 本机密钥（看注释，判断是给谁用的） ===" && \
for f in ~/.ssh/*.pub; do [ -f "$f" ] && ssh-keygen -lf "$f"; done && \
echo && echo "=== 3. ~/.ssh/config 是否存在 ===" && \
([ -f ~/.ssh/config ] && cat ~/.ssh/config || echo "❌ 没有 config，多账号必出问题") && \
echo && echo "=== 4. 密钥文件权限（必须 600，过宽会被 SSH 静默忽略） ===" && \
ls -l ~/.ssh/ | grep -E "id_|config" && \
echo && echo "=== 5. 实际握手（看它 offer 了哪把钥匙） ===" && \
ssh -vT git@github.com 2>&1 | grep -E "Offering|Permission denied|Connection closed|Authenticated|Hi "
```

**读结果的方法**：

- 第 2 步输出的**括号里那句注释**是判断重点。如果全是 `xxx@Gitee`、`xxx@gmail.com` 之类，而没有一把明确的 GitHub 专用 key，基本就是场景 A1。
- 第 5 步的 `Offering public key: ... SHA256:xxxx` 就是 GitHub 实际收到的钥匙指纹。拿它跟 GitHub 网页上已登记的指纹比对，对不上 = 没登记。
- 第 5 步如果最后是 `Authenticated to ssh.github.com` 或 `Hi 用户名!` = 认证已通，问题不在密钥。

---

## 场景 A：`Permission denied (publickey)`

这是**推送失败最常见的原因**，本质只有一句话：**GitHub 收到了你的公钥，但它的账号库里没有这个指纹。**

细分四种，用第 1 节的诊断结果对号入座：

| 子场景 | 判断依据 | 处理 |
|---|---|---|
| **A1 密钥是「别家的」（本次遇到的就是这种）** | 本机唯一密钥的注释是 `Gitee SSH Key` / 邮箱不匹配，没给 GitHub 用过 | 按下方 [A 标准修复流程](#a-标准修复流程生成专用密钥--分流配置--登记) 走一遍 |
| **A2 密钥对，但没加到 GitHub 账号** | 已有 GitHub 专用 key，但网页 Settings → SSH keys 里没有对应指纹 | 只需登记公钥，跳到 [第 3 步](#第-3-步把公钥登记到-github) |
| **A3 权限过宽，SSH 直接忽略这把钥匙** | `ls -l ~/.ssh/` 里私钥是 `-rw-r--r--`（644）而非 `-rw-------`（600） | [第 0 步](#第-0-步修正文件权限) 修完重试 |
| **A4 多账号，SSH 送错了钥匙** | 有多把 key，`Offering` 那行显示的不是你想用的那把 | 用 `IdentitiesOnly yes` + config 分流，见 [第 2 步](#第-2-步写-sshconfig按-host-分流) |

### A 标准修复流程：生成专用密钥 → 分流配置 → 登记

整个过程 4 步，**全程不删除、不覆盖任何已有密钥**（Gitee 的钥匙必须留着）。

#### 第 0 步：修正文件权限

SSH 对权限极度严格，权限不对会**静默跳过**这把钥匙，表现就是「明明配了却还是 publickey 失败」。

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config 2>/dev/null
find ~/.ssh -maxdepth 1 -name "id_*" ! -name "*.pub" -exec chmod 600 {} \;
chmod 644 ~/.ssh/*.pub 2>/dev/null
```

> 别图省事写 `chmod 600 ~/.ssh/id_*`，那样会把 `.pub` 公钥也一起改成 600。虽然公钥 600 通常也能用，但 `known_hosts` 同理被误改后容易出奇怪问题。上面这四行是精确写法。

#### 第 1 步：生成 GitHub 专用密钥

```bash
ssh-keygen -t ed25519 -C "你的标识@github" -f ~/.ssh/id_ed25519_github -N "" -q
```

- `-f ~/.ssh/id_ed25519_github`：**必须换文件名**，不能再用默认的 `id_ed25519`，否则会覆盖掉 Gitee 那把
- `-N ""`：不设密码短语，方便免密推送。若要多一层安全，可设密码，然后 `ssh-add --apple-use-keychain ~/.ssh/id_ed25519_github` 存入钥匙串
- `-q`：静默模式，不打印一堆横幅

生成后确认：

```bash
ssh-keygen -lf ~/.ssh/id_ed25519_github.pub
# 输出类似：256 SHA256:u5Rz3giS0+b0TePf1SlQ6UFiyKzWtk0pAW/TK2TYCnE 你的标识@github (ED25519)
```

**记下这个 SHA256 指纹**，后面跟 GitHub 网页比对要用。

#### 第 2 步：写 `~/.ssh/config`，按 host 分流

这一步是多账号共存的核心。没有它，SSH 只会在几把钥匙里瞎试，试到最后一把才可能撞对。

```bash
cat > ~/.ssh/config <<'EOF'
# GitHub 走 443 端口（代理环境下 22 端口会被掐断），并使用专用密钥
Host github.com
    HostName ssh.github.com
    User git
    Port 443
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes

Host ssh.github.com
    User git
    Port 443
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes

# Gitee 保持原有密钥
Host gitee.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

三个关键项的作用：

| 配置项 | 为什么必须有 |
|---|---|
| `HostName ssh.github.com` + `Port 443` | 把 `git@github.com:xxx` 的请求自动转到 443 端口，绕开代理对 22 端口的拦截。**改了这一项后，remote 用 `git@github.com:user/repo.git` 或 `ssh://git@ssh.github.com:443/...` 都能正常走** |
| `IdentityFile` | 指定用哪把钥匙，不指定就会被其他 key 干扰 |
| `IdentitiesOnly yes` | 强制只用 `IdentityFile` 指定的这把，不去试 agent 里的一堆钥匙。**多账号必加，否则 GitHub 会因为「试了太多钥匙」直接限流拉黑** |

验证配置是否真的生效（不用连网也能看）：

```bash
ssh -G github.com | grep -E "^(hostname|port|identityfile|identitiesonly) "
# 期望输出：
# hostname ssh.github.com
# port 443
# identityfile ~/.ssh/id_ed25519_github
# identitiesonly yes
```

#### 第 3 步：把公钥登记到 GitHub

```bash
# 复制到剪贴板（macOS）
pbcopy < ~/.ssh/id_ed25519_github.pub

# 直接打开添加页面
open "https://github.com/settings/ssh/new"
```

网页操作：**New SSH key** → Title 随便填（如 `Mac-mini`）→ Key 框 `Cmd+V` 粘贴 → **Add SSH key**。

> 添加成功的标志：页面上显示的指纹（如 `SHA256:u5Rz3gi...`）与你第 1 步记下的指纹**完全一致**。不一致说明粘错了公钥。

#### 第 4 步：验证并推送

```bash
# 认证测试，成功会显示 Hi 你的用户名!
ssh -T git@github.com

# 推送
git push
```

成功的两个标志：

```
Hi muzi1215! You've successfully authenticated, but GitHub does not provide shell access.
```

```
   xxxxxxx..yyyyyyy  main -> main
```

最后用这两条确认真的同步了（比看 push 输出更可靠）：

```bash
git fetch origin && git status -sb
# 期望：## main...origin/main    ← 后面没有 [ahead 1] 之类的字样
```

---

## 场景 B：`Connection closed by 198.18.x.x`（代理掐断）

**看到 `198.18.x.x` 这个 IP，立刻想到代理工具（Clash / Surge / V2Ray 等）的 fake-ip 网段**，这不是 GitHub 的服务器地址，是本机代理伪造的。

识别方法：

```bash
scutil --dns | grep nameserver | head -3     # 看 DNS 是否被代理接管
echo $HTTP_PROXY $HTTPS_PROXY                # 看代理环境变量
```

### 处理方式（按成本从低到高）

**1. 先重试 —— 大多数情况就是代理抖动**

```bash
git push
```

同一分钟内多试两次往往就过了。本次 2026-10-22 的实战中，第一次 `git push` 报 `Connection closed by 198.18.4.156 port 443`，**第二次直接成功**，没有任何配置改动。

**2. 确认是否 22 端口被拦（此时必须走 443）**

```bash
ssh -T -o ConnectTimeout=8 git@github.com     # 22 端口
ssh -T -p 443 -o ConnectTimeout=8 git@ssh.github.com  # 443 端口
```

如果 22 端口 `Connection closed` 而 443 端口有正常回应（哪怕是 `Permission denied`），说明是端口被拦，按 [第 2 步](#第-2-步写-sshconfig按-host-分流) 写 config 强制走 443 即可，**不需要改 remote 地址**。

**3. 首次连接需要接受 host key**

```bash
ssh-keyscan -p 443 ssh.github.com 2>/dev/null >> ~/.ssh/known_hosts
```

> 安全提醒：`ssh-keyscan` 拿到的 key 建议核对官方指纹。
> `ssh.github.com:443` 的 ED25519 官方指纹：`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`
> 核对命令：`ssh-keyscan -p 443 ssh.github.com 2>/dev/null | ssh-keygen -lf -`

**4. 换 remote 地址（config 方案失效时的兜底）**

```bash
# 走 443
git remote set-url origin ssh://git@ssh.github.com:443/用户名/仓库名.git

# 或退回 HTTPS（需要 PAT）
git remote set-url origin https://github.com/用户名/仓库名.git
```

注意端口写法：443 必须写成 `ssh://git@ssh.github.com:443/user/repo.git`，而 22 端口是 `git@github.com:user/repo.git`。

---

## 场景 C：`Repository not found`

按顺序排查，前两条占了 90%：

```bash
# 1. 地址对不对（大小写、用户名、仓库名、是否多了 .git）
git remote -v

# 2. 这个仓库真的存在吗（浏览器打开看）
open "https://github.com/用户名/仓库名"

# 3. 认证是不是用的另一个账号（多账号最容易踩）
ssh -T git@github.com
# 看输出的 Hi xxx! 里的 xxx 是不是仓库所有者
```

常见成因：

- 仓库在**另一个 GitHub 账号**下，但当前 SSH 用的是这个账号的 key
- 仓库是 **private**，而当前 key 未被授权（需仓库 Settings → Collaborators 加人，或个人 key 有 repo 权限）
- 仓库已改名/删除，本地 remote 还是旧地址

---

## 场景 D：`Host key verification failed`

meaning：服务器指纹变了。**只有两种情况**——服务器真的换了钥匙，或者你被中间人劫持。**不要无脑 `StrictHostKeyChecking=no`**。

```bash
# 1. 删掉该 host 的旧记录
ssh-keygen -R github.com
ssh-keygen -R ssh.github.com
ssh-keygen -R "[ssh.github.com]:443"

# 2. 重新获取并核对官方指纹
ssh-keyscan -p 443 ssh.github.com 2>/dev/null | ssh-keygen -lf -
# 官方 ED25519 指纹应为：SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU

# 3. 指纹一致才写入
ssh-keyscan -p 443 ssh.github.com 2>/dev/null >> ~/.ssh/known_hosts
```

指纹对不上 = 有中间人，立即停手，检查代理是否在解密流量。

---

## 2. 本机（Mac-mini）当前固化配置

以下是 2026-10-22 修复后的实际状态，重装系统或换机时可直接照抄。

**密钥分配**：

| 文件 | 用途 | 指纹 |
|---|---|---|
| `~/.ssh/id_ed25519` | **Gitee 专用**，勿动 | `SHA256:VTEmImLZ+pkdQdgSbH0F9fvNPYFLpBlaMOg+2zK59uM` |
| `~/.ssh/id_ed25519_github` | **GitHub 专用** | `SHA256:u5Rz3giS0+b0TePf1SlQ6UFiyKzWtk0pAW/TK2TYCnE` |

**`~/.ssh/config`**：见 [第 2 步](#第-2-步写-sshconfig按-host-分流) 全文，核心是把 `github.com` 改写到 `ssh.github.com:443`。

**本机环境已知特点**：

| 项 | 值 | 影响 |
|---|---|---|
| 代理 | `127.0.0.1:64438`（TUN 模式，fake-ip `198.18.x.x`） | 22 端口不可用，必须走 443；连接偶发抖动 |
| `credential.helper` | `osxkeychain` | 走 HTTPS 时 token 只需输一次 |
| gh CLI | 未安装 | 无法命令行添加公钥，只能走网页 |
| `api.github.com` | 经代理访问失败（SSL exit 35） | 不要用它做连通性测试，用 `github.com` |
| `github.com` HTTPS | 正常（200） | HTTPS 方案可作为 SSH 的备选 |

---

## 3. 全流程速查表

从零到推送成功，按顺序执行：

```bash
# ── 诊断 ─────────────────────────────
git remote -v                              # 看远程地址
for f in ~/.ssh/*.pub; do ssh-keygen -lf "$f"; done   # 看有哪几把钥匙、给谁用
ssh -vT git@github.com 2>&1 | grep Offering           # 看实际送了哪把

# ── 修复（仅当确认是密钥问题）─────────
ssh-keygen -t ed25519 -C "标识@github" -f ~/.ssh/id_ed25519_github -N "" -q
# 写 ~/.ssh/config（见第 2 步）
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519_github
pbcopy < ~/.ssh/id_ed25519_github.pub
open "https://github.com/settings/ssh/new"    # 粘贴 → Add SSH key

# ── 验证 ─────────────────────────────
ssh -T git@github.com                      # 期望 Hi 用户名!
git push                                   # 期望 xxx..yyy main -> main
git fetch origin && git status -sb         # 期望无 ahead/behind
```

**常用命令备查**：

| 命令 | 作用 |
|---|---|
| `ssh-keygen -lf xxx.pub` | 查公钥指纹（不用打开文件） |
| `ssh -vT git@github.com` | 详细模式看认证全过程，`Offering` 行最关键 |
| `ssh -G github.com` | **只解析 config 不联网**，验证配置是否生效 |
| `ssh -T -p 443 git@ssh.github.com` | 单测 443 端口 |
| `ssh-add -l` | 看 agent 里有哪些钥匙（`no identities` 是正常的，不影响 config 方案） |
| `git remote set-url origin <url>` | 换远程地址 |
| `ssh-keygen -R github.com` | 删除 known_hosts 里该 host 的记录 |

---

## 4. 实战复盘：2026-10-22 这次到底怎么了

**报错**：

```
git@ssh.github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**排查过程与结论**：

| 步骤 | 命令 | 发现 |
|---|---|---|
| 1 | `git remote -v` | 远程是 `ssh://git@ssh.github.com:443/muzi1215/aiops-doc.git`，443 已配好 |
| 2 | `ls -la ~/.ssh/` | 只有 `id_ed25519`，**没有 config** |
| 3 | `cat ~/.ssh/id_ed25519.pub` | 注释是 **`Gitee SSH Key`** ← 根因 |
| 4 | `ssh -vT git@ssh.github.com -p 443` | 服务器正常回应 `Authentications that can continue: publickey`，说明网络通，是**钥匙不被认** |
| 5 | `ssh-keygen -lf` | 指纹 `VTEmImLZ...`，GitHub 账号里没有这个指纹 |

**结论**：网络、remote 地址、443 端口全部正常，**唯一问题是本机那把 ed25519 是 Gitee 的钥匙，从没登记到 GitHub**。等于拿 Gitee 家的钥匙开 GitHub 的门。

**修复动作**：

1. 新建 `~/.ssh/id_ed25519_github`（不覆盖原钥匙）
2. 新建 `~/.ssh/config`，GitHub 走 443 + 专用 key，Gitee 仍用原 key
3. 权限统一 600 / 644
4. 网页登记公钥 → `ssh -T` 返回 `Hi muzi1215!` → `git push` 成功 `109c293..8a09649`
5. 顺手把 `.workbuddy/` 加进 `.gitignore`（本地记忆目录不入库）

**中途插曲**：登记完公钥后第一次 `git push` 又报 `Connection closed by 198.18.4.156 port 443`。这是**场景 B（代理抖动）**，与密钥无关，**重试一次即成功**。两个问题的报错长得很像，但 `fatal:` 行不同——这正是本文开头那张对照表的用途。

---

## 5. 一句话记住

> **`Permission denied (publickey)` = 钥匙不对，去查密钥和 GitHub 登记。**
> **`Connection closed by 198.18.x.x` = 网络被代理掐了，重试或换 443。**
> **查密钥前先跑 `ssh -vT git@github.com 2>&1 | grep Offering`，看它到底送出了哪把钥匙——这一条能省掉 80% 的瞎猜。**
