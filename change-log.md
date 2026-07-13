# 更新日志

## v1.0.1 — 多浏览器发布准备（第一批）

### 新增
- manifest.json 添加 `browser_specific_settings.gecko`，支持 Firefox Add-ons (AMO) 上架
- manifest.json 添加显式 `content_security_policy` 声明，加快商店审核

### 变更
- 移除 manifest.json 中的 `action` 字段（新标签页扩展无需工具栏按钮，消除审核歧义）
- 移除 Google Fonts CDN（Noto Sans SC）外部依赖，改用系统字体栈（PingFang SC / Microsoft YaHei / Segoe UI 等），实现零外部请求、离线可用
- 重写 README.md 为正式项目说明文档

### 影响
- 扩展不再加载任何外部资源，隐私政策可声明「不收集、不传输任何用户数据」
- 兼容 Chrome / Edge / Firefox 109+ 三大浏览器平台

## v1.0.0 — 多浏览器发布准备（第二批）

### 变更
- 数据持久化从 `localStorage` 迁移至 `chrome.storage.local`，通过 `StorageWrapper` 类实现：
  - 同步内存缓存 + 异步 fire-and-forget 持久化，保持与 localStorage 一致的同步 API
  - 首次加载自动检测并迁移旧 localStorage 数据（`tabsync_*` 前缀键）
  - 开发环境降级：非扩展上下文下自动回退到 localStorage
- 构造函数改为异步初始化（`storage.init().then(() => init())`），确保数据加载完成后再渲染 UI
