# 参与贡献

感谢你帮助改进 Moyo。项目欢迎代码、测试、文档、兼容性报告和交互建议。

## 提交问题前

1. 确认正在使用最新线上版本；
2. 搜索已有 Issue，避免重复；
3. 备份重要文档后再复现可能影响数据的问题；
4. 不要在 Issue 中上传私人 Markdown、身份信息或未脱敏截图。

Bug 报告应说明设备、操作系统、浏览器版本、复现步骤、预期结果和实际结果。文件选择器问题还应说明导入方式是单文件、文件夹还是 ZIP。

## 开发环境

需要 Node.js 20 或更高版本。

```powershell
git clone https://github.com/gnitgintoay/padmd.git
cd padmd/webapp
npm install
npm test
npm run dev
```

## 修改原则

- 保持本地优先，不引入未经说明的上传或遥测；
- 不更改 IndexedDB 数据库名称 `padmd-web`；
- 保存、恢复草稿与覆盖原文件必须在语义上明确区分；
- 新功能需要兼顾触屏、蓝牙键盘、横竖屏和夜间模式；
- 不把 iPad 专属 API 当作所有浏览器都支持；
- 变更文件流程时，优先保证“不丢数据、不覆盖原文件”。

## 测试与提交

提交 Pull Request 前运行：

```powershell
cd webapp
npm test
npm run build
```

对于界面变化，还应检查窄屏、平板横屏、日间与夜间主题。PR 描述中请写明：解决的问题、主要变化、验证方式和可能影响的数据边界。

## 提交信息

使用简洁的祈使句描述一次逻辑变化，例如：

- `Preserve imported folder hierarchy`
- `Improve tablet sidebar navigation`
- `Document local storage privacy boundary`

## 安全问题

不要在公开 Issue 中披露可直接利用的漏洞细节。请按照 [SECURITY.md](SECURITY.md) 中的方式报告。
