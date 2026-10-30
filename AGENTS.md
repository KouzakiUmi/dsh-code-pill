# Code Pill 项目维护入口

## 目的与验收

Code Pill 是 DeepSeek Harness 的纯客户端外观插件，为行内代码、聊天文件路径和可选动作行提供克制的胶囊样式，并提供代码外观与字体设置。

有效实现应满足：

- 不替换宿主 React 管理的消息子节点；默认渲染只写插件 class/data、样式和 Highlight。可选显示平滑的 Text 调度与 `data-dshcp-smooth-hold` 块标记例外须遵守其恢复契约，且不得与宿主的底部跟随争夺滚动位置。
- 代码外观使用草稿与显式保存；字体独立存储并即时应用。存储失败不得伪报成功。
- 内置六套预设均提供深浅色板，通过 `scripts/color-audit.mjs` 的对比度与绿色盲模拟检查。
- 插件卸载、功能关闭和能力降级时，清理自身观察器、RAF、定时器、样式、Highlight、事件监听和装饰属性。
- 源码变更后重建 `lib/client.js`，并执行 `docs/development.md` 中适用的验证。

## 结构与关键取舍

- `src/settings-core.cjs`：配置 schema、六套预设、行颜色、CSS 变量与颜色审计的唯一事实源。
- `src/settings-ui.js`：共享双 Tab 容器、代码外观草稿、预设卡片与实时预览。
- `src/font-core.cjs`、`src/font-catalog.cjs`、`src/font-ui.js`：字体配置、授权字体识别和即时设置。
- `src/client-main.js`：行内代码装饰、共享 MutationObserver 与生命周期。
- `src/path-renderer.js`、`src/row-tint.js`、`src/think-ink.js`、`src/display-smooth.js`：按语义边界拆分的可选渲染管线。
- `src/styles.css`、`src/font-styles.css`：布局与几何；预设色值不得复制到 CSS。
- `scripts/build.mjs`：将上述源码内联为自包含 `lib/client.js`，React 和宿主 UI primitives 保持 external。

### 预设与行为边界

预设只替换色板、语法／标记／代码块外观和排版。`toolPath`、`sentenceFallback`、`thinkRainbow`、`rowTint`、`displaySmooth` 与 `rowColors` 是独立行为配置，选择预设时必须保留。

预设卡片展示真实胶囊示例。动作行着色关闭时，预览使用宿主灰阶；开启后才显示草稿颜色。代码颜色和动作行颜色使用独立高级折叠区，字体高级槽位默认只显示字体栈，完整选择器按需展开。

### UI 与主题

两个 Tab 共用标题、最大宽度和存储范围说明，但保存语义不同。颜色使用宿主 `--dsw-alias-*` 令牌，预览审计背景只代表白色与 `#1e1e1e`，不能推断所有宿主主题均合规。新增交互需保留键盘焦点、选中态和窄屏布局。

## 实现边界

- Host 入口 `lib/index.js` 保持零副作用；不得在 Client 导入 Node 原生模块。
- 不新增外部服务、遥测、远程字体或图标资源，不读取主机文件系统、Profile 或凭据。
- 不直接修改 DSH 宿主安装目录。真实宿主验证与隔离夹具验证分别记录，不用测试替身冒充生产整页验收。
- 路径与动作行适配依赖已核实的宿主语义属性和局部结构；宿主升级后需重新核对，不根据本地化标题猜测。
- 字体名单只在用户主动授权后读取，保留于当前插件会话；不下载或分发字体文件。

## 维护约定

- 行为或契约调整时，同步更新 `DESIGN.md`、`docs/settings.md`、相关测试与 `CHANGELOG.md`；展示色板变化时重建对应文档资产。
- 修改测试必须基于产品行为，保留有效覆盖，不为通过而放宽颜色审计、类型或生命周期检查。
- `lib/client.js` 是生成产物，不手工单独编辑；交付前确认重建无漂移。
- 完整设计、兼容边界和验证命令分别见 `DESIGN.md`、`docs/compatibility.md`、`docs/development.md`。
