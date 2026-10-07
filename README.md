# dsh-code-pill

DSH 对话界面的 Antigravity 风格代码渲染插件，纯浏览器侧，无外部服务、配置或运行时依赖。

## 效果与边界

- 行内标识符、文件名、路径、URL 使用统一琥珀金色，背景轻薄，无边框。
- 明确的表达式、函数调用、声明和命令启用语法着色；关键字、字符串、数字、注释有区分，普通标识符保持金色。
- 文件路径不会被拆成属性或关键字着色。不自动添加文件类型徽章，不处理链接/按钮中的代码。
- shiki 代码块使用 VS Code Light+/Dark+ 配色，跟随 DSH 亮暗主题。
- 这是启发式行内 tokenizer，不是完整语言解析器。需要精确语言识别时应使用带语言的代码块。

已验证 DSH Core `0.2.1-alpha.1`、Cordis `4.0.5-alpha.1`，桌面 profile 和 Chromium 浏览器渲染。其他 Core 版本未验证；桌面壳版本不等于 Core 版本。浏览器不支持 CSS Custom Highlight API 时仍显示金色文字，但不做 token 染色。

## 安装和更新

npm 包名：`dsh-code-pill`。桌面插件页可填包名；命令行使用目标桌面安装自带 CLI，以下路径仅是 DSH NEXT 的示例，请按本机安装调整。

首次安装：

```powershell
node "C:\Program Files\DSH NEXT\resources\app\lib\desktop-cli.js" plugin --profile desktop add dsh-code-pill
```

已有安装更新：

```powershell
node "C:\Program Files\DSH NEXT\resources\app\lib\desktop-cli.js" plugin --profile desktop update dsh-code-pill@latest
```

也可使用 [GitHub Releases](https://github.com/KouzakiUmi/dsh-code-pill/releases) 中已构建的 `dsh-code-pill.tgz`：首次 `add <tarball URL>`，更新 `update dsh-code-pill@<tarball URL>`。源码压缩包不能代替该安装资产。

更新已安装包后重新打开 DSH，加载新的 JS 代际。不要直接修改 profile 的 node_modules；本地开发先构建、打包，再通过同一 CLI 更新 `dsh-code-pill@file:<tarball 的绝对路径>`。无配置字段、环境变量或持久化数据。

## 开发与验证

Node 24，使用提交的 npm lockfile：

```sh
npm ci --ignore-scripts
node scripts/build.mjs
node scripts/check-manifest.mjs
node tests/tokenizer.test.mjs
node tests/client-smoke.test.mjs
node tests/browser-render.test.mjs
npm pack --ignore-scripts --json > pack.json
node scripts/prepare-release.mjs
```

浏览器测试默认使用已安装的 Chrome；可用 `BROWSER_CHANNEL=msedge` 指定 Edge。CI 在 Linux 使用 Chrome，验证实际颜色、Highlight ranges、无边框和卸载清理，并生成 `dist/inline-preview.png`。真实 Cordis 生命周期测试可运行 `node tests/client-smoke.test.mjs <目标安装的 cordis/lib/index.js>`。

源码位于 `src/tokenizer.cjs`、`src/styles.css`、`src/client-main.js`；`scripts/build.mjs` 生成 `lib/client.js`。修改源码后重建产物，不直接编辑生成文件。MutationObserver 和 requestAnimationFrame 批处理，CSS Custom Highlight API 着色，不替换 React 管理的子节点；插件卸载时清理样式、observer、highlights 与属性。

## CI 和发布

`ci.yml` 在 main 推送和 PR 时运行构建、产物漂移检查、manifest、行为与浏览器测试、打包验证。PR 不发布。

`release.yml` 在推送 `v<package.json.version>` 标签时发布；也支持选择同一标签进行手动恢复。发布经过验证的同一个 tarball 到 GitHub Release 和 npm。npm job 使用 GitHub-hosted runner、Node 24、npm >=11.5.1 与 `id-token: write`，不需要 NPM_TOKEN。已存在的版本只在 integrity 与本次资产一致时跳过，查询失败会停止。

首次创建 npm 包需要维护者人工认证。包存在后，在 npm 设置 Trusted Publisher：

| 字段 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | KouzakiUmi |
| Repository | dsh-code-pill |
| Workflow filename | release.yml |
| Environment | 留空（job 没有 environment） |
| Allowed action | 允许直接 npm publish |

也可用 npm >=11.15.0 的 `npm trust github` 配置，需维护者身份和 2FA。参见 [npm 官方 Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。GitHub Release、npm 发布、DSH 市场上架和本机插件更新是分别进行的操作。

发布前更新版本和 CHANGELOG，完成验证后提交、创建匹配 tag 并推送。不要移动已发布标签。失败时查看 Actions；修复工作流后需新提交，旧 run 重跑不会自动使用新版工作流。npm 成功后查询具体版本、latest 和 integrity，允许短暂 registry 传播延迟。

## 许可证

MIT，见 LICENSE。
