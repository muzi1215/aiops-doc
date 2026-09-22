# GitHub Pages 部署完整指南（VitePress 实战）

> 本文档基于 lx-blog 项目（VitePress 文档站）部署到 GitHub Pages 的完整实战过程编写。
> 覆盖：创建仓库 → 本地 git 初始化 → SSH 认证（含代理踩坑）→ 推送 → GitHub Actions 自动构建部署 → deploy.yml 逐行详解。
> 其他项目（非 VitePress）复用方法见文末「其他项目复用」章节。

---

## 目录

1. [总体架构](#1-总体架构)
2. [本地准备](#2-本地准备)
3. [创建 GitHub 仓库](#3-创建-github-仓库)
4. [本地 git 初始化与推送](#4-本地-git-初始化与推送)
5. [SSH 认证专题（重点：代理踩坑）](#5-ssh-认证专题)
6. [VitePress 侧配置（base 路径是核心）](#6-vitepress-侧配置)
7. [deploy.yml 逐行详解（核心）](#7-deployyml-逐行详解)
8. [GitHub Pages 设置](#8-github-pages-设置)
9. [部署验证与日常更新](#9-部署验证与日常更新)
10. [常见问题排查](#10-常见问题排查)
11. [其他项目复用](#11-其他项目复用)

---

## 1. 总体架构

```
本地代码 ──git push──> GitHub 仓库（muzi1215/aiops-doc）
                             │ 触发
                             ▼
                    GitHub Actions（.github/workflows/deploy.yml）
                             │ 构建产物
                             ▼
                    GitHub Pages 托管
                    https://muzi1215.github.io/aiops-doc/
```

核心思路：**代码托管在 GitHub，构建和部署全部由 GitHub 的 CI（Actions）完成，本地只需推送代码**。每次 push 到 main 分支，自动完成 拉取代码 → 装依赖 → 构建 → 发布。

---

## 2. 本地准备

### 2.1 检查 git 是否安装

```bash
git --version
```

### 2.2 配置 git 身份（首次需要，commit 时使用）

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

查看是否已配置：

```bash
git config user.name
git config user.email
```

> `--global` 是全局配置，影响本机所有仓库。不加则只对当前仓库生效。

---

## 3. 创建 GitHub 仓库

**关键规则：仓库名决定访问路径。**

GitHub Pages 项目页地址规则：`https://<用户名>.github.io/<仓库名>/`

所以如果站点配置了 `base: '/aiops-doc/'`，仓库名**必须**是 `aiops-doc`，否则资源路径全错。

创建步骤：

1. 浏览器打开 https://github.com/new
2. 仓库名填 `aiops-doc`（或你的项目名）
3. **不要勾选** "Add a README file" / ".gitignore" / "License"（保持空仓库，避免和本地提交冲突）
4. 点 "Create repository"

---

## 4. 本地 git 初始化与推送

### 4.1 初始化仓库

```bash
# 在项目根目录执行；-b main 指定默认分支为 main（GitHub 主流用 main 而不是 master）
git init -b main
```

### 4.2 添加文件并提交

```bash
# 只添加需要的文件，避免把 node_modules、构建产物、敏感文件提交上去
# （哪些不该提交由 .gitignore 控制，见 4.3）
git add .github docs package.json package-lock.json .gitignore

# 提交。-m 是提交说明，描述这次改动的目的
git commit -m "init: VitePress 文档站点，配置 GitHub Pages 自动部署"
```

### 4.3 .gitignore（关键：排除垃圾文件）

```gitignore
node_modules          # 依赖目录，几百 MB，由 package-lock.json 可还原
aiops-doc-dist        # 构建产物，CI 会自动构建
docs/.vitepress/cache # 本地缓存
.DS_Store             # macOS 系统文件
```

> **原则**：能被重新生成的（依赖、构建产物、缓存）和敏感文件（.env、密钥）绝不提交。

### 4.4 关联远程仓库

```bash
# origin 是远程仓库的默认别名；URL 用 SSH 方式（见第 5 章）
git remote add origin git@github.com:muzi1215/aiops-doc.git

# 查看当前远程配置
git remote -v

# 修改远程地址（比如换了认证方式）
git remote set-url origin <新地址>
```

### 4.5 推送

```bash
# -u 首次推送：建立本地 main 和远程 main 的跟踪关系，以后直接 git push 即可
git push -u origin main
```

之后日常更新只需：

```bash
git add .
git commit -m "更新文档"
git push
```

---

## 5. SSH 认证专题

### 5.1 为什么用 SSH 而不是 HTTPS

- HTTPS 推送需要输入用户名 + Personal Access Token，麻烦
- SSH 配置一次后永久免密，`ssh-agent` 自动管理

### 5.2 生成 SSH 密钥（ed25519 算法，推荐）

```bash
# -t ed25519：算法；-C 注释（一般写邮箱，用于识别）；-f 指定保存路径；-N "" 无密码短语
ssh-keygen -t ed25519 -C "你的邮箱" -f ~/.ssh/id_ed25519 -N ""
```

生成两个文件：

- `~/.ssh/id_ed25519`：**私钥**，绝对不泄露
- `~/.ssh/id_ed25519.pub`：**公钥**，要添加到 GitHub

查看公钥内容：

```bash
cat ~/.ssh/id_ed25519.pub
```

### 5.3 把公钥添加到 GitHub

1. 打开 https://github.com/settings/keys
2. 点 **New SSH key**
3. Title 填备注（如 MacBook-Air），Key 粘贴公钥内容
4. 保存后，页面上会显示指纹（如 `SHA256:1eYSBbbPbmxJK9qwiXhXN0/2PISXFJI8OocEhQHAd6Q`）

### 5.4 测试连接

```bash
ssh -T git@github.com
```

成功会显示：`Hi muzi1215! You've successfully authenticated, but GitHub does not provide shell access.`

### 5.5 踩坑实录：代理工具拦截 22 端口

**报错现象**：

```
Connection closed by 198.18.0.62 port 22
fatal: Could not read from remote repository.
```

**原因分析**：`198.18.0.x` 是 Clash/Surge 等代理工具的 **fake-ip 网段**。代理工具接管了 github.com 的 DNS 解析，返回 fake-ip，但 SSH 22 端口流量没有走代理通道，导致连接被掐断。

**解决方案：改用 SSH over 443 端口**（GitHub 官方支持的方案，专为被防火墙/代理环境设计）。

```bash
# 1. 接受 ssh.github.com 的 host key（首次连接会提示验证）
#    用 ssh-keyscan 获取并直接写入 known_hosts
ssh-keyscan -p 443 ssh.github.com 2>/dev/null >> ~/.ssh/known_hosts

# 2. 用 443 端口测试（URL 是 ssh.github.com，不是 github.com）
ssh -T -p 443 git@ssh.github.com
```

> **安全验证**：ssh-keyscan 得到的 key 建议先核对 GitHub 官方公布的指纹：
> `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`（ssh.github.com:443 ED25519）
> 用 `ssh-keygen -lf -` 可以查看获取到的 key 指纹。

**修改 remote 地址为 443 端口**：

```bash
git remote set-url origin ssh://git@ssh.github.com:443/muzi1215/aiops-doc.git
```

注意 443 的写法是 `ssh://` 协议格式，22 端口默认写法是 `git@github.com:user/repo.git`。

### 5.6 SSH 相关小知识

| 命令 | 作用 |
|---|---|
| `ssh-keygen -t ed25519 -C "邮箱"` | 生成密钥 |
| `ssh -T git@github.com` | 测试 22 端口认证 |
| `ssh -T -p 443 git@ssh.github.com` | 测试 443 端口认证 |
| `ssh-keyscan -p 443 ssh.github.com` | 获取服务器 host key |

---

## 6. VitePress 侧配置

### 6.1 `docs/.vitepress/config.mts`

```ts
export default defineConfig({
  // ★★★ base 是部署到子路径的命根子 ★★★
  // 默认是 '/'（根域名）。部署到 https://用户名.github.io/aiops-doc/ 就必须写 '/aiops-doc/'
  // 首尾斜杠都不能少。写错的表现：页面能打开但 CSS/JS 全部 404
  base: '/aiops-doc/',

  // 构建输出目录（默认是 docs/.vitepress/dist）
  // 改成项目根目录下的 aiops-doc-dist，方便查看产物
  outDir: '../aiops-doc-dist',

  title: "AIops 文档",
  ...
})
```

**base 规则速记**：

| 部署位置 | base 值 |
|---|---|
| `https://用户名.github.io/`（个人主页仓库） | `/` |
| `https://用户名.github.io/仓库名/`（普通仓库） | `/仓库名/` |
| 自定义域名 | `/` |

> 注意：VitePress 的 nav、sidebar 里的链接写 `/aiops-doc/xxx` 这种绝对路径，base 已自动拼接，无需重复写。

### 6.2 `package.json` 脚本

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",     // 本地开发预览
    "docs:build": "vitepress build docs", // 构建（CI 里执行的就是这个）
    "docs:preview": "vitepress preview docs" // 本地预览构建产物
  }
}
```

### 6.3 本地先验证构建（推送前必做）

```bash
npm install        # 首次安装依赖（生成 package-lock.json）
npm run docs:build # 构建，成功后产物在 aiops-doc-dist/
npm run docs:preview # 本地 http://localhost:4173 预览效果
```

> `package-lock.json` 必须提交，CI 里的 `npm ci` 依赖它精确还原依赖。

---

## 7. deploy.yml 逐行详解

文件位置：`.github/workflows/deploy.yml`（目录和文件名是固定约定，GitHub 只认这个路径）

```yaml
# ============================================================
# 第 1 行：注释。以 # 开头的都是注释，GitHub 不会执行
# ============================================================

# 给整个 workflow 起个名字，会显示在仓库的 Actions 标签页
name: Deploy VitePress site to Pages

# ============================================================
# on：定义什么时候触发这个 workflow（触发条件）
# ============================================================
on:
  # 当有人 push 代码到 main 分支时触发（最常见的触发方式）
  push:
    branches: [main]
  # 手动触发：允许在 Actions 页面点 "Run workflow" 按钮手动执行
  # 调试、或推送历史代码后想强制重新部署时很有用
  workflow_dispatch:

# ============================================================
# permissions：声明这个 workflow 需要哪些权限
# GitHub 默认权限只读，这里按最小权限原则显式声明
# ============================================================
permissions:
  contents: read        # 读取仓库代码（构建需要）
  pages: write          # 写入 Pages 站点（部署发布需要）
  id-token: write       # 签发 OIDC 身份令牌（无密钥认证，deploy-pages 需要）

# ============================================================
# concurrency：并发控制
# 防止多次 push 同时构建部署，造成冲突
# ============================================================
concurrency:
  group: pages          # 同一个组的任务互斥（所有部署共用一个组名）
  cancel-in-progress: false
  # 不取消进行中的任务，而是让新任务排队等待（避免网站处于半发布状态）

# ============================================================
# jobs：workflow 里可以有多个 job（工作单元）
# 这里分 build（构建）和 deploy（部署）两个，deploy 依赖 build
# ============================================================
jobs:

  # ---------- 第一个 job：构建 ----------
  build:
    runs-on: ubuntu-latest   # 运行环境：GitHub 提供的免费 Ubuntu 虚拟机
    steps:                   # steps：一个 job 里按顺序执行的操作列表
      # 1. 拉取代码：把仓库代码下载到虚拟机
      - name: Checkout
        uses: actions/checkout@v5   # uses: 引用 GitHub 官方现成的 action（插件）
        with:
          fetch-depth: 0
          # 拉取全部 git 历史。只有启用 lastUpdated（文章最后更新时间）
          # 功能时才需要；不需要的话删掉这行还能加快速度

      # 2. 安装 Node.js 运行环境（构建 VitePress 需要）
      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 24          # 指定 Node 版本
          cache: npm                # 开启 npm 依赖缓存，加速后续构建

      # 3. 与 GitHub Pages 服务建立连接（准备阶段）
      #    会检查仓库是否已启用 Pages + Actions 构建方式
      #    如果没配置（第 8 章），这一步会报错：
      #    "Get Pages site failed... HttpError: Not Found"
      - name: Setup Pages
        uses: actions/configure-pages@v4

      # 4. 安装依赖：npm ci 和 npm install 的区别
      #    ci = clean install，严格按 package-lock.json 安装
      #    快、可复现、不会悄悄改版本；install 会重新解析版本
      #    ★ 所以 package-lock.json 必须提交到仓库 ★
      - name: Install dependencies
        run: npm ci                 # run: 直接执行 shell 命令

      # 5. 构建：执行 package.json 里的 docs:build 脚本
      #    产物会输出到 config.mts 里配置的 outDir（../aiops-doc-dist）
      - name: Build with VitePress
        run: npm run docs:build

      # 6. 上传构建产物：打包成一个 artifact（构建产物快照）
      #    上传给 GitHub 保存，供下一个 job（deploy）使用
      #    ★ path 必须和 outDir 对应 ★
      #    如果 outDir 是默认值（docs/.vitepress/dist），这里写 docs/.vitepress/dist
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: aiops-doc-dist      # 我们的 outDir 是 ../aiops-doc-dist

  # ---------- 第二个 job：部署 ----------
  deploy:
    # 部署目标环境。GitHub 会在仓库 Settings > Environments 自动创建
    # 这里还会显示部署 URL 和部署状态
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
      # ${{ }} 是表达式语法，引用前面 step 的输出
      # steps.deployment 就是下面 id: deployment 那个步骤
      # 取它输出的 page_url（部署后的访问地址）

    needs: build
    # ★ 依赖声明：deploy 必须等 build 成功后才会执行 ★
    # build 失败则 deploy 自动跳过，不会部署坏代码

    runs-on: ubuntu-latest
    name: Deploy          # job 显示名
    steps:
      # 唯一一步：执行部署
      # 把 build job 上传的 artifact 发布到 GitHub Pages
      # 使用 OIDC 无密钥认证（对应上面 permissions 里的 id-token: write）
      - name: Deploy to GitHub Pages
        id: deployment    # 给这一步起个 id，方便别处用 ${{ steps.deployment.outputs.xxx }} 引用它的输出
        uses: actions/deploy-pages@v4
```

### workflow 执行流程总结

```
push 到 main
   │
   ▼
┌─ build job（拉代码 → 装 Node → 连 Pages → 装依赖 → 构建 → 上传产物）
   │
   ▼
└─ deploy job（发布产物到 GitHub Pages）
   │
   ▼
访问 https://muzi1215.github.io/aiops-doc/
```

---

## 8. GitHub Pages 设置

这是**最容易漏的一步**（本次就踩了）：

**仓库 → Settings → Pages**，找到 "Build and deployment" → **Source** 下拉框：

- ❌ 默认是 `Deploy from a branch`（旧方案，直接发布仓库里的静态文件）
- ✅ **必须改成 `GitHub Actions`**（让 workflow 里的 deploy-pages 接管发布）

> 漏配的报错特征：workflow 在 Setup Pages 或 Deploy 步骤失败，
> `Error: HttpError: Not Found` / "Get Pages site failed"
> 在 Actions 页面查看失败 log 可定位。

---

## 9. 部署验证与日常更新

### 9.1 验证部署成功

1. 仓库 **Actions** 标签页：两个 job 全部绿色 ✔
2. 浏览器访问：`https://muzi1215.github.io/aiops-doc/`
3. 重点检查：CSS 是否生效、图片/链接是否正常（base 配错的典型症状）

### 9.2 日常更新流程

```bash
git add .
git commit -m "更新文档"
git push
```

push 后 Actions 自动重新构建部署，约 1-2 分钟生效。

---

## 10. 常见问题排查

| 报错 | 原因 | 解决 |
|---|---|---|
| `Connection closed by 198.18.0.62 port 22` | 代理工具 fake-ip 拦截 SSH 22 端口 | 改用 443 端口（第 5.5 节） |
| `Permission denied (publickey)` | SSH 公钥没添加到 GitHub | 添加公钥（第 5.3 节） |
| `Get Pages site failed` / `HttpError: Not Found` | Pages 没配 Source 为 GitHub Actions | 第 8 章 |
| 页面能开但 CSS/图片全坏 | base 路径配置错误 | base 改为 `/仓库名/`（第 6.1 节） |
| `npm ci` 报错 `package-lock.json` 缺失 | lock 文件没提交 | 提交 package-lock.json |
| Node 20 deprecation 警告 | GitHub 更新运行环境 | 无害警告，忽略；或升级 setup-node 版本 |
| 403 Forbidden | 仓库是私有且没升级 | Pages 需要公开仓库（免费版） |

---

## 11. 其他项目复用

### 11.1 非 VitePress 的静态站（Hugo、Astro、纯 HTML）

只需改 deploy.yml 里 3 处：

```yaml
      - name: Install dependencies
        run: npm ci                    # ① 按需改（Hugo 不需要这步）
      - name: Build with VitePress
        run: npm run docs:build        # ② 换成你的构建命令，如 hugo、astro build
      - name: Upload artifact
        with:
          path: aiops-doc-dist         # ③ 换成你的构建输出目录（public/、dist/ 等）
```

### 11.2 复用检查清单（新项目必备）

1. ❏ 仓库名与站点的 base 路径一致
2. ❏ package.json 有 build 脚本
3. ❏ package-lock.json 已提交
4. ❏ .gitignore 排除了 node_modules 和构建产物
5. ❏ 复制 `.github/workflows/deploy.yml` 并修改 ①②③ 三处
6. ❏ Settings → Pages → Source 选择 GitHub Actions
7. ❏ 推送到 main，Actions 全绿，访问验证

---

## 附：完整命令速查

```bash
# ── 本地一次性准备 ──
git config --global user.name "名字"
git config --global user.email "邮箱"
ssh-keygen -t ed25519 -C "邮箱" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub          # 复制到 GitHub Settings > SSH keys

# ── 新建仓库推送上云（一次性）──
git init -b main
git add <需要的文件>
git commit -m "init"
git remote add origin git@github.com:用户名/仓库名.git
git push -u origin main

# ── 代理拦截 22 端口时改 443 ──
ssh-keyscan -p 443 ssh.github.com 2>/dev/null >> ~/.ssh/known_hosts
ssh -T -p 443 git@ssh.github.com          # 验证
git remote set-url origin ssh://git@ssh.github.com:443/用户名/仓库名.git

# ── 日常更新 ──
git add .
git commit -m "更新内容"
git push
```
