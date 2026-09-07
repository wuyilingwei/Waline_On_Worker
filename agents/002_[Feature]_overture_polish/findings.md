# 调研记录

- [当前发布包] -> `recipe/overture.template.json` 将 `domain` 设为必填，并声明 Workers Routes/Zone 为必需权限 -> 无自定义域名无法部署且 OAuth 范围过宽。
- [部署脚本] -> `recipe/recipe.js` 无条件调用 `ctx.domains.attach(domain)` 并以域名构造结果 URL -> 需要依据 Overture 无域名 Worker URL 契约调整。
- [条款] -> 模板仅有一段简短描述 -> 未覆盖账户费用、权限、凭证和 JWT、数据库、第三方处理、自托管责任及许可免责声明。
- [路径纠正] -> 初始 Overture worktree 被错误建在 `/Users/user/.codex/worktrees/Waline_On_Worker/overture-polish`，未发生编辑 -> 已按要求保留；当前任务使用 `waline-overture-polish`。
- [无域名完成页] -> Overture 核心在未收到 recipe URL 且 `target.domain` 为空时会启用/查询 Workers subdomain，并生成 `https://<worker>.<subdomain>.workers.dev` -> recipe 只需避免调用 `domains.attach` 且不写入 `result.url`。
- [可选自定义域名权限] -> 现有 Overture 授权与能力分析在 Target 之前静态进行 -> 包保留 `domains` capability 和标记为 optional 的 Routes/Zone 权限，以支持填写域名；即使本次留空，OAuth/API Token 模板仍会展示这些权限，文档已明确此点。
- [验证] -> 安装锁定依赖后，`pnpm test:overture` 通过：归档校验、无域名与中英文 recipe 行为、schema 重放以及 Miniflare 包运行时冒烟测试全部成功。
- [完整测试] -> 从公开的 `wrangler.toml.example` 仅在当前 worktree 生成被 gitignore 的 `wrangler.toml` 后，`pnpm test` 通过 12 个测试文件、132 项测试；未使用真实账户配置，也未加入提交。
- [版本与 URL] -> `build:overture` 已固定 `--version 1.1.2 --tag v1.1.2`；无自定义域名的 `ctx.result` 不含 `url` 字段，自定义域名非空时才构造 URL，因此不会生成 `https://undefined`。
