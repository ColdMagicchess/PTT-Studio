# 插件市场索引

本目录是 DSH 插件市场的**格式 1 索引**，可以直接作为「自定义插件市场」的索引源。

## 添加到 DSH

1. 打开 **插件** → **实验性插件** 旁的 **更多** → 打开 **自定义插件市场**。
2. 切到 **发现** → **添加索引源**，填入：

   ```
   https://raw.githubusercontent.com/ColdMagicchess/PTT-Studio/main/market/index.json
   ```

3. 搜索 “PPT” 或 “dsh-pptx-studio”，选推荐版本 **安装**。确认框里会显示来源：Git 仓库 + 提交号。

每个版本都锁定到一个提交（`git+https://github.com/ColdMagicchess/PTT-Studio.git#<commit>`），仓库自带 `lib/` 构建产物，安装不需要构建授权。

## 发布新版本

```bash
pnpm run build && pnpm test          # 构建并测试
git commit -am "release x.y.z"        # 提交（含 lib/）
git push
node_modules/.bin/tsx scripts/market-index.ts add x.y.z $(git rev-parse HEAD)
git commit -am "market: x.y.z" && git push
```

`scripts/market-index.ts check` 按 DSH 0.2.1-rc.2 的索引规则校验本文件（CI 也会跑）。图标 `icons/dsh-pptx-studio.svg` 相对索引 URL 解析。
