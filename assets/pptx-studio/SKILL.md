---
name: pptx-studio
description: Design and build a new, visually designed PowerPoint deck (.pptx) from a topic or document — collects style, visual complexity and text density, plans every slide's layout, generates a consistent image set, then assembles editable slides. Use for "make a PPT / slides / presentation about …". To edit an existing .pptx, use office-pptx instead.
---

# PPT Studio：设计型演示文稿生成

本 skill 生成**全新的、经过设计的**演示文稿。编辑用户已有的 .pptx 时改用 `office-pptx`，不要使用本流程。

整个流程由你（当前对话模型）主导：你负责理解需求、写出逐页设计稿 `deck.json`、编写配图提示词并检查结果。图片由图片模型生成；版面由 `pptx_build` 工具按 `deck.json` 确定性组装。你不手写 python-pptx 或 pptxgenjs 代码。

所有工作文件放在任务工作区的 `.pptx-studio/<deck-id>/` 下：`brief.json`、`deck.json`、`assets/`、`builds/`。最终交付的 .pptx 放在用户指定位置，默认是工作区根目录。

## 流程总览

| 步骤 | 产出 | 用户确认 |
|---|---|---|
| 1. 需求收集 | brief.json | 缺少风格、复杂度或文字量时**必须询问** |
| 2. 内容大纲 | 每页标题与要点 | 默认请用户确认，用户可要求跳过 |
| 3. 逐页设计稿 | deck.json | 不单独确认 |
| 4. 风格板 | 2–3 张风格样张 | 默认请用户选择，用户可要求跳过 |
| 5. 生成背景与装饰件 | assets/、decor/ | — |
| 6. 组装 | builds/deck.vN.pptx | — |
| 7. 检查与修正 | 检查报告、渲染图 | — |
| 8. 交付 | present | — |

用户说"直接做""不用问我""你决定"时，跳过第 2、4 步的确认，并在最终回复里说明你替用户做了哪些选择。第 1 步的三项设计参数在这种情况下也由你按主题选定，同样在最终回复中说明。

## 1. 需求收集

先读 [references/intake.md](references/intake.md)。

从用户消息和提供的材料里提取：主题、用途与场合、受众、页数、语言、品牌色或 logo、必须包含的内容。

三项**设计参数**决定整套 PPT 的面貌，用户没有明确给出时，必须用 `ask_user_question` 在**同一次调用**中询问：

1. **整体风格**：从 [references/styles.md](references/styles.md) 里挑 3–4 个最适合该主题的风格作为选项，把最推荐的放第一位并标 `(Recommended)`。
2. **复杂程度**：页面上组件、装饰、配图的多少，分极简、简约、均衡、复杂、华丽五档，见 [references/complexity.md](references/complexity.md)。
3. **文字量**：每页文字的多少，见 [references/text-density.md](references/text-density.md)。

页数未知时可以在同一次调用里一起问。其他缺失信息能合理推断的就推断，不要逐项追问。

把结果写入 `brief.json`，格式见 [references/deck-format.md](references/deck-format.md#brief)。

## 2. 内容大纲

按页列出：页码、版式类型、标题、核心信息（一句话）、要点。规则：

- 第 1 页为封面，最后一页为结尾页；超过 8 页时，按章节加章节页。
- 每页只讲一个核心信息；标题写成结论句（例："新架构把延迟降低 40%"），不要写成话题词（例："延迟"）。
- 内容的拆分要符合 brief 中的文字量等级。素材很多但文字量为"少"时，把细节写进演讲者备注，不要塞进页面。

把大纲以简洁的表格发给用户确认。用户提出修改就改，确认后进入下一步。

## 3. 逐页设计稿 deck.json

先读 [references/deck-format.md](references/deck-format.md) 和 [references/layouts.md](references/layouts.md)。

deck.json 是整套 PPT 唯一的依据：图片提示词由它生成，组装工具按它摆放。逐页写清：

- `layout`：从版式库里选。连续页不要用同一个版式，除非内容本身是同构的（例如三页产品介绍）。
- `visual`：用一段话描述画面：什么东西在什么位置、视觉重心在哪、装饰放哪。这是写给图片模型和你自己核对用的。
- `elements`：每个元素的类型、位置（百分比坐标）、内容与样式角色。坐标先取版式库给出的默认网格，再按内容微调。
- `notes`：演讲者备注。

有背景图的页面，文字框左右各离页边至少 8%（见 [layouts.md](references/layouts.md) 通用网格）；`pptx_build` 报告「background decorations cross」时，先把文字框往里收，再考虑加 `shape` 衬底。

主题色、字体、装饰件数量和字号必须遵守 brief 所选的风格、复杂度、文字量；具体数值查对应的参考文件，不要自行发挥。复杂度为华丽时，每组文字下方都要加饰板（`panel` 元素），封面与章节页的标题用竖条框或圆窗。

复杂度为复杂或华丽时，要同时写两处：顶层 `decorations`（装饰件组 kit 与每件的 subject/role，见 [deck-format.md](references/deck-format.md#decorations)），以及每页的 `decor` 元素（用哪件、放哪、多大、镜像/旋转，见 [layouts.md](references/layouts.md#装饰件摆位)）。摆位敏感的件（四角角花、贴边的边饰）用 `mode: "single"`，其余用默认的 `sheet`；扁平、插画类风格在 `theme.styleAnchor` 里有人物/场景词时，给 kit 写一个只描述装饰件画风的 `styleAnchor`。

插画默认写 `cutout: "white"`（深色发光风用 `"black"`），生成后是透明 PNG，直接放背景上，不要再用白色卡片包插画；标题统一左对齐、加粗放大，数字用特大号 + 小一号单位（见 [layouts.md](references/layouts.md#插图写法去底放大不套卡)）。

**素材优先级：真实素材 > AI 生成。** 名画、文物、地标、产品、真实人物这类**已有明确对象**的内容，先搜索并下载可用的公有领域/用户授权原图（记录来源与许可），放进 deck 目录 `assets/` 后用 `image.path` 直接引用；AI 只补缺失的插画、背景与装饰。不要把已知作品凭想象重画一遍（例：讲《清明上河图》就用原作扫描图分段，不要用 AI 仿画）。网络不通或找不到可用图时，再退回 AI 生成并在交付说明。

**硬要求：任何内容页都不许出现大块空白。** 无论复杂度，内容元素的覆盖率要达到该档下限（极简 25%、简约 35%、均衡 45%、复杂 55%、华丽 60%）。写完 deck 后用 `pptx_check` 看 `fill` 警告，低于阈值就加卡片、副标题、底部结论条或配图，而不是缩小字号硬撑。配比按「字多图少、字少图多」：文字多时用双栏、表格、卡片铺满；文字少时用大配图、大数字、大字号撑满（见 [complexity.md](references/complexity.md#字多图少字少图多)）。

### 生成前自检：常见返工清单

写完 deck.json、生成图片之前逐条过一遍（第 7 步交付前再核对一次）：

1. **不要大块空白/半页空**，要补满：`pptx_check` 的 `fill` 必须清零；用副标题、信息卡、结论条、数字标签、加大配图补；字多图少、字少图多。
2. **不要把插画套在白矩形里**，要用 `assets[].cutout`（生成时纯白/纯黑底、主体不碰边、无场景）；去底后直接放背景，别再加 white panel 包图。
3. **不要 Word 式硬框表格**：≤6 项改 2x3 图标卡；必须用表格时用轻量样式——细浅线、zebra、数字加粗、首列居中。
4. **不要把卡片/字号做小**：卡片铺到接近 x6–94 / y24–88；数字用特大号 + 小一号单位；标题加粗放大——内容页 36–44pt、封面 display 52–60pt。
5. **不要在底部放悬浮通栏大色块**：用轻量提示条/信息条，与上方内容留 2–3% 间距、宽度对齐内容区。
6. **不要版心不统一**：标题与正文统一左对齐（x 6–8），卡片顶部/间距对齐；只有刻意居中的版式才居中。
7. **不要让装饰压扁或压字**：`decor` 的 box 是百分比、图片按物理比例等比缩放；decor 写在文字前、与文字至少留 2%；右下角页码饰牌附近不放。
8. **不要把带人物的风格板当背景/装饰的参考图**：image-to-image 会照抄人物；背景与装饰只用 styleAnchor + 配色，插画才用风格板。
9. **不要忘记复杂度与饰板**：ornate 每页 6–16 件装饰且文字都在饰板上；rich 每页 3–8 件。
10. **不要忽略投影可读性**：压在纹样/图片上的文字，面板不透明度 ≥0.95；正文不小于 16–17pt，标题 36–44pt；三列/多卡片之间至少留 3% 间距；细字不要直接压在暗纹上。
11. **不要让真实素材像贴纸**：名画/文物扫描图放在饰板里时可用软边或笔刷边蒙版（不要硬矩形白框）；裁切边缘可以羽化，但主体必须完整。
12. **不要闭门造车**：已知对象（名画、文物、地标、名人、产品）先找真实素材——搜索、下载公有领域/授权图片，放 `assets/` 用 `path` 引用，并注明来源与许可；AI 只补没有现成素材的部分。

## 4. 风格板

先读 [references/image-prompts.md](references/image-prompts.md)。

用 `pptx_style_board` 按 deck.json 的 `theme.styleAnchor` 生成 2–3 张风格样张（一张封面构图的背景加主视觉），让用户选择。选中的样张锁定为插画的风格参考图；背景与装饰件不用它，见第 5 步。用户不满意时，按用户反馈修改 `styleAnchor` 后重新生成。

未配置图片模型时跳过本步和第 5 步，背景使用主题色的纯色或渐变，并告诉用户可以在插件设置里配置图片模型以获得配图。

## 5. 生成背景与装饰件

图片多（>3 张）时加 `run_in_background: true`：工具立刻返回 job id，你可以继续写后面的页，最后用 `job_output`（`wait: true`）收结果、`job_list` 看进度；前台调用会一直等到全部出完。

先生成背景与插画：调用 `pptx_generate_assets`，`only` 传 `assets` 里的 id。风格板里有明显人物、机器人或角色时，**不要**拿它作参考生成背景（参考图会把人原样抄进背景）；可以分两次调用：第一次 `only` 只传背景 id、不带 `style_reference`，用同一套 styleAnchor 生成背景；第二次 `only` 只传插画 id、带 `style_reference`。背景里不能有角的枝条、徽章、飘带、散点、道具这类独立装饰，只该有质感、光和场景主体；构图只描述纹理、氛围与留白。

再生成装饰件组：`only` 传 `decorations` 里的 kit id。每个 kit 按 `mode` 生成，文件写到 `decor/` 下并写回 `decorations[].files`：

- `sheet`（默认）：一组一张整版图，去底后切件。**先核对切件数量与请求是否一致、件名能否对上**——6 件以上实测常多画/漏画（"A with B" 被拆成两件、从参考图抄来人物），读序映射会把件名对错；sheet 一次 4 件（2x2）最稳。
- `single`：每件一张图，慢但件名一定对；四角角花、贴边边饰这类摆位敏感的件优先用。

两类都要看：边缘透明干净、没有白边或黑边、没有残底、没有被切坏、主体没有被裁；图里不能有人物、场景或多余的件。返回 `partial`（`missing` 列出缺件）时换 seed 重试，或减少件数 / 改用 `single`；返回 `rejected` 时按 lint 报告改 subject。装饰件生成不传风格参考图，风格一致性靠 styleAnchor（kit 可覆盖）+ 配色。

- 背景按版式类型复用，通常 3–5 张（封面、章节、内容、结尾），不要每页一张。
- 插画按元素单独生成，默认 `cutout` 去底（生成后工具自动去底裁边，不羽化）；检查边缘没有白边/黑边、主体没有被抠掉（白衬衫、机器人外壳、屏幕这类内部白色应保留），不合格就换 seed 重生成。旧 `onColor` 底色只在不能去底时用。
- 图标用插件自带的矢量图标库（`icon` 元素），不用图片模型生成。
- 图表、表格、卡片、色块、分隔线全部用原生元素，不用图片。

不合格的图只重新生成那一张（组）。

## 6. 组装

调用 `pptx_build`，传入 deck.json 路径。工具会：

- 校验 deck.json，报告缺失的素材和越界坐标；
- 按版本号输出 `builds/deck.vN.pptx`，旧版本保留；
- 自动适配文字：放不下时先缩小字号（不低于该角色的最小字号），再换行，仍放不下时报告溢出。

## 7. 检查与修正

先读 [references/quality-checklist.md](references/quality-checklist.md)。

`pptx_build` 的结果里已经包含几何检查（溢出、重叠、越界、文字量、对比度、背景图上的纹理穿过文字框、每页装饰件数量、内容覆盖率 `fill`）；只改了 deck.json 想先检查时用 `pptx_check`。

装饰件专项：边缘透明、没有白边或黑边；四角是同一件的镜像、方向一致；装饰不压文字、不压饰板；每页件数符合复杂度（见 [references/complexity.md](references/complexity.md)）。

版面填充专项：`fill` 警告要清零，不留超过 1/4 页的空白带；字多时图少、用双栏/表格/卡片铺满，字少时图多、用配图/大数字/大字号撑满；补内容而不是缩小字号。

交付前对照第 3 步末尾的「常见返工清单」逐条过一遍，`fill` 与 `decor` 警告都清零后再交付。

视觉检查优先用插件设置里配置的独立视觉模型：当 `visionModelMode` 为 `route` 或 `custom` 时，调用 `pptx_review`，它会渲染每一页并返回结构化的版式/字号/对比度/配图问题。默认 `session`（或没有配置独立视觉模型）时，用 `pptx_render` 渲染成片（先渲染封面、一张内容页和改动过的页，最后整体过一遍），再用 `read_image` 查看，按 [references/quality-checklist.md](references/quality-checklist.md) 的「视觉」项检查；当前模型不能看图时跳过，并在交付时说明视觉检查未做。

发现问题就修改 deck.json 后重新组装，最多 3 轮。超过 3 轮仍有问题时，把剩余问题如实告诉用户。

## 8. 交付

调用 `present` 交付最终的 .pptx；当前环境没有 `present` 时，在回复里给出文件的绝对路径。最终回复写清：

- 页数与结构概要；
- 所选风格、复杂度、文字量，以及哪些是你替用户做的决定；
- 生成了多少张图片，未通过检查的地方；
- 后续修改方式（例如"第 5 页换个配图"只需告诉你，只会重新生成那一张）。

## 修改已生成的 PPT

用户要求修改时，改 deck.json 中受影响的部分，只重新生成受影响的素材，再重新组装。不要从头重做整套 PPT。要换整体风格时，回到第 4 步。
