# images：配图生成

| 文件 | 作用 |
|---|---|
| `prompt.ts` | 提示词拼接（主体 + styleAnchor + 配色 + 复杂度修饰 + 质量词）；把 hex 转成颜色名；检查主体提示词里的 hex、数字、缩写、引号和"text"类词 |
| `backends.ts` | 图片后端：`openai-compatible`（Agnes，同步接口）和 `modelscope`（异步任务加轮询）；强制走 IPv4；遇到 429、5xx、网络错误按指数退避重试 |
| `generate.ts` | `generateAssets`：并发生成、按提示词哈希缓存、可选风格参考图、把文件路径写回 deck |
| `raster.ts` | 纯 JS 的 PNG/JPEG 解码编码、边缘羽化、区域平均色、区域对比度采样、缩略图 |

## 后端

| 名称 | 地址 | 模型 | 说明 |
|---|---|---|---|
| `agnes`（默认） | `https://api.agnes-ai.cn/v1`（国内站） | `agnes-image-2.5-flash` | 同步返回；`size` 用档位 2K 配合 `ratio`；参考图放在 `extra_body.image`；没有负向提示词字段，在正向提示词末尾加"禁止文字"的说明 |
| `modelscope` | `https://api-inference.modelscope.cn/v1` | `Qwen/Qwen-Image`，带参考图时用 `Qwen-Image-Edit-2509` | 异步任务，每 5 秒轮询；并发超过 2 会被限流（429） |

Key 按 `apiKeyRef` 解析：先查 DSH 凭据库，再查环境变量。

## 缓存

文件名为 `<asset-id>.<哈希>.png`，哈希由完整提示词、宽高比、seed、参考图哈希、模型共同决定。所以改了提示词、主题或参考图会自动重新生成，没改的直接复用；`force` 参数可以强制重生成。

## 修改指引

- 加后端：在 `backends.ts` 加一个分支，在 `config.ts` 的 `kind` 里加枚举值。
- 改复杂度修饰词：同步改 `prompt.ts` 与 `references/image-prompts.md` 的修饰表。
