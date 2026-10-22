/** Host settings.section UI. Drafts never mutate chat until explicitly saved. */
var CP_STORAGE_KEY = 'dsh-code-pill.settings.v1';
function createSettingsStore() {
  var current = CP_SETTINGS.defaults();
  var listeners = new Set();
  var storageError = '';
  try {
    if (typeof localStorage !== 'undefined') {
      var saved = localStorage.getItem(CP_STORAGE_KEY);
      if (saved !== null) current = CP_SETTINGS.parse(saved);
    }
  } catch (err) { storageError = '已保存配置无法读取，当前使用默认设置：' + err.message; }
  function notify() { for (var cb of listeners) cb(); }
  function onStorage(event) {
    if (event.key !== CP_STORAGE_KEY) return;
    try {
      current = event.newValue === null ? CP_SETTINGS.defaults() : CP_SETTINGS.parse(event.newValue);
      storageError = '';
      notify();
    } catch (err) { storageError = '其他窗口的配置无效：' + err.message; notify(); }
  }
  return {
    getSnapshot: function () { return current; },
    getError: function () { return storageError; },
    subscribe: function (cb) {
      if (listeners.size === 0 && typeof window.addEventListener === 'function') window.addEventListener('storage', onStorage);
      listeners.add(cb);
      return function () {
        listeners.delete(cb);
        if (listeners.size === 0 && typeof window.removeEventListener === 'function') window.removeEventListener('storage', onStorage);
      };
    },
    save: function (input) {
      var next = CP_SETTINGS.normalize(input);
      if (typeof localStorage === 'undefined') throw new Error('浏览器存储不可用，设置未保存。');
      localStorage.setItem(CP_STORAGE_KEY, CP_SETTINGS.stringify(next));
      current = next;
      storageError = '';
      notify();
    }
  };
}

function installSettings(ctx, store, fontStore) {
  var slots = typeof ctx.get === 'function' ? ctx.get('slots') : ctx.slots;
  if (!slots) {
    if (typeof ctx.inject !== 'function') return function () {};
    var waiting = ctx.inject(['slots'], function (child) {
      child.effect(function () { return installSettings(child, store, fontStore); }, 'dsh-code-pill: deferred settings');
    });
    return function () { waiting.dispose(); };
  }
  if (typeof slots.inject !== 'function' || typeof slots.register !== 'function') return function () {};
  var React, ui;
  try {
    React = require('react');
    ui = require('@deepseek-ai/dsh-client-ui-primitives');
  } catch (err) {
    console.warn('dsh-code-pill: settings UI modules unavailable', err);
    return function () {};
  }
  if (!React || !ui || !ui.Button || !ui.Switch || !ui.Input) {
    console.warn('dsh-code-pill: settings require host Button, Switch and Input primitives');
    return function () {};
  }
  var h = React.createElement;
  var colorNames = { plain: '默认文字', kwc: '控制流', kwd: '声明与类型', str: '字符串', com: '注释', num: '数字', bg: '胶囊底色', badgeBg: '徽章底色', badgeText: '徽章文字' };
  var rowNames = CP_SETTINGS.ROW_LABELS;
  // 显示名以 MARKERS 的取值为键，顺序由单一事实源决定。
  var markerNames = { off: '关闭', label: '语言文字', icon: '小图标', both: '图标＋文字' };
  function tokenText(text, config, theme) {
    var toks = config.syntax ? tokenizeRanges(text, false) : [];
    var nodes = [], position = 0;
    for (var token of toks) {
      if (token.start > position) nodes.push(text.slice(position, token.start));
      nodes.push(h('span', { key: token.start, style: { color: config[theme][token.cls] || config[theme].plain } }, text.slice(token.start, token.end)));
      position = token.end;
    }
    if (position < text.length) nodes.push(text.slice(position));
    return nodes;
  }
  /** 折叠动作行示意：图标与动作名用类别色，状态词用状态色，描述保持宿主灰。 */
  function rowSamples(colors, gray) {
    function sample(key, tint, title, description, status, statusColor) {
      return h('div', { className: 'dshcp-preview-row', key: key },
        h('span', { className: 'dshcp-preview-icon', style: { color: tint || gray }, 'aria-hidden': true }),
        h('span', { style: { color: tint ? 'color-mix(in oklab, ' + tint + ' 82%, ' + gray + ')' : gray } }, title),
        h('span', { className: 'dshcp-preview-desc', style: { color: gray } }, '· ' + description, status ? ' ' : null, status ? h('span', { style: { color: statusColor } }, status) : null));
    }
    return CP_SETTINGS.ROW_CATEGORIES.map(function (category) {
      return sample(category.key, colors[category.key], category.title, category.description);
    }).concat([sample('job', colors.run, '读取任务输出', 'bash-a256 ·', '已完成', colors.ok),
      sample('err', colors.err, '读取', 'Permission denied'), sample('warn', colors.warn, '结束任务', 'bash-2 ·', '已中断', colors.warn)]);
  }
  function Preview(props) {
    var cfg = props.config, theme = props.theme;
    var vars = CP_SETTINGS.previewStyle(cfg, theme);
    var isDark = theme === 'dark';
    function code(text, badge, syntax) {
      var attributes = { className: 'dshcp-pill' };
      if (badge && (cfg.marker === 'label' || cfg.marker === 'both')) attributes['data-dshcp-badge'] = badge;
      if (badge && (cfg.marker === 'icon' || cfg.marker === 'both')) attributes['data-dshcp-icon'] = badgeIconKind(badge);
      return h('code', attributes, syntax ? tokenText(text, cfg, theme) : text);
    }
    var blockStyle = cfg.blockTheme === 'preset' ? { color: cfg[theme].plain } : {};
    return h('div', { className: 'dshcp-preview', 'data-dshcp-preview': '', 'data-preview-theme': theme, style: Object.assign({}, vars, { background: isDark ? '#1e1e1e' : '#ffffff', color: isDark ? '#d7d7d7' : '#292929' }) },
      h('div', { className: 'dshcp-preview-caption' }, '预览 · ', isDark ? '深色' : '浅色', ' · 不影响当前聊天'),
      h('p', null, '在 ', code('src/settings.ts', 'TS'), ' 中调整 ', code('fontScale'), '，让长篇回答更容易阅读。'),
      h('p', null, '声明 ', code('const count = 42', null, true), '，调用 ', code('print("hello")', null, true), '。'),
      h('p', null, '执行 ', code('npm run build'), '，检查 ', code('Dockerfile', 'DOCKER'), '。'),
      h('pre', { className: 'dshcp-preview-block', style: blockStyle }, cfg.blockTheme === 'preset' ? tokenText('const count = 42; // 当前预设配色', Object.assign({}, cfg, { syntax: true }), theme) : 'const count = 42; // 保留宿主配色（示意）'),
      h('div', { className: 'dshcp-preview-rows', 'aria-label': '折叠动作行预览' }, rowSamples(cfg.rowColors[theme], isDark ? '#8a8f98' : '#7b8190')));
  }
  function CodeAppearance() {
    var saved = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
    var draftState = React.useState(function () { return CP_SETTINGS.normalize(saved); });
    var draft = draftState[0], setDraft = draftState[1];
    var themeState = React.useState('light'), theme = themeState[0], setTheme = themeState[1];
    var statusState = React.useState(store.getError()), status = statusState[0], setStatus = statusState[1];
    var transferState = React.useState(''), transfer = transferState[0], setTransfer = transferState[1];
    var dirty = CP_SETTINGS.stringify(draft) !== CP_SETTINGS.stringify(saved);
    function change(key, value) { setDraft(function (old) { return Object.assign({}, old, { [key]: value, preset: 'custom' }); }); setStatus(''); }
    function color(role, value) {
      setDraft(function (old) { return Object.assign({}, old, { preset: 'custom', [theme]: Object.assign({}, old[theme], { [role]: value }) }); });
      setStatus('');
    }
    function rowColor(kind, value) {
      setDraft(function (old) { return Object.assign({}, old, { rowColors: Object.assign({}, old.rowColors, { [theme]: Object.assign({}, old.rowColors[theme], { [kind]: value }) }) }); });
      setStatus('');
    }
    function button(label, onClick, primary, disabled) { return h(ui.Button, { type: 'button', size: 'sm', variant: primary ? 'primary' : 'outline', onClick: onClick, disabled: !!disabled }, label); }
    function range(label, key, min, max, step, suffix) {
      return h('label', { className: 'dshcp-slider', key: key }, h('span', null, label, h('output', null, String(Math.round(draft[key] * 100) / 100), suffix)),
        h('input', { type: 'range', min: min, max: max, step: step, value: draft[key], 'aria-label': label, onChange: function (event) { change(key, Number(event.target.value)); } }));
    }
    var rowPage = theme === 'dark' ? '#1e1e1e' : '#ffffff';
    var rowWarnings = CP_SETTINGS.ROW_KEYS.filter(function (kind) { return CP_SETTINGS.contrast(draft.rowColors[theme][kind], rowPage) < CP_SETTINGS.AA_NORMAL; });
    var warnings = CP_SETTINGS.audit(draft, theme, theme === 'dark' ? '#1e1e1e' : '#ffffff').filter(function (item) { return !item.pass; });
    return h('div', { className: 'dshcp-settings' },
      h('header', { className: 'dshcp-settings-header' }, h('div', null, h('h2', null, 'Code Pill'), h('p', null, '让代码融入阅读，而不是打断阅读。')), h('span', { className: 'dshcp-local-tag' }, '本浏览器设置')),
      h('div', { className: 'dshcp-settings-toolbar', role: 'group', 'aria-label': 'Code Pill 操作' }, h('span', { role: 'status', className: 'dshcp-hint' }, status || (dirty ? '有未保存的更改' : '已与保存设置一致')),
        h('div', { className: 'dshcp-actions' }, button('恢复默认', function () { setDraft(CP_SETTINGS.defaults()); setStatus('默认设置已进入草稿；保存后应用。'); }),
          button('取消更改', function () { setDraft(CP_SETTINGS.normalize(saved)); setStatus('已取消未保存的更改。'); }, false, !dirty),
          button('保存并应用', function () { try { store.save(draft); setStatus('已保存并应用。'); } catch (err) { setStatus('保存失败：' + err.message); } }, true, !dirty))),
      h('section', { className: 'dshcp-panel' }, h('h3', null, '外观预设'), h('p', { className: 'dshcp-hint' }, '选择会替换色板与排版草稿；保存后才应用。'),
        h('div', { className: 'dshcp-preset-grid' }, CP_SETTINGS.PRESETS.map(function (preset) {
          return h('button', { type: 'button', key: preset.id, className: 'dshcp-preset', 'aria-pressed': draft.preset === preset.id, onClick: function () { setDraft(function (old) { return Object.assign(CP_SETTINGS.presetConfig(preset.id), { thinkRainbow: old.thinkRainbow, rowTint: old.rowTint, rowColors: old.rowColors }); }); setStatus(''); } },
            h('span', { className: 'dshcp-swatches', 'aria-hidden': true }, ['plain', 'kwd', 'str', 'num'].map(function (role) { return h('i', { key: role, style: { background: preset[theme][role] } }); })),
            h('strong', null, preset.name), h('small', null, preset.description));
        })), draft.preset === 'custom' ? h('p', { className: 'dshcp-hint' }, '当前：自定义') : null),
      h('section', { className: 'dshcp-panel' }, h('div', { className: 'dshcp-section-heading' }, h('h3', null, '色板与预览'), h('div', { className: 'dshcp-theme-toggle', role: 'group', 'aria-label': '编辑色板主题' },
        button('浅色', function () { setTheme('light'); }, theme === 'light'), button('深色', function () { setTheme('dark'); }, theme === 'dark'))),
        h(Preview, { config: draft, theme: theme }),
        h('div', { className: 'dshcp-color-grid' }, Object.keys(colorNames).map(function (role) {
          return h('label', { className: 'dshcp-color-field', key: role }, h('span', null, colorNames[role]),
            h('div', null, h('input', { type: 'color', value: draft[theme][role], 'aria-label': colorNames[role] + '颜色', onChange: function (event) { color(role, event.target.value); } }),
              h(ui.Input, { key: theme + draft[theme][role], defaultValue: draft[theme][role], 'aria-label': colorNames[role] + '十六进制', maxLength: 7, onBlur: function (event) {
                var value = event.target.value;
                if (/^#[0-9a-f]{6}$/i.test(value)) color(role, value.toLowerCase());
                else { event.target.value = draft[theme][role]; setStatus('颜色需要完整的 #RRGGBB；已恢复原值。'); }
              } })));
        })),
        warnings.length ? h('p', { className: 'dshcp-warning', role: 'status' }, '低对比度提醒：', warnings.map(function (item) { return (colorNames[item.role] || item.role) + ' ' + item.ratio.toFixed(2) + ':1'; }).join('；'), '。仍可保存。') : h('p', { className: 'dshcp-hint' }, '当前预览背景下，全部文字达到 4.5:1。实际会话背景可能不同。'),
        h('div', { className: 'dshcp-section-heading dshcp-subheading' }, h('h3', null, '折叠动作行颜色'), button('恢复行颜色默认', function () { setDraft(function (old) { return Object.assign({}, old, { rowColors: CP_SETTINGS.defaults().rowColors }); }); setStatus('行颜色已恢复默认；保存后应用。'); })),
        h('p', { className: 'dshcp-hint' }, '颜色用于折叠的工具行：图标与动作名用类别色，失败行与完成状态词用状态色。需在下方「显示与排版」开启「折叠动作行着色」才会应用到聊天；选择预设不会改变这些颜色。'),
        h('div', { className: 'dshcp-color-grid' }, CP_SETTINGS.ROW_KEYS.map(function (kind) {
          return h('label', { className: 'dshcp-color-field', key: kind }, h('span', null, rowNames[kind]),
            h('div', null, h('input', { type: 'color', value: draft.rowColors[theme][kind], 'aria-label': rowNames[kind] + '行颜色', onChange: function (event) { rowColor(kind, event.target.value); } }),
              h(ui.Input, { key: theme + draft.rowColors[theme][kind], defaultValue: draft.rowColors[theme][kind], 'aria-label': rowNames[kind] + '行十六进制', maxLength: 7, onBlur: function (event) {
                var value = event.target.value;
                if (/^#[0-9a-f]{6}$/i.test(value)) rowColor(kind, value.toLowerCase());
                else { event.target.value = draft.rowColors[theme][kind]; setStatus('颜色需要完整的 #RRGGBB；已恢复原值。'); }
              } })));
        })),
        rowWarnings.length ? h('p', { className: 'dshcp-warning', role: 'status' }, '行颜色低对比度提醒：', rowWarnings.map(function (kind) { return rowNames[kind] + ' ' + CP_SETTINGS.contrast(draft.rowColors[theme][kind], rowPage).toFixed(2) + ':1'; }).join('；'), '。仍可保存。') : h('p', { className: 'dshcp-hint' }, '当前预览背景下，行颜色全部达到 4.5:1。')),
      h('section', { className: 'dshcp-panel' }, h('h3', null, '显示与排版'),
        h('div', { className: 'dshcp-control-row' }, h('div', null, h('strong', null, '行内语法着色'), h('small', null, '关闭后保留统一文字颜色')), h(ui.Switch, { checked: draft.syntax, label: '行内语法着色', onChange: function (value) { change('syntax', value); } })),
        h('div', { className: 'dshcp-control-row' }, h('div', null, h('strong', null, '聊天文件路径'), h('small', null, '统一工具摘要、正文文件引用、搜索结果与读取标题的路径外观')), h(ui.Switch, { checked: draft.toolPath, label: '聊天文件路径', onChange: function (value) { change('toolPath', value); } })),
        h('div', { className: 'dshcp-control-row' }, h('div', null, h('strong', null, '思考文字彩虹刷入'), h('small', null, '思考内容流式出现时，新文字短暂呈彩虹色，随后落回正常颜色；系统开启“减少动态效果”时自动停用')), h(ui.Switch, { checked: draft.thinkRainbow, label: '思考文字彩虹刷入', onChange: function (value) { setDraft(function (old) { return Object.assign({}, old, { thinkRainbow: value }); }); setStatus(''); } })),
        h('div', { className: 'dshcp-control-row' }, h('div', null, h('strong', null, '折叠动作行着色'), h('small', null, '按读取、搜索、命令、会话、代理、任务、技能等 12 类给图标和动作名上色，失败与中断优先，描述保持宿主色')), h(ui.Switch, { checked: draft.rowTint, label: '折叠动作行着色', onChange: function (value) { setDraft(function (old) { return Object.assign({}, old, { rowTint: value }); }); setStatus(''); } })),
        h('label', { className: 'dshcp-control-row' }, h('span', null, '文件标记'), h('select', { 'aria-label': '文件标记', value: draft.marker, onChange: function (event) { change('marker', event.target.value); } }, CP_SETTINGS.MARKERS.map(function (mode) { return h('option', { value: mode, key: mode }, markerNames[mode]); }))),
        h('div', { className: 'dshcp-slider-grid' }, range('字号比例', 'fontScale', .8, 1.1, .01, '×'), range('圆角', 'radius', 0, 10, 1, 'px'), range('水平内边距', 'padding', 0, .6, .01, 'em'), range('底色强度', 'bgOpacity', 0, .2, .005, '')),
        h('label', { className: 'dshcp-control-row' }, h('span', null, '代码块颜色'), h('select', { 'aria-label': '代码块颜色', value: draft.blockTheme, onChange: function (event) { change('blockTheme', event.target.value); } }, h('option', { value: 'host' }, '保留宿主配色'), h('option', { value: 'preset' }, '使用当前色板')))),
      h('details', { className: 'dshcp-panel' }, h('summary', null, '导入／导出配置'), h('p', { className: 'dshcp-hint' }, '仅导出 Code Pill 外观配置，不包含聊天内容。导入先进入草稿。'),
        h('textarea', { value: transfer, 'aria-label': '配置 JSON', spellCheck: false, placeholder: '粘贴配置 JSON，或点击导出草稿', onChange: function (event) { setTransfer(event.target.value); } }),
        h('div', { className: 'dshcp-actions' }, button('导出草稿', function () { setTransfer(CP_SETTINGS.stringify(draft)); setStatus('草稿已导出到文本框，可选中复制。'); }), button('导入草稿', function () { try { setDraft(CP_SETTINGS.parse(transfer)); setStatus('导入成功；点击保存后应用。'); } catch (err) { setStatus('导入失败：' + err.message); } }))),
    );
  }
  var FontSettings = createFontSettings(React, fontStore);
  function SettingsPage() {
    var tabState = React.useState('appearance'), tab = tabState[0], setTab = tabState[1];
    return h('div', null,
      h('div', { className: 'dshcp-tabs', role: 'tablist', 'aria-label': 'Code Pill 设置分类' }, ['appearance', 'fonts'].map(function (id, index) {
        return h('button', { key: id, type: 'button', role: 'tab', id: 'dshcp-tab-' + id, 'aria-controls': 'dshcp-panel-' + id, 'aria-selected': tab === id, tabIndex: tab === id ? 0 : -1,
          onClick: function () { setTab(id); }, onKeyDown: function (event) {
            var next = event.key === 'Home' ? 'appearance' : event.key === 'End' ? 'fonts' : /^(ArrowLeft|ArrowRight)$/.test(event.key) ? (tab === 'fonts' ? 'appearance' : 'fonts') : null;
            if (next) { event.preventDefault(); setTab(next); document.getElementById('dshcp-tab-' + next).focus(); }
          } }, ['代码外观', '字体'][index]);
      })),
      h('div', { role: 'tabpanel', id: 'dshcp-panel-appearance', 'aria-labelledby': 'dshcp-tab-appearance', hidden: tab !== 'appearance' }, h(CodeAppearance)),
      h('div', { role: 'tabpanel', id: 'dshcp-panel-fonts', 'aria-labelledby': 'dshcp-tab-fonts', hidden: tab !== 'fonts', 'data-dshcp-preview': '' }, tab === 'fonts' ? h(FontSettings) : null));
  }
  var registration = slots.inject('settings.section', function () {
    return slots.register({ name: 'settings.section', id: 'dsh-code-pill', order: 65, label: function () { return 'Code Pill'; } }, function () { return h(SettingsPage); });
  });
  return typeof registration === 'function' ? registration : function () {};
}
