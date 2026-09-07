// Deployment script for Overture's sandboxed package runtime.

function shouldGenerateJwt(ctx) {
  return ctx.ctx.mode === "fresh" || ctx.ctx.fullRebuild || ctx.ctx.inputs.regenerate_jwt === true;
}

export async function deploy(ctx) {
  const { domain, fullRebuild, inputs } = ctx.ctx;

  await ctx.step("database", "running");
  await ctx.d1.provision("db");
  await ctx.step("database", "success");

  await ctx.step("schema", "running");
  // The schema is made entirely of CREATE ... IF NOT EXISTS statements.
  await ctx.d1.query("db", await ctx.text("migrations/schema.sql"));
  await ctx.step("schema", "success");

  if (fullRebuild) {
    await ctx.step("rebuild", "running");
    await ctx.worker.deleteScript();
    await ctx.step("rebuild", "success");
  } else {
    await ctx.step("rebuild", "skipped", "Full rebuild not requested");
  }

  await ctx.step("worker", "running");
  const secureDomains = typeof inputs.secure_domains === "string" ? inputs.secure_domains.trim() : "";
  const { versionId } = await ctx.worker.uploadVersion({
    ...(secureDomains ? {} : { preserveLiveVars: ["SECURE_DOMAINS"] }),
  });
  await ctx.worker.switchTraffic(versionId);
  await ctx.domains.attach(domain);
  await ctx.step("worker", "success");

  await ctx.step("secret", "running");
  if (shouldGenerateJwt(ctx)) {
    await ctx.secrets.put("JWT_SECRET", await ctx.crypto.randomBase64(48));
    await ctx.step("secret", "success", "A new JWT secret was generated");
  } else {
    await ctx.step("secret", "skipped", "Existing JWT secret preserved");
  }

  await ctx.result({ url: `https://${domain}`, notes: ["The first registered user becomes an administrator."] });
}
