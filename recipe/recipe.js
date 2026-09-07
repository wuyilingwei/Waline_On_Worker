// Deployment script for Overture's sandboxed package runtime.

function shouldGenerateJwt(ctx) {
  return ctx.ctx.mode === "fresh" || ctx.ctx.fullRebuild || ctx.ctx.inputs.regenerate_jwt === true;
}

function messages(locale) {
  if (locale === "zh-CN") {
    return {
      rebuildSkipped: "未请求完整重建",
      jwtGenerated: "已生成新的 JWT 密钥",
      jwtPreserved: "已保留现有 JWT 密钥",
      completed: "首次注册的用户将成为管理员。",
    };
  }
  return {
    rebuildSkipped: "Full rebuild was not requested",
    jwtGenerated: "A new JWT secret was generated",
    jwtPreserved: "Existing JWT secret was preserved",
    completed: "The first registered user becomes an administrator.",
  };
}

export async function deploy(ctx) {
  const { domain, fullRebuild, inputs, locale } = ctx.ctx;
  const copy = messages(locale);
  const customDomain = typeof domain === "string" ? domain.trim() : "";

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
    await ctx.step("rebuild", "skipped", copy.rebuildSkipped);
  }

  await ctx.step("worker", "running");
  const secureDomains = typeof inputs.secure_domains === "string" ? inputs.secure_domains.trim() : "";
  const { versionId } = await ctx.worker.uploadVersion({
    ...(secureDomains ? {} : { preserveLiveVars: ["SECURE_DOMAINS"] }),
  });
  await ctx.worker.switchTraffic(versionId);
  if (customDomain) await ctx.domains.attach(customDomain);
  await ctx.step("worker", "success");

  await ctx.step("secret", "running");
  if (shouldGenerateJwt(ctx)) {
    await ctx.secrets.put("JWT_SECRET", await ctx.crypto.randomBase64(48));
    await ctx.step("secret", "success", copy.jwtGenerated);
  } else {
    await ctx.step("secret", "skipped", copy.jwtPreserved);
  }

  await ctx.result({ ...(customDomain ? { url: `https://${customDomain}` } : {}), notes: [copy.completed] });
}
