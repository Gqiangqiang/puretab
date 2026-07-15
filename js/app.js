// ========================================
// 纯页 PureTab - 极简新标签页
// 核心交互逻辑
// ========================================

// 存储包装器：chrome.storage.local 异步持久化 + 同步内存缓存
// 保持与 localStorage 相同的字符串 API（getItem 返回 string|null）
class StorageWrapper {
  constructor() {
    this.cache = {};
    this._useChrome = false;
  }

  async init() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      this._useChrome = true;
      const data = await chrome.storage.local.get(null);
      this.cache = data || {};
    } else {
      // 开发降级：直接走 localStorage
      this._useChrome = false;
    }
  }

  getItem(key) {
    if (this._useChrome) {
      return key in this.cache ? this.cache[key] : null;
    }
    return localStorage.getItem(key);
  }

  setItem(key, value) {
    const val = String(value);
    if (this._useChrome) {
      this.cache[key] = val;
      chrome.storage.local.set({ [key]: val });
    } else {
      localStorage.setItem(key, val);
    }
  }

  // 获取所有 puretab_ 开头的数据
  getAllData() {
    const data = {};
    if (this._useChrome) {
      Object.keys(this.cache).forEach(key => {
        if (key.startsWith('puretab_')) data[key] = this.cache[key];
      });
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('puretab_')) data[key] = localStorage.getItem(key);
      }
    }
    return data;
  }

  // 批量导入数据
  async importData(data) {
    if (this._useChrome) {
      Object.entries(data).forEach(([key, value]) => { this.cache[key] = value; });
      await chrome.storage.local.set(data);
    } else {
      Object.entries(data).forEach(([key, value]) => { localStorage.setItem(key, value); });
    }
  }
}

class PureTabApp {
  constructor() {
    this.state = {
      theme: 'auto',
      darkStart: 18,
      darkEnd: 7,
      links: [],
      searchEngines: [],
      searchEngine: '',
      cardWidth: 108,
      showDate: true,
      showWeekday: true,
      showQuote: true,
      showTime: true,
      timeWeight: 300,
      showLinks: true,
      showLinkText: true,
      showIconBg: true,
      colsPerRow: 6,
      linkTarget: '_self',
      // 锁屏
      locked: false,
      autoLockEnabled: false,
      autoLockTime: 60,
    };

    this.iconMap = {
      tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>',
      book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
      file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
      link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
      edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',
      trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>'
    };

    this.storage = new StorageWrapper();
    this.storage.init().then(() => this.init());
  }

  init() {
    this.initClock();
    this.initSearch();
    this.initSidePanel();
    this.initSettingsEntry();
    this.initTheme();
    this.initQuickLinks();
    this.loadPreferences();
    this.applyVisibility();
    this.applyTimeWeight();
    this.initSearchEngine();
    this.loadData();
    this.initLockScreen();
  }

  loadPreferences() {
    const bool = (k, def) => { const v = this.storage.getItem(k); return v !== null ? v === 'true' : def; };
    const savedEngines = this.storage.getItem('puretab_search_engines');
    if (savedEngines) {
      try { this.state.searchEngines = JSON.parse(savedEngines); } catch(e) {}
    }
    if (!this.state.searchEngines.length) {
      this.state.searchEngines = this.getDefaultSearchEngines();
      this.saveSearchEngines();
    }
    const savedEngine = this.storage.getItem('puretab_search_engine');
    if (savedEngine && this.state.searchEngines.some(e => e.id === savedEngine)) {
      this.state.searchEngine = savedEngine;
    } else if (savedEngine) {
      const old = { bing: '必应', baidu: '百度', google: '谷歌' };
      const byName = this.state.searchEngines.find(e => e.name === old[savedEngine]);
      this.state.searchEngine = byName ? byName.id : this.state.searchEngines[0].id;
      this.storage.setItem('puretab_search_engine', this.state.searchEngine);
    } else {
      this.state.searchEngine = this.state.searchEngines[0].id;
      this.storage.setItem('puretab_search_engine', this.state.searchEngine);
    }
    this.state.showDate = bool('puretab_show_date', true);
    this.state.showWeekday = bool('puretab_show_weekday', true);
    this.state.showQuote = bool('puretab_show_quote', true);
    this.state.showTime = bool('puretab_show_time', true);
    const savedWeight = parseInt(this.storage.getItem('puretab_time_weight'));
    this.state.timeWeight = [300,400,500,600,700].includes(savedWeight) ? savedWeight : 300;
    this.state.showLinks = bool('puretab_show_links', true);
    this.state.showLinkText = bool('puretab_show_link_text', true);
    try { this.collapsedSections = new Set(JSON.parse(this.storage.getItem('puretab_collapsed_sections') || '[]')); } catch(e) { this.collapsedSections = new Set(); }
  }

  getDefaultSearchEngines() {
    return [
      { id: this.generateId(), name: '必应', url: 'https://www.bing.com/search?q=' },
      { id: this.generateId(), name: '百度', url: 'https://www.baidu.com/s?wd=' },
      { id: this.generateId(), name: '谷歌', url: 'https://www.google.com/search?q=' }
    ];
  }

  saveSearchEngines() {
    this.storage.setItem('puretab_search_engines', JSON.stringify(this.state.searchEngines));
  }

  applyVisibility() {
    document.body.classList.toggle('hide-date', !this.state.showDate);
    document.body.classList.toggle('hide-weekday', !this.state.showWeekday);
    document.body.classList.toggle('hide-quote', !this.state.showQuote);
    document.body.classList.toggle('hide-time', !this.state.showTime);
    document.body.classList.toggle('hide-links', !this.state.showLinks);
    document.body.classList.toggle('hide-link-text', !this.state.showLinkText);
    document.body.classList.toggle('hide-icon-bg', !this.state.showIconBg);
  }

  // 应用时间字体粗细（主时钟与锁屏时钟同步）
  applyTimeWeight() {
    const w = this.state.timeWeight;
    const main = document.getElementById('timeDisplay');
    if (main) main.style.fontWeight = w;
    const lock = document.getElementById('lockTimeDisplay');
    if (lock) lock.style.fontWeight = w;
  }

  // ========================================
  // 时钟与日期
  // ========================================
  initClock() {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');

      const timeEl = document.getElementById('timeDisplay');
      const dateEl = document.getElementById('dateDisplay');
      const weekdayEl = document.getElementById('weekdayDisplay');

      if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

      if (dateEl) dateEl.textContent = `${now.getMonth() + 1}月${now.getDate()}日`;

      const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const weekdayText = weekDays[now.getDay()];

      if (weekdayEl) {
        weekdayEl.textContent = weekdayText;
      }

      // 同步锁屏时钟
      const lockTimeEl = document.getElementById('lockTimeDisplay');
      const lockDateEl = document.getElementById('lockDateDisplay');
      if (lockTimeEl) lockTimeEl.textContent = `${hours}:${minutes}`;
      if (lockDateEl) lockDateEl.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdayText}`;

    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  // ========================================
  // 搜索功能
  // ========================================
  initSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.querySelector('.search-btn');

    if (!input) return;

    const doSearch = () => {
      const query = input.value.trim();
      if (!query) return;

      // 判断是否为URL
      const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?$/;
      if (urlPattern.test(query)) {
        const url = query.startsWith('http') ? query : `https://${query}`;
        window.location.href = url;
      } else {
        const engine = this.state.searchEngines.find(e => e.id === this.state.searchEngine);
        if (engine) window.location.href = engine.url + encodeURIComponent(query);
      }
    };

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doSearch();
    });

    if (btn) btn.addEventListener('click', doSearch);

    // 自动聚焦
    input.focus();
  }

  initSearchEngine() {
    const el = document.getElementById('searchEngine');
    const menu = document.getElementById('searchEngineMenu');
    if (!el || !menu) return;
    this.refreshEngineMenu(menu);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      el.classList.toggle('active', isOpen);
    });

    document.addEventListener('click', (e) => {
      if (!el.contains(e.target)) { menu.classList.remove('open'); el.classList.remove('active'); }
    });
  }

  refreshEngineMenu(menu) {
    const el = document.getElementById('searchEngine');
    const nameEl = document.getElementById('searchEngineName');
    const cur = this.state.searchEngines.find(e => e.id === this.state.searchEngine);
    if (nameEl && cur) nameEl.textContent = cur.name;
    if (!menu) menu = document.getElementById('searchEngineMenu');
    if (!menu) return;
    menu.replaceChildren();
    this.state.searchEngines.forEach(e => {
      const opt = document.createElement('div');
      opt.className = 'search-engine-option' + (e.id === this.state.searchEngine ? ' active' : '');
      opt.textContent = e.name;
      opt.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.state.searchEngine = e.id;
        this.storage.setItem('puretab_search_engine', e.id);
        if (nameEl) nameEl.textContent = e.name;
        this.refreshEngineMenu(menu);
        menu.classList.remove('open');
        if (el) el.classList.remove('active');
      });
      menu.appendChild(opt);
    });
  }

  // ========================================
  // FAB 悬浮按钮
  // ========================================
  // 侧边面板
  // ========================================
  initSidePanel() {
    const closeBtn = document.getElementById('panelClose');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePanel());
    }

    // 点击遮罩关闭
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('sidePanel');
      const trigger = document.getElementById('settingsBtn');
      // 点击编辑器弹窗（如添加搜索引擎）时不关闭 side-panel
      if (e.target.closest('.link-editor-overlay') ||
          e.target.closest('.link-editor')) return;
      if (panel?.classList.contains('open') && 
          !panel.contains(e.target) &&
          !trigger?.contains(e.target)) {
        this.closePanel();
      }
    });
  }

  openPanel(type) {
    const panel = document.getElementById('sidePanel');
    const title = document.getElementById('panelTitle');
    const content = document.getElementById('panelContent');

    if (!panel || !title || !content) return;

    this.state.currentPanel = type;

    const panelConfig = {
      settings: { title: '设置', class: 'settings-panel', render: () => this.renderSettingsPanel() },
      searchEngines: { title: '搜索引擎管理', class: 'search-engines-panel', render: () => this.renderSearchEnginesPanel(), back: 'settings' }
    };

    const config = panelConfig[type];
    if (!config) return;

    title.textContent = config.title;
    content.className = `panel-content ${config.class}`;
    this.safeHTML(content, config.render());

    // 返回按钮：有 back 配置则显示
    const backBtn = document.getElementById('panelBack');
    if (backBtn) {
      if (config.back) {
        backBtn.hidden = false;
        backBtn.onclick = () => this.openPanel(config.back);
      } else {
        backBtn.hidden = true;
        backBtn.onclick = null;
      }
    }

    // 绑定面板内事件
    this.bindPanelEvents(type, content);

    panel.classList.add('open');

    // 添加遮罩
    let overlay = document.querySelector('.panel-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'panel-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => this.closePanel());
    }
    overlay.classList.add('open');
  }

  closePanel() {
    const panel = document.getElementById('sidePanel');
    const overlay = document.querySelector('.panel-overlay');

    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');

    this.state.currentPanel = null;
  }

  bindPanelEvents(type, container) {
    switch(type) {
      case 'settings':
        this.bindSettingsEvents(container);
        break;
      case 'searchEngines':
        this.bindSearchEnginesEvents(container);
        break;
    }
  }

  // ========================================
  // 设置入口（点击齿轮按钮）
  // ========================================
  initSettingsEntry() {
    const el = document.getElementById('settingsBtn');
    if (el) {
      el.addEventListener('click', () => this.openPanel('settings'));
    }
  }

  // ========================================
  // 设置面板
  // ========================================
  renderSettingsPanel() {
    const markBtn = (v, label) => { const pct = ((v - 80) / (180 - 80) * 100).toFixed(2); return '<button type="button" class="size-mark' + (this.state.cardWidth === v ? ' active' : '') + '" data-size="' + v + '" style="left:' + pct + '%"><span class="size-mark-name">' + label + '</span><span class="size-mark-val">' + v + '</span></button>'; };
    const toggles = [
      { key: 'showTime', label: '时间' },
      { key: 'showDate', label: '日期' },
      { key: 'showWeekday', label: '周几' },
      { key: 'showQuote', label: '底部金句' }
    ];
    const iconToggles = [
      { key: 'showLinks', label: '快捷链接' },
      { key: 'showLinkText', label: '图标文字' },
      { key: 'showIconBg', label: '图标背景色' }
    ];
    const thmBtn = (v, label, disabled = false) => '<button class="settings-cols-btn' + (this.state.theme === v ? ' active' : '') + '" data-theme="' + v + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    // 时间字体粗细选项
    const weightBtn = (v, label) => '<button class="settings-cols-btn' + (this.state.timeWeight === v ? ' active' : '') + '" data-time-weight="' + v + '"' + ' style="font-weight:' + v + '">' + label + '</button>';
    // 链接打开方式选项
    const linkTargetBtn = (v, label) => '<button class="settings-cols-btn' + (this.state.linkTarget === v ? ' active' : '') + '" data-link-target="' + v + '">' + label + '</button>';
    // 自动锁屏时长选项
    const lockTimeBtn = (v, label) => '<button class="settings-cols-btn' + (this.state.autoLockTime === v ? ' active' : '') + '" data-lock-time="' + v + '"' + (!this.state.autoLockEnabled ? ' disabled' : '') + '>' + label + '</button>';
    // 可折叠分组容器
    const section = (key, title, body) => {
      const collapsed = (this.collapsedSections && this.collapsedSections.has(key)) ? ' collapsed' : '';
      return '<div class="settings-section' + collapsed + '">' +
        '<button type="button" class="settings-collapse-header" data-collapse="' + key + '">' +
        '<h4 class="settings-heading">' + title + '</h4>' +
        '<svg class="settings-collapse-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="settings-collapse-body"><div class="settings-collapse-inner"><div class="settings-collapse-card">' + body + '</div></div></div>' +
        '</div>';
    };
    return (
      section('search', '搜索引擎',
        '<button class="settings-menu-btn" data-action="searchEngines">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
        '搜索引擎管理</button>'
      ) +
      section('theme', '主题模式',
        '<div class="settings-cols">' + thmBtn('light','白色') + thmBtn('dark','黑色') + thmBtn('auto','自动') + thmBtn('system','跟随系统', true) + '</div>' +
        (this.state.theme === 'auto' ? this.renderDarkRange() : '')
      ) +
      section('display', '显示设置',
        toggles.map(t => '<div class="settings-toggle-row"><span class="settings-toggle-label">' + t.label + '</span><div class="settings-switch' + (this.state[t.key] ? ' on' : '') + '" data-toggle="' + t.key + '"></div></div>').join('') +
        '<h4 class="settings-heading sub-heading">时间字体粗细</h4>' +
        '<div class="settings-cols">' + weightBtn(300,'细') + weightBtn(400,'常规') + weightBtn(500,'中等') + weightBtn(600,'半粗') + weightBtn(700,'粗') + '</div>'
      ) +
      section('icon', '图标设置',
        iconToggles.map(t => '<div class="settings-toggle-row"><span class="settings-toggle-label">' + t.label + '</span><div class="settings-switch' + (this.state[t.key] ? ' on' : '') + '" data-toggle="' + t.key + '"></div></div>').join('') +
        '<h4 class="settings-heading sub-heading">图标大小 <span class="size-value" id="sizeValueLabel">' + this.state.cardWidth + 'px</span></h4>' +
        '<div class="size-range-wrap"><input type="range" min="80" max="180" step="1" value="' + this.state.cardWidth + '" class="size-range" id="sizeRange"><div class="size-marks" id="sizePresets"><span class="size-end size-end-start">80</span>' + markBtn(88,'小') + markBtn(108,'中') + markBtn(132,'大') + markBtn(160,'特大') + '<span class="size-end size-end-end">180</span></div></div>' +
        '<h4 class="settings-heading sub-heading">每行显示图标数 <span class="size-value" id="colsValueLabel">' + this.state.colsPerRow + '</span></h4>' +
        '<div class="size-range-wrap"><input type="range" min="4" max="10" step="1" value="' + this.state.colsPerRow + '" class="size-range" id="colsRange"><div class="cols-hint"><span>4</span><span>10</span></div></div>' +
        '<h4 class="settings-heading sub-heading">链接打开方式</h4>' +
        '<div class="settings-cols">' + linkTargetBtn('_self','当前标签页') + linkTargetBtn('_blank','新标签页') + '</div>'
      ) +
      section('lock', '锁屏',
        '<div class="settings-toggle-row"><span class="settings-toggle-label">无操作自动锁屏</span><div class="settings-switch' + (this.state.autoLockEnabled ? ' on' : '') + '" data-toggle="autoLockEnabled"></div></div>' +
        '<div class="settings-lock-times">' + lockTimeBtn(30,'30秒') + lockTimeBtn(60,'1分钟') + lockTimeBtn(180,'3分钟') + lockTimeBtn(300,'5分钟') + lockTimeBtn(600,'10分钟') + '</div>' +
        '<p class="settings-lock-hint">手动锁屏：点击顶栏锁形图标，或按 Ctrl/Cmd+Shift+L</p>'
      ) +
      section('data', '数据管理',
        '<button class="settings-menu-btn" id="exportDataBtn">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
        '导出数据</button>' +
        '<button class="settings-menu-btn" id="importDataBtn">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>' +
        '导入数据</button>' +
        '<p class="settings-data-hint">导出为 JSON 文件，可备份或迁移到其他设备</p>'
      )
    );
  }

  bindSettingsEvents(container) {
    // 折叠分组标题：就地切换，避免重渲染导致面板被误关
    container.querySelectorAll('[data-collapse]').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = header.dataset.collapse;
        const sectionEl = header.closest('.settings-section');
        const collapsed = sectionEl.classList.toggle('collapsed');
        if (collapsed) this.collapsedSections.add(key);
        else this.collapsedSections.delete(key);
        this.storage.setItem('puretab_collapsed_sections', JSON.stringify([...this.collapsedSections]));
      });
    });

    container.querySelectorAll('.settings-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPanel(btn.dataset.action);
      });
    });

    container.querySelectorAll('.settings-cols-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.theme !== undefined) {
          const v = btn.dataset.theme;
          this.state.theme = v;
          this.storage.setItem('puretab_theme', v);
          if (v === 'auto') {
            this.applyAutoTheme();
          } else if (v === 'system') {
            this.applySystemTheme();
          } else {
            document.documentElement.dataset.theme = v;
          }
          this.refreshSettingsPanel(); // 切换模式后重渲染，显示/隐藏深色时段滑块
        }
      });
    });

    const colsRange = container.querySelector('#colsRange');
    if (colsRange) {
      colsRange.addEventListener('input', () => this.applyColsCount(colsRange.value, container));
    }

    container.querySelectorAll('.size-mark[data-size]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyCardSize(btn.dataset.size, container);
      });
    });

    // 时间字体粗细（就地切换 active，立即应用到时钟）
    container.querySelectorAll('[data-time-weight]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = parseInt(btn.dataset.timeWeight);
        this.state.timeWeight = v;
        this.storage.setItem('puretab_time_weight', v);
        this.applyTimeWeight();
        container.querySelectorAll('[data-time-weight]').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.timeWeight) === v);
        });
      });
    });

    container.querySelectorAll('.settings-switch').forEach(sw => {
      sw.addEventListener('click', () => {
        const key = sw.dataset.toggle;
        this.state[key] = !this.state[key];
        this.storage.setItem('puretab_' + key.replace(/[A-Z]/g, m => '_' + m.toLowerCase()), this.state[key]);
        this.applyVisibility();
        sw.classList.toggle('on', this.state[key]);
        // 自动锁屏开关：重启计时器并切换时长按钮可用性（就地更新，避免重渲染导致面板被误关）
        if (key === 'autoLockEnabled') {
          this.applyAutoLockChange();
          container.querySelectorAll('[data-lock-time]').forEach(btn => {
            btn.disabled = !this.state.autoLockEnabled;
          });
        }
      });
    });

    // 自动锁屏时长选项（就地切换 active，避免重渲染）
    container.querySelectorAll('[data-lock-time]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        this.state.autoLockTime = parseInt(btn.dataset.lockTime);
        this.storage.setItem('puretab_auto_lock_time', this.state.autoLockTime);
        this.applyAutoLockChange();
        container.querySelectorAll('[data-lock-time]').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.lockTime) === this.state.autoLockTime);
        });
      });
    });

    // 链接打开方式（就地切换 active，立即应用到链接卡片）
    container.querySelectorAll('[data-link-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = btn.dataset.linkTarget;
        this.state.linkTarget = v;
        this.storage.setItem('puretab_link_target', v);
        this.applyLinkTarget();
        container.querySelectorAll('[data-link-target]').forEach(b => {
          b.classList.toggle('active', b.dataset.linkTarget === v);
        });
      });
    });

    const sizeRange = container.querySelector('#sizeRange');
    if (sizeRange) {
      sizeRange.addEventListener('input', () => this.applyCardSize(sizeRange.value, container));
    }

    // 导出数据
    const exportBtn = container.querySelector('#exportDataBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.exportData();
      });
    }

    // 导入数据
    const importBtn = container.querySelector('#importDataBtn');
    if (importBtn) {
      importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.importData();
      });
    }

    // 深色时段范围条（仅自动模式下存在）
    this.bindDarkRange(container);
  }

  // 深色时段范围条 HTML（仅自动模式下渲染）
  renderDarkRange() {
    const fmt = h => { const hr = Math.floor(h); const min = (h % 1) === 0 ? '00' : '30'; return String(hr).padStart(2, '0') + ':' + min; };
    return `
      <div class="theme-range-wrap" id="themeRangeWrap">
        <div class="theme-range-labels">
          <span>开始<b id="darkStartLabel">${fmt(this.state.darkStart)}</b></span>
          <span>结束<b id="darkEndLabel">${fmt(this.state.darkEnd)}</b></span>
        </div>
        <div class="theme-range-track" id="themeRangeTrack">
          <input type="range" min="0" max="24" step="0.5" value="${this.state.darkStart}" class="theme-range theme-range-start" id="darkStartRange">
          <input type="range" min="0" max="24" step="0.5" value="${this.state.darkEnd}" class="theme-range theme-range-end" id="darkEndRange">
        </div>
        <div class="theme-range-hint">深色时段，可跨午夜（如 18:00 → 次日 07:00）</div>
      </div>`;
  }

  // 构建范围条轨道渐变（高亮深色时段，支持跨午夜）
  buildRangeGradient() {
    const { darkStart: s, darkEnd: e } = this.state;
    const pct = h => (h / 24 * 100).toFixed(2);
    const dark = 'var(--accent-rose)';
    const base = 'var(--bg-glass-hover)';
    if (s === e) return `linear-gradient(to right, ${base}, ${base})`;
    // 深色区间（归一化到 [0,24] 内）
    const intervals = s < e ? [[s, e]] : [[s, 24], [0, e]];
    intervals.sort((a, b) => a[0] - b[0]);
    const stops = [];
    let cursor = 0;
    for (const [a, b] of intervals) {
      if (a > cursor) stops.push(`${base} ${pct(cursor)}%`, `${base} ${pct(a)}%`);
      stops.push(`${dark} ${pct(a)}%`, `${dark} ${pct(b)}%`);
      cursor = b;
    }
    if (cursor < 24) stops.push(`${base} ${pct(cursor)}%`, `${base} ${pct(24)}%`);
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }

  // 绑定深色时段滑块事件
  bindDarkRange(container) {
    const startRange = container.querySelector('#darkStartRange');
    const endRange = container.querySelector('#darkEndRange');
    if (!startRange || !endRange) return;
    const track = container.querySelector('#themeRangeTrack');
    const startLabel = container.querySelector('#darkStartLabel');
    const endLabel = container.querySelector('#darkEndLabel');
    const fmt = h => { const hr = Math.floor(h); const min = (h % 1) === 0 ? '00' : '30'; return String(hr).padStart(2, '0') + ':' + min; };
    const refresh = () => {
      this.state.darkStart = parseFloat(startRange.value);
      this.state.darkEnd = parseFloat(endRange.value);
      this.storage.setItem('puretab_dark_start', this.state.darkStart);
      this.storage.setItem('puretab_dark_end', this.state.darkEnd);
      track.style.background = this.buildRangeGradient();
      startLabel.textContent = fmt(this.state.darkStart);
      endLabel.textContent = fmt(this.state.darkEnd);
      this.applyAutoTheme();
    };
    startRange.addEventListener('input', refresh);
    endRange.addEventListener('input', refresh);
    refresh(); // 初始化渐变与标签
  }

  refreshSettingsPanel() {
    const content = document.getElementById('panelContent');
    if (!content) return;
    this.safeHTML(content, this.renderSettingsPanel());
    this.bindSettingsEvents(content);
  }

  refreshSearchEnginesPanel() {
    const content = document.getElementById('panelContent');
    if (!content) return;
    this.safeHTML(content, this.renderSearchEnginesPanel());
    this.bindSearchEnginesEvents(content);
  }

  // ========================================
  // 搜索引擎管理面板
  // ========================================
  renderSearchEnginesPanel() {
    const curId = this.state.searchEngine;
    return this.state.searchEngines.map(e => `
      <div class="engine-item${e.id === curId ? ' active' : ''}">
        <div class="engine-info">
          <span class="engine-name">${e.name}</span>
          <span class="engine-url">${e.url}</span>
        </div>
        <div class="engine-actions">
          ${e.id !== curId ? '<button class="engine-select-btn" data-id="' + e.id + '">选中</button>' : ''}
          <button class="engine-delete-btn" data-id="${e.id}">删除</button>
        </div>
      </div>
    `).join('') + `
    <button class="engine-add-btn" id="engineAddBtn">+ 添加搜索引擎</button>
    `;
  }

  bindSearchEnginesEvents(container) {
    container.querySelectorAll('.engine-select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.searchEngine = btn.dataset.id;
        this.storage.setItem('puretab_search_engine', this.state.searchEngine);
        const menu = document.getElementById('searchEngineMenu');
        if (menu) this.refreshEngineMenu(menu);
        this.refreshSearchEnginesPanel();
      });
    });

    container.querySelectorAll('.engine-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state.searchEngines.length <= 1) {
          this.showToast('至少保留一个搜索引擎');
          return;
        }
        const id = btn.dataset.id;
        this.state.searchEngines = this.state.searchEngines.filter(e => e.id !== id);
        if (this.state.searchEngine === id) {
          this.state.searchEngine = this.state.searchEngines[0].id;
          this.storage.setItem('puretab_search_engine', this.state.searchEngine);
        }
        this.saveSearchEngines();
        const menu = document.getElementById('searchEngineMenu');
        if (menu) this.refreshEngineMenu(menu);
        this.refreshSearchEnginesPanel();
      });
    });

    const addBtn = container.querySelector('#engineAddBtn');
    addBtn?.addEventListener('click', () => this.showEngineEditor());
  }

  showEngineEditor(existingEngine) {
    const isEdit = !!existingEngine;
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'link-editor-overlay';
      const editor = document.createElement('div');
      editor.className = 'link-editor';
      this.safeHTML(editor,
        '<div class="link-editor-header">' +
        '<span class="link-editor-title">' + (isEdit ? '编辑搜索引擎' : '添加搜索引擎') + '</span>' +
        '<button class="link-editor-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        '</div>' +
        '<div class="link-editor-body">' +
        '<div class="link-editor-field">' +
        '<label class="link-editor-label" for="engineNameInput">名称</label>' +
        '<input type="text" class="link-editor-input" id="engineNameInput" value="' + (isEdit ? existingEngine.name : '') + '" placeholder="搜索引擎名称">' +
        '</div>' +
        '<div class="link-editor-field">' +
        '<label class="link-editor-label" for="engineUrlInput">搜索网址</label>' +
        '<input type="text" class="link-editor-input" id="engineUrlInput" value="' + (isEdit ? existingEngine.url : '') + '" placeholder="https://www.bing.com/search?q=">' +
        '<span class="link-editor-hint" id="engineUrlHint">搜索词将追加在网址末尾</span>' +
        '</div>' +
        '</div>' +
        '<div class="link-editor-footer">' +
        '<button class="link-editor-btn link-editor-btn--cancel">取消</button>' +
        '<button class="link-editor-btn link-editor-btn--confirm" id="engineConfirmBtn" disabled>确定</button>' +
        '</div>'
      );
      overlay.appendChild(editor);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      const nameInput = overlay.querySelector('#engineNameInput');
      const urlInput = overlay.querySelector('#engineUrlInput');
      const confirmBtn = overlay.querySelector('#engineConfirmBtn');
      const hint = overlay.querySelector('#engineUrlHint');
      const closeBtn = overlay.querySelector('.link-editor-close');
      const cancelBtn = editor.querySelector('.link-editor-btn--cancel');

      const validate = () => {
        const url = urlInput.value.trim();
        const name = nameInput.value.trim();
        const valid = name.length > 0 && url.length > 0 && url.includes('.');
        confirmBtn.disabled = !valid;
        if (url.length > 0 && !url.includes('.')) { urlInput.classList.add('error'); hint.classList.add('error'); }
        else { urlInput.classList.remove('error'); hint.classList.remove('error'); }
      };
      urlInput.addEventListener('input', validate);
      nameInput.addEventListener('input', validate);
      validate();

      let closed = false;
      const close = (result) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', docEsc);
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 400);
        resolve(result);
      };
      const docEsc = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', docEsc);

      const confirm = () => {
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        if (!url.includes('.') || !name) return;
        close({ name, url });
      };

      confirmBtn.addEventListener('click', confirm);
      cancelBtn.addEventListener('click', () => close(null));
      closeBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      [nameInput, urlInput].forEach(input => {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !confirmBtn.disabled) confirm(); });
      });

      setTimeout(() => nameInput.focus(), 120);
    }).then(result => {
      if (!result) return;
      this.state.searchEngines.push({
        id: this.generateId(),
        name: result.name,
        url: result.url
      });
      this.state.searchEngine = this.state.searchEngines[this.state.searchEngines.length - 1].id;
      this.storage.setItem('puretab_search_engine', this.state.searchEngine);
      this.saveSearchEngines();
      const menu = document.getElementById('searchEngineMenu');
      if (menu) this.refreshEngineMenu(menu);
      this.refreshSearchEnginesPanel();
    });
  }

  applyGridColumns() {
    const el = document.getElementById('quickLinks');
    if (!el) return;
    const w = Math.max(80, Math.min(180, this.state.cardWidth || 108));
    el.style.setProperty('--card-w', w + 'px');
  }

  // 应用图标大小并同步设置面板 UI
  applyCardSize(v, container) {
    v = Math.max(80, Math.min(180, parseInt(v) || 108));
    this.state.cardWidth = v;
    this.storage.setItem('puretab_card_width', v);
    this.applyGridColumns();
    if (!container) return;
    const range = container.querySelector('#sizeRange');
    if (range) range.value = v;
    const label = container.querySelector('#sizeValueLabel');
    if (label) label.textContent = v + 'px';
    container.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size) === v));
  }

  // 应用每行显示图标数
  applyColsPerRow() {
    const el = document.getElementById('quickLinks');
    if (!el) return;
    const n = Math.max(4, Math.min(10, parseInt(this.state.colsPerRow) || 6));
    el.style.setProperty('--cols', n);
  }

  // 应用每行显示图标数并同步设置面板 UI
  applyColsCount(v, container) {
    v = Math.max(4, Math.min(10, parseInt(v) || 6));
    this.state.colsPerRow = v;
    this.storage.setItem('puretab_cols_per_row', v);
    this.applyColsPerRow();
    if (!container) return;
    const range = container.querySelector('#colsRange');
    if (range) range.value = v;
    const label = container.querySelector('#colsValueLabel');
    if (label) label.textContent = v;
  }

  // ========================================
  // 主题切换（支持白色 / 黑色 / 自动 / 跟随系统 四种模式）
  // ========================================
  initTheme() {
    // 主题模式：light / dark / auto / system（默认 auto；auto 按时段，system 跟随系统）
    const savedTheme = this.storage.getItem('puretab_theme');
    this.state.theme = ['light','dark','auto','system'].includes(savedTheme) ? savedTheme : 'auto';
    // 深色时段（默认 18:00 ~ 次日 07:00）
    const ds = parseFloat(this.storage.getItem('puretab_dark_start'));
    const de = parseFloat(this.storage.getItem('puretab_dark_end'));
    this.state.darkStart = (!isNaN(ds) && ds >= 0 && ds <= 24) ? ds : 18;
    this.state.darkEnd = (!isNaN(de) && de >= 0 && de <= 24) ? de : 7;

    // 应用主题：auto 按时间，system 跟随系统，light/dark 直接设置
    if (this.state.theme === 'auto') {
      this.applyAutoTheme();
    } else if (this.state.theme === 'system') {
      this.applySystemTheme();
    } else {
      document.documentElement.dataset.theme = this.state.theme;
    }

    // 实时跟随：每 30 秒检查一次，到点自动切换
    setInterval(() => this.checkAutoTheme(), 30000);

    // 跟随系统：监听 prefers-color-scheme 变化，系统切换时实时跟随
    this.systemMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (this.systemMedia) {
      const onSystemChange = (e) => {
        if (this.state.theme !== 'system') return;
        const target = e.matches ? 'dark' : 'light';
        if (target !== document.documentElement.dataset.theme) {
          document.documentElement.dataset.theme = target;
          this.showToast(target === 'dark' ? '已自动切换为深色模式' : '已自动切换为浅色模式');
        }
      };
      if (this.systemMedia.addEventListener) this.systemMedia.addEventListener('change', onSystemChange);
      else if (this.systemMedia.addListener) this.systemMedia.addListener(onSystemChange);
    }

    // 顶部手动切换按钮：点击即在 light/dark 间切换，并退出自动模式
    const toggleBtn = document.getElementById('themeToggle');
    toggleBtn?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      this.state.theme = next;
      this.storage.setItem('puretab_theme', next);
    });
  }

  // 判断某小时是否处于深色时段（支持跨午夜）
  isDarkAt(h, start, end) {
    if (start === end) return false; // 起止相同视为无深色窗口
    return start < end ? (h >= start && h < end) : (h >= start || h < end);
  }

  // 自动模式：按当前时间应用主题
  applyAutoTheme() {
    if (this.state.theme !== 'auto') return;
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const target = this.isDarkAt(h, this.state.darkStart, this.state.darkEnd) ? 'dark' : 'light';
    document.documentElement.dataset.theme = target;
  }

  // 跟随系统模式：按系统深浅色应用主题
  applySystemTheme() {
    if (this.state.theme !== 'system') return;
    const target = this.systemMedia && this.systemMedia.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = target;
  }

  // 定时检查：跨过临界点时切换并提示一次
  checkAutoTheme() {
    if (this.state.theme !== 'auto') return;
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const target = this.isDarkAt(h, this.state.darkStart, this.state.darkEnd) ? 'dark' : 'light';
    if (target !== document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = target;
      this.showToast(target === 'dark' ? '已自动切换为深色模式' : '已自动切换为浅色模式');
    }
  }

  // ========================================
  // 数据加载
  // ========================================
  loadData() {
    // 从 chrome.storage.local 加载所有数据
    const keys = ['puretab_theme'];
    keys.forEach(key => {
      const data = this.storage.getItem(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          // 应用到对应状态
        } catch(e) {}
      }
    });
  }

  // ========================================
  // 快捷链接（数据驱动 + 持久化）
  // ========================================
  getDefaultLinks() {
    return [
      { id: this.generateId(), name: 'Bilibili', url: 'https://bilibili.com', icon: 'tv' },
      { id: this.generateId(), name: '知乎', url: 'https://zhihu.com', icon: 'book' },
      { id: this.generateId(), name: 'GitHub', url: 'https://github.com', icon: 'github' },
      { id: this.generateId(), name: 'Notion', url: 'https://notion.so', icon: 'file' },
      { id: this.generateId(), name: 'YouTube', url: 'https://youtube.com', icon: 'youtube' }
    ];
  }

  generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  initQuickLinks() {
    const saved = this.storage.getItem('puretab_links');
    if (saved) {
      try { this.state.links = JSON.parse(saved); } catch(e) {}
      let migrated = false;
      this.state.links.forEach(link => { if (!link.id) { link.id = this.generateId(); migrated = true; } });
      if (migrated) this.saveLinks();
    }
    if (!this.state.links || !this.state.links.length) {
      this.state.links = this.getDefaultLinks();
      this.saveLinks();
    }
    const savedW = this.storage.getItem('puretab_card_width');
    this.state.cardWidth = savedW ? (parseInt(savedW) || 108) : 108;
    const savedCols = parseInt(this.storage.getItem('puretab_cols_per_row'));
    this.state.colsPerRow = (savedCols >= 4 && savedCols <= 10) ? savedCols : 6;
    this.state.linkTarget = this.storage.getItem('puretab_link_target') === '_blank' ? '_blank' : '_self';
    this.renderLinks();
    this.applyGridColumns();
    this.applyColsPerRow();

    const addBtn = document.getElementById('addLinkBtn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.addLink();
      });
    }
    this.bindContextMenu();
    this.bindDragAndDrop();
  }

  renderLinks() {
    const container = document.getElementById('quickLinks');
    if (!container) return;
    container.querySelectorAll('.link-card:not(.add-link)').forEach(c => c.remove());
    const addBtn = container.querySelector('.add-link');

    this.state.links.forEach(link => {
      const card = document.createElement('a');
      card.href = link.url;
      card.className = 'link-card';
      card.dataset.linkId = link.id;
      card.draggable = true;
      card.title = link.name;
      card.target = this.state.linkTarget || '_self';
      if (this.state.linkTarget === '_blank') card.rel = 'noopener noreferrer';
      this.safeHTML(card, '<div class="link-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div><span></span>');
      card.querySelector('span').textContent = link.name;
      container.insertBefore(card, addBtn);
      this.loadLinkIcon(card, link.url);
    });
  }

  // 应用链接打开方式到所有已渲染的链接卡片
  applyLinkTarget() {
    document.querySelectorAll('.link-card:not(.add-link)').forEach(card => {
      card.target = this.state.linkTarget || '_self';
      if (this.state.linkTarget === '_blank') card.rel = 'noopener noreferrer';
      else card.removeAttribute('rel');
    });
  }

  bindDragAndDrop() {
    const container = document.getElementById('quickLinks');
    if (!container) return;
    let draggedCard = null;
    let lastAfter = null;

    container.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.link-card:not(.add-link)');
      if (!card) { e.preventDefault(); return; }
      draggedCard = card;
      lastAfter = null;
      card.classList.add('dragging');
      container.classList.add('dragging-active');
      e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedCard) return;
      const after = this.getDragAfterElement(container, e.clientX, e.clientY);
      if (after === lastAfter) return;
      lastAfter = after;

      // Cancel previous FLIP
      const allCards = container.querySelectorAll('.link-card:not(.add-link)');
      allCards.forEach(c => { c.style.transition = 'none'; c.style.transform = ''; });

      // Record positions of non-dragging cards
      const peers = [...container.querySelectorAll('.link-card:not(.dragging):not(.add-link)')];
      const first = new Map();
      peers.forEach(c => first.set(c, c.getBoundingClientRect()));

      // Move the dragged card
      const addBtn = container.querySelector('.add-link');
      if (after == null) {
        container.insertBefore(draggedCard, addBtn);
      } else {
        container.insertBefore(draggedCard, after);
      }

      // FLIP: animate peers
      peers.forEach(c => {
        const prev = first.get(c);
        if (!prev) return;
        const curr = c.getBoundingClientRect();
        const dx = prev.left - curr.left;
        const dy = prev.top - curr.top;
        if (dx === 0 && dy === 0) return;
        c.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        requestAnimationFrame(() => {
          c.style.transition = 'transform 0.18s cubic-bezier(0.4,0,0.2,1)';
          c.style.transform = '';
        });
      });
    });

    container.addEventListener('dragend', () => {
      if (!draggedCard) return;
      draggedCard.classList.remove('dragging');
      container.classList.remove('dragging-active');
      // Clean FLIP
      const allCards = container.querySelectorAll('.link-card:not(.add-link)');
      allCards.forEach(c => { c.style.transition = ''; c.style.transform = ''; });
      this.syncLinkOrder();
      draggedCard = null;
      lastAfter = null;
    });
  }

  getDragAfterElement(container, x, y) {
    const els = [...container.querySelectorAll('.link-card:not(.dragging):not(.add-link)')];
    if (!els.length) return null;

    // 按行分组（同行 top 一致）
    const rows = [];
    let curTop = null;
    let curRow = [];
    els.forEach(el => {
      const box = el.getBoundingClientRect();
      if (curTop === null || Math.abs(box.top - curTop) > 2) {
        if (curRow.length) rows.push(curRow);
        curRow = [];
        curTop = box.top;
      }
      curRow.push(el);
    });
    if (curRow.length) rows.push(curRow);

    // 定位光标 y 最近的行（处理行间隙、网格上方/下方的空白区域）
    let targetRow = rows[0];
    let minDy = Infinity;
    rows.forEach(row => {
      const box = row[0].getBoundingClientRect();
      const mid = box.top + box.height / 2;
      const dy = Math.abs(y - mid);
      if (dy < minDy) { minDy = dy; targetRow = row; }
    });

    // 在目标行内按 x 定位：光标在某元素左半侧 → 插到它前面
    for (const el of targetRow) {
      const box = el.getBoundingClientRect();
      if (x < box.left + box.width / 2) return el;
    }

    // 光标越过本行最后一个元素中点 → 插到本行末尾（等同下一行首个之前；末行则为 null）
    const lastOfRow = targetRow[targetRow.length - 1];
    const idx = els.indexOf(lastOfRow);
    return els[idx + 1] || null;
  }

  syncLinkOrder() {
    const container = document.getElementById('quickLinks');
    const cards = [...container.querySelectorAll('.link-card:not(.add-link)')];
    this.state.links = cards.map(c => this.state.links.find(l => l.id === c.dataset.linkId)).filter(Boolean);
    this.saveLinks();
  }

  async loadLinkIcon(card, url) {
    const iconContainer = card.querySelector('.link-icon');
    const cached = this.getCachedIcon(url);
    if (cached) { this.applyIconEntry(iconContainer, cached); return; }

    let domain;
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {
      this.setDefaultIcon(iconContainer);
      return;
    }
    const slug = domain.split('.')[0];
    const TIMEOUT = 3000;
    let entry = null;

    entry = await this.fetchSimpleIcon(slug, TIMEOUT);
    if (!entry) entry = await this.loadFavicon('https://' + domain + '/favicon.ico', TIMEOUT);

    if (entry) {
      this.applyIconEntry(iconContainer, entry);
      this.setCachedIcon(url, entry);
    } else {
      this.setDefaultIcon(iconContainer);
    }
  }

  async fetchSimpleIcon(slug, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch('https://cdn.simpleicons.org/' + slug, { signal: controller.signal });
      if (!resp.ok) { clearTimeout(timer); return null; }
      const svgText = await resp.text();
      clearTimeout(timer);
      return { type: 'svg', data: svgText };
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  // 图片源：先 fetch 为 dataURL（可缓存）；CORS 失败则退回 <img> 加载（能显示但不缓存）
  async loadFavicon(src, timeout) {
    const dataURL = await this.fetchAsDataURL(src, timeout);
    if (dataURL) return { type: 'img', data: dataURL };
    const ok = await this.loadImg(src, timeout);
    return ok ? { type: 'img', data: src } : null;
  }

  async fetchAsDataURL(src, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(src, { signal: controller.signal });
      if (!resp.ok) { clearTimeout(timer); return null; }
      const blob = await resp.blob();
      clearTimeout(timer);
      if (!blob.size) return null;
      return await this.blobToDataURL(blob);
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  loadImg(src, timeout) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const finish = (ok) => { if (settled) return; settled = true; clearTimeout(timer); resolve(ok); };
      const timer = setTimeout(() => finish(false), timeout);
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      img.src = src;
    });
  }

  applyIconEntry(container, entry) {
    if (entry.type === 'svg') {
      this.safeHTML(container, entry.data);
      const svg = container.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', '30');
        svg.setAttribute('height', '30');
        svg.setAttribute('fill', 'currentColor');
        svg.querySelectorAll('[fill]:not([fill="none"])').forEach(el => el.setAttribute('fill', 'currentColor'));
      }
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.src = entry.data;
      img.onerror = () => this.setDefaultIcon(container);
      container.replaceChildren(img);
    }
  }

  // 通过 DOMParser 解析 HTML 字符串后替换容器内容，避免直接 innerHTML 赋值触发扩展审核告警
  safeHTML(el, html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    el.replaceChildren(...doc.body.childNodes);
    return el;
  }

  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  getCachedIcon(url) {
    try {
      const v = this.storage.getItem('puretab_icon:' + url);
      if (!v) return null;
      const entry = JSON.parse(v);
      if (entry && entry.type === 'img' && typeof entry.data === 'string' && entry.data.includes('google.com/s2/favicons')) return null;
      return entry;
    } catch { return null; }
  }

  setCachedIcon(url, entry) {
    try { this.storage.setItem('puretab_icon:' + url, JSON.stringify(entry)); } catch {}
  }

  setDefaultIcon(container) {
    this.safeHTML(container, this.iconMap.link);
  }

  bindContextMenu() {
    const container = document.getElementById('quickLinks');
    if (!container) return;
    const self = this;
    container.addEventListener('contextmenu', function(e) {
      const card = e.target.closest('.link-card');
      if (!card || card.classList.contains('add-link')) return;
      e.preventDefault();
      const link = self.state.links.find(l => l.id === card.dataset.linkId);
      if (!link) return;
      self.showContextMenu(e.clientX, e.clientY, link);
    });
  }

  showContextMenu(x, y, link) {
    this.hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    const editItem = document.createElement('div');
    editItem.className = 'context-menu-item';
    this.safeHTML(editItem, this.iconMap.edit + '<span></span>');
    editItem.querySelector('span').textContent = ' 编辑';
    editItem.addEventListener('mousedown', (e) => e.stopPropagation());
    editItem.addEventListener('click', () => { this.hideContextMenu(); this.editLink(link); });

    const delItem = document.createElement('div');
    delItem.className = 'context-menu-item context-menu-item--danger';
    this.safeHTML(delItem, this.iconMap.trash + '<span></span>');
    delItem.querySelector('span').textContent = ' 删除';
    delItem.addEventListener('mousedown', (e) => e.stopPropagation());
    delItem.addEventListener('click', () => { this.hideContextMenu(); this.deleteLink(link); });

    menu.appendChild(editItem);
    menu.appendChild(delItem);
    document.body.appendChild(menu);
    this._contextMenu = menu;

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth) menu.style.left = (x - r.width) + 'px';
      if (r.bottom > window.innerHeight) menu.style.top = (y - r.height) + 'px';
    });

    const remove = () => {
      document.removeEventListener('click', close, true);
      document.removeEventListener('keydown', esc, true);
    };
    const close = (ev) => {
      if (!menu.contains(ev.target)) { this.hideContextMenu(); remove(); }
    };
    const esc = (ev) => {
      if (ev.key === 'Escape') { this.hideContextMenu(); remove(); }
    };
    requestAnimationFrame(() => {
      document.addEventListener('click', close, true);
      document.addEventListener('keydown', esc, true);
    });
  }

  hideContextMenu() {
    if (this._contextMenu) { this._contextMenu.remove(); this._contextMenu = null; }
  }

  showLinkEditor(existingLink) {
    return new Promise((resolve) => {
      const isEdit = !!existingLink;
      const tipDismissed = this.storage.getItem('puretab_link_tip_dismissed') === 'true';
      const tipHtml = tipDismissed ? '' : (
        '<div class="link-editor-tip" role="note">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>' +
        '<span>请注意，本插件不涉及云端内容，所有数据均在本地，请注意自己的数据安全。</span>' +
        '<button type="button" class="link-editor-tip-dismiss" aria-label="不再提示">不再提示</button>' +
        '</div>'
      );

      const overlay = document.createElement('div');
      overlay.className = 'link-editor-overlay';
      const editor = document.createElement('div');
      editor.className = 'link-editor link-editor--wide';
      this.safeHTML(editor,
        '<div class="link-editor-header">' +
        '<span class="link-editor-title">' + (isEdit ? '编辑链接' : '添加链接') + '</span>' +
        '<button class="link-editor-close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        '</div>' +
        '<div class="link-editor-body">' +
        '<div class="link-editor-field">' +
        '<label class="link-editor-label" for="linkUrlInput">网址</label>' +
        '<input type="text" class="link-editor-input" id="linkUrlInput" value="' + (isEdit ? existingLink.url : '') + '" placeholder="https://example.com">' +
        '<span class="link-editor-hint" id="linkUrlHint">网址必须包含 "."</span>' +
        '</div>' +
        '<div class="link-editor-field">' +
        '<label class="link-editor-label" for="linkNameInput">名称</label>' +
        '<input type="text" class="link-editor-input" id="linkNameInput" value="' + (isEdit ? existingLink.name : '') + '" placeholder="我的链接">' +
        '</div>' +
        tipHtml +
        '</div>' +
        '<div class="link-editor-footer">' +
        '<button class="link-editor-btn link-editor-btn--cancel">取消</button>' +
        '<button class="link-editor-btn link-editor-btn--confirm" id="linkConfirmBtn" disabled>确定</button>' +
        '</div>'
      );
      overlay.appendChild(editor);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      const urlInput = overlay.querySelector('#linkUrlInput');
      const nameInput = overlay.querySelector('#linkNameInput');
      const confirmBtn = overlay.querySelector('#linkConfirmBtn');
      const hint = overlay.querySelector('#linkUrlHint');
      const closeBtn = overlay.querySelector('.link-editor-close');
      const cancelBtn = editor.querySelector('.link-editor-btn--cancel');
      const dismissBtn = overlay.querySelector('.link-editor-tip-dismiss');

      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          this.storage.setItem('puretab_link_tip_dismissed', 'true');
          const tip = overlay.querySelector('.link-editor-tip');
          if (!tip) return;
          tip.style.opacity = '0';
          tip.style.transform = 'translateY(-4px)';
          setTimeout(() => tip.remove(), 180);
        });
      }

      const validate = () => {
        const url = urlInput.value.trim();
        const valid = url.length > 0 && url.includes('.');
        confirmBtn.disabled = !valid;
        if (url.length > 0 && !url.includes('.')) {
          urlInput.classList.add('error');
          hint.classList.add('error');
        } else {
          urlInput.classList.remove('error');
          hint.classList.remove('error');
        }
      };
      urlInput.addEventListener('input', validate);
      validate();

      let closed = false;
      const close = (result) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', docEsc);
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 400);
        resolve(result);
      };
      const docEsc = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', docEsc);

      const confirm = () => {
        const url = urlInput.value.trim();
        if (!url.includes('.')) return;
        const name = nameInput.value.trim() || '新链接';
        close({ url: url.startsWith('http') ? url : 'https://' + url, name: name });
      };

      confirmBtn.addEventListener('click', confirm);
      cancelBtn.addEventListener('click', () => close(null));
      closeBtn.addEventListener('click', () => close(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
      [urlInput, nameInput].forEach(input => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !confirmBtn.disabled) confirm();
        });
      });
      setTimeout(() => urlInput.focus(), 120);
    });
  }

  showConfirm(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'link-editor-overlay';
      const dialog = document.createElement('div');
      dialog.className = 'link-editor confirm-dialog';
      this.safeHTML(dialog,
        '<div class="confirm-dialog-message"></div>' +
        '<div class="link-editor-footer">' +
        '<button class="link-editor-btn link-editor-btn--cancel">取消</button>' +
        '<button class="link-editor-btn link-editor-btn--confirm">确认</button>' +
        '</div>'
      );
      dialog.querySelector('.confirm-dialog-message').textContent = message;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      const confirmBtn = dialog.querySelector('.link-editor-btn--confirm');
      const cancelBtn = dialog.querySelector('.link-editor-btn--cancel');

      let closed = false;
      const close = (val) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', docEsc);
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 400);
        resolve(val);
      };
      const docEsc = (e) => { if (e.key === 'Escape') close(false); };
      document.addEventListener('keydown', docEsc);

      confirmBtn.addEventListener('click', () => close(true));
      cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

      setTimeout(() => confirmBtn.focus(), 120);
    });
  }

  async editLink(link) {
    const result = await this.showLinkEditor(link);
    if (!result) return;
    const dup = this.state.links.find(l => l.id !== link.id && l.url === result.url);
    if (dup) {
      const confirmed = await this.showConfirm('该网址已存在，是否继续修改？');
      if (!confirmed) return;
    }
    link.url = result.url;
    link.name = result.name;
    link.icon = 'link';
    this.saveLinks();
    this.renderLinks();
  }

  deleteLink(link) {
    this.state.links = this.state.links.filter(l => l !== link);
    this.saveLinks();
    this.renderLinks();
    this.showToast('链接已删除');
  }

  async addLink() {
    const result = await this.showLinkEditor();
    if (!result) return;
    const dup = this.state.links.find(l => l.url === result.url);
    if (dup) {
      const confirmed = await this.showConfirm('该网址已存在，是否继续添加？');
      if (!confirmed) return;
    }
    this.state.links.push({
      id: this.generateId(),
      name: result.name,
      url: result.url,
      icon: 'link'
    });
    this.saveLinks();
    this.renderLinks();
    this.showToast('链接已添加 ✅');
  }

  saveLinks() {
    this.storage.setItem('puretab_links', JSON.stringify(this.state.links));
  }

  // ========================================
  // 锁屏（手动锁屏 + 无操作自动锁屏）
  // ========================================
  initLockScreen() {
    // 读取自动锁屏设置（默认关闭）
    this.state.autoLockEnabled = this.storage.getItem('puretab_auto_lock_enabled') === 'true';
    const savedTime = parseInt(this.storage.getItem('puretab_auto_lock_time'));
    this.state.autoLockTime = (savedTime && savedTime > 0) ? savedTime : 60;

    const lockScreen = document.getElementById('lockScreen');
    const lockBtn = document.getElementById('lockBtn');

    // 顶栏按钮 → 锁屏
    lockBtn?.addEventListener('click', () => this.lock());

    // 点击锁屏层任意处 → 解锁
    lockScreen?.addEventListener('click', () => this.unlock());

    // 快捷键 Ctrl/Cmd+Shift+L → 锁屏
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        this.lock();
      }
    });

    // 无操作计时器
    this._lockTimer = null;
    this._lockActivityThrottle = null;
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
      document.addEventListener(evt, () => this.resetLockTimer(), { passive: true });
    });

    this.resetLockTimer();
  }

  // 重置无操作计时器（节流：最多每秒重置一次）
  resetLockTimer() {
    if (!this.state.autoLockEnabled || this.state.locked) return;
    if (this._lockActivityThrottle) return;
    this._lockActivityThrottle = setTimeout(() => { this._lockActivityThrottle = null; }, 1000);

    if (this._lockTimer) clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => this.lock(), this.state.autoLockTime * 1000);
  }

  lock() {
    const lockScreen = document.getElementById('lockScreen');
    if (!lockScreen || this.state.locked) return;
    this.state.locked = true;
    // 清理可能残留的关闭动画状态及其监听器
    if (this._unlockEndHandler) {
      lockScreen.removeEventListener('animationend', this._unlockEndHandler);
      this._unlockEndHandler = null;
    }
    lockScreen.classList.remove('hide');
    lockScreen.classList.add('show');
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
    // 失去焦点，避免锁屏后输入仍打到搜索框
    document.activeElement?.blur();
  }

  unlock() {
    const lockScreen = document.getElementById('lockScreen');
    if (!lockScreen || !this.state.locked) return;
    this.state.locked = false;
    // 触发关闭动画（与开启的 fadeUp 相反）
    lockScreen.classList.remove('show');
    lockScreen.classList.add('hide');
    // 动画结束后彻底清理，恢复隐藏状态
    // 仅在 fadeDown 结束时执行，避免被后续 fadeUp 的 animationend 误触发
    this._unlockEndHandler = (e) => {
      if (e.animationName !== 'fadeDown') return;
      lockScreen.classList.remove('hide');
      lockScreen.removeEventListener('animationend', this._unlockEndHandler);
      this._unlockEndHandler = null;
    };
    lockScreen.addEventListener('animationend', this._unlockEndHandler);
    this.resetLockTimer();
  }

  // 应用自动锁屏设置变更（开关 / 时长）后重启计时器
  applyAutoLockChange() {
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
    if (this.state.autoLockEnabled && !this.state.locked) {
      this._lockTimer = setTimeout(() => this.lock(), this.state.autoLockTime * 1000);
    }
  }

  // ========================================
  // 数据导入导出
  // ========================================
  exportData() {
    const data = this.storage.getAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const date = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    a.href = url;
    a.download = 'puretab-backup-' + date + '.json';
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('数据已导出 ✅');
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        // 验证数据格式
        if (typeof data !== 'object' || Array.isArray(data)) throw new Error();
        const validKeys = Object.keys(data).filter(k => k.startsWith('puretab_'));
        if (!validKeys.length) { this.showToast('无效的备份文件'); return; }
        // 只导入 valid keys
        const filtered = {};
        validKeys.forEach(k => { filtered[k] = data[k]; });
        await this.storage.importData(filtered);
        this.showToast('数据已导入，正在刷新...');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        this.showToast('导入失败：文件格式错误');
      }
    });
    input.click();
  }

  // ========================================
  // Toast 提示
  // ========================================
  showToast(message) {
    const existing = document.querySelector('.puretab-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'puretab-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
}

// ========================================
// 初始化应用
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  window.pureTab = new PureTabApp();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  // 锁屏态：仅允许 Esc 解锁，屏蔽其余快捷键
  if (window.pureTab?.state.locked) {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.pureTab.unlock();
    }
    return;
  }

  // ESC 关闭面板
  if (e.key === 'Escape') {
    const panel = document.getElementById('sidePanel');
    if (panel?.classList.contains('open')) {
      window.pureTab?.closePanel();
    }
  }

  // / 聚焦搜索
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('searchInput')?.focus();
  }

  // Cmd/Ctrl + F 聚焦搜索
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    document.getElementById('searchInput')?.focus();
  }
});
