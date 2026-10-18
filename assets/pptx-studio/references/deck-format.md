# deck.json 格式

整套 PPT 由两个文件描述，都放在 `.pptx-studio/<deck-id>/` 下：

- `brief.json`：需求收集的结果。
- `deck.json`：逐页设计稿，`pptx_build` 和 `pptx_generate_assets` 只读这个文件。

完整的机器可读定义见 [../deck.schema.json](../deck.schema.json)，完整示例见 [../examples/](../examples/)。

<a id="brief"></a>
## brief.json

```json
{
  "version": 1,
  "topic": "2026 年度产品发布",
  "purpose": "发布会",
  "audience": "客户与媒体",
  "language": "zh-CN",
  "slideCount": 12,
  "style": "tech-dark",
  "complexity": "rich",
  "textDensity": "light",
  "brand": { "primary": "#3B82F6", "logo": "assets/logo.png" },
  "mustInclude": ["三项核心功能", "上线时间表"],
  "decidedBy": { "style": "user", "complexity": "user", "textDensity": "assistant" }
}
```

`style` 取风格库中的 id 或 `custom`；`complexity` 取 `minimal`（极简）/ `simple`（简约）/ `balanced`（均衡）/ `rich`（复杂）/ `ornate`（华丽）；`textDensity` 取 `light` / `medium` / `dense`。`brand` 可省略。

## deck.json 顶层

| 字段 | 必填 | 说明 |
|---|---|---|
| `version` | 是 | 固定为 1 |
| `id` | 是 | 小写字母、数字和连字符，同时用作目录名 |
| `title` | 是 | 演示文稿标题，写入文件属性 |
| `language` | 是 | 例如 `zh-CN`、`en-US` |
| `design` | 是 | `{ style, complexity, textDensity }`，与 brief 一致 |
| `theme` | 是 | 配色、字体、styleAnchor、seed，见下文 |
| `pageNumbers` | 否 | 默认 `true`：组装工具在右下角饰牌上自动画页码（封面、章节页、结尾页除外）。不要手写页码元素 |
| `assets` | 否 | 需要生成的图片清单，见下文 |
| `decorations` | 否 | 装饰件组（kit）清单，见下文；复杂度为 rich 或 ornate 时必须有 |
| `slides` | 是 | 页面数组，至少 1 页 |

## theme

```json
{
  "style": "tech-dark",
  "colors": {
    "background": "#0B1020", "surface": "#141B33", "primary": "#3B82F6",
    "secondary": "#22D3EE", "accent": "#A78BFA", "text": "#F1F5F9", "textMuted": "#94A3B8"
  },
  "fonts": { "heading": "微软雅黑", "body": "微软雅黑", "latin": "Segoe UI" },
  "styleAnchor": "futuristic technology aesthetic, ...",
  "seed": 20261017,
  "radius": 12
}
```

颜色一律写成 6 位 hex。`radius` 是卡片圆角，单位为磅（pt），取风格库给出的值。`motifs` 是背景的质感词汇 `{ foreground, midground, background }`，只描述背景的质感和底纹，不再画进背景的独立装饰件，见 [complexity.md](complexity.md#画面由三层组成)：`background` 是整版密铺的底纹，`midground` 是织进表面的中景纹理（rich 可省略），`foreground` 用来推导装饰件的 subject、写进 `decorations[].pieces[].subject`，不参与背景提示词。复杂度为 rich 或 ornate 时必填。`highlight` 可选，是点睛色（例如深蓝金色主题里的一轮红日），每页最多用一处，元素中以 `highlight` 角色名引用。

## assets：图片清单

每张需要生成的图片登记一次，页面通过 `id` 引用。同一张背景可以被多页引用。

```json
{
  "id": "bg-content",
  "kind": "background",
  "prompt": "very subtle surface texture with soft light along the edges, a large calm even center, low contrast",
  "aspect": "16:9",
  "file": "assets/bg-content.png"
}
```

| 字段 | 说明 |
|---|---|
| `id` | 资源 id，在 deck 内唯一 |
| `kind` | `background` 或 `illustration` |
| `prompt` | 只写**主体加构图**两段，用英文；不得含 hex 色值、数字、缩写或"text/title"类词（见 [image-prompts.md](image-prompts.md#正向提示词的禁用内容)）。styleAnchor、配色、复杂度修饰和质量词由工具自动拼接 |
| `aspect` | `16:9`、`4:3`、`3:4`、`1:1` |
| `onColor` | 插画专用：放置位置的底色角色（`background` 或 `surface`），工具据此写入底色描述。与 `cutout` 互斥；旧流程用，会留下方框 |
| `cutout` | 插画专用：`white` 或 `black`。在纯白/纯黑平底上生成，工具去底、裁边后存成透明 PNG，插画直接融入背景；与 `onColor` 互斥。白底适合浅色、扁平、插画风，黑底适合发光深色风 |
| `file` | 生成后的相对路径，由工具写入；也可以指向用户提供的图片，这时不再生成。`cutout` 资产的 `file` 指向透明 PNG |

背景的 `prompt` 只写质感、光、氛围和场景主体，不写具体装饰件（角的枝条、徽章、飘带、散落星点、道具）；这些交给 `decorations`。

**插画默认用 `cutout`**：`{ "kind": "illustration", "cutout": "white" }`。生成后是透明 PNG，直接放大放在背景上或大数字旁，不要再套白色圆角卡片——白卡会把插图框住，贴纸感强。工具只去掉与图片边缘连通的背景，主体内部的白色（白衬衫、机器人外壳、屏幕）会保留。

<a id="decorations"></a>
## decorations：装饰件组

一组装饰件（kit）由图片模型生成，`mode` 决定方式：`sheet`（默认）在一张整版图里一起画好，每件分开、共享风格，工具去掉纯白或纯黑底后按连通区切件；`single` 每件单独一张图，工具逐件去底裁边。两种模式都把每件的路径写回 deck.json。件怎么画（模式、提示词、网格、lint）见 [image-prompts.md](image-prompts.md#装饰件整版图提示词)。

```json
{
  "id": "ink-corner",
  "backdrop": "white",
  "mode": "sheet",
  "pieces": [
    { "id": "plum-spray", "subject": "corner spray of plum blossoms and slender branches", "role": "corner" },
    { "id": "cloud-strip", "subject": "narrow border strip of repeating cloud scrolls", "role": "border" },
    { "id": "bead-divider", "subject": "vertical divider of small linked beads", "role": "divider" }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 小写字母、数字和连字符；`decor` 元素用 `kit/piece` 引用 |
| `backdrop` | 是 | 生成用的底色，生成后去掉：`white` 用于大多数风格，`black` 用于深色发光风格 |
| `mode` | 否 | `sheet`（默认）：一组一张整版图，切件后按阅读顺序配回件 id，快但 6 件以上容易多画/漏画；`single`：每件一张图，件名一定对但慢。摆位敏感的件用 `single` |
| `styleAnchor` | 否 | 覆盖 `theme.styleAnchor`，只给这一组用；主题 anchor 里有人物/场景词（扁平、插画类风格）时，给 kit 写一个只描述装饰件画风的 anchor |
| `pieces` | 是 | 1–12 件，每件 `{ id, subject, role }` |
| `pieces[].id` | 是 | 组内唯一，小写字母、数字和连字符 |
| `pieces[].subject` | 是 | 英文短语，只写件本身；不写颜色、数字、缩写、引号或 text 类词，工具 lint 不合格会整组拒收。`single` 模式一条只写一个物件，不要写 "X with Y" |
| `pieces[].role` | 是 | `corner` 角饰、`border` 边饰、`divider` 分隔纹、`accent` 点缀、`scatter` 散点、`frame` 框饰、`badge` 徽章底座 |
| `files` | 否 | 由 `pptx_generate_assets` 写入：件 id → 相对 deck 目录的路径（`decor/` 下） |
| `sheet` | 否 | 由工具写入：生成的原图路径 |

整套 kit 的数量按复杂度（见 [complexity.md](complexity.md)）：simple 1 个、balanced 1–2 个、rich 2–3 个、ornate 3–4 个。每组件数：`sheet` 一次 4 件（2x2）最稳，rich 每组 4–6 件；ornate 件多，建议用 `single`（每组 4–9 件）。件数不够就加一组，不要硬塞进一张整版图。每页用哪些件、放在哪，由下面的 `decor` 元素决定。

装饰件生成不传插图风格参考图（风格板里的人物会被抄进每一件），一致性靠 `styleAnchor`（kit 覆盖或用主题的）+ 配色 +（sheet 模式的）同图并置。

## slides：页面

```json
{
  "id": "s03",
  "layout": "bullets-image",
  "visual": "左侧三条要点，右侧一张发光的 AI 芯片插画，背景为通用内容页背景",
  "background": { "asset": "bg-content" },
  "elements": [ ... ],
  "notes": "演讲者备注"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 页面 id，例如 `s01` |
| `layout` | 是 | 版式库中的 id |
| `visual` | 是 | 一段画面描述，写清什么东西在什么位置 |
| `background` | 否 | `{ "asset": id }` 引用背景图；或 `{ "color": 角色 }` 使用纯色；或 `{ "gradient": [角色, 角色], "angle": 角度 }`。省略时使用 `background` 色 |
| `elements` | 是 | 元素数组，按从下到上的叠放顺序排列 |
| `notes` | 否 | 演讲者备注 |

## elements：元素

所有元素都有 `type` 和 `box`。`box` 为 `{ x, y, w, h }`，单位是页面宽高的百分比。可选 `id` 用于检查报告中定位问题。

元素按数组顺序从下到上绘制：背景 → `decor` → 面板、卡片、图片 → 文字。因此 `decor` 要写在它旁边文字**之前**。

颜色字段可以写主题角色名（`primary`、`text` 等），也可以写 hex；优先用角色名，这样换主题时不必逐个修改。

### text 文本

```json
{
  "type": "text",
  "box": { "x": 6, "y": 8, "w": 88, "h": 12 },
  "role": "title",
  "text": "新架构把延迟降低 40%",
  "align": "left",
  "valign": "middle",
  "color": "text",
  "bold": true
}
```

| 字段 | 说明 |
|---|---|
| `role` | `display`、`title`、`subtitle`、`heading`、`body`、`number`、`caption`；决定默认字号和最小字号，见 [text-density.md](text-density.md) |
| `text` | 文本内容。也可以写成片段数组 `[{ "text": "降低", "color": "accent", "bold": true }, ...]`，用于在一行里强调部分文字 |
| `align` | `left`（默认）、`center`、`right` |
| `valign` | `top`（默认）、`middle`、`bottom` |
| `color` | 默认 `text` |
| `bold`、`italic` | 可选 |
| `size` | 可选，覆盖默认字号；仍受最小字号约束 |
| `autoFit` | 默认 `true`：放不下时缩小字号。设为 `false` 时，放不下直接报告溢出 |

### bullets 要点列表

```json
{
  "type": "bullets",
  "box": { "x": 6, "y": 26, "w": 46, "h": 62 },
  "role": "body",
  "items": [
    "推理速度提升 3 倍",
    { "text": "支持 100 万 token 上下文", "level": 1 }
  ],
  "marker": "dot"
}
```

`items` 中的每项是字符串，或 `{ text, level }`（`level` 为 0 或 1）。`marker` 取 `dot`（默认）、`number`、`none`、`icon`；取 `icon` 时每项写成 `{ text, icon }`。

### shape 形状

```json
{ "type": "shape", "box": { ... }, "shape": "roundRect", "fill": "surface", "opacity": 0.7, "line": { "color": "primary", "width": 1 }, "shadow": true }
```

`shape` 取 `rect`、`roundRect`、`ellipse`、`line`、`arrow`、`triangle`、`chevron`、`diamond`。`line.double` 为 true 时画双线描边。`line` 形状只使用 `line` 字段。`opacity` 范围 0–1。装饰性的形状加 `"decor": true`，几何检查不会把它和其他元素的重叠算作问题。

### panel 饰板（华丽档）

```json
{ "type": "panel", "box": { ... }, "panel": "panel", "fill": "background", "opacity": 0.9, "accent": "accent", "corners": true }
```

`panel` 取 `panel`（内容饰板）、`banner`（竖条框）、`medallion`（圆窗）、`plaque`（小饰牌），画法见 [layouts.md](layouts.md#饰板)。`corners` 为 true 时在四角加角花。饰板放在 elements 中它承托的文字**之前**，几何检查不把饰板与其上文字的重叠算作问题。

text 元素可加 `"vertical": true` 竖排，用于 banner 中的标题。

### decor 装饰件

从装饰件组里取一件放到页面上。坐标是外接框，图片按等比缩进框内、贴靠离页面最近的那个角（左上角的元素贴左上，右下角贴右下）。

```json
{ "type": "decor", "box": { "x": 0, "y": 0, "w": 12, "h": 10 }, "piece": "ink-corner/plum-spray", "flipH": true }
```

| 字段 | 说明 |
|---|---|
| `piece` | `kit id/piece id`，必须存在于 `decorations`；校验会查这一条 |
| `box` | 外接框。件按角贴靠，所以角花只用一个角上的框即可 |
| `flipH`、`flipV` | 水平 / 垂直镜像；同一件角花用 flipH、flipV 放到另外三个角，四角才对称 |
| `rotate` | 旋转角度 |
| `opacity` | 0–1，用于让装饰更退后 |

规则：

- `decor` 必须写在它旁边文字之前（先画装饰再画字），并且不要与文字框重叠，至少留 2% 间隔。
- 每页件数按复杂度（简约 0–2、均衡 1–4、复杂 3–8、华丽 6–16），`pptx_check` 会检查；装饰盖住文字会报错。
- 不要压在饰板上，尤其不要压饰板里的文字；右下角页码饰牌附近不放。
- 同一件在整套里反复用（镜像、旋转、缩放）比每页换新件更统一。

### image 图片

```json
{ "type": "image", "box": { ... }, "asset": "il-chip", "fit": "contain" }
```

`asset` 引用 assets 中的 id；也可以用 `path` 直接指向工作区中的图片。`fit` 取 `contain`（默认）或 `cover`。

### icon 图标

```json
{ "type": "icon", "box": { ... }, "name": "rocket", "color": "primary", "badge": "surface" }
```

`name` 取插件内置矢量图标库中的名称；`badge` 可选，给图标加一个圆形底色。可用名称（共 29 个）：`rocket`、`brain`、`zap`、`shield`、`chart`、`trend`、`users`、`target`、`lightbulb`、`clock`、`globe`、`lock`、`check`、`star`、`heart`、`cloud`、`database`、`cpu`、`settings`、`book`、`flag`、`gift`、`leaf`、`mail`、`phone`、`map`、`sparkles`、`flower`、`arrowRight`。没有合适的图标时用最接近的一个，不要编造名称；未知名称会被 `pptx_check` 报错。

### chart 图表

```json
{
  "type": "chart",
  "box": { ... },
  "chart": "bar",
  "categories": ["2023", "2024", "2025"],
  "series": [{ "name": "营收（亿元）", "values": [12, 18, 27] }],
  "legend": true,
  "dataLabels": true
}
```

`chart` 取 `bar`（柱状）、`barH`（条形）、`line`、`pie`、`doughnut`、`area`。系列颜色依次取 primary、secondary、accent。数据必须来自用户材料。

### table 表格

```json
{
  "type": "table",
  "box": { ... },
  "header": ["功能", "旧版", "新版"],
  "rows": [["延迟", "120 ms", "72 ms"], ["并发", "1k", "5k"]],
  "colWidths": [40, 30, 30]
}
```

`colWidths` 可选，是各列占表格宽度的百分比。组装工具默认使用**轻量表格**样式：表头主色底、细线（背景色系的浅色）、隔行浅色、数字单元格加粗、首列居中其余左对齐。信息 ≤6 项时不要用表格，改用卡片组（见 [layouts.md](layouts.md#table-表格)）。

## 版本与文件

- 每次调用 `pptx_build` 都输出新的 `builds/deck.vN.pptx`，N 从 1 递增，旧版本不覆盖。
- 修改时直接编辑 deck.json，不要另存为 deck2.json。
- 资源文件按 `assets/<asset-id>.png` 命名；重新生成时覆盖同名文件，并在检查报告中注明。
- 装饰件按 `decor/<kit>.<hash>.<piece>.png` 命名，整版图是 `decor/<kit>.<hash>.sheet.png`，多切出的件存 `decor/<kit>.<hash>.extra-N.png`。装饰件的 hash 由提示词、seed 和图片模型算出（装饰件不使用风格参考图），换 seed 或改提示词会得到新文件。
- `decorations[].files` 与 `decorations[].sheet` 由 `pptx_generate_assets` 写回 deck.json；手写 deck 时不要自己填。
