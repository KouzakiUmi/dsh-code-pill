# dsh-code-pill 设计文档

## 1. 产品定位与本次扩展

Code Pill 用于 DSH 对话中的行内代码：薄背景、克制的语法色、可选文件标记。
设置页注册到宿主 `settings.section`，不建立独立服务器，不向消息插入交互按钮。
本次增加五套深浅配对预设、自定义颜色、文件标记、排版参数、代码块颜色与配置导入导出。

## 2. 核心约束

1. **不修改消息子节点。** React 管理的 code 只加 class/data 属性；语法色用 CSS Custom Highlight，文件标记用伪元素。
2. **宁可少染，不误伤术语。** 标识符、路径、URL、文件名默认 plain，只有明确表达式和命令启用启发式扫描。
3. **增量更新。** 九个持久 Highlight 集合按 code 增删 Range，不在流式更新时重建全文。
4. **草稿隔离。** 设置页面由 React 渲染独立预览，使用 `data-dshcp-preview` 排除聊天渲染管线。修改草稿不影响真实聊天。
5. **显式保存。** 只有“保存并应用”写浏览器存储、更新渲染；取消恢复已保存配置，关闭页面丢弃草稿。
6. **单一色源。** `src/settings-core.cjs` 定义色板；CSS 生成器、设置预览和审计读取同一数据。`src/styles.css` 只定义几何、伪元素和界面布局。
7. **不覆盖宿主安装。** 开发产物只写工作区，不修改 DSH 安装目录、Profile 或生产插件。

## 3. 语义与文件标记

解析类别为 kwc/kwd/str/com/num/fn/typ/cst/prm；默认文字 plain 加前五类构成六个独立颜色。
fn/typ/cst/prm 并入 plain：行内表达式不是完整编辑器，不必把所有角色拆色。
不承诺完整语言解析；精确高亮使用带语言的宿主代码块。

文件标记只用于命中的文件名，不用于普通表达式：

| 模式 | 行为 |
| --- | --- |
| off | 不显示标记 |
| label | 文件名前显示语言缩写 |
| icon | 文件名前显示单色文件图标 |
| both | 文件名前图标、文件名后语言缩写 |

图标为本地 CSS SVG mask，继承当前文字色，无 CDN、无品牌 Logo、无消息子节点插入。
徽章使用独立的实色背景与文字色，避免叠层背景使审计失真。
文件检测支持常用扩展名、特殊 basename、Windows 分隔符与中文路径；有空白的路径仍保守降级。

## 4. 设置数据

浏览器 key 为 `dsh-code-pill.settings.v1`；配置 `version: 1`。
保存范围是当前浏览器、当前 origin，不是账户同步，也不是主机 Profile 配置。
保存失败保留草稿并显示错误，不声称已保存。无效的已有配置回落默认并提示。
跨窗口 storage 事件更新当前渲染，不强行覆盖另一个页面正在编辑的草稿。

| 字段 | 含义 / 范围 |
| --- | --- |
| preset | amber/readable/cool/editor/contrast/custom |
| syntax | 行内语法着色布尔开关 |
| marker | off/label/icon/both |
| fontScale | 0.8–1.1，相对正文 em |
| radius | 0–10px |
| padding | 水平 0–0.6em |
| bgOpacity | 0–0.2 |
| blockTheme | host/preset |
| light、dark | 各含 plain/kwc/kwd/str/com/num/bg/badgeBg/badgeText |

默认保留琥珀色与语言徽章，字号 0.94em、圆角 4px、水平内边距 0.25em。
代码块默认 host：这是可组合扩展，不能默认夺走其他主题插件的代码块配色。
选择 preset 时，按当前主题生成 `--shiki-*` 变量；返回 host 会移除插件的变量覆盖。

JSON 导入必须通过配置版本、枚举、数值范围、颜色格式与未知字段校验。
不接受任意 CSS、远程图片地址、脚本或主题代码；导入只进入草稿。
导出为配置 JSON 文本，不包含聊天内容、凭据或账户数据。

## 5. 五套配对预设与审计

- amber：琥珀经典，延续签名色。
- readable：柔和阅读，中性基调。
- cool：冷调清晰，青蓝基调。
- editor：编辑器经典，熟悉的蓝/绿/暖色语法信号。
- contrast：高对比，更强的文字明暗差。

每套均分别设计 light/dark，非简单颜色反转。
预设选择替换完整外观草稿，界面明确提示；修改任何外观参数标记 custom。

内置色板需按默认排版通过审计：六个文字角色对页面背景与合成 pill 背景 ≥4.5:1，徽章文字对徽章底色 ≥4.5:1。
页面审计背景为白色与 `#1e1e1e`，不能据此宣称对所有宿主主题都合规。
自定义色板只提示，不禁止保存；审计提醒基于当前预览背景与当前底色强度。
色盲模拟为辅助设计检查，不等于医学验证或所有视觉障碍下都能分辨的保证。
数值以 `node scripts/color-audit.mjs` 的当前输出为准，不在本文复制第二份色板表。

## 6. 渲染与生命周期

MutationObserver 监听 childList 与 characterData，受影响的 code 入 Set，RAF 合并处理。
宿主不存在已核实的稳定聊天 selector 时保留 body fallback，但 pending 为空不安排 RAF。
处理时重新核验 code 的资格，排除 pre/a/button、内含按钮/链接/SVG 与设置预览区域。

快照包含文本、首节点身份和子节点数。子节点变化使快照失效，避免同文字替换 Text 后旧 Range 空掉但跳过更新。
迁入排除区域、脱离 DOM 时清除 class、data 与 Range；迁出或重新插入后重新建立。
配置变化更新样式、清除旧 Range 并重新排队；关闭 syntax 保留 pill 与可选文件标记。
卸载清理 slot 注册、store 订阅/storage 事件、observer、RAF、样式、Highlight 与装饰属性。

无 Highlight API：pill + 文件标记，不染 token。非单文本节点：安全退化为 plain。
高对比 forced-colors 由系统接管色彩；不强制保留自定义 RGB。

## 7. 设置页集成

复用宿主 React 和 `@deepseek-ai/dsh-client-ui-primitives` 的 Button、Switch、Input。
通过 `ctx.slots.inject('settings.section', ...)` 等待扩展入口，由 slot 生命周期拥有注册与注销。
没有 slots 或缺少 UI 模块时，只禁用设置页面，聊天渲染继续。
不引入运行时 React 副本；React/ReactDOM 开发依赖只用于浏览器测试。

颜色输入提供 color picker 与完整 #RRGGBB 文本；文本失焦校验，非法输入恢复原值并提示。
预览包含中文段落、文件名、声明、字符串、命令和代码块。
宿主代码块预览为示意，不假称独立测试页已经复现宿主完整 Shiki 高亮器。

## 8. 验证入口

- `node tests/tokenizer.test.mjs`：分类、区间、防误伤、文件/命令检测。
- `node tests/settings.test.mjs`：预设、严格配置、CSS、序列化与审计。
- `node tests/client-smoke.test.mjs`：模块加载、body-null 降级与生命周期。
- `node tests/browser-render.test.mjs`：真实 Chromium 颜色、徽章、主题与卸载。
- `node tests/dynamic-render.test.mjs`：流式节点替换、区域迁移、配置更新与降级。
- `node tests/settings-browser.test.mjs`：真实 React 草稿、保存、开关、导入、窄屏与清理；宿主控件是结构测试替身，非宿主整体截图验证。
- `node scripts/color-audit.mjs`：五套默认预设配对主题审计。

源码修改后运行 build 更新 lib/client.js。构建不安装，不更新 Profile，不执行 Git 发布。
