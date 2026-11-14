# Moyo 架构说明

## 系统概览

Moyo 当前线上版本是纯静态 Progressive Web App，没有业务后端。

```text
系统文件选择器
      │
      ▼
files.js ── 读取 Markdown / 本机解压 ZIP
      │
      ▼
db.js ───── IndexedDB: padmd-web
      │
      ├── main.js：文档库、文件夹、保存状态和交互
      └── editor.js：CodeMirror 编辑状态与 Markdown 样式
                    │
                    ▼
          导出 Markdown 或 ZIP 副本
```

## 核心模块

### `webapp/src/main.js`

应用状态与界面协调层，负责初始化设置、构建文档树、全文搜索、最近与收藏视图、文档与文件夹操作、草稿备份、响应式侧栏、同步滚动、跨窗口通知和对话框。

### `webapp/src/db.js`

本地持久化层。数据库名称固定为 `padmd-web`，当前包含：

- `documents`：原文、草稿、路径、来源和时间信息；
- `settings`：主题、分栏比例、最后打开文档等设置。

数据库名称不得随品牌改名，否则现有用户会在升级后看不到旧文档。

### `webapp/src/files.js`

文件边界层，负责文件与文件夹选择、递归读取目录、Safari 降级处理、使用 fflate 解压与生成 ZIP，以及生成下载副本。

### `webapp/src/editor.js`

封装 CodeMirror 6，包括 Markdown 语言支持、快捷键、查找替换、格式包装、搜索结果定位、大纲行跳转和 `==高亮==` 装饰。编辑器作为独立模块加载，避免阻塞应用外壳的首屏资源。

## 数据模型

每个文档同时保留：

- `original`：导入时的原始内容；
- `draft`：当前恢复草稿；
- `name` 与 `path`：文件名和 Moyo 内的逻辑分类；
- `source`：创建或导入来源；
- `importBatchId` 与 `importRoot`：文件夹或 ZIP 导入批次及其独立顶层目录；
- `createdAt`、`modifiedAt`、`exportedAt`；
- `lastOpenedAt` 与 `favorite`：最近打开时间和收藏状态；
- `history`：最多 10 个关键历史版本；
- `trashed`：是否位于回收站。

文件夹没有独立数据库记录，而是从文档 `path` 动态构建。因此空文件夹不会单独保存。

## 保存语义

编辑器更新只修改内存中的 `draft`。恢复草稿会定期写入 IndexedDB，但不会写回系统文件。用户主动点击“保存副本”时，浏览器才生成下载文件。

同一来源下的多个标签页通过 `BroadcastChannel` 通知已写入的文档更新。它只在浏览器本地传递文档 ID 和更新时间，不上传正文；收到更新的窗口由用户决定是否重新载入。

## PWA 与部署

Vite PWA 插件生成 Service Worker，缓存应用外壳以支持离线启动。GitHub Pages 使用 `/padmd/` 作为基础路径；`docs/` 是 Pages 发布产物，`dist/` 是根路径构建产物。

Service Worker 缓存的是程序资源，不是文档数据库。文档仍由 IndexedDB 管理。

生产构建可通过 `CLOUDFLARE_WEB_ANALYTICS_TOKEN` 注入 Cloudflare Web Analytics 信标。令牌为空时不生成信标，开发和 Fork 构建默认不会发出统计请求。信标只负责页面级访问与性能指标；Moyo 没有向它发送文档或编辑事件。

## 安全边界

- 不使用业务服务器或云端文档数据库；
- 可选的 Cloudflare Web Analytics 只收集页面级访问与性能指标，不读取 IndexedDB 或文档内容；
- IndexedDB 遵循浏览器同源策略，但并不加密；
- GitHub Pages 的同一主机下，不同路径仍属于同一来源；
- 能控制同源页面代码的人，理论上能读取该来源的 IndexedDB；
- 能解锁同一浏览器环境的人，可以直接打开本地文档库。

安全强化方向见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](../SECURITY.md)。

## 测试

Vitest 当前覆盖数据库辅助逻辑、Markdown 扩展名、ZIP 提取和导入文件夹分组。涉及触屏、系统文件选择器和响应式布局的行为还需要浏览器端人工检查。
