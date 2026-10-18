# build：组装 .pptx

| 文件 | 作用 |
|---|---|
| `assemble.ts` | `buildDeck(deck, options)`：deck → pptx 字节，同时返回文字适配报告、缺失资源、未知图标 |
| `metrics.ts` | 文字测量与自动适配：`fitText`、`wrapCount`、字体测量器与估算测量器 |
| `typography.ts` | 各文字角色在三档文字量下的字号、最小字号、行距（与 `references/text-density.md` 一致） |
| `icons.ts` | 29 个内置线框图标（Lucide 风格，ISC 许可）和饰板角花，以 SVG 数据嵌入 |

## 设计

- **坐标**：deck 里用页面百分比，页面固定 16:9（13.333×7.5 英寸），按比例换算。
- **文字适配**：
  - 起始字号取该角色在当前文字量档位的默认值，每次减 1pt，直到放下或降到最小字号；到最小字号还放不下就报告溢出，不会悄悄裁掉。
  - 标题类角色（display、title、number、heading、subtitle）优先保持一行；正文避免最后一行只剩一个字。
  - 测宽默认用保守的宽度表：中文按 1em，西文约 0.56em。配置了 `.ttf/.otf` 字体时改用真实字宽；`.ttc` 字体集解析不了，自动退回宽度表。
- **元素**：文本、要点（项目符号用主题 secondary 色，pptxgenjs 本身不支持，靠改写 XML 实现）、形状（可选双线描边）、饰板（panel/banner/medallion/plaque，双线描边加四角角花）、图片、图标（可选圆形底）、原生图表、原生表格。
- **背景**：纯色、渐变（SVG 渐变图）或资源图（cover 铺满）。
- **羽化**：插画放在图片背景上，或放在卡片上但图片边缘颜色与卡片色差距较大（RGB 距离 ≥ 18，常见于主体被画到边缘的插画）时，边缘按 `featherFraction` 渐变为透明；边缘颜色已经和卡片一致的插画不做羽化。
- **图片体积**：按图片在页面上的尺寸 × `imagePpi`（默认 192）缩放，背景最长边上限 `backgroundMaxPx`（1920），插画上限 `imageMaxPx`（800）；不透明的图片编码为 JPEG（质量 `jpegQuality`，默认 85），带透明的图片编码为最高压缩的 PNG。实测 6–7 页带 8 张图的 PPT 约 3 MB；不做这一步时约 20 MB。
- **页码**：自动画在右下角的小饰牌上，cover、section、closing 三种版式不画；deck 里写 `pageNumbers: false` 可以整体关闭。

## 已知限制

- 竖排文字（`vertical`）在 LibreOffice 渲染和 PowerPoint 里都能正常显示，但测宽按横排计算，所以竖排框的高度要留足余量。
- 文字适配基于估算宽度，PowerPoint 实际排版可能有 1–2pt 的偏差。
