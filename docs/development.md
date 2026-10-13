# 开发与验证

本文描述 **0.4.0** 的源码与交付流程，npm `0.2.0` 不包含这些新增功能；实际发布状态以 registry 和 GitHub Release 为准。包版本字段见 [package.json](../package.json)；产品约定见 [DESIGN.md](../DESIGN.md)，验证边界见 [兼容性说明](compatibility.md)。

## 环境与完整自检

开发和 CI 使用 **Node 24**，通过提交的 [package-lock.json](../package-lock.json) 安装精确依赖；不要以手动安装替代 lockfile。包声明的 Node `>=18` 是宿主最低范围，不代表开发测试矩阵覆盖了全部 Node 版本。

在仓库根目录依次执行：

```sh
npm ci --ignore-scripts
node scripts/build.mjs
node --check lib/client.js
node scripts/check-manifest.mjs
node scripts/check-docs.mjs
node tests/tokenizer.test.mjs
node tests/settings.test.mjs
node tests/fonts.test.mjs
node tests/font-catalog.test.mjs
node tests/client-smoke.test.mjs
node tests/browser-render.test.mjs
node tests/dynamic-render.test.mjs
node tests/settings-browser.test.mjs
node scripts/color-audit.mjs
npm pack --ignore-scripts --json > pack.json
node scripts/prepare-release.mjs
```

这是验证步骤，不包含安装到当前 DSH、提交、推送或发布。依赖安装可能访问 npm registry；插件自身的零外网边界不意味着开发工具链离线。

| 入口 | 主要检查 |
| --- | --- |
| [tokenizer.test.mjs](../tests/tokenizer.test.mjs) | 分类、Range 区间、术语/路径防误伤、文件与命令识别 |
| [settings.test.mjs](../tests/settings.test.mjs) | 六套配对预设、严格配置校验、CSS 生成、序列化、对比度 |
| [client-smoke.test.mjs](../tests/client-smoke.test.mjs) | 模块工厂、body 未就绪降级、样式注入和清理 |
| [browser-render.test.mjs](../tests/browser-render.test.mjs) | 真实浏览器颜色、Highlight ranges、徽章、主题切换、卸载 |
| [dynamic-render.test.mjs](../tests/dynamic-render.test.mjs) | 流式节点变化、Range 身份、区域迁移、设置更新和降级 |
| [settings-browser.test.mjs](../tests/settings-browser.test.mjs) | 真实 React 的草稿隔离、保存/失败、持久化恢复、导入、窄屏、清理；宿主控件是结构替身 |
| [color-audit.mjs](../scripts/color-audit.mjs) | 所有预设深浅主题的页面/合成胶囊/徽章对比度、角色明度差、绿色盲模拟混淆对 |

浏览器测试使用 `playwright-core` 驱动已安装的 Chrome，默认 `BROWSER_CHANNEL=chrome`；可设置 `BROWSER_CHANNEL=msedge` 使用已安装的 Edge。这不代表 Edge 已进入实际验证矩阵。预览图写入 `dist/`，包括行内代码与设置页深浅布局；它们是测试夹具截图，不是生产 DSH 全页截图。

可选的真实 Cordis 生命周期检查：

```sh
node tests/client-smoke.test.mjs <目标安装的 cordis/lib/index.js 绝对路径>
```

该参数必须来自实际目标安装，不能猜测或把另一 Core 的依赖视为当前宿主。检查真实 fiber 激活和 dispose，但 DOM 仍是 smoke test 桩；它不证明真实设置侧栏端到端集成。

## 模块图与单一色源

```text
src/settings-core.cjs ──┬── CSS 变量生成 / 配置校验 / 预览 / 对比度审计
                       ├── src/settings-ui.js（草稿与浏览器存储）
                       └── scripts/color-audit.mjs、tests/settings.test.mjs
src/font-catalog.cjs ─────── 客户端授权字体枚举 / SFNT 能力分类 / 筛选
src/font-core.cjs ────────── 字体配置 / CSS / 外部状态库 / 旧配置读取
src/font-ui.js ───────────── 字体 Tab 与逐部位配置
src/font-styles.css ──────── 字体面板与双 Tab 布局
src/tokenizer.cjs ────────── 行内分类、文件与命令识别
src/styles.css ───────────── 几何、伪元素、设置布局
src/client-main.js ───────── DOM 观察、RAF、Highlight、生命周期
             上述源码 ── scripts/build.mjs ── lib/client.js
宿主 ModuleLoader ── require('react') / require(UI primitives) ── 设置页
lib/index.js ─────────────── host 空操作
```

色板数值唯一来源是 [settings-core.cjs](../src/settings-core.cjs)，不要在 [styles.css](../src/styles.css)、设置预览或审计脚本中复制第二份色表。[settings-ui.js](../src/settings-ui.js) 负责设置草稿与保存；[tokenizer.cjs](../src/tokenizer.cjs) 负责启发式分类；[client-main.js](../src/client-main.js) 仅装饰属性并维护 Highlight Range，不替换 React 管理的消息子节点。

[build.mjs](../scripts/build.mjs) 是本地源码拼接器，将这些模块内联进 [lib/client.js](../lib/client.js)。React 和 `@deepseek-ai/dsh-client-ui-primitives` 保持 **宿主 external**：在模块工厂里由宿主 `require` 解析，不将 React 副本打包。React/ReactDOM 开发依赖仅用于设置页测试；host 入口 [lib/index.js](../lib/index.js) 不注册网络或文件服务。

## 生成产物与打包

修改源码后必须重建并提交 [lib/client.js](../lib/client.js)，不能只提交源码，也不要手工编辑该生成文件。没有安装生命周期脚本替用户构建；源码压缩包也不能替代经过验证的插件 tarball。

[check-manifest.mjs](../scripts/check-manifest.mjs) 核验包名、bundle patch、导出入口、依赖归属和客户端产物。[prepare-release.mjs](../scripts/prepare-release.mjs) 读取 `npm pack --json` 输出，要求包含包清单、patch 与两个运行入口，拒绝源码、测试、脚本、工作流和依赖目录泄漏，再复制为 `dist/dsh-code-pill.tgz`。实际打包范围以 [package.json](../package.json) 的 `files` 为准；文档目录也应通过该清单显式纳入，并核对 pack 的文件列表。

## 首页展示与文档检查

[render-doc-assets.mjs](../scripts/render-doc-assets.mjs) 读取当前 bundle 和预设，使用隔离的 Chromium frames 生成首页 Banner、六套配对色板对比与文件标记图。开发机使用已安装的开源字体；不打包字体，不调用图片生成服务，不把隔离预览冒充生产 DSH 截图。重建方式见 [展示资源说明](../assets/README.md)。

[check-docs.mjs](../scripts/check-docs.mjs) 检查文档的本地链接、预设名称（按 settings-core 实际数量核对）、docs 打包清单与 main/正式版本边界；CI 和发布 verify 均执行它。截图资源保存在仓库，普通构建不会因本机字体变化而重新生成图片。

## CI 与发布不是同一操作

[ci.yml](../.github/workflows/ci.yml) 在 **main 推送与 PR** 上执行 Node 24 安装、构建、语法与 manifest 检查、全部八项测试、色板审计和打包。构建后使用 `git diff --exit-code -- lib/client.js` 检查提交产物是否漂移；成功后上传 `verified-package` artifact（`dist/`）。**main 推送或 PR 不会发布 npm，也不会创建 GitHub Release。**

[release.yml](../.github/workflows/release.yml) 由 `v*` 标签触发；手动恢复也必须选择标签 ref。verify job 要求标签精确等于包版本前加 `v`，重复完整验证并上传 `release-package`。npm 与 GitHub jobs 都使用这个已验证 tarball，而非重新打包。

npm job 使用 GitHub-hosted runner、Node 24、`id-token: write`，并且实际声明 **`environment: npm`**。npm Trusted Publisher 应匹配维护者/仓库、工作流文件 `release.yml`，以及 environment **`npm`**；旧文档的“Environment 留空”不适用于当前工作流。工作流输出 Node/npm 版本，但没有单独锁定 npm 版本字段，发布前仍需确认 runner 的 npm 支持所需可信发布流程。

[publish-npm.mjs](../scripts/publish-npm.mjs) 会访问 registry：已有版本只有 integrity 与验证资产相同才跳过；其他查询失败停止，版本冲突仅进入有限次数的可见性核对。它是发布脚本，不属于普通本地自检，未获单独授权不得执行。创建标签、发布 npm、GitHub Release、DSH 市场上架和本机插件更新均为独立操作；这次整理文档不执行其中任何发布动作。
