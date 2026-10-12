# 兼容性与权限边界

本文针对当前 **Unreleased / main** 的代码。新增五套预设、自定义色板、设置页、图标和持久化能力不能据此归属于已发布 npm `0.2.0`；[package.json](../package.json) 中仍保留该版本字段，并不构成新增功能已发布的证据。开发入口见 [开发与验证](development.md)，行为约定见 [DESIGN.md](../DESIGN.md)。

## 已知证据，不扩大结论

| 层级 | 已知事实 | 不能据此声称 |
| --- | --- | --- |
| 历史 DSH 集成 | 原有行内渲染在 Core `0.2.1-alpha.1` / Cordis `4.0.5-alpha.1` 上有历史验证；包清单仅标记该 Core compatible | 当前新增设置页已在该 Core 整个真实现场重新验证；其他 Core 自动兼容 |
| 浏览器渲染 | 真实 Chrome 测试检查最终 bundle 的颜色、Highlight ranges、徽章、主题、动态节点与卸载；新增设置/动态测试已在本机通过 | 所有浏览器、桌面壳、宿主主题都通过；测试夹具等于生产消息页 |
| 设置页 | [settings-browser.test.mjs](../tests/settings-browser.test.mjs) 使用真实 React/ReactDOM，Button、Switch、Input 和 slots 为结构测试替身 | 宿主真实控件样式、完整设置导航、生产 Shiki 高亮器已端到端验证 |
| Cordis 生命周期 | 已使用本机实际安装的 Cordis 入口运行 [client-smoke.test.mjs](../tests/client-smoke.test.mjs)，真实 fiber 加载与卸载检查通过；DOM 为最小桩 | 此测试覆盖真实 settings.section、宿主所有服务、热更新的全部现场行为 |
| 当前 DSH 安装 | 本轮未将当前 Unreleased 插件安装/更新到 DSH profile，未修改宿主安装 | 已在当前生产 DSH 设置页试用或完成部署 |

桌面应用壳版本不等于 Core 版本。实际 Core 导出契约和 UI 模块应按目标环境核验；其他 Core 版本保持“未知”，不把历史声明升级为全面兼容保证。包声明 Node `>=18`，开发/CI 使用 Node 24，未建立各 Node 版本的完整测试矩阵。

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

- 未安装到当前 DSH，尚缺真实宿主设置页、控件外观、导航和完整 Shiki 链路的现场验收。
- 默认浏览器测试为 Chrome；Edge 通道可选不等于已通过，Firefox/WebKit 及其他宿主/Core 未验证。
- [color-audit.mjs](../scripts/color-audit.mjs) 按白色与 `#1e1e1e` 页面背景、默认底色强度和徽章背景审计；不保证任意宿主背景或用户自定义颜色均满足对比度。自定义低对比度可保存，仅警告。
- 色盲模拟是辅助检查，不是医学验证；forced-colors 的系统配色与布局仍应现场检查。
- 浏览器禁用/清除存储会影响持久化；同 origin 的脚本访问和第三方主题变量覆盖应按目标宿主的实际安全与样式环境评估。

兼容性判断应保留“历史宿主证据 / 当前独立测试 / 尚未现场安装”的分层，不能用单一 compatible 字段替代这些边界。
