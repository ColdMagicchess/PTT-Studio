# 提示词与规范模块

本目录是插件注册给 DSH 的 `pptx-studio` skill。它告诉对话模型怎样一步步做出一套设计型 PPT，并定义模型写给组装工具的 deck.json 格式。插件代码通过 `ctx.skills.registerProvider` 注册本目录（`resourceBase` 指向本目录），模型按需读取 `references/` 下的文件。

## 文件

| 文件 | 作用 | 谁读 |
|---|---|---|
| `SKILL.md` | 主流程：8 个步骤、两个用户确认点、"直接做"时的处理、生成前自检（10 条常见返工）、修改已有 PPT | 对话模型（skill 正文） |
| `references/intake.md` | 需求收集：先提取再提问；风格、复杂程度、文字量缺任何一项就在一次 `ask_user_question` 中问齐；附完整调用示例与推荐规则 | 对话模型 |
| `references/styles.md` | 11 套风格（含 swiss-modern 瑞士国际主义）：配色 7 角色、字体、装饰语言、styleAnchor；highlight 点睛色；主题纹样 motifs；品牌色替换规则；用户描述到风格的映射 | 对话模型 |
| `references/complexity.md` | 复杂程度五档定义与数量表；版面要满（内容覆盖率下限 `fill`）；字多图少 / 字少图多的配比；补满手法；画面三层与装饰件组怎么定（`sheet` / `single` 模式与每组件数）；背景质感 motifs 的写法 | 对话模型；修饰词同时用于生图 |
| `references/text-density.md` | 文字量三档：字数、条数、字号与最小字号、行距 | 对话模型；`pptx_build` 的字号表来源 |
| `references/layouts.md` | 17 种版式的百分比坐标、安全区、text-safe 与装饰件摆位区、插图写法（cutout、放大、不套卡）、装饰件摆位、饰板（华丽档）、版式选择规则 | 对话模型；`pptx_check` 的安全区来源 |
| `references/image-prompts.md` | 画面三层与背景禁令、背景与插画的 6 段提示词、插画 `cutout` 去底、负向词与正向禁用内容、复杂度修饰（rich/ornate 模板）、装饰件整版图 / 单件提示词（含 `single` 模式）、kit 级 styleAnchor、构图写法、尺寸、风格一致性（不传参考图）、示例 | 对话模型；`pptx_generate_assets` 的拼接规则 |
| `references/deck-format.md` | brief.json 与 deck.json 的字段说明（人读），含 `decorations` 装饰件组与 `decor` 元素 | 对话模型 |
| `references/quality-checklist.md` | 内容、版面、视觉三类检查项与修正优先级 | 对话模型；`pptx_check` 的检查项来源 |
| `deck.schema.json` | deck.json 的 JSON Schema（2020-12），含按复杂度的条件约束 | `pptx_build` 校验 |
| `examples/aurora-launch.*.json` | 8 页完整示例（tech-dark、rich、light，黑底装饰件组、`il-chip` 为 cutout black），通过 schema 校验 | 对话模型参考；回归测试 |
| `examples/mid-autumn-ornate.deck.json` | 6 页华丽档示例（chinese-ink、ornate、light，3 个 sheet kit + 1 个 `single` kit，`il-mooncake` 为 cutout white，每页 7–10 个 decor 件），通过 schema 校验 | 对话模型参考；回归测试 |

## 设计方案

### 风格库补充：swiss-modern

瑞士国际主义：白底黑字 + 单一信号红（`#E2231A`），Arial/Helvetica，严格网格、细规则线、红色小方块、黑白建筑摄影；不用圆角、阴影、渐变和生成装饰件。复杂度建议 `simple` 或 `minimal`，靠网格与摄影撑满版面；真实建筑照片转黑白即可（Pixabay 等免费商用素材，注明来源）。

### 三项设计参数互相独立

- **风格**决定"用什么"：配色、字体、装饰语言、styleAnchor。
- **复杂程度**决定"多少、多满、多细"：五档 `minimal` 极简、`simple` 简约、`balanced` 均衡、`rich` 复杂、`ornate` 华丽。任何风格都能配任何档位。
- **文字量**决定"多少字、多大字"：三档 `light`、`medium`、`dense`。

复杂程度的定义与风格无关。复杂和华丽两档的背景质感由对话模型从风格和主题推导出 `theme.motifs`（`background` 密铺底纹、`midground` 中景纹理，`foreground` 只用来推导装饰件 subject），再填进固定的复杂度修饰模板；具体装饰件由 `decorations` 的 kit 与每页 `decor` 元素决定。新增风格不需要改复杂度定义。

### 华丽档的判定标准

依据用户给的两张参考图（国潮鎏金插画、华丽中国风 PPT）抽象出的通用特征：装饰件多而精（角花、边饰、分隔纹、散点，每页 6–16 件，同一件镜像复用）；背景是同色系满版底纹、中间低对比；每件装饰有描边、镂空、纹理等细节；内容覆盖率 ≥ 60%（装饰之外内容也铺满）；文字放在饰板上；一处高对比点睛色。

### 画面三层与装饰件

画面分三层：

1. **背景图**：图片模型只画底色、质感、光、氛围和场景主体，不画具体装饰件；
2. **装饰件**：图片模型按装饰件组（kit）生成——默认 `sheet` 模式是一张整版图，去底后按连通区切件再按阅读顺序配回件 id；摆位敏感或件多的用 `single` 模式逐件生成；主模型在 deck.json 里用 `decorations` 定义件、用 `decor` 元素摆位；
3. **内容**：文字、饰板、卡片、图表、表格、图标、配图，由组装工具原生绘制。

旧链路把装饰写进背景提示词，位置和数量都不可控，也没法逐页调整；新链路每页的件数、位置、大小、镜像都由 deck.json 决定，背景只负责质感。kit 的提示词（模式、件数、网格、白/黑底、逐件 subject、kit 级 styleAnchor）见 [references/image-prompts.md](references/image-prompts.md#装饰件整版图提示词)，摆位规则见 [references/layouts.md](references/layouts.md#装饰件摆位)。

装饰件生成**不传插图风格参考图**：实测 image-to-image 会把风格板里的人物、机器人抄进每一件，也会让背景图照抄人物；一致性改由 styleAnchor（kit 可覆盖主题 anchor）+ 配色 + sheet 模式的同图并置保证。`pptx_check` 会按 [references/complexity.md](references/complexity.md) 的件数表检查每页装饰件数量，并报告盖住文字的装饰。

### 真实素材优先

名画、文物、地标、产品、名人等**已有明确对象**的内容，不要用 AI 臆造。流程：先搜索可用的公有领域/授权原图并记录来源与许可 → 裁成需要的局部 → 放 deck 目录 `assets/` → 用 `image.path` 引用（无需 `prompt`）。AI 只补没有现成素材的插画、背景、装饰件。真实画作放在饰板里时可用软边/笔刷边蒙版，避免硬矩形贴纸感；主体必须完整。示例：清明上河图导览直接裁用原作扫描图的郊野/汴河/街市/城门四段。

### 投影可读性

- 压在纹样或图片上的文字，其面板/卡片不透明度不低于 0.95；正文不小于 16–17pt，内容页标题 36–44pt。
- 并排三列/多卡片间距至少 3%，宁可加大卡片也不要缩小字号。
- 细字不要直接压在暗纹上；对比度问题优先改底色/面板，而不是加粗字。

### deck.json 是唯一依据

图片提示词由 deck.json 拼出，组装和检查也只读 deck.json。对话模型不写组装代码，只改 deck.json。坐标一律使用页面百分比。

### 图片提示词拼接

`[主体] , [构图与留白] , [styleAnchor] , [配色] , [复杂度修饰] , [质量词]`

deck.json 的 `assets[].prompt` 只写前两段，其余段由工具按 theme 与 design 自动拼接。

装饰件另有两套提示词：`decorationSheetPrompt`（`sheet` 模式）按件数排网格（2x2 / 3x2 / 3x3 / 4x3），强调每件独立、一个短语只对应一件、不许加件、不许有人物场景、写明白底或黑底；`decorationPiecePrompt`（`single` 模式）一件一张，主体居中、四周留白、不许人物场景。两者都接 styleAnchor（kit 可覆盖）、配色、单件精细度、质量词与无文字后缀。背景提示词里不再出现任何装饰件。

## 实测记录

**新链路已有两份逐页验收过的成片（2026-10-18）：**

### 装饰件生成实测（2026-10-18）

| 发现 | 处理 |
|---|---|
| sheet 模式请求 6 件时模型画了 8–9 件：把 "A with B" 拆成两件、从参考图抄来人物，读序映射会把件名对错 | 新增 `mode: "single"` 逐件生成（`decorationPiecePrompt`）；sheet 一次 4 件（2x2）最稳，更多件加组或改 single |
| 用插图风格板做参考图时，板里的人物/机器人被抄进每一件装饰件，背景图也会照抄参考图里的人物 | 装饰件生成不传风格参考图；kit 可写 `styleAnchor` 覆盖主题 anchor；背景不要拿带人物的风格板当参考，另起一次不带参考图的调用 |
| sheet 一次 4 件（2x2）最稳；6 件以上多画/漏画常见 | complexity.md 的每组件数改为 sheet 4 件一组，rich 2–3 组、ornate 3–4 组并建议 single |

**这些是生成阶段的实测结论。体积实测（imageMaxPx 800 + 媒体去重）：**

| 成片 | 页数 | 体积 | 组装结果 | 落点 |
|---|---|---|---|---|
| 编程夏令营（flat-illustration / rich）：3 背景 + 6 张 cutout 插画 + 10 件装饰件 | 7 | 2.9 MB | 0 error / 13 warning | 仓库根 `青少年编程夏令营招生说明-满版.pptx` |
| 清明上河图导览（chinese-ink / ornate）：**真实原作扫描图裁段** + 3 张底纹 + 12 件水墨装饰件 | 7 | 3.7 MB | 0 error / 10 warning | 仓库根 `清明上河图导览.pptx` |

不做媒体去重时这两份分别是 4.7 / 8.4 MB；`imageMaxPx` 1200 且不去重时夏令营约 5.4 MB。

### 魔搭 Qwen-Image（2026-10-17）

| 发现 | 处理 |
|---|---|
| 正向提示词里的 hex 色值、百分比被画成文字；"AI" 缩写被画在主视觉上 | 正向提示词禁用 hex、数字、缩写、text 类词；工具提交前检查 |
| 只靠 styleAnchor，同套背景的装饰边框风格偏离 | 风格板选定后，所有图片带风格参考图生成（Qwen-Image-Edit-2509） |
| 插画底色与背景差几个色阶，深色底上露出方框 | 背景图上的插画四周 18% 羽化 |
| 同时提交 4 张时 2 张返回 429 | 每次最多同时提交 2 张，429 时按递增间隔重试 |
| 一张 60–110 秒；带参考图约 150 秒 | 素材生成作为后台任务 |
| 通用华丽档修饰（科技风）产出三层装饰，但远景小纹样偏稀、前景偏大块 | 待接入 Agnes 后复测；可在 motifs 中写更细的远景纹样 |

样张在 `../../.samples/`。

### Agnes AI（2026-10-18，主力后端）

- **国内站**：`POST https://api.agnes-ai.cn/v1/images/generations`，Bearer 认证。国际站 `apihub.agnes-ai.com` 不认国内站的 Key（返回 401）。
- 模型 `agnes-image-2.5-flash`；`size` 取 `1K`/`2K`/`3K`/`4K` 配合 `ratio`（`16:9`、`3:4`、`4:3`、`1:1` 等）；16:9 2K 输出 2624×1472。
- 文生图取 Base64：顶层 `return_base64: true`，结果在 `data[0].b64_json`。图生图参考图放 `extra_body.image`（data URI 或 URL），配合 `extra_body.response_format: "b64_json"`。没有 negative_prompt 字段，禁止项写在正向提示词末尾。
- 同步返回，2K 一张 13–24 秒；3 张并发未限流。当前全部免费。
- 返回的图片可能是 JPEG（即使请求的是 PNG），保存时按文件头判断格式。
- 本机 Node 需强制 IPv4（`family: 4`），否则连接超时。

**同一通用华丽档模板（未做风格专项）在 Agnes 上的效果**：

| 风格 | 样图 | 评价 |
|---|---|---|
| tech-dark | `.samples/agnes-ornate-tech.jpg` | 三层齐全：角落晶体、多层圆环框饰、整页散布小点，中间圆窗可放标题 |
| chinese-ink | `.samples/agnes/ornate-ink.png` | 屏风、圆窗格、梅枝、山水、祥云、印章，满铺且细节密，最接近用户参考图 |
| business-minimal | `.samples/agnes/ornate-biz.png` | 线框几何、六边形网格、折纸飘带；装饰多但整体偏素，符合商务风的克制 |
| fresh-gradient | `.samples/agnes/ornate-fresh.png` | 花枝、泡泡、爱心、圆拱框饰，满铺且有珠光细节 |

结论：Agnes 对"高信息密度"提示词的响应明显好于魔搭 Qwen-Image，华丽档以 Agnes 为默认后端。注意 chinese-ink 样图的角落出现了小印章，印章内有类似文字的笔画；印章属于风格装饰，可以接受，但要在质检中留意。

### 华丽档通用模板调优（2026-10-18，魔搭 Qwen-Image，seed 20261017）

目标：任何风格加 ornate 都接近用户参考图的密度。测试风格 tech-dark、chinese-ink、business-minimal，motifs 按 complexity.md 自拟；全部提示词与样图在 `.samples/ornate-tuning/`（`prompts.jsonl` 逐张记录，`metrics.py` 做像素统计）。统计口径："空白"指 16px 块内亮度标准差低于 6 的块占比；参考图（国潮鎏金）为 13.7%。

| 轮次 | 改了什么 | 效果 | 样图 |
|---|---|---|---|
| 基线 | 原 ornate 模板 | 科技风空白 48.9%，远景小点只在两侧、前景几大块晶体 | `.samples/ornate-tech-cover.png` |
| 第一轮 | 改为 maximalist、edge to edge、all-over pattern、前景 dense overlapping clusters | 水墨出现整页云纹底（空白 31%）；科技风反而更空（61%），只有中央圆环和两侧晶体；商务风两侧折纸飘带加镂空角花，中间纯白 | `r1-tech.png` `r1-ink.png` `r1-biz.png` |
| 第二轮 | 加 wallpaper pattern、narrow calm vertical area、gaps 里撒小饰物 | 三种风格都出现竖条框，底纹变清楚，但仍是两侧装饰、中间一大片空；科技风 54%，商务 48% | `r2-*.png` |
| 第三轮（只测科技） | 改写负向词（plain empty background 等）；试"garland 环绕四边"、"压过风格克制"等写法 | 环绕写法产出细边框加大面积空黑底，空白升到 60–66%，属于退步 | `r3-tech.png` `r3b-tech.png` `r3c-tech.png` |
| 第四轮 | 底色写成 "patterned surface like brocade / damask wallpaper"，前景写 "many small finely drawn parts rather than heavy solid blocks"，开头加 "even where this style is usually clean or minimal" | 商务风出现满版菱格底纹、蕾丝饰框、宝石与飘带；水墨（brocade 版）整页云纹锦地、空白 6%，但底色被染成高饱和黄 | `r4-tech.png` `r4-biz.png` `final-ink.png` |
| 定稿 | 底纹改为 "tone-on-tone ... close to the base background color" 防止染色；中间写 "with no scenery or objects inside it"；负向词加 oversaturated；前景 motifs 改为可拆成小件的短语 | 科技风：圆窗饰框、两侧晶枝、电路底纹、琥珀点睛；商务风：菱格底、蕾丝框、四角宝石簇与飘带，空白 35% | `final-tech.png` `final-biz.png` |
| 同模板换 Agnes | 定稿模板原样提交 agnes-image-2.5-flash 2K | 整页暗纹底，两侧大圆环镂空框，四角和边缘是密集晶枝，琥珀点睛，中间留出干净饰板区；最接近参考图 | `final-tech-agnes.jpg` |

结论：

- 当时这份定稿模板已写入 image-prompts.md 的 ornate 段（含追加负向词与写法说明），complexity.md 的华丽档定义同步；它是旧链路的最终版，现在 image-prompts.md 的 ornate 段已换成新链路模板。模板不含任何风格专项内容。
- 起作用的写法有三条：底纹写成"同色系的锦缎或墙纸"，而不是"均匀散布"；前景写成"多而细的小件"，而不是"lush"；开头用一句话压过 styleAnchor 里的 clean、negative space。不起作用的是"环绕四边的花环"，它让模型画出一圈细边框，中间全空。
- 魔搭 Qwen-Image 的上限：暗色风格的空白仍在 55–60%（大面积纯黑底被统计为空白，肉眼可见底纹偏暗），浅色风格约 35%，只有自带纹样传统的国风能到 15% 以下。Agnes 用同一模板时暗色风格的空白约 33%，四角细节密度明显更高，华丽档应以 Agnes 为默认后端。
- 同一 seed 下 Qwen-Image 对构图有强惯性（反复画中央圆环或竖条框），可以直接当饰板位置用。
- 这批定稿模板是旧链路（把装饰画进背景）的最后一代；新链路的 ornate 背景模板已改为「只有同色系底纹、不画任何独立装饰件」的版本（见 image-prompts.md），上面的样张只用于对比后端细节密度，不再代表目标画面。

### Agnes AI 复核（2026-10-18）

用户 Key 在 `apihub.agnes-ai.com` 和 `apihub.agnes-ai.cn` 上都返回 `401 Invalid token`；在国内站 `api.agnes-ai.cn` 上返回 200（1K 文生图约 13 秒）。与上文"国内站 Key 不被国际站识别"的结论一致。

## 代码同步

本目录的规则有一部分在代码里也有一份，改动时两边必须一致：

| 规则 | 文档 | 代码 |
|---|---|---|
| 背景复杂度修饰（含 rich / ornate 模板与负向词） | `references/image-prompts.md` | `src/images/prompt.ts` 中的 `BACKGROUND_MODIFIER`、`RICH_BACKGROUND`、`ORNATE_BACKGROUND`、`ORNATE_NEGATIVE`、`ILLUSTRATION_MODIFIER` |
| 正向提示词禁用内容与 kit lint | `references/image-prompts.md` | `src/images/prompt.ts` 中的 `lintSubject`、`lintKit` |
| 装饰件提示词（sheet 整版 / single 单件）与单件精细度 | `references/image-prompts.md` | `src/images/prompt.ts` 中的 `decorationSheetPrompt`、`decorationPiecePrompt`、`DECOR_DETAIL` |
| 装饰件生成模式 `sheet` / `single` 与 kit 级 `styleAnchor` | `references/image-prompts.md`、`references/complexity.md`、`references/deck-format.md` | `src/images/decorations.ts` 中的 `generateDecorations`（`kit.mode`、`kit.styleAnchor`） |
| 插画去底（`cutout`） | `references/deck-format.md`、`references/image-prompts.md`、`references/layouts.md` | `assets[].cutout`；`src/images/raster.ts` 的 `cutoutImage`、`keyWhite(img, 60, 110, 0.95)`（只去掉与图片边缘连通的背景，保留主体内部白色）/ `keyBlack`；`src/images/generate.ts` 的 cutout 分支；`src/images/prompt.ts` 的 `assetPrompt` |
| 装饰件的生成、去底、切件与缓存 | `references/deck-format.md`、`references/image-prompts.md` | `src/images/decorations.ts` 中的 `generateDecorations`、`src/images/raster.ts` 中的 `keyWhite`、`keyBlack`、`cutSheet`、`cutDecoration` |
| 装饰件摆位（外接框按物理比例等比缩放、贴角、镜像） | `references/layouts.md`、`references/deck-format.md` | `src/build/decor.ts` 中的 `decorPlacement`（`SLIDE_ASPECT` / `H_IN_W`，不会把件压扁）、`src/build/assemble.ts` 的 `decor` 分支 |
| 每页装饰件数量与压字 | `references/complexity.md`、`references/quality-checklist.md` | `src/check/geometry.ts` 中的 `DECOR_PER_SLIDE` 与 `decor` 检查 |
| 内容覆盖率下限与 `fill` 检查（版面要满） | `references/complexity.md`、`references/layouts.md`、`references/quality-checklist.md` | `src/check/geometry.ts` 中的 `FILL_MIN`、`contentCoverage`、`fill` 检查（`FILL_SKIP` 跳过封面/章节/结尾/引言/全图页） |
| 图片体积与最长边像素 | `src/build/README.md` | `src/config.ts` 的 `imageMaxPx`（默认 800）、`backgroundMaxPx`、`imagePpi`；`src/build/README.md` |
| 媒体去重（同一张图多页只嵌一次） | —（构建内部行为） | `src/build/assemble.ts` 的 `dedupeMedia`（字节哈希合并 `ppt/media` 并改写 slide rels） |
| 投影可读性与并排间距 | `references/layouts.md`、`references/quality-checklist.md`、`SKILL.md` | 无代码映射（写作规范；`panel` 的 `opacity` 由 deck.json 控制） |
| 文字量字号与上限 | `references/text-density.md` | `src/build/typography.ts`、`src/check/geometry.ts` 中的 `DENSITY` |
| 安全区与页码位置 | `references/layouts.md` | `src/check/geometry.ts` 中的 `SAFE`、`src/build/assemble.ts` 中的 `PAGE_NUMBER_BOX` |
| 图标名称 | `references/deck-format.md` | `src/build/icons.ts` |
| deck 字段（含 `assets.cutout`、`decorations` 的 `mode` / `styleAnchor` 与 `decor`） | `references/deck-format.md` | `deck.schema.json`、`src/deck/types.ts` |

`tests/prompt.spec.ts` 会检查华丽档背景提示词包含关键句、示例 deck 拼出的提示词里没有 hex 和数字；`tests/decor-*.spec.ts` 覆盖抠图/切件、装饰提示词、kit lint、decor 摆位；`tests/geometry-fill.spec.ts` 覆盖 `contentCoverage`/`fill`；`tests/cutout.spec.ts` 覆盖 `assetPrompt` 的 cutout 分支、schema 校验和「内部白色不被抠掉」；两个示例 deck 同时是 schema 与 subject lint 的回归基准。全量 10 文件 121 个测试。

## 修改指引

- 加风格：只改 `styles.md`，按已有格式补配色、字体、装饰、styleAnchor，并在映射表里加一行。
- 调某档复杂度：改 `complexity.md` 的定义与数量表，以及 `image-prompts.md` 的复杂度修饰表，两处要一致。
- 加版式：改 `layouts.md`，同时把 id 加进 `deck.schema.json` 的 `layout` 枚举。
- 加元素类型或字段：改 `deck-format.md` 与 `deck.schema.json`，再用示例跑一次校验。
- 改可读性/间距/真实素材规则：`references/layouts.md`、`references/quality-checklist.md`、`SKILL.md` 三处一起改（无代码常量与它们对应，靠写作约束）。
- 改装饰件规则：`references/complexity.md` 的件数表与模式建议、`references/layouts.md` 的摆位、`references/image-prompts.md` 的整版图 / 单件提示词三处一起改，示例 deck 里的 `decorations`（含 `mode` / `styleAnchor`）与 `decor` 跟着改。
- 改了任何字段名，都要同步 `examples/`，并检查 `SKILL.md` 中的引用。
