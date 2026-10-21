<p align="center">
  <img src="https://raw.githubusercontent.com/KouzakiUmi/dsh-code-pill/main/assets/banner.png" width="100%" alt="Code Pill：代码更清楚，阅读更连贯。琥珀色行内代码、文件徽章与六套深浅配对预设。">
</p>

<div align="center">

# Code Pill

**让代码融入阅读，而不是打断阅读。**

DeepSeek Harness 的行内代码外观插件。轻背景、语法色、文件标记，按你的阅读习惯调整。

[![CI](https://github.com/KouzakiUmi/dsh-code-pill/actions/workflows/ci.yml/badge.svg)](https://github.com/KouzakiUmi/dsh-code-pill/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-code-pill?color=916200&label=npm)](https://www.npmjs.com/package/dsh-code-pill)
[![MIT](https://img.shields.io/badge/license-MIT-68786a)](LICENSE)

[开始使用](#开始使用) · [挑选色板](#六套色板两种主题) · [设置指南](docs/settings.md) · [开发文档](docs/development.md)

</div>

> [!NOTE]
> **本页为 0.5.0 版本文档。** 字体能力分类与搜索、设置页、六套外观预设和自定义选项见 [更新记录](CHANGELOG.md)。main 与 npm 已发布包不自动等同；实际发布状态以 [npm](https://www.npmjs.com/package/dsh-code-pill) 与 [GitHub Releases](https://github.com/KouzakiUmi/dsh-code-pill/releases) 为准。推送 main 只构建验证包，不会自动发布 npm。

## 不必把对话变成编辑器

短标识符需要的是清楚的引用感，文件名需要的是定位线索，真正的表达式才需要语法颜色。Code Pill 把这三件事分开：

| 阅读动作 | Code Pill 如何处理 |
| --- | --- |
| 扫过一段回复 | 轻薄底色、无边框胶囊，让代码区别于正文，又不过度抢眼 |
| 找到某个文件 | 语言缩写或单色小图标；不为普通表达式贴文件标记 |
| 细读一段代码 | 关键字、字符串、数字与注释分色；路径和术语保持统一颜色 |
| 调整阅读习惯 | 深浅独立色板、字号和间距；先预览，满意后再保存 |

## 六套色板，两种主题

不是给同一张图加滤镜。每套都有独立的浅色与深色配色；预设只是起点，每个颜色都能继续调整。

<img src="https://raw.githubusercontent.com/KouzakiUmi/dsh-code-pill/main/assets/presets.png" width="100%" alt="六套预设对比：琥珀经典、柔和阅读、冷调清晰、编辑器经典、高对比、素雅简约；每套同时展示浅色和深色。">

<sub>展示图由当前客户端 bundle 在隔离 Chromium 页面中真实渲染，并读取源码中的预设；不是生产 DSH 整页截图。</sub>

## 文件标记，想留多少就留多少

关闭、语言文字、小图标、图标＋文字。图标继承当前文字颜色，不加载外部资源；文件标记不会扩散到普通表达式。

<img src="https://raw.githubusercontent.com/KouzakiUmi/dsh-code-pill/main/assets/markers.png" width="100%" alt="四种文件标记模式：关闭、语言文字、小图标、图标加文字。普通代码表达式不加文件图标。">

聊天文件路径同样使用胶囊：覆盖读取／写入／编辑摘要、正文文件引用、搜索结果文件名、读取卡片标题与聊天内路径标签。保留宿主点击和截断；URL、匹配正文、行号、终端输出和附件卡片不受影响，可在设置里整项关闭。聊天路径适配自 0.5.0 起提供，已通过宿主结构夹具回归，尚未完成真实宿主整页验收。

## 调到舒服，再应用

在 **设置 → Code Pill** 中使用两个 Tab：**代码外观** 与 **字体**。

代码外观：

- **颜色**：分别调整深浅主题的六个文字角色、胶囊底色和徽章颜色。
- **排版**：字号比例、圆角、水平内边距、底色强度。
- **显示**：行内语法着色、文件标记、聊天文件路径，以及保留宿主／使用当前色板的代码块配色。
- **管理**：保存并应用、取消草稿、恢复默认、JSON 导入导出。

**代码外观草稿不改变聊天。** 字体 Tab 保留 Font Lab 的即时应用模式，支持全局／等宽字体、界面缩放、会话字号、逐部位覆盖、自定义选择器和 CSS 导出。首次读取原 Font Lab 的本浏览器配置，之后独立保存，不修改原插件配置。

设置仅保存到当前浏览器、当前网站地址，不上传、不跨设备自动同步；同源窗口会同步已保存的设置。字体只引用本机字体，不下载或分发字体文件；「读取 / 刷新本机字体」需用户主动点击并授权；只展示本次浏览器提供的字体，不内置字体组合或固定候选。支持英文、汉字样本、ASCII 等宽和未完整识别筛选及搜索；名单只存当前插件会话。合并版本启用前建议停用原 Font Lab，避免两个插件同时覆盖字体；本次源码合并不自动停用或卸载原插件。自定义低对比度配色会提醒，但不禁止保存。

详细操作、默认值和存储范围见 [设置指南](docs/settings.md)。

## 开始使用

### 安装已发布版本

在 DSH 插件页填写 `dsh-code-pill`，或使用实际 Profile 名称执行：

```powershell
dsh plugin --profile <profile> add dsh-code-pill
```

更新已安装版本：

```powershell
dsh plugin --profile <profile> update dsh-code-pill@latest
```

按部署方式重新打开／重载 DSH，让新客户端模块被加载。**这些命令安装 npm 已发布包；双 Tab 从 0.3.0 起提供，动态字体分类与搜索从 0.4.0 起提供，请核对安装版本。**

### 试用当前 main

在 [CI 构建记录](https://github.com/KouzakiUmi/dsh-code-pill/actions/workflows/ci.yml) 中选择成功的 main 构建，下载 `verified-package` artifact 并解压。使用其中的 `dsh-code-pill.tgz`，不要把 GitHub 源码 ZIP 当作插件包。

首次安装与已有插件更新分别使用：

```powershell
dsh plugin --profile <profile> add <tarball 的绝对路径>
dsh plugin --profile <profile> update dsh-code-pill@file:<tarball 的绝对路径>
```

路径含空格时整体加引号。构建包仍可能保留当前版本字段；它不等于对应版本已经正式发布。

## 克制，也包括权限

**不接外部服务，不读账户凭据，不访问主机文件系统，不替换 React 管理的消息子节点。** 插件装饰合格的行内代码、注册 CSS Highlight、注入用户选择的字体／字号／缩放 CSS，并读写浏览器配置；可按需通过浏览器授权读取本机字体族名称及分类所需的字体数据表，仅在客户端解析，不上传、不永久保存字体名单。

默认保留宿主代码块配色。内置预设按白色与 `#1e1e1e` 背景、合成胶囊背景和徽章背景审计，文字对比度达到 4.5:1；这不是对所有宿主主题和自定义颜色的保证。

真实 Chrome 渲染、React 设置交互、Cordis 加载与卸载已有测试证据。验证分层：行内渲染在 Core `0.2.1-alpha.1` 有历史集成验证；当前 Core `0.2.1-alpha.2` 已在桌面 Profile 以本地未发布包、经独立 Chrome 连接真实宿主，完成设置入口、草稿隔离、保存与刷新恢复、文件图标和 41 个真实聊天 code 子节点身份保持的现场验证；生产 Electron 窗口本身尚未直接操作，其他 Core 与浏览器保持未知。本地验收和 main 源码推送均不等于正式发布，不代表 npm `0.2.0` 已包含这些功能。宿主需提供设置 slot、React 和 UI primitives；能力不足时保留聊天渲染、按能力降级。完整范围见 [兼容性与权限边界](docs/compatibility.md)。

## 进一步了解

| 文档 | 内容 |
| --- | --- |
| [设置指南](docs/settings.md) | 预设、颜色、开关、导入导出与常见问题 |
| [设计说明](DESIGN.md) | 零子节点侵入、增量 Highlight、色板与草稿隔离 |
| [开发与验证](docs/development.md) | 模块结构、测试、构建、打包与发布边界 |
| [兼容性](docs/compatibility.md) | 实测证据、降级、浏览器存储与未覆盖场景 |
| [更新记录](CHANGELOG.md) | 已发布版本与 Unreleased 改动 |

首页插图可通过 `node scripts/render-doc-assets.mjs` 从当前 bundle 重建，详见 [展示资源说明](assets/README.md)。

---

[MIT License](LICENSE) · [报告问题](https://github.com/KouzakiUmi/dsh-code-pill/issues) · [GitHub Releases](https://github.com/KouzakiUmi/dsh-code-pill/releases)
