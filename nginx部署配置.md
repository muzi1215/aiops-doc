# aiops-doc 站点 Nginx 部署配置说明

> 本文记录:aiops-doc(VitePress 文档站)在 lx-nginx 上部署时踩过的坑、
> 官方文档怎么读、nginx 配置每一行的作用、构建 base/输出目录怎么配,
> 以及验证方法。适用读者:需要维护该站点的运维/开发人员。
>
> ⚠️ 本副本位于**构建产物目录**,重新 `vitepress build` 会被清除;
> 权威副本在 `/lx/docker/lx-nginx/config/nginx-config-guide.md`。

---

## 0. 环境与部署结构

| 项 | 值 |
|---|---|
| 服务器 | 47.103.12.12(Aliyun ECS) |
| Web 服务 | Docker 容器 `lx-nginx`(nginx:1.26.2-alpine) |
| 站点目录(容器内) | `/var/www/html/aiops-doc/` |
| 站点目录(宿主机) | `/lx/docker/lx-nginx/www/html/aiops-doc/` |
| 主配置(容器内) | `/config/nginx.conf` |
| 主配置(宿主机) | `/lx/docker/lx-nginx/config/nginx.conf` |
| 访问入口 | `http://47.103.12.12/aiops-doc/` |
| 构建 base | `/aiops-doc/`(2026-08-14 起,见第 5、6 节) |

Docker 挂载关系(`docker-compose.yaml`):

```yaml
volumes:
  - ./config:/config        # nginx 配置(容器启动用 -c /config/nginx.conf)
  - ./logs:/var/log/nginx   # 访问/错误日志
  - ./www/html:/var/www/html  # 前端站点文件
```

> ⚠️ 容器内路径和宿主机路径不一样:配置里写的是**容器内**路径
> (如 `/var/www/html/...`、`/config/...`),不要拿宿主机路径去填。

---

## 1. 最初的配置为什么没生效(404 / 没有样式)

### 1.1 症状

1. 直接访问 `http://47.103.12.12/aiops-doc/` → **404**
2. 偶尔页面 HTML 能出来,但**完全没有样式**(JS/CSS/字体全部 404)

访问日志里的实锤:

```
GET /aiops-doc/                200    ← 页面 HTML 能出
GET /assets/app.mrZRhfID.js    404    ← JS 找不到
GET /assets/style.BhX5jokk.css 404    ← CSS 找不到
GET /vp-icons.css              404    ← 图标样式找不到
GET /assets/inter-roman-latin.Di8DUHzh.woff2 404  ← 字体找不到
```

### 1.2 原因一:`root` 用错导致路径重复拼接(404 的直接原因)

原配置写的是:

```nginx
location /aiops-doc/ {
    root /var/www/html/aiops-doc;   # ❌ 错
    ...
}
```

nginx 拼接规则:

- `root` = **root 路径 + 完整 URI**(location 前缀原样保留)
- `alias` = **alias 路径 + URI 去掉前缀后的剩余部分**

所以原配置下,请求 `/aiops-doc/index.html` 时:

```
root 方式: /var/www/html/aiops-doc + /aiops-doc/index.html
         = /var/www/html/aiops-doc/aiops-doc/index.html   ← 不存在 → 404
alias 方式: /var/www/html/aiops-doc/ + index.html
         = /var/www/html/aiops-doc/index.html             ← 正确
```

**结论:子路径部署(location 带前缀)时,90% 要用 `alias`,而不是 `root`。**
只有 location 是 `/` 时才直接用 `root`。

### 1.3 原因二:嵌套的 `location ~* ^/assets/` 永远不命中

原配置:

```nginx
location /aiops-doc/ {
    ...
    location ~* ^/assets/ {     # ❌ 永远不生效
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**关键知识点:嵌套正则 location 匹配的是完整请求 URI(不是去掉前缀后的剩余部分)。**

- 实际请求 URI 是 `/aiops-doc/assets/xxx.js`
- 正则要求 `^/assets/`(必须以 `/assets/` 开头)
- `/aiops-doc/assets/...` 不以 `/assets/` 开头 → **永远匹配不上** → 缓存头从未加上

### 1.4 原因三:构建产物 base 是 `/`,但部署在子路径 `/aiops-doc/`

看旧的 `index.html`:

```html
<link rel="preload stylesheet" href="/assets/style.BhX5jokk.css">
<script type="module" src="/assets/app.mrZRhfID.js"></script>
```

这些是**根路径绝对地址**(以 `/` 开头),VitePress 构建默认 `base: '/'`。
页面 HTML 在 `/aiops-doc/` 下能访问,但浏览器加载 JS/CSS 时请求的是
`/assets/...`(**域名根**,不带前缀)→ 404 → **没有样式**。

### 1.5 三种根因一句话总结

| 根因 | 后果 |
|---|---|
| `root` 写错(应为 `alias`) | `/aiops-doc/` 整个 404 |
| 嵌套 `location ~* ^/assets/` 匹配完整 URI | 缓存头从未生效 |
| 构建 `base='/'` + 子路径部署 | HTML 里的 `/assets/...` 绝对路径 404 → 无样式 |

---

## 2. 怎么做的配置:静态直出 vs 反向代理

### 2.1 本次方案:nginx 静态文件直出(不是 proxy_pass)

流程:浏览器请求 → nginx 按 location 规则匹配 → 直接读磁盘文件返回。

```
浏览器 ──GET /aiops-doc/──▶ nginx(lx-nginx)
                              │ location /aiops-doc/ → alias
                              ▼
                      /var/www/html/aiops-doc/index.html
```

VitePress 是**静态站点**(构建产物就是 HTML/JS/CSS),所以用静态直出
最合适:性能最好、不依赖后端进程、nginx 挂了文件也还在。

### 2.2 什么时候才需要反向代理(proxy_pass)

当站点是**动态服务**时才用 `proxy_pass`,例如:

- `vitepress preview` / `vite dev` 跑起来的 Node 服务
- 后端 API(现有 `/aiops-api/`、`/ws/` 就是这种)

```nginx
location /myapp/ {
    proxy_pass http://127.0.0.1:4173/;   # vitepress preview 默认 4173 端口
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

两种方式对比:

| 对比项 | 静态直出(alias/root) | 反向代理(proxy_pass) |
|---|---|---|
| 适用 | 静态文件(构建产物) | 动态服务(后端/预览服务器) |
| 性能 | 极高(nginx 直接读文件) | 一般(多一跳网络) |
| 缓存控制 | 可精确控制(本文方案) | 依赖后端响应头 |
| 文件更新 | 替换文件即可 | 需重启服务 |

> aiops-doc 是静态产物,所以"代理配置"的正确做法就是:
> **用 alias 把 URL 路径映射到磁盘目录**,而不是 proxy_pass。

---

## 3. 怎么阅读解析官方文档

### 3.1 文档地址

- 中文镜像:https://vitejs.cn/vitepress/guide/deploy#http-cache-headers
  (镜像可能滞后于官网,nginx 示例是旧版写法)
- 官方新版:https://vitepress.dev/guide/deploy#http-cache-headers

### 3.2 官方文档核心讲了三件事

1. **HTTP 缓存头(重点)**
   - VitePress 构建后,`assets/` 下的 JS/CSS/字体文件名**带内容 hash**
     (如 `app.4f283b18.js`),内容不变文件名就不变 → 可以放心给最长缓存:
     ```
     Cache-Control: max-age=31536000, immutable   # 1 年,永不重新验证
     ```
   - 页面 HTML 没有 hash → 不能长缓存,用 `no-cache`
2. **gzip 压缩**:对文本类资源(text/css、js、json、xml 等)开启压缩
3. **cleanUrls / 路由处理**:
   ```
   try_files $uri $uri.html $uri/ =404;   # 依次尝试:原路径 → xxx.html → 目录 → 404
   error_page 404 /404.html;              # 404 时返回自定义 404 页
   error_page 403 /404.html;              # 目录无 index 时也返回 404 页
   ```

### 3.3 官网新旧两版 nginx 示例的差异

**旧版(中文镜像,嵌套 location 写法)**:

```nginx
server {
    gzip on;
    gzip_types text/plain text/css application/json ...;
    server_name _;
    location / {
        try_files $uri $uri.html $uri/ =404;
        error_page 404 /404.html;
        error_page 403 /404.html;
        location ~* ^/assets/ {
            add_header Cache-Control "public, immutable";
        }
    }
}
```

**新版(官网,map 写法)**:

```nginx
map $uri $cache_control {
    ~^/assets/  "public, max-age=31536000, immutable";
    default     "no-cache";
}
server {
    gzip on; ...
    add_header Cache-Control $cache_control always;
    location / {
        try_files $uri $uri.html $uri/ =404;
    }
}
```

解析要点:

- 两个版本**思想一样**:`assets/` 下带 hash 的资源给 1 年强缓存,页面 no-cache
- 新版用 `map` 更优雅(一个变量统一控制);旧版用嵌套 location
- **都要注意**:示例假设站点部署在**域名根路径**(`location /`、URI 以 `/assets/` 开头)。
  子路径部署必须适配(见第 1、5 节)

### 3.4 读官方文档的方法论

1. 先看**场景假设**:示例假设部署在根路径、默认构建目录等
2. 提取**核心原则**(hash→强缓存、页面 no-cache、gzip、try_files)
3. 对照**自己的部署形态**:根路径 or 子路径?构建 base 是什么?
4. 适配后再**用 curl 实测验证**,不要只看配置「感觉没问题」

---

## 4. 当前生效配置逐行解释(2026-08-14 简化后)

```nginx
location  /aiops-doc/ {
    alias /var/www/html/aiops-doc/;   # ① 磁盘目录映射,必须 alias 且结尾带 /
    index index.html;                 # ② 访问目录时默认找 index.html
    # ③ 依次尝试:原路径 → .html → 目录 → 否则 404(cleanUrls 支持)
    try_files $uri $uri.html $uri/ =404;
    # ④ 404 时内部跳转到子路径下的 404 页(官方推荐自定义 404)
    error_page 404 /aiops-doc/404.html;
    # ⑤ 目录存在但没有 index.html 时 nginx 报 403,也统一转 404 页
    error_page 403 /aiops-doc/404.html;
    # ⑥ 带 hash 的静态资源:按扩展名命中,给 1 年 immutable 强缓存
    location ~* \.(js|css|woff2?|png|jpe?g|gif|svg|ico)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

逐行作用:

| # | 指令 | 作用 | 备注 |
|---|---|---|---|
| ① | `alias` | 把 `/aiops-doc/xxx` 映射到 `/var/www/html/aiops-doc/xxx` | 用 `root` 会路径重复,见 1.2 |
| ② | `index` | 访问目录返回 index.html | |
| ③ | `try_files` | cleanUrls 支持:无后缀 URL 找对应 .html 文件 | 顺序很重要,`=404` 是兜底;曾被人为注释掉,已恢复 |
| ④⑤ | `error_page` | 404/403 统一返回自定义 404 页 | 路径要带 `/aiops-doc/` 前缀,否则内部跳转会落到根目录的 404.html(不存在) |
| ⑥ | 嵌套正则 location | 对 js/css/字体等**带 hash 文件名**的资源加 1 年强缓存 | 嵌套正则匹配完整 URI,所以按**扩展名**匹配而不是 `^/assets/` |

> **已删除的配置**:之前因为构建 `base='/'` 补的三个根级 alias
> (`location /assets/`、`= /vp-icons.css`、`= /hashmap.json`)。
> 重新构建并设置 `base: '/aiops-doc/'` 后,**根级 alias 已不再需要并已删除**,
> `/aiops-doc/` 一个块即可完整工作,域名根命名空间(`/assets/` 等)已释放。

### 4.1 nginx 指令速查

| 指令/语法 | 含义 | 优先级 |
|---|---|---|
| `location = /path` | 精确匹配 | 最高 |
| `location ^~ /path` | 前缀匹配,命中后不再查正则 | 高 |
| `location /path` | 普通前缀匹配,选最长的 | 中 |
| `location ~ / ~*` | 正则匹配(区分/不区分大小写),按配置顺序 | 低(前缀选完后查) |
| `alias` | 磁盘路径 = alias + 剩余 URI | |
| `root` | 磁盘路径 = root + 完整 URI | |
| `try_files ... =404` | 依次尝试,全部失败返回 404 | |
| `error_page code /uri` | 出错时内部跳转 | |
| `add_header` | 追加响应头 | 嵌套 location 里写,只对该 location 生效 |

### 4.2 修复后实测结果(2026-08-14,base 重构后)

| 请求 | 结果 | 缓存头 |
|---|---|---|
| `http://47.103.12.12/aiops-doc/` | 200,`<title>AIops 文档</title>` | — |
| `http://47.103.12.12/aiops-doc`(无斜杠) | 301 → `/aiops-doc/` | — |
| `http://47.103.12.12/aiops-doc/assets/app.xxx.js` | 200 | `public, max-age=31536000, immutable` |
| `http://47.103.12.12/aiops-doc/vp-icons.css` | 200 | — |
| `http://47.103.12.12/aiops-doc/hashmap.json` | 200 | — |
| `http://47.103.12.12/aiops-doc/404.html` | 200 | — |
| `http://47.103.12.12/assets/...`(根级) | 404(已释放,属预期) | — |
| `http://47.103.12.12/`(aiops 门户) | 200 | — |

---

## 5. 部署路径与构建 base 不匹配问题(2026-08-14 遇到并解决)

### 5.1 症状

- 直接访问 `http://47.103.12.12/aiops-doc/`,页面显示 VitePress 的
  **"PAGE NOT FOUND"** 404 页(但服务端实际返回的是 200!)
- 浏览器控制台报错:**`Hydration completed but contains mismatches`**
- 点击导航栏标题/logo 回到"首页",地址栏变成 `http://47.103.12.12`,
  刷新后又变成 aiops 门户"官网" —— 和 `www/html/index.html` 冲突

### 5.2 根因

构建用的是默认 `base: '/'`,但站点被部署在子路径 `/aiops-doc/`,导致:

1. **服务端**:`/aiops-doc/` → alias → `index.html`(这是"首页"的静态 HTML,SSR 内容)→ 返回 **200**
2. **客户端**:VitePress 的路由(vue-router)base 是编译时写死的 `/`,
   它用 `location.pathname` 解析出当前路径 `/aiops-doc/` → 没有任何页面匹配
   → 客户端渲染出 VitePress 的 **404 页**
3. **Hydration mismatch**:SSR 静态 HTML 是首页,客户端 JS 渲染的是 404 页,
   两边内容不一致 → 控制台报错
4. **logo/标题链接**指向 `base` = `/` → 点击后地址变成 `/`,
   而 `/` 被 aiops 门户(`www/html/index.html`)占用 → 刷新就变官网

### 5.3 为什么 nginx 修不了

- 路由 base 是**编译时写死在 JS 包里**(`framework.xxx.js`)的
- vue-router 读取的是**浏览器地址栏的真实 pathname**,nginx 改不了浏览器地址栏
- nginx 只能改服务端返回的内容,改不了客户端 JS 的路由逻辑
- **唯一彻底解法:用 `base: '/aiops-doc/'` 重新构建**(见第 6 节)

> 纯 nginx 的替代方案(不重新构建):把 docs 放到域名根 `/`,
> 门户挪到 `/portal/` —— 代价是门户 URL 变更、原有收藏夹失效,不推荐。

### 5.4 修复步骤(本次实际执行的)

1. VitePress 配置加 `base: '/aiops-doc/'`
2. 重新构建并上传到 `/lx/docker/lx-nginx/www/html/aiops-doc/`
3. nginx 删除三个根级 alias(已不需要)
4. reload + 逐项 curl 验证(见 4.2)

---

## 6. VitePress 构建配置:base / 输出目录(outDir)

### 6.1 三个关键配置项(在 `.vitepress/config.*` 或根目录 `vitepress.config.*`)

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  // ① base:站点部署的 URL 前缀,必须和 nginx 的部署路径完全一致!
  //    - 部署在子路径:前后都要带斜杠,如 '/aiops-doc/'
  //    - 部署在域名根:用 '/' 或省略不写
  //    - 影响:index.html 里所有资源引用前缀 + 客户端路由根路径(logo/链接跳转)
  base: '/aiops-doc/',

  // ② outDir:构建输出目录(即"生成的文件夹名称和路径")
  //    - 默认:docs/.vitepress/dist
  //    - 路径相对于当前配置文件所在目录(即项目根)
  outDir: '../dist',                  // 输出到项目根目录下的 dist/ 文件夹
  // outDir: '../aiops-doc-dist',     // 自定义文件夹名称
  // outDir: '/tmp/docs-build',       // 也支持绝对路径

  // ③ srcDir:文档源码目录(默认 'docs',即 markdown 放在 docs/ 下)
  //    - 如果你的 .md 直接在项目根,可以设为 '.'
  // srcDir: 'docs',

  title: 'AIops 文档',
  // ...其他配置
})
```

### 6.2 常用构建命令

```bash
# 源码在 docs/ 子目录时:
npx vitepress build docs

# 或按 package.json 里配的脚本(推荐):
npm run docs:build        # 等价于 vitepress build docs

# 本地预览验证产物:
npm run docs:preview      # 默认 http://localhost:4173
```

### 6.3 构建产物在哪里 / 怎么部署

- 默认输出:`docs/.vitepress/dist/`(或你 `outDir` 指定的目录)
- 产物内容:index.html、assets/、404.html、hashmap.json、vp-icons.css 等
- **部署**:把输出目录里的**所有文件**上传覆盖到服务器
  `/lx/docker/lx-nginx/www/html/aiops-doc/`(容器内 `/var/www/html/aiops-doc/`)
- 建议上传前先清空旧目录,避免残留旧文件(如 `markdown-examples.html`)

### 6.4 常见坑(按影响排序)

| 坑 | 现象 | 解法 |
|---|---|---|
| base 与部署路径不一致 | 子路径部署出现 PAGE NOT FOUND、Hydration mismatch、无样式 | 见第 5 节,重设 base 重新构建 |
| 改了 base 但没重新上传 | 线上还是旧产物 | 重新构建 + 上传覆盖 |
| 上传时不清空旧目录 | 残留旧页面(如 markdown-examples.html) | 先删旧文件再上传 |
| outDir 指向了别处 | 找不到产物/传错目录 | 构建后确认输出目录,按 6.3 部署 |

---

## 7. 常用运维命令

```bash
# 校验配置语法(容器内)
docker exec lx-nginx nginx -t

# 热重载配置(不中断服务)
docker exec lx-nginx nginx -s reload

# 直接看当前生效配置
docker exec lx-nginx nginx -T

# 看访问日志(排查 404/无样式这类问题)
tail -f /lx/docker/lx-nginx/logs/access.log

# 看错误日志
tail -f /lx/docker/lx-nginx/logs/error.log

# 快速验证(带缓存头查看)
curl -sI http://47.103.12.12/aiops-doc/
curl -sI http://47.103.12.12/aiops-doc/assets/<文件名>
```

---

## 8. 后续维护注意

1. **每次重新构建,都要保持 `base: '/aiops-doc/'`**,与 nginx 部署路径一致;
   上传覆盖后浏览器强制刷新(Ctrl+Shift+R)验一次。
2. 根级 `/assets/` 已释放,`/`(门户)、`/aiops/`、`/aiops-api/`、`/ws/`、
   `/static/`、`/lx-blog/` 等其他配置均未改动。
3. 若以后给文档站配独立域名(如 `docs.xxx.com`),可改用官网新版示例
   (`map $uri $cache_control` + 独立 server 块,root 指向站点目录),
   并把 base 改回 `/`。
4. 本说明的权威副本:`/lx/docker/lx-nginx/config/nginx-config-guide.md`
   (站点目录里的副本会在重新构建时被清除)。
