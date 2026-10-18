# 风格库

每个风格定义**配色、字体、装饰语言**和**风格锚点**（`styleAnchor`，生成每张图片时都会带上的固定英文描述）。把所选风格的这些值原样写进 deck.json 的 `theme`。用户提供了品牌色时，用品牌色替换 `primary`，并按"品牌色替换规则"调整其余颜色。

配色角色：

| 角色 | 用途 |
|---|---|
| `background` | 页面底色；没有背景图时直接用它 |
| `surface` | 卡片、容器的底色 |
| `primary` | 主色：标题强调、主要色块、图表第一系列 |
| `secondary` | 辅色：次要色块、图表第二系列 |
| `accent` | 点缀色：大数字、重点标记，每页只用在一两处 |
| `text` | 正文与标题 |
| `textMuted` | 注释、页码、次要说明 |

`highlight` 是可选的点睛色：在主色之外，每页最多一处小面积的高对比点缀，华丽档建议设置。

字体只使用 Windows 和 Office 自带的字体，保证在用户电脑上显示一致：中文用"微软雅黑""等线""宋体"，西文用 Arial、Segoe UI、Georgia。

---

## tech-dark 科技深色

适合：发布会、技术产品、AI、数据平台。

- 配色：background `#0B1020` · surface `#141B33` · primary `#3B82F6` · secondary `#22D3EE` · accent `#A78BFA` · text `#F1F5F9` · textMuted `#94A3B8`
- 字体：标题 微软雅黑 Bold / Segoe UI Semibold；正文 微软雅黑 / Segoe UI
- 装饰：细发光线条、网格透视地面、数据光点、半透明玻璃卡片（surface 70% 不透明）、圆角 12px
- styleAnchor：`futuristic technology aesthetic, deep navy-black background, glowing cyan and electric-blue light lines, subtle perspective grid, soft bokeh light particles, clean high-end product-launch look, cinematic lighting, smooth gradients, ultra clean, high detail`

## business-minimal 商务简约

适合：工作汇报、方案、咨询、金融。

- 配色：background `#FFFFFF` · surface `#F3F6FA` · primary `#1E3A8A` · secondary `#3B82F6` · accent `#F59E0B` · text `#1F2937` · textMuted `#6B7280`
- 字体：标题 微软雅黑 Bold / Arial Bold；正文 微软雅黑 / Arial
- 装饰：左侧或顶部的主色细条、细分隔线、小方块编号、直角或 4px 小圆角
- styleAnchor：`clean corporate minimalism, white and light-gray background, navy-blue accents, thin geometric lines, generous negative space, subtle soft shadows, professional and calm, flat design with gentle depth`

## swiss-modern 瑞士国际主义

适合：建筑、设计、商务提案、作品集、编辑式汇报、需要强网格与留白的场合。

- 配色：background `#FFFFFF` · surface `#F2F2EF` · primary `#111111` · secondary `#E2231A` · accent `#9A9A9A` · text `#111111` · textMuted `#6E6E6E`
- 字体：标题 Arial Bold；正文 微软雅黑；西文 Arial（有 Helvetica 时优先 Helvetica）
- 装饰：严格 12 栏网格、0.1–0.2% 页高的细规则线、红色小方块、编号栏目、黑白摄影、大面积均匀留白；不用圆角、不用阴影、不用渐变
- styleAnchor：`Swiss International Style editorial design, strict modular grid, Helvetica typography, generous white space, black and white architectural photography, a single signal-red accent, precise thin rules, flat and unadorned, high contrast`
- 复杂度建议：`simple` 或 `minimal`；版面靠网格与摄影撑满，不靠装饰件。真实素材优先（建筑照片转黑白），标题与正文统一左对齐。

---

## fresh-gradient 清新渐变

适合：互联网产品、营销、年轻用户、活动介绍。

- 配色：background `#F8FAFF` · surface `#FFFFFF` · primary `#6366F1` · secondary `#EC4899` · accent `#14B8A6` · text `#1E1B4B` · textMuted `#64748B`
- 字体：标题 微软雅黑 Bold / Segoe UI Semibold；正文 微软雅黑 / Segoe UI
- 装饰：大面积柔和渐变光斑、圆润的有机形状（blob）、胶囊形标签、圆角 20px
- styleAnchor：`soft pastel gradient aesthetic, dreamy blend of indigo, pink and teal, smooth organic blob shapes, airy and light, glossy subtle 3D, modern app-marketing look, clean and cheerful`

## flat-illustration 扁平插画

适合：教学、科普、培训、公益、儿童与大众传播。

- 配色：background `#FFF9F0` · surface `#FFFFFF` · primary `#2563EB` · secondary `#F97316` · accent `#10B981` · text `#1F2937` · textMuted `#6B7280`
- 字体：标题 微软雅黑 Bold；正文 微软雅黑
- 装饰：扁平场景插画、简单几何小元素（圆点、波浪线、星形）、圆角 16px
- styleAnchor：`flat vector illustration style, friendly characters and simple objects, limited warm palette of blue, orange and green on cream background, clean shapes, no outlines or thin consistent outlines, soft flat shading, editorial infographic look`

## chinese-ink 国风水墨

适合：文化、历史、传统节日、文旅、茶与非遗。

- 配色：background `#F5F0E6` · surface `#FBF8F1` · primary `#8B1E1E` · secondary `#2F4F4F` · accent `#C9A227` · text `#2B2B2B` · textMuted `#7A6F5F`
- 字体：标题 宋体 Bold；正文 微软雅黑；西文 Georgia
- 装饰：水墨山水晕染、印章红方块、竖排小标题、细回纹边框、留白
- styleAnchor：`traditional Chinese ink-wash painting aesthetic, rice-paper texture, soft black ink mountains and mist, vermilion seal accents, elegant negative space, muted earthy tones, refined oriental minimalism`

## academic-clean 学术严谨

适合：论文答辩、科研汇报、课题申报、学术报告。

- 配色：background `#FFFFFF` · surface `#F5F7FA` · primary `#0F4C81` · secondary `#5B8DB8` · accent `#C0392B` · text `#222222` · textMuted `#666666`
- 字体：标题 微软雅黑 Bold；正文 微软雅黑；西文 Arial
- 装饰：顶部细标题栏、编号章节标记、图表为主，几乎没有插画
- styleAnchor：`clean academic presentation style, white background, restrained deep-blue accents, precise thin lines, scientific diagram aesthetic, minimal and rigorous, high clarity`

## warm-natural 温暖自然

适合：生活方式、健康、食品、教育、品牌故事。

- 配色：background `#FAF6F0` · surface `#FFFFFF` · primary `#7C9A6B` · secondary `#D4A373` · accent `#E07A5F` · text `#3D3A35` · textMuted `#8A8278`
- 字体：标题 微软雅黑 Bold / Georgia；正文 微软雅黑
- 装饰：植物叶片剪影、纸张质感、手绘线条、圆角 16px
- styleAnchor：`warm natural lifestyle aesthetic, soft beige paper texture, sage green and terracotta tones, delicate botanical leaves, gentle daylight, organic hand-drawn accents, cozy and calm`

## bold-creative 大胆创意

适合：创意提案、品牌、设计作品集、年轻化营销。

- 配色：background `#111111` · surface `#1E1E1E` · primary `#FF3D57` · secondary `#FFD600` · accent `#00E5FF` · text `#FFFFFF` · textMuted `#A3A3A3`
- 字体：标题 微软雅黑 Bold（大字号、紧字距）；正文 微软雅黑
- 装饰：大面积撞色几何块、粗线条、斜切构图、超大数字
- styleAnchor：`bold graphic design poster aesthetic, high-contrast black background with vivid red, yellow and cyan color blocks, strong geometric shapes, dynamic diagonal composition, Swiss-style energy, punchy and modern`

## luxury-elegant 高端典雅

适合：高端品牌、地产、珠宝、年会、颁奖。

- 配色：background `#0F0F12` · surface `#1A1A20` · primary `#C8A96A` · secondary `#8C7A55` · accent `#E8D5A8` · text `#F5F1E8` · textMuted `#9A9384`
- 字体：标题 宋体 Bold / Georgia；正文 微软雅黑
- 装饰：金色细线框、大理石或丝绒质感、对称构图、细衬线
- styleAnchor：`luxury elegant aesthetic, deep charcoal-black background, champagne-gold fine line accents, subtle marble and velvet textures, symmetrical refined composition, soft spotlight, premium and timeless`

## gov-red 党政红

适合：党建、政务、主题教育、表彰。

- 配色：background `#FFFFFF` · surface `#FFF5F3` · primary `#C8161D` · secondary `#E0A526` · accent `#8B0000` · text `#2B2B2B` · textMuted `#6B6B6B`
- 字体：标题 微软雅黑 Bold / 宋体 Bold；正文 微软雅黑
- 装饰：红色飘带、金色光芒、天安门或长城剪影（仅封面）、红色标题条
- styleAnchor：`solemn official Chinese red theme, rich red and gold, flowing silk ribbons, radiant golden light rays, dignified and grand, clean white space for content, ceremonial and formal`

---

---

## 主题纹样 motifs

复杂度为 rich 或 ornate 时，从所选风格的「装饰」一栏和演示主题推导 `theme.motifs`（见 [complexity.md](complexity.md#装饰件组怎么定)）：`background` 写整版密铺的底纹，`midground` 写织进表面的中景纹理，`foreground` 写装饰件的词汇（用来推导 `decorations[].pieces[].subject`，不画进背景）。例如国风水墨配华丽：foreground `plum blossom branches and pine needles`，midground `circular lattice windows and cloud-pattern frames`，background `small auspicious clouds and ink dots`。复杂度为 simple 或 balanced 时 motifs 可省略。

## 品牌色替换规则

1. 把品牌色放到 `primary`。
2. `secondary` 取品牌色同色系中较浅或较深的一档，或者取品牌规范里的辅色。
3. `accent` 保留风格原值；与品牌色色相差小于 30° 时，换成品牌色的互补色。
4. 把 styleAnchor 中描述颜色的词换成品牌色的颜色名，例如 "navy-blue accents" 换成 "emerald-green accents"。
5. 检查 `text` 与 `background`、`text` 与 `surface` 的对比度不低于 4.5:1，大标题不低于 3:1。

## 用户描述的映射

| 用户的说法 | 风格 |
|---|---|
| 科技感、未来感、AI、赛博、发布会 | tech-dark |
| 商务、简约、专业、汇报、稳重 | business-minimal |
| 瑞士、国际主义、极简网格、Helvetica、建筑、编辑设计 | swiss-modern |
| 清新、年轻、活泼、渐变、互联网 | fresh-gradient |
| 插画、卡通、可爱、科普、教学 | flat-illustration |
| 国风、中国风、水墨、古风、传统 | chinese-ink |
| 学术、答辩、科研、严谨 | academic-clean |
| 自然、温馨、生活、健康、文艺 | warm-natural |
| 创意、大胆、潮流、设计感、撞色 | bold-creative |
| 高端、奢华、典雅、黑金 | luxury-elegant |
| 党建、政务、红色、庄重 | gov-red |

用户描述的风格不在库中时，参照最接近的风格写一套新的配色和 styleAnchor，并在 deck.json 里把 `theme.style` 写成 `custom`。
