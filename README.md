# PadMD

PadMD 是一个为 iPad 和 Android 平板设计的轻量、本地优先 Markdown 阅读与编辑 PWA。

在线使用：<https://gnitgintoay.github.io/padmd/>

## 当前功能

- 单栏编辑，以及“导入原文 / 修改稿”对照模式
- 拖动中间分隔线调节两栏宽度；比例会在本机记住
- 导入单个或多个 Markdown 文件
- 导入完整文件夹；旧版 iPad Safari 可改用 ZIP 导入
- 保留文件夹层级、文档搜索、重命名、复制和回收站
- 每 20 秒只备份浏览器恢复草稿，不覆盖导入的原文件
- “保存副本”导出修改版，“备份全部”导出 ZIP
- 触控格式工具栏、查找替换、撤销重做、字数统计
- 支持 iPad / Android 蓝牙键盘及 `⌘` / `Ctrl` 快捷键
- PWA 离线缓存，可从 Safari“添加到主屏幕”

PadMD 导入的是浏览器本地副本。iPad 网页不能持续写入“文件”App 中的原文件，因此需要通过“保存副本”导出修改稿。清除 Safari 网站数据也会清除本地文档库，请定期使用“备份全部”。

## iPad 使用

1. 用 Safari 打开上面的在线地址。
2. 点“分享”按钮。
3. 选择“添加到主屏幕”。
4. 从主屏幕打开 PadMD。

iPadOS / Safari 18.4 及更高版本支持完整文件夹选择。较旧版本请先在“文件”App 中压缩文件夹，再使用“导入 ZIP”。

## 本地开发

当前网页实现位于 `webapp/`：

```powershell
cd webapp
npm install
npm test
npm run dev
```

GitHub Pages 构建：

```powershell
cd webapp
npm run build
```

默认基础路径为 `/padmd/`。根路径托管可设置环境变量 `BASE_PATH=/` 后重新构建。

原 Flutter 原型仍保留在 `lib/`、`android/` 和 `ios/`，但线上 PWA 已改用 Vite + CodeMirror 6，以显著减少下载和启动时间。

## 开源说明

PadMD 使用 CodeMirror 6、fflate 和 Vite。文件树与文件夹读取设计参考了 MIT 许可的 [techjewel/mdread](https://github.com/techjewel/mdread)。完整第三方声明见 `webapp/public/THIRD_PARTY_NOTICES.md`。

本项目以 MIT License 发布。
