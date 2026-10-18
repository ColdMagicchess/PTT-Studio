# src：插件代码

Host 侧插件代码。`pnpm run build` 用 tsdown 把 `src/index.ts` 打成单文件 `lib/index.js`（ESM）。除 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-credentials` 外，所有依赖都打进包里，所以装插件时不需要再装依赖，也不会触发 pnpm 的构建脚本审批。

## 入口与注册

| 文件 | 作用 |
|---|---|
| `index.ts` | Cordis 插件入口。`inject = ['tools', 'skills', 'workingDirectory']`；`apply` 校验配置、注册 skill 和 6 个工具 |
| `config.ts` | 插件 `Config`（schemastery）：图片后端列表与当前后端、并发、重试、单次张数上限、测宽字体、羽化比例、deck 大小上限 |
| `skill.ts` | 以 rank 590 注册 `pptx-studio` skill（内置 skill 是 600，用户项目里的 skill 仍然优先） |
| `paths.ts` | 定位包根目录与 `assets/pptx-studio/`，源码运行和打包运行都适用 |
| `fsutil.ts` | 原子写入：先写临时文件再改名 |
| `types/host.d.ts` | 本插件用到的 DSH 宿主 API 的类型声明。安装版 DSH 只带 JS 不带 .d.ts，所以只声明用到的子集 |

## 模块

| 目录 | README | 内容 |
|---|---|---|
| `deck/` | [deck/README.md](deck/README.md) | deck.json 的类型与校验 |
| `build/` | [build/README.md](build/README.md) | 用 pptxgenjs 组装 .pptx，含文字测量与自动适配、图标、饰板 |
| `images/` | [images/README.md](images/README.md) | 图片提示词拼接与检查、Agnes/魔搭后端、并发重试缓存、羽化 |
| `check/` | [check/README.md](check/README.md) | 几何与对比度检查 |
| `tools/` | [tools/README.md](tools/README.md) | 6 个模型工具与沙箱写入检查 |
| `vision.ts` | 独立视觉模型评审：解析自定义模型、路由/会话路由、OpenAI 兼容调用、结构化问题解析；`tools/review.ts` 暴露 `pptx_review` |
| `client/` | [client/README.md](client/README.md) | 浏览器插件设置页：三类模型、自定义模型、Key 输入（构建为 `lib/client.js`） |

## 与 DSH 的约定

- **宿主服务**：`tools`、`skills`、`workingDirectory` 是必需的，写在 `inject` 里；`sandboxPolicy`、`credentials` 是可选的，用 `ctx.get(name)` 读取，缺了也不阻塞激活。
- **不新增 Session 事件**：模型看到的内容全部来自工具结果，Web 卡片需要的数据放在 `presentationMeta` 里。
- **二进制写入**：DSH 的 `ctx.fs` 只能写文本，所以 .pptx 和图片用 node:fs 写入；写之前必须调用 `callWorkspace(...).assertWritable`，按 Session 的沙箱模式检查。
