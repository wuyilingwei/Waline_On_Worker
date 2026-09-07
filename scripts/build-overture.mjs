import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const version = valueFor("--version");
const tag = valueFor("--tag");

if (!version || !tag || !tag.startsWith("v") || tag.slice(1) !== version) {
  throw new Error("Usage: node scripts/build-overture.mjs --version <version> --tag v<version>");
}

const output = join(root, "dist", "overture");
const packageRoot = join(output, "package");
const archive = join(output, "overture.tar.gz");
rmSync(output, { recursive: true, force: true });
mkdirSync(join(packageRoot, "worker"), { recursive: true });
mkdirSync(join(packageRoot, "migrations"), { recursive: true });

const bundleDir = mkdtempSync(join(tmpdir(), "waline-overture-"));
try {
  execFileSync("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", "recipe/wrangler.toml", `--outdir=${bundleDir}`], {
    cwd: root,
    stdio: "inherit",
  });
  cpSync(join(bundleDir, "index.js"), join(packageRoot, "worker", "index.js"));
} finally {
  rmSync(bundleDir, { recursive: true, force: true });
}
cpSync(join(root, "recipe", "recipe.js"), join(packageRoot, "recipe.js"));
cpSync(join(root, "schema.sql"), join(packageRoot, "migrations", "schema.sql"));
execFileSync("tar", ["-czf", archive, "-C", packageRoot, "recipe.js", "worker", "migrations"], { cwd: root });

if (!existsSync(archive) || statSync(archive).size === 0) throw new Error("Overture archive was not created");
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
const template = readFileSync(join(root, "recipe", "overture.template.json"), "utf8");
const recipe = template
  .replace("__VERSION__", version)
  .replace("__TAG__", tag)
  .replace("__BUILD_TIME__", new Date().toISOString())
  .replace("__SHA256__", digest)
  .replace("__BYTES__", String(statSync(archive).size))
  .replace("__LICENSE__", JSON.stringify(readFileSync(join(root, "LICENSE"), "utf8")).slice(1, -1));
writeFileSync(join(output, "overture.json"), `${recipe}\n`);
console.log(`Built ${archive} (${statSync(archive).size} bytes, sha256 ${digest})`);
