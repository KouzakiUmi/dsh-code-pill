# 兼容性与权限边界

本文针对 **0.6.0** 的代码。六套预设、自定义色板、双 Tab 设置页、图标、字体与持久化能力自 `0.3.0` 起提供，字体能力分类与搜索自 `0.4.0` 起提供；[package.json](../package.json) 的版本字段不构成已发布的证据，实际发布状态以 registry 和 GitHub Release 为准。开发入口见 [开发与验证](development.md)，行为约定见 [DESIGN.md](../DESIGN.md)。

## 已知证据，不扩大结论

| 层级 | 已知事实 | 不能据此声称 |
| --- | --- | --- |
| 历史 DSH 集成 | 原有行内渲染在 Core `0.2.1-alpha.1` / Cordis `4.0.5-alpha.1` 上有历史验证；包清单仅标记该 Core compatible | 当前新增设置页已在该 Core 整个真实现场重新验证；其他 Core 自动兼容 |
| 当前宿主现场 | 桌面 Profile 安装本地未发布包、独立 Chrome 连接真实宿主（Core `0.2.1-alpha.2`）：设置 slots 入口、草稿隔离、保存实际聊天色板、三个真实文件节点的图标、语法关闭后 Range 清空、导出 JSON、刷新恢复均通过；41 个真实聊天 code 子节点身份未被改写；深/浅标题颜色与宿主正文对齐 | 生产 Electron 窗口本身已被直接操作；npm `0.2.0` 已包含这些功能 |
| 浏览器渲染 | 真实 Chrome 测试检查最终 bundle 的颜色、Highlight ranges、徽章、主题、动态节点与卸载；新增设置/动态测试已在本机通过 | 所有浏览器、桌面壳、宿主主题都通过；测试夹具等于生产消息页 |
| 设置页测试 | [settings-browser.test.mjs](../tests/settings-browser.test.mjs) 使用真实 React/ReactDOM，Button、Switch、Input 和 slots 为结构测试替身 | 控件样式等于生产宿主真实控件；完整设置导航、生产 Shiki 高亮器已端到端验证 |
| Cordis 生命周期 | 已使用本机实际安装的 Cordis 入口运行 [client-smoke.test.mjs](../tests/client-smoke.test.mjs)，真实 fiber 加载与卸载检查通过；DOM 为最小桩 | 此测试覆盖真实 settings.section、宿主所有服务、热更新的全部现场行为 |
| 当前 DSH 安装 | 上述现场验证使用本地未发布的工作区包；通过桌面配套 CLI 更新 desktop 的插件来源与 lockfile，未修改宿主安装代码、未手改 Profile 配置；验证页临时外观已恢复 | npm 包已发布；其他 Profile 已部署；所有客户端缓存均已刷新 |

上述证据来自 2026-10-12 的本地工作区验收，不等于对已发布包在每个宿主环境上的重新验证；这些能力自 `0.3.0` 起随 npm 与 GitHub Release 发布；当前版本和 dist-tag 以 npm registry 为准。

桌面应用壳版本不等于 Core 版本。实际 Core 导出契约和 UI 模块应按目标环境核验；其他 Core 版本保持“未知”，不把历史声明升级为全面兼容保证。包声明 Node `>=18`，开发/CI 使用 Node 24，未建立各 Node 版本的完整测试矩阵。

Font Lab 合并版本的浏览器内行为已由隔离 Chrome + React 测试覆盖；字体族读取授权、生产终端与 CSS zoom 弹窗仍缺现场验收证据，不能据此宣称已在所有宿主或其余 Profile 部署。

聊天路径适配（0.5.0）基于本地宿主源码结构，已在隔离 Chrome 中验证路径、点击保持、动态归属、配置与卸载；未进行真实宿主整页验收。少量 CSS-module 局部名回退仍需随宿主升级回归。

思考文字彩虹刷入依赖 CSS Custom Highlight API、`StaticRange` 与 `color-mix()`；缺任一能力时该选项静默不生效。本机验证使用 Chrome 155（隔离页面，复刻宿主思考行与流式 Markdown 的 DOM 契约）；本机桌面壳的 Chromium 版本来自安装包字符串，不等于已在其真实聊天页验收。

折叠动作行着色的类别与状态色是纯 CSS，依赖宿主 `data-variant`／`data-tool`／`data-state` 与 DisclosureRow 的固定子结构（取自本机已安装宿主源码，宿主改动结构时可能失效且不报错）；完成状态词另需 CSS Custom Highlight 与 `StaticRange`。同样只在隔离 Chrome 夹具中验证，未在真实聊天页验收。

## 宿主能力与降级

客户端入口依赖宿主 `window.__ModuleLoader__`。设置页通过 `settings.section` 注册，读取 slots 服务，并复用宿主 React 与 `@deepseek-ai/dsh-client-ui-primitives` 的 Button、Switch、Input；集成实现见 [settings-ui.js](../src/settings-ui.js)。

- **没有 slots**：可在支持服务注入的宿主等待 slots；没有相关契约时不注册设置页。
- **缺少 UI/React 模块或必需控件**：不注册设置页，聊天默认渲染仍继续，不加载额外 React 副本。若当前 origin 已有有效保存配置，渲染仍可恢复它；“没有设置页”不等于删除配置。
- **body 尚未就绪**：渲染启动安全返回空清理函数；不把这个安全返回当成稍后自动初始化的承诺。
- **缺少 CSS Custom Highlight API**：保留胶囊文字和可选文件标记，不做 token 染色。
- **多 Text 或非单一 Text 子节点**：不拆解/重写 React 内容，安全回落为 plain；Highlight 染色只用于一个 Text 子节点。
- **forced-colors 高对比度**：颜色由系统接管，不强行保留自定义 RGB；不以普通深浅截图推断其实际可读性。

渲染器只装饰合格的行内 code，不处理 pre、链接、按钮、内含交互/SVG 子节点或设置预览区域；目前使用 body 观察 fallback，不承诺仅命中某个已核实的稳定聊天根。实现见 [client-main.js](../src/client-main.js)。tokenizer 是启发式扫描，不是完整语言解析器；路径、普通标识符和不明确表达式优先保守处理。

代码块默认 `host`，不覆盖宿主主题；选择 `preset` 才生成 Shiki CSS 变量。变量测试与设置预览不是生产宿主完整 Shiki 渲染验证，也不能保证与所有其他主题插件的覆盖顺序兼容。

## 浏览器存储与隐私

新增设置持久化意味着权限描述必须从旧版“只改 DOM/CSS”扩展为：**读写插件自己的浏览器 localStorage 外观配置**。key 为 `dsh-code-pill.settings.v1`，配置格式 `version: 1`；实现见 [settings-ui.js](../src/settings-ui.js) 与 [settings-core.cjs](../src/settings-core.cjs)。

- 存储范围是当前浏览器配置环境、当前 origin（协议、主机、端口），不是 DSH profile、账户或云端配置；不同 origin/设备不会自动同步。
- 清除网站数据会丢失配置；隐私模式、存储禁用或配额限制可能导致读取/保存失败。读取无效值回落默认并提示；保存失败保留草稿、不应用到聊天、不声称已保存。
- 保存后通过同 origin 的 storage 事件更新其他页面；已有编辑草稿不被强行覆盖。更改草稿不影响真实聊天，导入也只进入草稿，显式保存才生效。
- 导出是配置 JSON 文本，不含聊天内容、账户或凭据。导入严格校验版本、字段、枚举、范围与颜色，不接受任意 CSS、脚本或远程资源。
- localStorage 不是加密秘密库；同 origin 中具备执行权限的其他脚本可能访问它，不应把敏感信息填入外观配置。

字体 Tab 额外使用 `dsh-code-pill.fonts.v1`，首次兼容读取原 `dsh-font-lab/v1`。字体为即时应用：保存失败时本页仍生效并反馈未持久化，与代码外观草稿模式不同。用户主动点击「读取 / 刷新本机字体」后才请求浏览器 Local Font Access 权限，在浏览器内读取字体数据表进行分类，不上传、下载、复制或分发字体文件。候选名单只存本次插件会话，不永久缓存，不读取旧 `dsh-font-lab/fonts` 名单。语言为字符样本覆盖，等宽为默认字面 95 个可打印 ASCII 度量；未知或各字面有差异时不确证能力。浏览器可以只提供允许的字体子集。用户自定义选择器可影响整个页面字体；总开关与卸载会清理本插件覆盖，但不会清理其他插件样式。

## 零外网与主机边界

| 能力 | 当前插件行为 |
| --- | --- |
| 外网请求 | 无 fetch/XHR/WebSocket、外部服务、遥测或 CDN 资源；图标为本地单色 SVG mask |
| 主机文件系统 | 无 host FS 访问；[lib/index.js](../lib/index.js) 的 apply 是空操作 |
| 命令执行 | 无插件运行时命令，无 preinstall/install/postinstall/prepare 生命周期脚本 |
| 凭据/Profile | 不读取环境变量、账户凭据或主机 profile；只读写上述浏览器外观配置 |
| DOM/CSS | 读取页面 code 文本以判断行内模式，添加 class/data、样式与 Highlight 注册项；不上传文本，不替换消息子节点 |

这些是**插件运行时**边界，不包括开发依赖安装、npm 发布或 DSH 下载包本身。构建、测试和打包工具在工作区读写文件；发布脚本访问 registry，不能混同为插件有外网或 hostFS 能力。

## 未覆盖与风险

- 生产 Electron 窗口本身尚未直接操作；生产完整设置导航与 Shiki 链路仍缺最终验收。
- 默认浏览器测试为 Chrome；Edge 通道可选不等于已通过，Firefox/WebKit 及其他宿主/Core 未验证。
- [color-audit.mjs](../scripts/color-audit.mjs) 按白色与 `#1e1e1e` 页面背景、默认底色强度和徽章背景审计；不保证任意宿主背景或用户自定义颜色均满足对比度。自定义低对比度可保存，仅警告。
- 色盲模拟是辅助检查，不是医学验证；forced-colors 的系统配色与布局仍应现场检查。
- 浏览器禁用/清除存储会影响持久化；同 origin 的脚本访问和第三方主题变量覆盖应按目标宿主的实际安全与样式环境评估。

兼容性判断应保留“历史宿主证据 / 当前独立测试 / 尚未现场安装”的分层，不能用单一 compatible 字段替代这些边界。
