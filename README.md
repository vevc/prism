# Prism

基于 Cloudflare Snippets 的 HMAC 签名反向代理，用于安全的动态域名转发。

只有携带合法签名的请求才会被转发到目标域名，避免开放代理被滥用。仓库中还附带签名计算页与订阅转换 Worker，方便日常使用。

## 核心：签名代理（`snippet.js`）

请求需携带两个查询参数：

| 参数 | 含义 |
|------|------|
| `d` | 目标域名 |
| `t` | 对 `d` 的 HMAC-SHA256 签名（hex） |

校验通过后，会把请求的 `hostname` 改写为 `d` 并透传（支持 WebSocket）。

示例：

```text
https://your-proxy.example.com/path?d=api.example.com&t=<hmac_hex>
```

### 签名算法

```text
t = HMAC-SHA256(SECRET_KEY, d)  →  hex
```

- `message`：目标域名字符串（即 `d`）
- `key`：与 Snippet 中配置的 `SECRET_KEY` 相同
- 输出：十六进制字符串（大小写均可）

### 部署 Snippet

1. 打开 Cloudflare Dashboard → 对应域名 → **Rules** → **Snippets**
2. 新建 Snippet，粘贴 `snippet.js`
3. 将文件顶部的 `SECRET_KEY` 换成长度不少于 32 位的高强度随机字符串
4. 配置触发规则，使需要走代理的流量命中该 Snippet

> 密钥只保存在 Snippet 配置中，不要提交真实密钥到 Git。

### 响应状态

| 状态 | 含义 |
|------|------|
| `400` | 缺少 `d` 或 `t` |
| `403` | 签名校验失败 |
| `500` | 运行时异常 |

---

## 附带工具

### 1. 签名计算器（`docs/index.html`）

本地计算 `t`，并可选拼出完整代理 URL。密钥只在浏览器中使用，不会上传。

可部署到 GitHub Pages（仓库 **Settings → Pages**，Source 选分支，Folder 选 `/docs`）。

访问地址一般为：

```text
https://<user>.github.io/<repo>/
```

### 2. 订阅转换（`converter.obf.js` / `converter.js`）

单文件 Cloudflare Worker：提供网页 UI，将 VLESS 订阅链接改写为经过 Prism 代理的新链接。

主要行为：

- 支持明文多行链接或 base64 订阅内容
- 仅处理 VLESS；其他协议在前端忽略并提示
- UUID 在提交前脱敏，结果返回后再还原
- 使用 Worker 环境变量 `SECRET_KEY`、`PROXY_DOMAIN` 生成签名并替换域名 / sni / host，在 path 中追加 `d`、`t`

部署时**优先使用** `converter.obf.js`。该版本已去掉源码中的 `vless` / `uuid` 等明文关键字；直接部署可读版 `converter.js` 时，Cloudflare 可能因关键词审查导致 Worker 运行出现 **1101** 错误。

1. Cloudflare Dashboard → Workers → Create → 粘贴 **`converter.obf.js`**
2. Settings → Variables：
   - `SECRET_KEY`：与 Snippet 中密钥一致（建议 Secret）
   - `PROXY_DOMAIN`：代理入口域名，如 `your-proxy.example.com`（不要带协议或路径）
3. Deploy 后访问 Worker 地址即可使用

`converter.js` 为可读源码，便于本地阅读与修改；线上部署请使用 `converter.obf.js`。

---

## 项目结构

```text
prism/
├── snippet.js         # 核心：HMAC 签名反向代理（Cloudflare Snippets）
├── docs/index.html    # 附带：签名计算器（可部署 GitHub Pages）
├── converter.obf.js   # 附带：订阅转换 Worker（推荐部署）
└── converter.js       # 订阅转换可读源码
```

## 安全说明

- `SECRET_KEY` 是整套系统的信任根，泄露后任何人都能签发合法代理请求
- Snippet 与 Converter 必须使用同一密钥，否则转换出的链接无法通过代理校验
- 签名计算器适合个人本地使用；不要把真实密钥写进公开仓库或静态页面源码
