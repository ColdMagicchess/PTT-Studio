# client：插件设置页

浏览器端的插件设置页，构建为 `lib/client.js`（`window.__ModuleLoader__.load` 闭包工厂），由 DSH Web 前端在插件详情页加载。

| 文件 | 作用 |
|---|---|
| `index.ts` | 设置页：文字/视觉/图片模型选择、自定义模型 JSON、Agnes/ModelScope/自定义模型 Key 输入 |
| `shims.d.ts` | `react` 与 `@deepseek-ai/dsh-client-ui-primitives` 的最小类型声明（构建时 external，运行时由 loader 提供） |

## 挂载方式

- Slot：`plugins.bundle.config`，bundle key 为 `dsh-pptx-studio` / `@deepseek-ai/dsh-pptx-studio`，config entry id 为 `pptx-studio`。
- 服务：`slots`、`locale`、`configForms`、`remote.credentials`。
- 表单用 `SettingsFormModel`：字段暂存、保存、恢复默认；凭据字段用 `SettingsSecretField`，只写不读。
- 页面不直接读 Key，只通过 `remote.credentials.describe()` 显示「已配置/未配置」。

## 构建

`tsdown -c tsdown.client.config.ts` 输出 CJS 后包成：

```js
window.__ModuleLoader__.load({ id: "dsh-pptx-studio", factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;
  // bundle
  return module.exports
} })
```

注意：Host 构建的 `clean: true` 会清掉 `lib/client.js`，所以 `package.json` 的 build 必须先跑 Host 再跑 client。

两个已踩过的坑：

- Host Config 中要出现在页面的字段必须 `.volatile()`，否则 settings 服务不提供该 namespace，`whileServed()` 不触发，slot 不注册。
- react 要用 `import * as React`（编译成 `require("react").createElement`）；默认导入会编译成 `require("react").default.createElement`，而 loader 的 CJS require 没有 `default`，页面渲染会失败。


## 修改指引

- 加字段：同时改 `src/config.ts`、本页 `FIELDS` 与渲染分区；字段必须是标量（表单只支持顶层字段）。
- 改 Key 列表：改 `BASE_REFS` 与密钥分区；自定义模型 Key 走 `customModelApiKeyRef` + `customKey`。
- 升级 DSH 后先核对 `SettingsFormModel` / `SettingsSecretField` / `plugins.bundle.config` 的签名。
