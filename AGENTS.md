# AGENTS.md — 纯页 PureTab 扩展

面向 AI 编码代理的项目指南。请先阅读本文件再开始改动。

## 项目概览

纯页 PureTab 是一款 Manifest V3 浏览器扩展，通过 `chrome_url_overrides.newtab` 接管新标签页，提供最简洁的新标签页体验：时钟、搜索、快捷链接、锁屏等模块。

- **类型**：Browser Extension (MV3)，纯前端，无后端
- **语言**：原生 HTML / CSS / JavaScript（无构建步骤、无打包器、无依赖管理）
- **目标浏览器**：Chrome / Edge / Firefox 109+
- **UI 语言**：简体中文（所有文案、注释、变量命名说明均使用中文）

## 目录结构

```
manifest.json        # MV3 清单，权限：storage；含 browser_specific_settings（Firefox）、CSP 声明
newtab.html          # 新标签页入口（单页结构，所有面板内联）
css/style.css        # 全部样式（含 CSS 变量主题系统、深色主题）
js/app.js            # 全部交互逻辑（单一 PureTabApp 类）
icons/               # 扩展图标 16/48/128
pack.sh              # 打包脚本，产物输出到 dist/（不提交）
dist/                # 打包产物（git 忽略，仅发布时本地生成）
privacy.html         # 隐私政策页（商店上架用）
change-log.md        # 更新日志（每次打包需更新，见「约定」）
```

## 构建、测试与工具链

- **无构建步骤、无打包器、无 npm 依赖**。改完源码直接重新加载扩展即可（见下）。
- **无 test / lint / typecheck 工具链**——不要假设这些命令存在，改完代码靠手动验证（新开标签页 + DevTools）。
- 打包发布：`./pack.sh`。脚本从 `manifest.json` 读取 `version`，生成 `dist/puretab-v<version>.zip`（仅含 manifest/html/css/js/icons）。

## 加载与调试

无构建步骤。本地开发流程：

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本目录
4. 修改文件后在该页点「重新加载」；新开标签页查看效果

调试新标签页：在新标签页中按 `Ctrl/Cmd+Shift+I`（或右键检查）打开 DevTools。

## 架构与约定

### 单类驱动
所有逻辑集中在 `js/app.js` 的 `PureTabApp` 类中，按模块拆分为 `initXxx()` 方法。新增功能时：
- 在 `init()` 中调用新的 `initXxx()`
- 用 `// ====` 包裹的中文注释块划分模块边界（保持现有风格）
- 实例在 `window.pureTab` 上，供 HTML 内联事件或 DevTools 调试使用
- ⚠️ `init()` 顺序有依赖：`initClock` → `initSearch` → ... → `loadPreferences` / `applyVisibility` / `applyTimeWeight` → `initSearchEngine` → `loadData` → `initLockScreen`。调整顺序前确认无前后依赖。

### 数据持久化
- 使用 `chrome.storage.local`（通过 `StorageWrapper` 类包装），键名统一前缀 `puretab_`（如 `puretab_links`、`puretab_theme`）
- `StorageWrapper` 提供同步 API（`getItem` / `setItem`），内部维护内存缓存 + 异步 fire-and-forget 写入 `chrome.storage.local`
- 构造函数异步初始化：`storage.init()` 加载全部数据到缓存后，才调用 `init()` 渲染 UI
- 开发降级：非扩展上下文下（如直接在浏览器打开 newtab.html）自动回退到 `localStorage`
- ⚠️ v2.0.0 已移除从 `localStorage` 迁移旧 `tabsync_*` 数据的逻辑。chrome.storage.local 是唯一持久化源
- ⚠️ `loadData()` 当前是占位逻辑（仅读 `puretab_theme` 且未应用回 UI）。真正的持久化加载分散在 `loadPreferences()` + 各模块自己的 `initXxx()`（各自读取所需 key）。**新增持久化字段：在对应 `initXxx()` 内读、在对应写操作处存即可，不要依赖 `loadData()`。**

### 主题系统
- `css/style.css` 顶部 `:root` 定义「晨光」浅色主题 CSS 变量，`[data-theme="dark"]` 覆盖为深色
- 切换通过 `document.documentElement.setAttribute('data-theme', ...)`，状态存 `puretab_theme`
- 颜色一律使用 CSS 变量（`--accent-warm` 等），不要硬编码十六进制值

### DOM 结构
- `newtab.html` 为单页结构，所有面板内联在同一文件
- 侧边面板由 `initSidePanel()` 控制 `.open` 类切换
- 新增面板：在 HTML 中加结构 + 在 `app.js` 加 `initXxx()` + 在 `css/style.css` 加样式

### 交互细节
- 键盘：`/` 聚焦搜索框，`Esc` 关闭侧边面板 / 解除锁屏，`Ctrl/Cmd+Shift+L` 手动锁屏
- 反馈：`showToast(msg)` 提示
- 搜索：自动识别 URL（正则匹配）直接跳转，否则使用当前选中的搜索引擎

### 锁屏
- 由 `initLockScreen()` 驱动；`lock()` / `unlock()` 通过 `.lock-screen.show` 类切换覆盖层（z-index = `--z-loader`，盖住一切）
- 解锁：点击锁屏层任意处或按 `Esc`（无需密码）
- 自动锁屏：基于无操作时长（`mousemove`/`keydown`/`click`/`scroll`/`touchstart`，带节流重置），默认关闭
- 设置项：`puretab_auto_lock_enabled`（默认 `false`）、`puretab_auto_lock_time`（秒，默认 60）
- ⚠️ `locked` 状态不持久化（仅当次标签页会话），避免新开标签页被全部锁住
- 锁屏态下屏蔽 `/`、`Cmd/Ctrl+F` 等快捷键穿透
- 锁屏时钟复用 `initClock()` 的 `setInterval` 同步更新

## 代码风格
- 注释、文案、变量说明用中文；CSS 类名、JS 标识符用英文
- 缩进 2 空格；字符串优先单引号
- 不使用框架、不引入 npm 依赖、不添加构建工具（保持零依赖单文件架构）
- 外部资源：无（已移除 Google Fonts CDN，改用系统字体栈 PingFang SC / Microsoft YaHei / Segoe UI 等）
- 使用最简洁的代码，完成更多的功能，可复用的代码尽量复用，包括css、html、js等

## 常见陷阱

- 修改 `manifest.json` 后必须重新加载扩展才生效
- `newtab.html` 中部分元素 ID 被 `app.js` 直接 `getElementById` 引用，重命名 ID 需同步两边
- `chrome.*` API 在普通页面中不可用，仅在新标签页/扩展上下文中可用

## 不要做

- 不要拆分 `app.js` 为多文件（除非引入模块化方案并同步改 HTML 引入方式）
- 不要引入 React/Vue 等框架或打包器
- 不要把硬编码颜色写回 CSS（统一走变量）
- 不要在提交信息中出现 `Co-Authored-By` 等字样

## 约定
- 重要功能的增删改都要记录到 AGENTS.md
- 每次打包时，都要将更新记录到 change-log.md，更新信息从 git 信息中获取
