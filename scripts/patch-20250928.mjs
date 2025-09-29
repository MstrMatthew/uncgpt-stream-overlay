// scripts/patch-20250928.mjs
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
  const src = await readText(p);
  const out = await editFn(src);
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

    // Prepend ?token= handler
    if (!/searchParams\.get\(['"]token['"]\)/.test(out)) {
      const pre = `(function(){try{const u=new URL(location.href);const t=u.searchParams.get('token');if(t){sessionStorage.setItem('adminToken',t);u.searchParams.delete('token');history.replaceState(null,'',u.toString());}}catch(e){}})();\n`;
      out = pre + out;
    }

    // Accessor helpers
    if (!/function\s+getAdminToken\s*\(/.test(out)) {
      out = `function getAdminToken(){return sessionStorage.getItem('adminToken')||'';}function setAdminToken(t){t?sessionStorage.setItem('adminToken',t):sessionStorage.removeItem('adminToken');}\n` + out;
    }

    return out;
  });
}

// NOTE: synchronous (NOT async) to avoid Promise creeping into edits
function insertAfterEnvBlock(code, insert) {
  const anchors = [
    /const\s+MOD_HOLD_MS[^\n]*\n/i,
    /const\s+HYPE_TIER_MIN_CENTS[^\n]*\n/i,
    /const\s+FREE_TIER_MIN_CENTS[^\n]*\n/i
  ];
  for (const rx of anchors) {
    const m = code.match(rx);
    if (m) {
      const idx = m.index + m[0].length;
      return code.slice(0, idx) + insert + code.slice(idx);
    }
  }
  const importBlock = code.match(/^(?:import[\s\S]+?\n)+/);
  if (importBlock) {
    const idx = importBlock[0].length;
    return code.slice(0, idx) + insert + code.slice(idx);
  }
  return insert + code;
}

async function patchServer() {
  if (!has("server.mjs")) return false;
  return await safeEdit("server.mjs", (src) => {
    let s = src;

    // MAX_QUESTION_CHARS const
    if (!/MAX_QUESTION_CHARS/.test(s)) {
      const ins = `const MAX_QUESTION_CHARS = Number(process.env.MAX_QUESTION_CHARS || 280);\n`;
      s = insertAfterEnvBlock(s, ins);
    }

    // normalizeQuestion helper
    if (!/function\s+normalizeQuestion\s*\(/.test(s)) {
      const ins = `function normalizeQuestion(q){const s=String(q||"").trim();if(!s)return s;return /^asks:\\s*/i.test(s)||/\\?$/.test(s)?s:("asks: "+s);} \n`;
      s = insertAfterEnvBlock(s, ins);
    }

    // receiveItem prelude: normalize + dedupe + truncate
    if (/function\s+receiveItem\s*\(/.test(s) && !/dup\s*=\s*queue\.find/.test(s)) {
      const fnRx = /function\s+receiveItem\s*\(([^)]*)\)\s*\{/;
      const m = s.match(fnRx);
      if (m) {
        const param = (m[1] || "item").split(",")[0].trim() || "item";
        const insertAt = m.index + m[0].length;
        const prelude =
`const __nowTs=Date.now();
try{
  if (${param} && typeof ${param}==="object"){
    const __u = (${param}.user??"Viewer");
    let __q = normalizeQuestion(${param}.question??"");
    const __max = Number(process.env.MAX_QUESTION_CHARS||MAX_QUESTION_CHARS||0);
    if (__max && __q.length>__max) __q = __q.slice(0,__max);
    if (Array.isArray(queue)){
      const __dup = queue.find(x=>x.user===__u && x.question===__q && (__nowTs-(x.ts||0))<60000 && (x.status==="staged"||x.status==="queued"));
      if (__dup) return __dup;
    }
    ${param}.user = __u;
    ${param}.question = __q;
  }
}catch(__e){}
`;
        s = s.slice(0, insertAt) + "\n" + prelude + s.slice(insertAt);
      }
    }

    return s;
  });
}

async function addEnvExampleKnob() {
  if (!has(".env.example")) return false;
  const cur = await readText(".env.example");
  if (!/MAX_QUESTION_CHARS=/.test(cur)) {
    await writeText(".env.example", (cur.trimEnd() + "\nMAX_QUESTION_CHARS=280\n"));
    return true;
  }
  return false;
}

async function removeStrayEvalFile() {
  const entries = await readdir(ROOT);
  let removed = false;
  for (const name of entries) {
    if (name.startsWith('eval ') || name.includes('ssh-agent') || name.includes('$(ssh-agent')) {
      try {
        const p = f(name);
        const st = await stat(p);
        if (st.isFile()) { await unlink(p); removed = true; }
      } catch {}
    }
  }
  return removed;
}

async function run() {
  if (!has("scripts")) mkdirSync(f("scripts"), { recursive: true });

  const results = {
    packageJson: await upsertPackageJson(),
    gitignore: await cleanGitignore(),
    modpanel: await patchModpanel(),
    server: await patchServer(),
    envExample: await addEnvExampleKnob(),
    stray: await removeStrayEvalFile()
  };

  const changed = Object.entries(results).filter(([,v])=>v).map(([k])=>k);
  console.log(changed.length ? "Patched: " + changed.join(", ") : "No changes needed.");
  console.log("Done.");
}

run().catch(e=>{ console.error(e?.stack||e); process.exit(1); });
