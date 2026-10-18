# 模型设置设计（阶段 5）

用户需求：插件有三类模型——文字模型、图片模型、视觉模型。文字模型和视觉模型默认跟随**当前对话的模型**；图片模型默认使用 Agnes。用户也可以添加自定义 OpenAI 兼容模型，填写 URL、Key 和模型名。Key 只进 DSH 凭据库。

## 状态

- ✅ Host 配置字段（`src/config.ts`）
- ✅ 插件设置页（`src/client/index.ts`，构建为 `lib/client.js`）
- ✅ Key 输入框（通过 `ctx.remote.credentials.set` 写入凭据库）
- ⏳ 非 session 模型的调用工具：文字模型的自动大纲、视觉模型的逐页评审留到阶段 6（`pptx_outline` / `pptx_review`）。当前默认 session，不改变既有行为。

## Host 配置（扁平字段，便于设置表单读写）

```ts
textModelMode: 'session' | 'route' | 'custom'   // 默认 session
textModelName: string                            // route 写 provider/model，custom 写自定义模型 name
visionModelMode: 'session' | 'route' | 'custom' // 默认 session
visionModelName: string
customModelsJson: string                         // JSON 数组，默认 '[]'
customModelApiKeyRef: string                     // 默认 CUSTOM_API_KEY
imageBackend: string                             // 已有；默认 agnes
```

自定义模型项：`{ name, baseUrl, model, apiKeyRef, api: "openai-chat" }`。设置页保存时校验 JSON 数组与必填字段；Host 侧只在后续调用时解析，配置错误不会让插件加载失败。

## 设置页

Slot：`plugins.bundle.config`，bundle key 为 `dsh-pptx-studio` / `@deepseek-ai/dsh-pptx-studio`，config entry id 为 `pptx-studio`。

分区：

1. **文字模型**：来源（session/route/custom）+ 路线或名称。
2. **视觉模型**：同上。
3. **图片模型**：当前后端名（默认 agnes）。
4. **自定义模型**：JSON 数组文本框 + 自定义模型凭据名。
5. **API Key**：Agnes / ModelScope / 自定义模型三个密码框；空白表示不修改，填入后调用 `remote.credentials.set(ref, value)`，页面只显示「已配置/未配置」。

设置页用 `SettingsFormModel` 暂存与保存；JSON 字段有自定义 parse（非法 JSON 或缺少 name/baseUrl/model/apiKeyRef 时阻止保存）。

**关键约束：Config 里要出现在设置页的字段必须 `.volatile()`。** `settings.volatileForm()` 只把 volatile 字段组成可服务表单；没有 volatile 字段的插件 entry 不会出现在 settings describe 里，`configForms.whileServed()` 永远不触发，`plugins.bundle.config` slot 也就不注册（页面看不到任何设置区）。volatile 字段的运行时值可能是 `{ get() }` 包装，消费时用 `readLive()` 解包。

## 构建

- 浏览器入口：`src/client/index.ts`，无 JSX，`React.createElement` 由 loader 提供。
- `tsdown.client.config.ts`：CJS 输出，外层包成 `window.__ModuleLoader__.load({ id, factory(require) { ... } })`；`react` 与 `@deepseek-ai/dsh-client-ui-primitives` 为 external，其余打进 bundle。
- `package.json`：`exports["./client"]`、`files` 含 `lib/client.js`、`dsh.client.inject` 含 locale / ui-settings / ui-plugin-manager / api-remotes。
- 根 `tsconfig.json` 的 include 会把 `src/client` 一起类型检查；react/primitives 类型由 `src/client/shims.d.ts` 声明。

## 风险

- `configForms`、`plugins.bundle.config`、`remote.credentials` 都是 pre-stable API，升级 0.3 前要重新核对。
- 外部插件不能新增 typert Remote，所以设置页不能调用插件自定义的 Host 方法；只使用配置表单和凭据库。
- 设置页里修改自定义模型 JSON 只保存文本；真正调用时的错误（URL 不通、模型名错）会在阶段 6 的工具结果里报告。
