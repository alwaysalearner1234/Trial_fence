// Repairs the `wasmcurves` hole left behind by `npm ci`.
//
// `ffjavascript@0.3.x` (nested under snarkjs) requires `wasmcurves` at
// runtime, but `npm ci` silently drops it from node_modules (npm reify/
// ideal-tree bug — the lockfile lists it, the tree omits it, and a plain
// `npm install wasmcurves` hangs). That breaks Hardhat tests and scripts/e2e.mjs,
// which resolve snarkjs's Node build. `npm pack` only fetches the tarball and
// never runs the dependency solver, so it works reliably.
//
// Usage: `node scripts/fix-zk-deps.mjs` (from the repo root, after npm ci).
// Safe to re-run: exits immediately when the package is already present.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "node_modules", "wasmcurves");
const SPEC = "wasmcurves@0.2.2";

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`[fix-zk-deps] '${cmd} ${args.join(" ")}' failed with code ${r.status}`);
    process.exit(1);
  }
}

if (fs.existsSync(path.join(TARGET, "package.json"))) {
  console.log("[fix-zk-deps] wasmcurves already present, nothing to do.");
  process.exit(0);
}

console.log(`[fix-zk-deps] wasmcurves missing, fetching ${SPEC}…`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tf-wasmcurves-"));
run("npm", ["pack", SPEC], tmp);

const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
if (!tgz) {
  console.error("[fix-zk-deps] npm pack produced no tarball");
  process.exit(1);
}

fs.mkdirSync(TARGET, { recursive: true });
// `tar` ships with GitHub runners, macOS and Windows 10+.
run("tar", ["-xzf", path.join(tmp, tgz), "-C", TARGET, "--strip-components=1"], ROOT);

if (!fs.existsSync(path.join(TARGET, "package.json"))) {
  console.error("[fix-zk-deps] extraction failed: no package.json in node_modules/wasmcurves");
  process.exit(1);
}
console.log("[fix-zk-deps] wasmcurves installed.");
