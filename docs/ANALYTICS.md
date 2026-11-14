# Moyo 匿名统计配置

Moyo 支持可选的 Cloudflare Web Analytics。它只用于观察在线版的访问趋势、设备类别与加载性能，不统计任何文档或编辑行为。

## 能看到什么

- Visits（访问次数）与 Page views（页面浏览次数）；
- 页面加载时间与 Core Web Vitals；
- 国家、设备类型、浏览器和操作系统等聚合维度；
- 外部来源网站和站内路径。

Cloudflare Web Analytics 不提供可靠的“独立用户、新用户、回访用户”身份统计。Moyo 不使用 Cookie、浏览器存储或设备指纹来补足这些数据，因此不能把 Visits 直接等同于真实人数。

## 不会发送什么

- Markdown 正文、草稿与历史版本；
- 文件名、文件夹路径和搜索词；
- 导入、编辑、保存、删除等操作；
- IndexedDB、`localStorage` 或其他 Moyo 本地数据。

## 创建站点令牌

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
2. 打开 **Analytics & Logs → Web Analytics**；
3. 选择 **Add a site**，填写 `gnitgintoay.github.io`；
4. 在 **Manage site** 中复制 JavaScript 代码里的 `token` 值。

这个站点令牌会出现在最终网页中，用于把数据归入对应统计站点；它不是 Cloudflare 账号密码或管理 API Token。不要把账号密码、全局 API Key 或管理 API Token 填入这里。

## 本地构建验证

PowerShell：

```powershell
$env:CLOUDFLARE_WEB_ANALYTICS_TOKEN = "Cloudflare 提供的站点令牌"
cd webapp
npm run build
```

构建后的 `webapp/dist/index.html` 应包含 `static.cloudflareinsights.com/beacon.min.js`。不设置该环境变量重新构建时，统计信标不会出现。

## GitHub Actions

仓库 CI 已读取名为 `CLOUDFLARE_WEB_ANALYTICS_TOKEN` 的 Actions Secret：

1. 打开仓库 **Settings → Secrets and variables → Actions**；
2. 新建 Repository secret；
3. 名称填写 `CLOUDFLARE_WEB_ANALYTICS_TOKEN`；
4. 值只填写 Cloudflare Web Analytics 的站点令牌。

当前 GitHub Pages 使用仓库中的 `docs/` 静态产物。正式上线时仍需使用该令牌重新构建并将产物更新到 `docs/`；仅添加 Secret 不会自动改写已经提交的静态页面。

## 查看统计

Cloudflare Dashboard → **Analytics & Logs → Web Analytics** → 选择 Moyo 站点。新数据通常需要等待几分钟才会显示，统计不会补录启用之前的访问。

完整数据边界见 [隐私说明](PRIVACY.md)。
