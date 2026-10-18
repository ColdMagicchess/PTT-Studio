# deck：deck.json 类型与校验

| 文件 | 作用 |
|---|---|
| `types.ts` | deck.json 的 TypeScript 类型，与 `assets/pptx-studio/deck.schema.json` 保持一致 |
| `validate.ts` | `validateDeck(value)`：先过 JSON Schema（ajv，2020-12，strict），再查交叉引用 |

## 校验内容

1. **Schema**：字段、枚举、坐标范围，以及按复杂度的条件约束（`rich` 必须有 `motifs`，`ornate` 的三层 motifs 都必填）。
2. **交叉引用**：资源 id 和页面 id 不能重复；背景和图片引用的资源必须存在；元素框不能超出页面；图表每个系列的数值个数要等于类别数；表格每行的单元格数要等于列数，`colWidths` 要和列数一致；用了 `highlight` 色就必须定义 `theme.highlight`。

所有问题收集后一起抛出 `DeckValidationError`（只列前 20 条），工具会把它作为错误结果返回给模型。

## 修改指引

- 加字段：同时改 `types.ts` 和 `deck.schema.json`，再更新 `references/deck-format.md`，并用 `examples/` 跑一次校验。
- schema 文件通过 `paths.ts` 定位，不要写死相对路径。
