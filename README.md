# dsh-code-pill

DSH 对话界面的 Antigravity 风格代码渲染插件（纯浏览器侧）。

## 效果

- **inline code**：渲染成琥珀色 pill（Antigravity 观感），内部做语法着色，
  覆盖常用语言（JS/TS/JSX、Python、Go、Rust、Java、C/C++、C#、SQL、
  Bash/PowerShell、HTML/XML、PHP、Ruby、Lua、Kotlin、Swift 等）。
- **文件名徽章**：`search.mjs`、`package.json` 这类文件名 inline code
  前面出现 `JS` / `JSON` 语言徽章（Antigravity 的文件类型标注风格）。
- **代码块**：shiki 代码块的 token 色换成 VS Code **Light+ / Dark+**
  官方调色板（keyword 蓝/粉紫、string 橙、comment 绿、function 黄、
  type 青、constant 浅蓝），跟随 DSH 亮/暗主题切换。
- **命令行**：`git commit -m "fix"` 这类命令片段按 shell 规则着色
  （`--flag` 参数色、`$VAR` 常量色）。

## 实现要点（React 安全）

- **零 DOM 结构修改**：着色用 CSS Custom Highlight API（tokenize 出
  字符区间 → Range → Highlight，注册到九个固定 highlight 名，由
  `::highlight()` 规则上色）；徽章用 `data-dshcp-badge` 属性 +
  `::before` 伪元素。React 管理的 `code` 元素只被加 class 与 data
  属性，子节点永不改动，流式更新经 characterData mutation 重新着色。
- MutationObserver 只读监听 + requestAnimationFrame 批处理；排除
  `pre` 内代码块、file mention 按钮与链接化的 inline code。
- 颜色全部走 CSS 变量（`--dshcp-*` / `--shiki-*`），亮暗两套跟随
  `body[data-ds-dark-theme]`。

## 结构

```
src/tokenizer.cjs    纯函数 tokenizer（node 可测试）
src/styles.css       VS Code 调色板 + pill/徽章/highlight 规则
src/client-main.js   client factory 模板（占位符）
scripts/build.mjs    拼接 → lib/client.js（node scripts/build.mjs）
lib/index.js         host 侧最小插件（零副作用）
lib/client.js        产物：window.__ModuleLoader__ factory
tests/               node 直跑的行为测试
```

## 安装

Desktop profile 用 Desktop 随包 CLI（首次安装，GitHub Release tarball，无需 npm registry）：

```
node "C:\Program Files\DSH NEXT\resources\app\lib\desktop-cli.js" plugin --profile desktop add https://github.com/KouzakiUmi/dsh-code-pill/releases/download/v<version>/dsh-code-pill.tgz
```

已安装更新：

```
node "C:\Program Files\DSH NEXT\resources\app\lib\desktop-cli.js" plugin --profile desktop update dsh-code-pill@https://github.com/KouzakiUmi/dsh-code-pill/releases/download/v<version>/dsh-code-pill.tgz
```

本地开发：`file:` spec 指向本目录（先 `node scripts/build.mjs` 生成 lib/client.js）。安装后重启 DSH Desktop 并刷新 Web GUI 生效（profile 无 HMR）。

## 发布

显式 tag 发布：推 `v*` tag 触发 GitHub Actions——CI 重建 client bundle 并与提交产物比对（防漂移）、跑 manifest 校验与全部测试、pack 后发 GitHub Release（资产 `dsh-code-pill.tgz`）。tag 必须与 package.json 版本一致（`v0.1.0` ↔ `0.1.0`）。
