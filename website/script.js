(function () {
  'use strict';

  // ==========================================================
  // i18n dictionaries
  // ==========================================================
  const I18N = {
    zh: {
      'meta.title': 'Penraft — 朴素，但顺手。',
      'meta.description': '一个安静的笔记应用。朴素、顺手、自动保存。',

      'nav.features': '功能',
      'nav.philosophy': '理念',
      'nav.download': '下载',

      'hero.eyebrow': '一个安静的笔记应用。',
      'hero.title': '朴素，但顺手。',
      'hero.sub': '你专心写，剩下的它管。',
      'hero.tags.autosave': '自动保存',
      'hero.tags.multidoc': '笔记，并排放',
      'hero.tags.minimal': '极简',
      'hero.cta_primary': '下载 Mac 版',
      'hero.cta_secondary': '查看源码',
      'hero.meta.platforms': '仅 macOS',
      'hero.meta.free': '免费使用',
      'hero.meta.offline': '笔记存在你电脑里',
      'hero.image_alt': 'Penraft 应用主界面截图',

      'features.eyebrow': '核心功能',
      'features.title': '朴素 · 顺手',
      'features.sub': '不堆砌功能，只保留写作真正需要的那几件。',
      'features.tabs.title': '多文档管理',
      'features.tabs.desc': '想新建就新建，想关掉就关掉。Tab 像浏览器一样，可以拖动排序、双击改名，关掉只是隐藏，不会真删。',
      'features.dual.title': '两种写作模式',
      'features.dual.desc': '默认所见即所得——写 # 直接出标题、写 - 直接出列表。也能切到纯文本，看到完整的源码。',
      'features.autosave.title': '自动保存',
      'features.autosave.desc': '每输入一个字都会悄悄存到电脑里，不用手动按保存，不会丢任何一个想法。',
      'features.search.title': '搜索所有笔记',
      'features.search.desc': '点一下放大镜，所有文档一起搜。命中哪一篇直接跳过去。',
      'features.restore.title': '下次打开如初',
      'features.restore.desc': '关掉前开着哪几篇、停在哪一篇，下次再开还是原样。',
      'features.shortcuts.title': '键盘友好',
      'features.shortcuts.desc': '几个最常用的动作——新建、切换模式、立即保存——都能不离手地完成。',

      'highlight.eyebrow': '为什么是 Penraft',
      'highlight.title': '朴素 · 顺手',
      'highlight.image_alt': '源码模式截图',
      'highlight.p1.title': '极简',
      'highlight.p1.desc': '没有设置面板，没有侧边栏，没有插件市场。打开就写。',
      'highlight.p2.title': '笔记在你自己手里',
      'highlight.p2.desc': '所有笔记都是纯文本文件，存在你自己电脑里。想用 iCloud / 同步盘备份随时都行。',
      'highlight.p3.title': '不用调，能用',
      'highlight.p3.desc': '没什么可设置的。装上就能写，不必学。',

      'footer.tag': 'v0.1.0 · 一个安静的笔记工具',
      'footer.github': 'GitHub',
      'footer.releases': '下载',
      'footer.features': '功能',
      'footer.philosophy': '理念',
      'footer.copy': '© 2026 Penraft · 一个对写作友善的小工具',

      'mock.tab1': '今日的写作',
      'mock.tab2': 'Penraft 设计笔记',
      'mock.tab3': '周会记录',
      'mock.h1': '今日的写作',
      'mock.quote': '写作不是把灵感保存下来，而是在纸上想清楚。',
      'mock.h2': '三件事',
      'mock.li1.k': '早晨',
      'mock.li1.v': '晨跑后把脑子里冒出的几句话写下来',
      'mock.li2.k': '中午',
      'mock.li2.v': '整理上周和团队的对话，找出可以追的线索',
      'mock.li3.k': '晚上',
      'mock.li3.v': '复盘——今天有没有让任何事情变得更简单',
      'mock.p': '默认把笔记保存到',
      'mock.period': '。',

      'mock2.h1': 'Penraft 设计笔记',
      'mock2.quote': '安静的工具，用得最久。',
      'mock2.h2': '三个原则',
      'mock2.li1.k': '极简',
      'mock2.li1.v': '能少一个按钮就少一个',
      'mock2.li2.k': '顺手',
      'mock2.li2.v': '别打扰，也别打断',
      'mock2.li3.k': '可靠',
      'mock2.li3.v': '每一个字都自动留下',
      'mock2.p': '设计灵感：一支顺手的笔。',

      'mock3.h1': '周会记录',
      'mock3.quote': '5 月 16 日 · 团队对齐',
      'mock3.h2': '本周',
      'mock3.li1.k': '完成',
      'mock3.li1.v': 'Hero 文案落地',
      'mock3.li2.k': '进行',
      'mock3.li2.v': '应用截图替换中',
      'mock3.li3.k': '下周',
      'mock3.li3.v': '开放下载页',
      'mock3.p': '下次周会：5 月 23 日。',
    },

    en: {
      'meta.title': 'Penraft — plain, yet handy notes.',
      'meta.description': 'A quiet notes app. Plain, handy, autosaved.',

      'nav.features': 'Features',
      'nav.philosophy': 'Philosophy',
      'nav.download': 'Download',

      'hero.eyebrow': 'a quiet notes app.',
      'hero.title': 'plain, yet handy.',
      'hero.sub': 'You focus on writing, Penraft handles the rest.',
      'hero.tags.autosave': 'Autosave',
      'hero.tags.multidoc': 'Side by Side',
      'hero.tags.minimal': 'Minimal',
      'hero.cta_primary': 'Download for Mac',
      'hero.cta_secondary': 'View source',
      'hero.meta.platforms': 'macOS only',
      'hero.meta.free': 'Free to use',
      'hero.meta.offline': 'Notes stay on your computer',
      'hero.image_alt': 'Penraft main editor screenshot',

      'features.eyebrow': 'Core features',
      'features.title': 'Plain & Handy',
      'features.sub': 'No bloat — only what writing actually needs.',
      'features.tabs.title': 'One window, many docs',
      'features.tabs.desc': 'Add or close as you go. Tabs work like a browser — drag to reorder, double-click to rename. Closing just hides; nothing is ever deleted.',
      'features.dual.title': 'Two ways to write',
      'features.dual.desc': 'Type # and the heading appears; type - and the list appears. Or flip to plain text and see the source.',
      'features.autosave.title': 'Autosaves as you type',
      'features.autosave.desc': 'Every keystroke is quietly written to your disk. No save button. Nothing lost.',
      'features.search.title': 'Search every note',
      'features.search.desc': 'Click the magnifier — search across all your docs at once, jump straight to the match.',
      'features.restore.title': 'Picks up where you left off',
      'features.restore.desc': 'The same tabs, in the same order, on the same active one — every time you reopen it.',
      'features.shortcuts.title': 'Kind to keyboards',
      'features.shortcuts.desc': 'New doc, toggle mode, save now — the few moves you make often are all reachable without your hands leaving the keys.',

      'highlight.eyebrow': 'Why Penraft',
      'highlight.title': 'Plain & Handy',
      'highlight.image_alt': 'Source mode screenshot',
      'highlight.p1.title': 'Minimal',
      'highlight.p1.desc': 'No settings panel, no sidebar, no plugin marketplace. Open it and write.',
      'highlight.p2.title': 'Yours, on your disk',
      'highlight.p2.desc': 'Every note is a plain text file on your own computer. Back it up with iCloud, a sync folder, anything you like.',
      'highlight.p3.title': 'Nothing to configure',
      'highlight.p3.desc': "There's nothing to set. Install it, write.",

      'footer.tag': 'v0.1.0 · A quiet little notes app',
      'footer.github': 'GitHub',
      'footer.releases': 'Download',
      'footer.features': 'Features',
      'footer.philosophy': 'Philosophy',
      'footer.copy': '© 2026 Penraft · A small tool kind to writers',

      'mock.tab1': "Today's writing",
      'mock.tab2': 'Penraft design notes',
      'mock.tab3': 'Weekly sync',
      'mock.h1': "Today's writing",
      'mock.quote': "Writing isn't capturing inspiration — it's thinking clearly on paper.",
      'mock.h2': 'Three things',
      'mock.li1.k': 'Morning',
      'mock.li1.v': 'Jot down whatever surfaced during the run',
      'mock.li2.k': 'Noon',
      'mock.li2.v': 'Sift last week\'s team chats for threads worth pulling',
      'mock.li3.k': 'Evening',
      'mock.li3.v': 'Review — did anything get simpler today?',
      'mock.p': 'saves notes to',
      'mock.period': ' by default.',

      'mock2.h1': 'Penraft design notes',
      'mock2.quote': 'Quiet tools are the ones you keep using.',
      'mock2.h2': 'Three principles',
      'mock2.li1.k': 'Minimal',
      'mock2.li1.v': 'One less button is always better',
      'mock2.li2.k': 'Handy',
      'mock2.li2.v': "Don't interrupt, don't get in the way",
      'mock2.li3.k': 'Reliable',
      'mock2.li3.v': 'Every keystroke kept, automatically',
      'mock2.p': 'Inspiration: a pen that just works.',

      'mock3.h1': 'Weekly sync',
      'mock3.quote': 'May 16 · Team alignment',
      'mock3.h2': 'This week',
      'mock3.li1.k': 'Done',
      'mock3.li1.v': 'New hero copy shipped',
      'mock3.li2.k': 'WIP',
      'mock3.li2.v': 'Replacing mock with real screenshots',
      'mock3.li3.k': 'Next',
      'mock3.li3.v': 'Open the download page',
      'mock3.p': 'Next sync: May 23.',
    },
  };

  // ==========================================================
  // Language detection & switching
  // ==========================================================
  const LS_KEY = 'penraft_lang';
  const SUPPORTED = ['zh', 'en'];

  function detectLang() {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('lang');
    if (fromUrl && SUPPORTED.includes(fromUrl)) return fromUrl;

    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (e) { /* ignore storage failures */ }

    const nav = (navigator.language || 'zh').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  }

  function applyLang(lang) {
    const dict = I18N[lang] || I18N.zh;

    document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';

    // textContent / innerHTML
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] != null) el.innerHTML = dict[key];
    });

    // alt attributes
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      const key = el.getAttribute('data-i18n-alt');
      if (dict[key] != null) el.setAttribute('alt', dict[key]);
    });

    // <title> and <meta name="description">
    if (dict['meta.title']) document.title = dict['meta.title'];
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && dict['meta.description']) metaDesc.setAttribute('content', dict['meta.description']);

    // toggle UI state
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lang === lang);
    });
  }

  function setLang(lang, persist = true) {
    if (!SUPPORTED.includes(lang)) return;
    applyLang(lang);
    if (persist) {
      try { localStorage.setItem(LS_KEY, lang); } catch (e) { /* ignore */ }
    }
  }

  // ==========================================================
  // Screenshot loader — gracefully fall back to inline mock
  // ==========================================================
  function initScreenshots() {
    document.querySelectorAll('.screenshot-frame[data-image]').forEach((frame) => {
      const src = frame.getAttribute('data-image');
      if (!src) return;
      const img = frame.querySelector('img.screenshot-img');
      const mock = frame.querySelector('.screenshot-mock');
      const probe = new Image();
      probe.onload = () => {
        if (img) img.setAttribute('src', src);
        frame.classList.add('has-image');
        if (mock) mock.style.display = 'none';
      };
      probe.onerror = () => {
        frame.classList.add('is-mock');
      };
      probe.src = src;
    });
  }

  // ==========================================================
  // Mock tab switching (hero screenshot demo)
  // ==========================================================
  function initMockTabs() {
    document.querySelectorAll('.hero .screenshot-mock').forEach((mock) => {
      const tabs = mock.querySelectorAll('.mock-tab[data-mock-tab]');
      const bodies = mock.querySelectorAll('.mock-body[data-mock-body]');
      const sources = mock.querySelectorAll('.mock-source[data-mock-source]');
      const toggle = mock.querySelector('.mock-source-toggle');
      if (!tabs.length || !bodies.length) return;

      const activate = (index) => {
        const idx = String(index);
        tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.mockTab === idx));
        bodies.forEach((b) => b.classList.toggle('is-active', b.dataset.mockBody === idx));
        sources.forEach((s) => s.classList.toggle('is-active', s.dataset.mockSource === idx));
      };

      const initialTab = mock.querySelector('.mock-tab[data-mock-tab].is-active');
      const initialIdx = initialTab ? initialTab.dataset.mockTab : '0';
      sources.forEach((s) => s.classList.toggle('is-active', s.dataset.mockSource === initialIdx));

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => activate(tab.dataset.mockTab));
        tab.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate(tab.dataset.mockTab);
          }
        });
      });

      if (toggle) {
        toggle.removeAttribute('aria-hidden');
        toggle.setAttribute('role', 'button');
        toggle.setAttribute('tabindex', '0');
        toggle.setAttribute('aria-label', '切换源码 / 渲染');
        const doToggle = () => mock.classList.toggle('is-source');
        toggle.addEventListener('click', doToggle);
        toggle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            doToggle();
          }
        });
      }
    });
  }

  // ==========================================================
  // Nav scroll state
  // ==========================================================
  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ==========================================================
  // Language toggle bindings
  // ==========================================================
  function initLangToggle() {
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
  }

  // ==========================================================
  // Boot
  // ==========================================================
  document.addEventListener('DOMContentLoaded', () => {
    setLang(detectLang(), false);
    initLangToggle();
    initScreenshots();
    initMockTabs();
    initNavScroll();
  });
})();
