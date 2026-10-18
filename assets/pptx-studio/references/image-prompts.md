# 图片提示词

图片模型只负责**画面**：背景、插画、装饰件（整版图或单件）。文字、图标、图表、卡片一律由组装工具绘制。所有图片提示词都用**英文**书写，图片模型对英文的理解更稳定；页面文字的语言不受影响。

## 画面由三层组成

| 层 | 由谁画 | 内容 |
|---|---|---|
| 背景 | 图片模型生成一张背景图（极简档不生成，用纯色或渐变） | 底色、质感、光、氛围，以及场景主体（满月、山脉、芯片等）；**不画具体的装饰件** |
| 装饰件 | 图片模型按**装饰件组**（kit）生成（`sheet` 模式一张整版图切件，`single` 模式逐件生成），工具去掉底色并裁成透明 PNG | 角花、边饰、分隔纹、散点小纹样、框饰、徽章底座等 |
| 内容 | 组装工具用原生元素绘制 | 文字、饰板、卡片、图表、表格、图标、配图 |

**背景禁令**：背景图里不得出现独立的装饰件——角的枝条、徽章、飘带、散落星点、道具等，都交给装饰件层。背景只画表面质感、光和氛围色，构图段只描述纹理、氛围与留白，不写"四角的装饰""边缘的花枝"。

decor 区不再靠背景图填充：主模型在 deck.json 的 `decorations` 里定义件、在 `slides[].elements[]` 里用 `decor` 元素摆位（见 [deck-format.md](deck-format.md#decorations)），组装工具把装饰画在背景之上、内容之下。数量见 [complexity.md](complexity.md)。

## 提示词结构

每个背景或插画提示词由以下几段按顺序拼接而成，各段用英文逗号连接：

```
[主体] , [构图与留白] , [styleAnchor] , [配色] , [复杂度修饰] , [质量词]
```

| 段 | 来源 | 示例 |
|---|---|---|
| 主体 | 由你按页面内容撰写，一句话 | `an abstract glowing neural network sphere` |
| 构图与留白 | 按版式的 text-safe 与留白写；背景只写质感、光和安静区，不写装饰件 | `the subject sits on the right side of the frame, the left half of the frame is calm with a soft gradient` |
| styleAnchor | deck.json `theme.styleAnchor`，原样照抄 | 见 [styles.md](styles.md) |
| 配色 | 主题色的**颜色名**（不写 hex） | `color palette of deep navy, electric blue, cyan and soft violet` |
| 复杂度修饰 | 按下表 | `minimal decoration, lots of negative space` |
| 质量词 | 固定 | `high quality, sharp details, professional presentation design` |

负向提示词固定为：

```
text, letters, words, numbers, watermark, logo, signature, caption, title, UI elements, buttons, charts, blurry, low quality, distorted, cropped subject, busy cluttered center, frame border
```

图片中**绝对不能出现文字**。哪怕是装饰性的字母，也会因为乱码而无法使用。

### 正向提示词的禁用内容

Qwen-Image 等模型的文字渲染能力很强，**正向提示词里任何像文字的内容都可能被直接画到图上**。负向提示词挡不住这种情况，必须从正向提示词里去掉。这条对 `assets[].prompt` 和 `decorations[].pieces[].subject` 同样适用：

| 禁止 | 改为 |
|---|---|
| hex 色值 `#3B82F6` | 颜色名 `electric blue` |
| 数字、百分比 `left 58%`、`40%` | 方位词 `the left half`、`the right third`、`two thirds` |
| 缩写和专有名词 `AI`、`5G`、`Aurora`、品牌名 | 描述形态 `a glowing neural core`、`a network of light` |
| `text`、`title`、`letters`、`words`、`label`、`caption` | `empty negative space`、`calm empty area` |
| 引号包起来的任何词 | 去掉引号 |

`pptx_generate_assets` 会在提交前检查提示词：背景和插画不合格时拒绝该张，装饰件组里任何一件的 subject 不合格时整组拒收，并报告位置与原因。

<a id="复杂度修饰"></a>
### 复杂度修饰

复杂度修饰词按等级固定，与风格无关。rich 只替换 `{background}`；ornate 替换 `{background}` 与 `{midground}`；`{foreground}` 不再进背景，只用来推导装饰件的 subject。

| 等级 | 背景修饰 | 插画修饰 |
|---|---|---|
| minimal | 不生成背景图 | `single simple subject, minimal details, flat clean shapes` |
| simple | `nearly flat calm background, one or two faint decorative accents near a single edge, mostly empty negative space` | `single simple subject, few details, clean shapes` |
| balanced | `subtle decorations only along the edges, calm uniform center` | `clear subject with a few supporting elements` |
| rich | 见下方 rich 段 | `detailed scene with multiple supporting elements, layered depth and rich lighting` |
| ornate | 见下方 ornate 段 | `extremely intricate and ornate subject, fine outlines, engraved and filigree details, layered decorative elements, sparkling highlights` |

rich 背景修饰：

```
richly layered atmospheric background, soft depth of field and gentle lighting gradients, a subtle tone-on-tone texture of {background} spread across the whole frame, softly blurred ambient color shapes fading in at the very edges, the middle of the frame stays calm and clean, no separate ornaments, no corner sprays, no props or foreground objects, only surface texture and light
```

ornate 背景修饰：

```
lavish ornate backdrop design, even where this style is usually clean or minimal the whole surface is richly worked, the backdrop is not plain but a tone-on-tone patterned surface like damask wallpaper in shades close to the base background color, a tight seamless repeat of hundreds of tiny {background} covering the whole frame edge to edge including the middle, low-contrast woven midground texture of {midground} dissolved into the surface, every texture finely drawn with engraved and filigree detail, a soft vignette at the edges, the middle of the frame is a softer low-contrast zone with no scenery, no separate ornaments, no corner sprays, no medallions, no props and no foreground objects inside it, one small vivid accent in the highlight color
```

ornate 档在固定负向词末尾追加：

```
plain empty background, solid flat background, large blank areas, minimalist, sparse decoration, bright object in the middle, oversaturated, standalone ornaments, sticker outlines
```

不支持负向词的后端（如 Agnes）不追加，正向模板已覆盖这些要求。

写华丽档提示词时注意：

- **中间不写 "empty"**：这块区域会被饰板盖住，可以保留低对比的底纹，见 [layouts.md](layouts.md#饰板)。构图段里版式的 `calm empty area`、`empty negative space` 一律改成 `a softer low-contrast zone`；常用对称构图 `symmetrical composition, a softer zone in the middle of the frame`。
- **底纹写成"墙纸"而不是"散布"**：只写 `scattered` 或 `repeated evenly`，模型会画成零星的点；写成 `tone-on-tone patterned surface like damask wallpaper` 加 `hundreds of tiny`，才会整页铺满。`tone-on-tone ... close to the base background color` 防止浅色风格的底纹被染成大片高饱和色。
- **前景 motifs 不再进背景**：模板只用 `{background}` 与 `{midground}` 把纹样织进表面；`theme.motifs.foreground` 从风格的「装饰」一栏和主题推导，写进 `decorations[].pieces[].subject`，不要指望背景把它画出来。
- **风格自带的克制词要被压过**：styleAnchor 里的 `ultra clean`、`generous negative space`、`elegant negative space` 会把画面拉回空旷，模板第一句 `even where this style is usually clean or minimal the whole surface is richly worked` 就是用来抵消它们的，不要删。
- **背景只留质感**：模板里已经写了 `no separate ornaments, no corner sprays, no props`；自己写主体时不要补"四周的枝条""角落的徽章"这类句子。

简约、均衡两档的固定修饰里仍有 `faint decorative accents` / `subtle decorations only along the edges` 的旧措辞，按表面色晕理解；具体装饰件一律由 `decor` 元素摆放，不写进主体段。

## 装饰件整版图提示词

装饰件有两种生成模式，写在 `decorations[].mode`：

| 模式 | 怎么生成 | 优点 | 代价 |
|---|---|---|---|
| `sheet`（默认） | 一组一张整版图，去底后按连通区切件，按阅读顺序配回件 id | 快；同图并置，组内风格同源 | 6 件以上实测常多画/漏画，读序映射会把件名对错 |
| `single` | 每件单独一张图，逐件去底裁边 | 件名一定对，不依赖读序 | 慢：一组 4 件就是 4 次请求 |

摆位敏感的件（四角角花、贴边的边饰）用 `single`；批量小件、风格一致优先用 `sheet`。`sheet` 一次 4 件（2x2）最稳，6 件以上要接受多画/漏画和件名错位的风险，件数不够就加一组或改用 `single`。装饰件的生成**不传**插图风格参考图（见「风格一致性」）。

### 整版图提示词（sheet 模式）

`decorationSheetPrompt`（`src/images/prompt.ts`）按下面的顺序拼接：

1. 件数与网格：`a decoration asset sheet of exactly N separate small ornament pieces arranged in <网格> (<网格描述>) with wide empty gaps between them, one piece per cell and nothing else in the image, each listed phrase is exactly one separate piece (do not split a phrase into several items and do not add unlisted items), each piece fully separated and not touching any other piece or the edges, every piece drawn at the same style and level of finish: <件 1>, <件 2>, ...`。网格按件数取：1 件 `a single centered item`，2–4 件 `a neat two by two grid`（`exactly two rows of two`），5–6 件 `a neat three by two grid`（`exactly two rows of three`），7–9 件 `a neat three by three grid`（`exactly three rows of three`），10–12 件 `a neat four by three grid`（`exactly three rows of four`）。每件的 subject 用英文逗号列出，顺序就是切件后配对的顺序。
2. 底色段：白底 `all on a plain flat pure white background, no sticker outlines, no white borders around the items, no drop shadow`；黑底 `all on a plain flat pure black background, no grey halo or sticker outline around the items, no glow spill outside the shapes`。
3. `no shadows, no ground, no scenery, no text anywhere`。
4. 只画列出的件：`only the listed ornament pieces: no people, no characters, no animals, no mascots, no faces, no scenes, no main illustration, no extra items, no props`。
5. 依次拼接 styleAnchor（kit 的 `styleAnchor` 优先，否则 `theme.styleAnchor`）、配色（颜色名）、按档位的单件精细度（`DECOR_DETAIL`）、质量词、无文字后缀。

整版图固定 1:1，一次一张。

### 单件提示词（single 模式）

每件单独生成一张图。`decorationPiecePrompt` 的结构是：`one single small ornament piece drawn alone: <subject>, centered in the frame with wide plain empty margins, nothing touching the edges` + 白/黑底（单数措辞：`no sticker outline, no white border, no drop shadow` / `no grey halo or sticker outline, no glow spill outside the shape`）+ `no ground, no scenery, no text anywhere` + `only this one ornament piece: no people, no characters, no animals, no faces, no scenes, no other items` + styleAnchor / 配色 / `DECOR_DETAIL` / 质量词 / 无文字后缀。

关键是 subject 一条只写一个物件：不要写 "X with Y"（模型会把它拆成两件或对错名字），也不要写场景。完整示例（chinese-ink，kit 级 styleAnchor，白底）：

```
one single small ornament piece drawn alone: porcelain plate with a painted moon and cloud rim, centered in the frame with wide plain empty margins, nothing touching the edges, on a plain flat pure white background, no sticker outline, no white border, no drop shadow, no ground, no scenery, no text anywhere, only this one ornament piece: no people, no characters, no animals, no faces, no scenes, no other items, traditional Chinese ink-wash ornament style, fine ink outlines, vermilion and gold accents, muted earthy tones, refined oriental minimalism, color palette of very light gold, red, deep teal and gold, with a small touch of red as the highlight, extremely intricate pieces, fine gilded or glowing outlines, filigree, openwork and engraved texture, many small parts in every piece, high quality, sharp details, professional presentation design, absolutely no text, letters, numbers, watermark or logo anywhere
```

注意 `single` 模式同样禁人物和动物（提示词里写了 `no animals`）：主题件选器物、植物、几何纹样，不要选人物或动物造型。

### 示例一：华丽档背景（tech-dark，ornate）

motifs：`foreground = branching glowing fiber filaments with small crystal sprigs`（用来推导装饰件，不进背景），`midground = fine holographic circuit traces`，`background = glowing hexagon dots and micro circuit nodes`；配色段补 highlight 色。

```
a richly patterned atmospheric backdrop, an even surface across the whole frame,
futuristic technology aesthetic, deep navy-black background, glowing cyan and electric-blue light lines, subtle perspective grid, soft bokeh light particles, clean high-end product-launch look, cinematic lighting, smooth gradients, ultra clean, high detail,
color palette of very dark navy, blue, cyan and violet, with a small touch of orange as the highlight,
lavish ornate backdrop design, even where this style is usually clean or minimal the whole surface is richly worked, the backdrop is not plain but a tone-on-tone patterned surface like damask wallpaper in shades close to the base background color, a tight seamless repeat of hundreds of tiny glowing hexagon dots and micro circuit nodes covering the whole frame edge to edge including the middle, low-contrast woven midground texture of fine holographic circuit traces dissolved into the surface, every texture finely drawn with engraved and filigree detail, a soft vignette at the edges, the middle of the frame is a softer low-contrast zone with no scenery, no separate ornaments, no corner sprays, no medallions, no props and no foreground objects inside it, one small vivid accent in the highlight color,
high quality, sharp details, professional presentation design
```

注意最后一段里没有任何"四角装饰""边缘花枝"——那些是装饰件，由 `decor` 元素摆上去。

### 示例二：白底六件装饰整版图（chinese-ink，ornate）

requested pieces（顺序即切件顺序）：`corner spray of plum blossoms` / `border strip of cloud scrolls` / `divider of small beads` / `badge base of double rings` / `scatter of tiny stars` / `corner spray of bamboo leaves`。

```
a decoration asset sheet of exactly 6 separate small ornament pieces arranged in a neat three by two grid (exactly two rows of three) with wide empty gaps between them, one piece per cell and nothing else in the image, each listed phrase is exactly one separate piece (do not split a phrase into several items and do not add unlisted items), each piece fully separated and not touching any other piece or the edges, every piece drawn at the same style and level of finish: corner spray of plum blossoms, border strip of cloud scrolls, divider of small beads, badge base of double rings, scatter of tiny stars, corner spray of bamboo leaves, all on a plain flat pure white background, no sticker outlines, no white borders around the items, no drop shadow, no shadows, no ground, no scenery, no text anywhere, only the listed ornament pieces: no people, no characters, no animals, no mascots, no faces, no scenes, no main illustration, no extra items, no props, traditional Chinese ink-wash painting aesthetic, rice-paper texture, soft black ink mountains and mist, vermilion seal accents, elegant negative space, muted earthy tones, refined oriental minimalism, color palette of very light gold, red, deep teal and gold, with a small touch of red as the highlight, extremely intricate pieces, fine gilded or glowing outlines, filigree, openwork and engraved texture, many small parts in every piece, high quality, sharp details, professional presentation design, absolutely no text, letters, numbers, watermark or logo anywhere
```

示例用 6 件展示完整的提示词结构；实操优先 4 件一组（2x2），超过 6 件的 sheet 更容易多画或漏画。

各件的 role：

| 件 | role | 用途 |
|---|---|---|
| corner spray of plum blossoms | `corner` | 四角角花，镜像到另外三角 |
| border strip of cloud scrolls | `border` | 上下边带 |
| divider of small beads | `divider` | 卡片缝隙、两栏之间的分隔 |
| badge base of double rings | `badge` | 章节编号、小标题的底座 |
| scatter of tiny stars | `scatter` | 空隙里的散点 |
| corner spray of bamboo leaves | `corner` | 另一组角花，与梅枝交替用 |

### 装饰件组规则

- **按用途分组**：角饰（角花、角框）、点缀（小花、星点、小纹样）、主题（与本页内容相关的小物件）。一组在同一张图里生成或用同一种画风逐件生成，组内风格天然一致；组与组之间靠同一个 styleAnchor + 配色统一。
- **件数与模式**：`sheet` 一次 4 件（2x2）最稳，6 件以上多画/漏画常见；`single` 一组 4–9 件、逐件生成。整套 kit 数量与每组件数见 [complexity.md](complexity.md)：复杂 2–3 组、每组 4–6 件；华丽 3–4 组，建议 `single`。件数不够就加组，不要硬塞进一张整版图。
- **styleAnchor**：默认用 `theme.styleAnchor`；扁平、插画类风格的 anchor 常含 `friendly characters` 之类，会让人物混进装饰件，这时给 kit 写一个只描述装饰件画风的 `styleAnchor`。
- **不传风格参考图**：装饰件生成不传插图风格板——image-to-image 会把板里的人物/机器人抄进每一件。一致性靠 styleAnchor + 配色 +（sheet 模式的）同图并置。
- **白底用于大多数风格，黑底用于深色发光风格**（如 tech-dark）。白底组里不能写白色的物体：它会被当成底色一起去掉，切出来是残缺的。
- **subject 同样受正向禁用限制**：不写 hex、数字、缩写、引号、`text` 类词；`single` 模式一条 subject 只写一个物件，不要写 "X with Y"。工具会 lint，不合格整组拒收并报告是哪一件。
- **sheet 的 wide gaps 是为了切分**：件贴边、互相重叠或被画在一起时，会被切坏或并成一件。切完后件的边缘必须是干净的透明通道。
- **返回 `partial`** 表示切出的件少于请求（模型少画了或粘连了），结果里的 `missing` 列出没切出来的件。sheet 模式工具内部会先换 seed 再试一次；仍是 `partial` 就手动换 seed、减少件数或改用 `single`。多切出来的件会以 `extra-N` 存下来，可以不引用。
- **同一件复用**：镜像、旋转、缩放同一件比每页换新件更统一，也更省生成次数。
- **看图验收**：白边、残底、被切坏、主体被裁都算不合格；图里出现人物、场景或多余的件也算不合格。

## 构图与留白的写法

背景图只描述质感、光和留白，不再写装饰区。构图描述必须和版式的 text-safe 区一致：

| 版式 | 背景构图描述 |
|---|---|
| cover | `the main visual sits on the right side of the frame, the left half of the frame is a calm gradient with soft texture` |
| section | `soft atmospheric color along the right edge and the bottom edge, the left two thirds of the frame stay calm and even` |
| 内容页通用 | `very subtle surface texture, gentle light falloff toward the edges, a large calm even center, low contrast` |
| closing | 与 cover 相同，主体可以换成更收束的画面 |
| image-full | `full-bleed scene, the lower-left area is darker and calmer` |

装饰件的摆位写在 deck.json 的 `decor` 元素里，见 [layouts.md](layouts.md#装饰件摆位)。不要把"四角的花枝""边缘的徽章"写进背景构图。

### 插画：cutout 去底（默认）

插画默认用 `assets[].cutout`：`"white"` 或 `"black"`。生成时在纯白/纯黑平底上画，工具用 `cutoutImage` 去底、裁边，存成**透明 PNG**，直接放在背景上——没有白框，也不会留下贴纸感。

`assetPrompt` 会自动在主体后追加：

```
isolated on a plain flat pure <white|black> background, nothing touching the edges, no scenery, no ground shadow
```

所以 deck.json 的 `prompt` 只写主体本身，不要自己再写底色或 "nothing touching the edges"。

- **白底**适合浅色、扁平、插画风；**黑底**适合发光深色风（如 tech-dark）。
- 去底只去掉**与图片边缘连通**的纯白/纯黑背景，**主体内部的白色会保留**（白衬衫、机器人外壳、屏幕），不会把主体打洞。
- `cutout` 插画不再羽化，边缘是干净的透明通道。生成后检查：没有白边/黑边、主体没有被抠掉、主体没有被裁。
- 插画主体要居中、四周留 8–12% 余量（提示词的 `nothing touching the edges`）；裁边后工具会去掉透明边，所以主体四周的留白不会被保留。

不要再走「`onColor` 底色 + 白色圆角卡」的旧做法：白卡会把插图框住，卡片内也显空。旧流程的 `onColor` 只在确实不能去底时使用；放在图片背景上的旧插画仍会自动加 18% 羽化。

## 真实素材优先

名画、文物、地标、名人、产品等**已有明确对象**的内容不要用 AI 臆造。先搜索并下载可用的公有领域/授权原图（例如《清明上河图》的原作扫描图），裁成需要的局部后放 `assets/`，用 `image.path` 引用，并在备注或交付说明里写清来源与许可。只给缺的插画、背景、装饰用 AI 生成。真实素材通常**不需要 cutout**：按画框/饰板裁切放在饰板里，反而更可信。

## 尺寸

| 用途 | 宽高比 | 生成尺寸 |
|---|---|---|
| 背景、全图 | 16:9 | 1664×928（组装时等比缩放至铺满） |
| 装饰件图（sheet 整版 / single 单件） | 1:1 | 1328×1328（一件件分开画，切后随内容裁边） |
| 竖向插画（bullets-image） | 约 3:4 | 1104×1472 |
| 方形插画（cutout、卡片位） | 1:1 | 1328×1328 |
| 横向插画 | 4:3 | 1472×1104 |

插画按元素框的宽高比，取最接近的一档。cutout 插画主体居中、四周留 8–12% 余量；裁边后按主体大小缩放，摆放时放大到页宽的 35–45%（见 [layouts.md](layouts.md#插图写法去底放大不套卡)）。

## 风格一致性

一套 PPT 的所有图片看起来必须出自同一个设计师之手。做到这一点靠以下规则：

1. **styleAnchor 是主依据**。背景和插画用 `theme.styleAnchor`，每个提示词都完整带上它，不改写、不删减。装饰件默认也用它；kit 可以写自己的 `styleAnchor` 覆盖（只给这一组用），用来避开主题 anchor 里的人物/场景词。
2. **风格参考图只用于插画，且板里不要有人物**。风格板选定后，插画仍可以用它作参考（魔搭用 `Qwen/Qwen-Image-Edit-2509`，提示词以 `Using the visual style, color palette, glow and lighting of this reference image, create a new image:` 开头）。实测参考图会把它里面的人物、机器人原样抄进新图：所以**装饰件生成一律不传参考图**；背景图也别拿带人物的风格板当参考（可以另起一次不带 `style_reference` 的调用生成背景，或换一张不含人物的风格板），改用同一套 styleAnchor。
3. **固定 seed**。deck.json `theme.seed` 给出一个固定种子，所有图片都使用它；单张重新生成时才换种子。
4. **配色只用主题色**。提示词里只出现主题色的颜色名，不写 hex，不引入别的颜色。装饰件也一样。
5. **主体描述用同一套词汇**。例如插画都写 "flat vector illustration of ..."，不要这张写 "3D render"、那张写 "watercolor"；装饰件都用同一套名词（"corner spray of ..."、"border strip of ..."）。
6. **光照统一**。在 styleAnchor 之外，不额外描述光照方向和时间。
7. **装饰件组共用风格**。同一套的 kit 用同一个 styleAnchor 和配色；sheet 模式同图并置天然同源，single 模式逐件生成也靠同一个 anchor 统一。同一件在整套里复用（镜像、旋转、缩放），别每页换新件。

生成完成后逐张对照检查：色调、画风、线条粗细、细节密度是否一致；装饰件还要看边缘、切件质量和件名是否与 subject 对得上。偏差明显的修改提示词或换种子后重新生成那一张（组）。

## 示例

同一个风格换不同复杂度，只有"复杂度修饰"一段变化，其余各段不变。

主题：tech-dark，复杂度 rich，封面背景。motifs：`background = tiny glowing data dots`（前景 motifs 只用于装饰件）。

```
an abstract glowing neural core made of light filaments and floating data particles,
the main visual sits on the right side of the frame, the left half of the frame is a calm gradient with soft texture,
futuristic technology aesthetic, deep navy-black background, glowing cyan and electric-blue light lines, subtle perspective grid, soft bokeh light particles, clean high-end product-launch look, cinematic lighting, smooth gradients, ultra clean, high detail,
color palette of very dark navy, blue, cyan and violet,
richly layered atmospheric background, soft depth of field and gentle lighting gradients, a subtle tone-on-tone texture of tiny glowing data dots spread across the whole frame, softly blurred ambient color shapes fading in at the very edges, the middle of the frame stays calm and clean, no separate ornaments, no corner sprays, no props or foreground objects, only surface texture and light,
high quality, sharp details, professional presentation design
```

华丽档示例见上文「装饰件整版图提示词」的示例一（背景）与示例二（装饰件组）。

主题：flat-illustration，复杂度 balanced，cutout 插画（1:1，去底后直接放在浅色背景上）。

```
isolated illustration of a teacher pointing at a whiteboard covered with simple shapes, isolated on a plain flat pure white background, nothing touching the edges, no scenery, no ground shadow,
flat vector illustration style, friendly characters and simple objects, limited warm palette of blue, orange and green on cream background, clean shapes, no outlines or thin consistent outlines, soft flat shading, editorial infographic look,
color palette of royal blue, warm orange and fresh green,
clear subject with a few supporting elements,
high quality, sharp details, professional presentation design
```

注意第二条是工具自动追加的 cutout 段，deck.json 里只写第一条的主体。

质量词里不写 `4k`：它含数字，也可能被画出来。

## 代码同步

| 规则 | 文档 | 代码 |
|---|---|---|
| 背景复杂度修饰（含 rich / ornate 模板与负向词） | 本文「复杂度修饰」 | `src/images/prompt.ts` 的 `BACKGROUND_MODIFIER`、`RICH_BACKGROUND`、`ORNATE_BACKGROUND`、`ORNATE_NEGATIVE` |
| 正向禁用内容 | 本文「正向提示词的禁用内容」 | `src/images/prompt.ts` 的 `lintSubject`（kit 用 `lintKit`）、`NEGATIVE`、`NO_TEXT` |
| 装饰件提示词（整版 / 单件、网格、底色、件数） | 本文「装饰件整版图提示词」 | `src/images/prompt.ts` 的 `decorationSheetPrompt`、`decorationPiecePrompt`、`DECOR_DETAIL` |
| 装饰件生成模式与 kit 级 styleAnchor | 本文、[complexity.md](complexity.md)、[deck-format.md](deck-format.md#decorations) | `src/images/decorations.ts` 的 `generateDecorations`（`mode`、`kit.styleAnchor`）、`src/images/raster.ts` 的 `cutSheet` / `cutDecoration` |
| 装饰件摆位（外接框、等比缩进、贴角） | [deck-format.md](deck-format.md#decor-装饰件) | `src/build/decor.ts` 的 `decorPlacement`、`src/build/assemble.ts` 的 `decor` 分支 |

代码里改了模板或 lint，必须同步改本文；两边用同一串英文，不要各写一版。
