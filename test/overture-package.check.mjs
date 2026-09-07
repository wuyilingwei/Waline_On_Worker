import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const archive = resolve(root, "dist/overture/overture.tar.gz");
const recipePath = resolve(root, "dist/overture/overture.json");

function context({ mode, fullRebuild = false, inputs = {} }) {
  const calls = [];
  return {
    calls,
    ctx: {
      mode,
      fullRebuild,
      inputs,
      live: { vars: {}, customDomains: [] },
    },
    step: async (...args) => calls.push(["step", ...args]),
    d1: { provision: async (...args) => calls.push(["d1.provision", ...args]), query: async (...args) => calls.push(["d1.query", ...args]) },
    text: async () => "CREATE TABLE IF NOT EXISTS test (id INTEGER);",
    worker: {
      deleteScript: async () => calls.push(["worker.deleteScript"]),
      uploadVersion: async (options) => {
        calls.push(["worker.uploadVersion", options]);
        return { versionId: "version" };
      },
      switchTraffic: async (...args) => calls.push(["worker.switchTraffic", ...args]),
    },
    domains: { attach: async (...args) => calls.push(["domains.attach", ...args]) },
    secrets: { put: async (...args) => calls.push(["secrets.put", ...args]) },
    crypto: { randomBase64: async () => "generated-secret" },
    result: async (...args) => calls.push(["result", ...args]),
  };
}

test("builds a verifiable Overture release package", () => {
  assert.ok(existsSync(archive));
  const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
  assert.equal(recipe.package.artifact, "overture.tar.gz");
  assert.equal(recipe.package.bytes, statSync(archive).size);
  assert.equal(recipe.package.sha256, createHash("sha256").update(readFileSync(archive)).digest("hex"));
  assert.deepEqual(recipe.authModes, ["oauth", "auto"]);
  assert.equal(recipe.hostSecrets, undefined);
  assert.deepEqual(recipe.resources.map((resource) => resource.binding), ["DB"]);
  assert.equal(recipe.inputs.find((input) => input.id === "domain")?.required, undefined);
  assert.deepEqual(recipe.permissions.map((permission) => permission.key), ["workers_scripts", "d1", "workers_routes"]);
  assert.equal(recipe.permissions.find((permission) => permission.key === "workers_routes")?.requirement, "optional");
  assert.match(recipe.terms.texts["zh-CN"], /数据保护义务/);
  assert.match(recipe.terms.texts["*"], /data-protection obligations/);
  const contents = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  for (const path of ["recipe.js", "worker/index.js", "migrations/schema.sql"]) assert.match(contents, new RegExp(`^${path}$`, "m"));
});

test("recipe uses workers.dev without a custom domain and preserves JWT on an ordinary overwrite", async () => {
  const { deploy } = await import(resolve(root, "recipe/recipe.js"));

  const overwrite = context({ mode: "overwrite", inputs: { domain: "" } });
  await deploy(overwrite);
  assert.equal(overwrite.calls.some(([name]) => name === "secrets.put"), false);
  assert.equal(overwrite.calls.some(([name]) => name === "worker.deleteScript"), false);
  assert.equal(overwrite.calls.some(([name]) => name === "domains.attach"), false);
  assert.deepEqual(overwrite.calls.find(([name]) => name === "result"), ["result", { notes: ["The first registered user becomes an administrator."] }]);

  const chinese = context({ mode: "overwrite", inputs: { domain: "" } });
  chinese.ctx.locale = "zh-CN";
  await deploy(chinese);
  assert.deepEqual(chinese.calls.find(([name]) => name === "result"), ["result", { notes: ["首次注册的用户将成为管理员。"] }]);
  assert.deepEqual(chinese.calls.find(([name, id, status]) => name === "step" && id === "rebuild" && status === "skipped"), ["step", "rebuild", "skipped", "未请求完整重建"]);

  for (const options of [
    { mode: "fresh", inputs: { domain: "waline.example.com" } },
    { mode: "overwrite", fullRebuild: true, inputs: { domain: "waline.example.com" } },
    { mode: "overwrite", inputs: { domain: "waline.example.com", regenerate_jwt: true } },
  ]) {
    const run = context(options);
    await deploy(run);
    assert.equal(run.calls.some(([name, secret]) => name === "secrets.put" && secret === "JWT_SECRET"), true);
  }

  const withDomain = context({ mode: "fresh", inputs: { domain: "waline.example.com" } });
  withDomain.ctx.domain = "waline.example.com";
  await deploy(withDomain);
  assert.deepEqual(withDomain.calls.find(([name]) => name === "domains.attach"), ["domains.attach", "waline.example.com"]);
  assert.deepEqual(withDomain.calls.find(([name]) => name === "result"), ["result", { url: "https://waline.example.com", notes: ["The first registered user becomes an administrator."] }]);
});

test("schema can be replayed without replacing existing rows", () => {
  const schema = readFileSync(resolve(root, "schema.sql"), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "wl_Comment"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "wl_Users"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "wl_Settings"/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS "idx_counter_url"/);
  assert.doesNotMatch(schema, /\bDROP\s+(TABLE|INDEX)\b/i);
});
