# Changelog

## 0.2.0 — 2026-10-10

可读性重设计（设计推理与数值推导见新增 DESIGN.md）。

- 色彩系统重做：约束求解（WCAG ≥ 4.5:1 + 明度阶梯 + 色盲安全轴）取代手工选色，两主题统一渲染同一套 6 色语义（plain/kwc/kwd/str/com/num 独立，fn/typ/cst/prm 继承 plain）。修复 Light 主题 kwc/kwd 同色、num 等五类无独立色的信息丢失问题。
- 恢复文件名语言徽章（0.1.3 曾取消），与 package.json 宣传一致；徽章改为 inline 伪元素布局，修掉失效的 flex 声明。
- 修复 Light 注释对比度（4.3 → 5.07）、Light 数字对 pill 背景对比度（4.26 → 4.96）、Light 字符串与 plain 的绿色盲混淆、Dark 数字与 plain/kwd/com 的绿色盲混淆。
- 渲染性能：九个语法类别改为持久 Highlight 对象 + per-code 差量 add/delete，替代每帧全量重建；长对话流式渲染不再随消息数退化。
- tokenizer 新增 `detectInlineContext()` 单入口（mode + badge 一次计算）；注释移除硬编码色值，消除与 styles.css 的双源漂移。
- 新增 `scripts/color-audit.mjs`：色板 WCAG 对比度、明度差矩阵、绿色盲模拟混淆对审计，任一失败以非零退出码拦截 CI；新增 DESIGN.md 记录设计思路、数值与已知边界。
- 浏览器测试扩展：徽章、num 独立色、Light/Dark 变量切换断言。

## 0.1.3 — 2026-10-08

- 恢复 Antigravity 风格金色行内代码，使用轻背景、无边框样式。
- 表达式保留关键字、字符串和数字染色，路径和术语统一显示，取消自动文件徽章。
- 修复 CSS_TEXT 未定义导致 web boot 启动失败。
- 修复命令名前缀误匹配、流式文本替换后的高亮更新，排除链接/按钮内代码。
- 增加浏览器渲染和 Cordis 生命周期验证，完善构建、打包与 npm Trusted Publisher 发布流程。

## 0.1.0

- 首次发布行内代码渲染与 shiki 配色插件。
