# 首页展示资源

这些资源为 Code Pill 独立设计，未复制 dsh-subusage 的画面或素材。首页横幅采用深色底、琥珀签名与倾斜卡片，卡片内容是真实客户端渲染；展示内容来自当前代码。

| 资源 | 内容与来源 |
| --- | --- |
| [banner.png](banner.png) | 首页主视觉（2880×1520，2x）；右侧为真实客户端的行内代码与折叠动作行渲染 |
| [presets.png](presets.png) | 六套配对深浅色预设，名称和颜色读取 [settings-core.cjs](../src/settings-core.cjs) |
| [markers.png](markers.png) | 四种文件标记模式，使用同一份真实客户端 bundle |
| [feature-rows.png](feature-rows.png) | 折叠动作行着色前后对比（深浅各一组），按宿主 DOM 结构的夹具渲染 |
| [feature-ink.png](feature-ink.png) | 0.6.0／0.7.0 旧版思考彩虹的实测时间序列（深浅各一列）；轻量短尾的当前参数见 [设计说明](../DESIGN.md)，重建脚本已使用新参数 |

## 重建

在已经安装开发依赖、Chrome 可用的环境中：

```sh
node scripts/build.mjs
node scripts/render-doc-assets.mjs
```

[render-doc-assets.mjs](../scripts/render-doc-assets.mjs) 与 [doc-scenes.mjs](../scripts/doc-scenes.mjs)（行着色与思考刷入场景）通过路由拦截创建隔离页面，没有启动替代服务器，也没有访问生产 DSH。每个预设在独立 origin/frame 中保存配置、加载 [lib/client.js](../lib/client.js)，由同一渲染管线生成语法色和文件标记。

脚本校验各 frame 实际使用自己的色板，并检查 UTF-8 文本与页面错误。展示图是**隔离的真实插件渲染，不是生产 DSH 整页截图**；设置页控件替身的测试截图不用于冒充产品现场。

## 字体与许可

开发机已安装并用于渲染的开源字体：`Noto Sans SC` 与 `Sarasa Term SC`；均不随插件打包，不使用字体 CDN。字体缺失时使用系统兜底，生成图的排版可能不同。图形、布局及本地 SVG 图标为仓库自有代码，按根目录 [MIT LICENSE](../LICENSE) 使用。

图片用于 GitHub 文档展示，不是插件运行时资源。颜色或功能变化后应重新生成，并检查截图与文档是否仍符合当前实现。
