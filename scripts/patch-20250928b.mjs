// scripts/patch-20250928b.mjs
import { readFile, writeFile, readdir, stat, unlink } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const f = (p) => path.join(ROOT, p);

async function readText(p) { return await readFile(f(p), "utf8"); }
async function writeText(p, s) { await writeFile(f(p), s, "utf8"); }
function has(p) { return existsSync(f(p)); }

async function safeEdit(p, editFn) {
  if (!has(p)) return false;
  const src = await readText(p);              // string
  const out = await editFn(src);              // may return same string
  if (out !== null && out !== undefined && out !== src) {
    await writeText(p, out);
    return true;
  }
  return false;
}

async function upsertPackageJson() {
  if (!has("package.json")) return false;
  const pkg = JSON.parse(await readText("package.json"));
  pkg.private = true;
  pkg.type = "module";
  if (!pkg.main || pkg.main !== "server.mjs") pkg.main = "server.mjs";
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.start = "node server.mjs";
  await writeText("package.json", JSON.stringify(pkg, null, 2) + "\n");
  return true;
}

async function cleanGitignore() {
  const desired = [
    "# secrets",
    ".env",
    ".admin_token",
    "tokens.twitch.json",
    "tokens.twitch.json.bak-*",
    "app_token.json",
    "state.json",
    "",
    "# runtime data",
    "data/",
    "backups/",
    "",
    "# deps & build",
    "node_modules/",
    "dist/",
    "build/",
    "coverage/",
    "*.log",
    "",
    "# macOS and zips/apps",
    ".DS_Store",
    "*.zip",
    "UncGPT Start.app",
    "UncGPT Start.command",
    "",
    "# misc scratch",
    "*.bak-*",
    "*.brok-*",
    ""
  ].join("\n");
  await writeText(".gitignore", desired);
  return true;
}

async function patchModpanel() {
  let target = "modpanel.js";
  if (!has(target) && has("public/modpanel.js")) target = "public/modpanel.js";
  if (!has(target)) return false;

  return await safeEdit(target, (src) => {
    let out = src;

    // localStorage -> sessionStorage
    if (out.includes("localStorage")) {
      out = out.replaceAll("localStorage", "sessionStorage");
    }

    // Prepend ?token= handler if missing
    if (!/searchParams\.get\(['"]token['"]\)/.test(out)) {
      const pre = `(function(){try{const u=new URL(location.href);const t=u.searchParams.get('token');if(t){sessionStorage.setItem('adminToken',t);u.searchParams.delete('token');history.replaceState(null,'',u.toString());}}catch(e){}})();\
