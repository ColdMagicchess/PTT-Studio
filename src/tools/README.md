# tools：模型工具

| 工具 | 作用 | 写入位置 |
|---|---|---|
| `pptx_style_board` | 按 deck 主题和复杂度生成 1–3 张风格样张，每张用不同 seed | `<deck 目录>/style/` |
| `pptx_generate_assets` | 生成 deck.assets 中的图片，可带风格参考图；结果写回 deck.json 的 `file` 字段 | `<deck 目录>/assets/`、deck.json |
| `pptx_build` | 校验并组装 .pptx，按版本号输出，同时返回检查结果 | `<deck 目录>/builds/deck.vN.pptx` 或 `output` 参数指定的路径 |
| `pptx_check` | 只做校验和检查，不写文件 | — |
| `pptx_render` | 用 LibreOffice Kit 把 .pptx 指定页渲染成 PNG（文件名为 `slide-NN.png`，NN 是页码），供 `read_image` 做视觉检查 | `<pptx 目录>/review/<pptx 名>/` |

| 文件 | 作用 |
|---|---|
| `context.ts` | `callWorkspace`：解析调用方 Session 的工作目录和沙箱策略；`assertWritable` 的规则是 read-only 全部拒绝，workspace-write 只允许写工作区内，danger-full-access 不限制 |
| `build.ts` | `pptx_build`、`pptx_check`；按背景图采样文字对比度 |
| `images.ts` | `pptx_style_board`、`pptx_generate_assets`；解析当前图片后端与 Key |
| `render.ts` | `pptx_render`；`locateRenderer` 自动查找独立 Node（`$DSH_HOME/dsh-runtimes/dsh-primary-runtime/.../node`）和 kit CLI（Electron 的 `process.resourcesPath/app.asar.unpacked/...`），也可以通过配置 `renderNode`、`renderCli` 指定 |

## 结果格式

每个工具都返回结构化值：`render` 生成模型看到的文本，`presentationMeta` 留给第二阶段的 Web 卡片（路径、页数、问题数、生成的文件列表）。PTC 模式下，`tools.pptx_build(...)` 直接拿到这个结构化值。

## 运行时间

`pptx_generate_assets` 支持 `run_in_background: true`：通过 `ctx.jobs.start()` 注册后台任务，逐张 append 进度并更新 progress 行，工具立即返回 job id；模型用通用的 `job_output`/`job_list` 收集（需要宿主有 `dsh-tool-jobs`；没有时前台执行）。前台调用的超时是 1 小时，`pptx_style_board` 是 30 分钟。目前仍是前台执行，改成 `ctx.jobs` 后台任务留到第二阶段（见总览 README 的阶段计划）。
