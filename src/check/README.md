# check：几何与对比度检查

`checkDeck(deck, fits, missingAssets, unknownIcons, sampler?)` 返回问题列表，每条带 slide、element、check、severity、message。这些检查不需要渲染器，`pptx_build` 和 `pptx_check` 都会运行。

| 检查项 | 严重级别 | 规则 |
|---|---|---|
| overflow | error | 文字缩到最小字号仍放不下 |
| shrunk | warning | 文字被缩小（报告原字号和实际字号） |
| overlap | error | 两个内容元素重叠超过较小者面积的 5%（形状、饰板、装饰图片不参与） |
| safe-area | warning | 内容元素超出安全区（x 6–94，y 8–98）；全幅图片不受限 |
| density | warning | 超过所选文字量档位的标题字数、要点条数、单条字数、每页正文总量 |
| contrast | error/warning | 文字与它的底色对比度：正文 ≥ 4.5:1，大标题 ≥ 3:1。底色取文字下方的饰板或形状，没有就取页面底色；在图片背景上时，对文字框区域实际采样，取最差 10% 像素的对比度 |
| contrast（装饰穿过） | warning | 图片背景上的文字框里，与区域中位色差异很大的像素占比：标题类超过 20%、正文超过 6% 时报告。左侧起笔条带单独计分（按一半权重计入），因为从页边伸进来的装饰最先压到首字 |
| panel | warning | 华丽档在图片背景上的文字没有饰板 |
| missing-asset / unknown-icon | error | 引用的图片没有文件，或图标名不在内置库里 |

文字字数统计口径与 `references/text-density.md` 一致：中文 1 字算 1，英文 1 个词算 2。
