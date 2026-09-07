# Findings

- [2026-09-07] -> Overture package format -> Release 必须含固定名 `overture.json` 和 `overture.tar.gz`；数据包需要 `recipe.js`、Worker ESM 模块和迁移文件。
- [2026-09-07] -> Auth model -> 公共入口支持 OAuth 与 Account API Token，配方可声明 `authModes: ["oauth", "auto"]`，本包不需要长期 Cloudflare API token。
- [2026-09-07] -> Existing deployment -> 仅需要 D1 `DB` binding；`schema.sql` 使用 `CREATE ... IF NOT EXISTS`，可在 overwrite 时安全重放。
- [2026-09-07] -> Wrangler package build -> `--outfile` 保存的是 deploy multipart 请求体，不能作为 Worker ESM；改用 `--outdir` 并仅复制生成的 `index.js` 到归档。
- [2026-09-07] -> `pnpm test` -> 当前远端 main 未跟踪根目录 `wrangler.toml`，而 `vitest.config.ts` 硬编码该路径，13 个既有 workerd suites 均在启动前失败。Overture 独立 runtime smoke 不依赖该本地配置且已通过。
