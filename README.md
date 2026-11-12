<p align="center">
  <img src="webapp/public/icon.svg" width="96" height="96" alt="Moyo logo" />
</p>

<h1 align="center">Moyo · 墨页</h1>

<p align="center">为 iPad、Android 平板和手机设计的本地优先 Markdown 阅读与编辑器。</p>

<p align="center">
  <a href="https://gnitgintoay.github.io/padmd/">在线使用</a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a> ·
  <a href="docs/PRIVACY.md">隐私说明</a> ·
  <a href="CONTRIBUTING.md">参与贡献</a>
</p>

## 为什么是 Moyo

很多 Markdown 编辑器首先为电脑设计，放到平板上以后，文件导入、触控操作、分屏编辑和本地保存体验并不自然。Moyo 从平板使用场景出发：无需注册，不依赖服务器，打开网页即可管理、阅读和修改自己的 Markdown 文档。

Moyo 导入的是一份浏览器本地副本。编辑过程不会自动覆盖“文件”App 或设备中的原文件；需要带走修改稿时，使用“保存副本”或“备份全部”。

## 主要功能

- 导入单篇、多篇 Markdown，或保留层级地导入整个文件夹。
- 在旧版 Safari 无法完整选择文件夹时，本机解压 ZIP 并导入。
- 文件夹折叠、计数、新建文档、重命名、移动、合并与回收站。
- 单栏编辑和原文对照；分栏宽度可拖动并自动记忆。
- 只跟随用户当前操作栏位的同步滚动，避免自动回弹。
- Markdown 加粗、斜体和 `==高亮==` 的源代码内样式提示。
- 查找替换、撤销重做、格式工具栏、行列与字数统计。
- 支持蓝牙键盘以及 `Command` / `Ctrl` 快捷键。
- 恢复草稿与原文分离，不会因为暂停输入而覆盖原文件。
- 日间、夜间主题和适合触屏的响应式界面。
- PWA 离线缓存，可添加到 iPad 或 Android 主屏幕。

## 快速开始

### iPad

1. 使用 Safari 打开 [Moyo 在线版](https://gnitgintoay.github.io/padmd/)。
2. 点击 Safari 的“分享”。
3. 选择“添加到主屏幕”。
4. 从主屏幕打开 Moyo，然后导入 Markdown 文件或文件夹。

iPadOS 18.4 及以上通常可以保留完整文件夹层级；旧版系统建议先在“文件”App 中压缩文件夹，再使用“导入 ZIP 文件夹”。

### Android

使用 Chrome 打开在线版，通过浏览器菜单选择“添加到主屏幕”或“安装应用”。不同厂商的文件选择器能力可能有所差异，ZIP 导入是最稳定的完整文件夹迁移方式。

完整操作说明见 [使用指南](docs/USER_GUIDE.md)。

## 数据与隐私

当前版本：

- 不需要账号；
- 不包含广告、统计分析或遥测；
- 不会把 Markdown 内容上传到项目服务器；
- 文档保存在当前浏览器的 IndexedDB 数据库中；
- 清理浏览器网站数据可能删除文档，因此需要定期导出 ZIP 备份。

同一设备、同一浏览器环境中的使用者能够看到同一份本地文档库。当前文档也没有加密，不适合存放密码、证件、医疗记录或涉密材料。详细边界和 GitHub Pages 同源风险见 [隐私说明](docs/PRIVACY.md) 与 [安全策略](SECURITY.md)。

## 技术架构

Moyo 在线版是一套纯静态 PWA：

- Vite：构建与开发服务器；
- CodeMirror 6：Markdown 编辑器；
- IndexedDB：浏览器本地文档与设置；
- fflate：设备本机 ZIP 导入和备份；
- Service Worker：离线资源缓存；
- GitHub Pages：静态发布。

没有业务后端，也没有云端文档数据库。架构、数据流和安全边界见 [架构说明](docs/ARCHITECTURE.md)。仓库仍保留早期 Flutter 原型，用于记录 Android/iOS 原生方向的探索；当前线上产品以 `webapp/` 为准。

## 本地开发

需要 Node.js 20 或更高版本。

```powershell
cd webapp
npm install
npm test
npm run dev
```

生产构建：

```powershell
cd webapp
npm run build
```

默认部署基础路径为 `/padmd/`。部署到域名根路径时，将环境变量 `BASE_PATH` 设置为 `/` 后重新构建。

## 仓库结构

```text
webapp/               当前 PWA 源代码和测试
docs/                 GitHub Pages 文件及项目文档
dist/                 根路径静态构建产物
lib/, android/, ios/  早期 Flutter 原型
test/                 Flutter 原型测试
```

## 项目状态与路线图

Moyo 处于公开测试阶段，核心 Markdown 阅读、编辑、文件夹管理和本地备份流程已经可用。近期重点是：

1. 数据安全中心、本地锁定和加密设计；
2. 重复导入识别和更可靠的备份恢复；
3. 大纲、全库搜索与大量文档性能；
4. 图片、相对链接和 HTML 导出；
5. 可选的跨设备同步。

完整规划见 [产品路线图](docs/PRODUCT_PLAN.md)，版本变化见 [CHANGELOG](CHANGELOG.md)。

## 参与项目

欢迎提交 Bug、兼容性反馈、交互建议和 Pull Request。开始之前请阅读 [贡献指南](CONTRIBUTING.md)。涉及安全问题时不要公开披露利用细节，请按照 [安全策略](SECURITY.md) 报告。

## 开源许可

Moyo 使用 [MIT License](LICENSE) 发布。第三方组件及参考项目声明见 [THIRD_PARTY_NOTICES](webapp/public/THIRD_PARTY_NOTICES.md)。
