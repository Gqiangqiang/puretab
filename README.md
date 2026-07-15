# 纯页 PureTab - 极简新标签页

一款提供简洁的新标签页浏览器扩展。提供最简洁的新标签页体验：时钟、搜索、快捷链接、锁屏等模块

## 功能特性

| 功能 | 说明 |
|------|------|
| 实时时钟 | 自动更新时间，带日期、星期显示 |
| 搜索框 | 支持 URL 识别直接跳转，内置必应/百度/谷歌，可自定义搜索引擎 |
| 快捷链接 | 数据驱动，支持拖拽排序、右键编辑、自定义图标，列数和卡片大小可调 |
| 主题系统 | 白色 / 黑色 / 自动（定时切换）/ 跟随系统 四种模式 |
| 锁屏 | 手动锁屏 `Ctrl/Cmd+Shift+L`，无操作自动锁屏，复用时钟显示 |
| 侧边面板 | 设置中心、搜索引擎管理，右侧滑出式交互 |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `/` | 聚焦搜索框 |
| `Esc` | 关闭侧边面板 / 解除锁屏 |
| `Ctrl/Cmd+Shift+L` | 手动锁屏 |

## 本地开发

无构建步骤，纯原生 HTML / CSS / JavaScript。

1. 克隆仓库
2. 打开 `chrome://extensions`（或 Edge 的 `edge://extensions`）
3. 开启「开发者模式」
4. 「加载已解压的扩展程序」→ 选择本项目根目录
5. 修改文件后点击「重新加载」，新开标签页查看效果

调试：在新标签页中按 `Ctrl/Cmd+Shift+I` 打开 DevTools。

## 项目结构

```
manifest.json        # MV3 清单
newtab.html          # 新标签页入口（单页结构）
css/style.css        # 全部样式（CSS 变量主题系统 + 深色主题）
js/app.js            # 全部交互逻辑（单一 PureTabApp 类）
icons/               # 扩展图标 16/48/128
```

## 技术栈

- Chrome Extension Manifest V3
- 纯原生 HTML / CSS / JavaScript，零依赖、零构建
- CSS 变量驱动的主题系统
- chrome.storage.local 数据持久化（`puretab_` 前缀键名）

## 浏览器兼容

- Chrome（Manifest V3 完全支持）
- Edge（Manifest V3 完全支持）
- Firefox 109+（Manifest V3 支持）

## 许可

MIT
