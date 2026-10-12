// Isolated local integration run. Never uses a team deployment, wallet or database.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(path.join(tmpdir(), "trialfence-test-"));
const children = [];
const require = createRequire(import.meta.url);
const token = "integration-test-only";
const env = { ...process.env, DB_FILE: path.join(temp, "test.db"), ISSUER_API_KEY: token, RELAYER_API_KEY: token,
  RPC_URL: "http://127.0.0.1:8545", DEPLOYMENT_FILE: path.join(root, "contracts/deployments/localhost.json"),
  PORT_ISSUER: "4001", PORT_RELAYER: "4002", OPENAI_API_KEY: "" };
env.OWNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
env.ISSUER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
env.RELAYER_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
env.HMAC_SECRET = "integration-test-only-hmac";

function start(label, args, cwd = root, inherit = false) {
  const log = path.join(temp, `${label}.log`);
  const child = spawn(process.execPath, args, { cwd, env, detached: true,
    stdio: inherit ? "inherit" : ["ignore", openSync(log, "a"), openSync(log, "a")] });
  children.push(child);
  return { child, log };
}
async function finish(job) {
  const code = await new Promise((resolve, reject) => { job.child.once("exit", resolve); job.child.once("error", reject); });
  if (code !== 0) throw new Error(`Child failed (${code}): ${existsSync(job.log) ? readFileSync(job.log, "utf8") : "see output above"}`);
}
async function ready(url, init) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    try { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(2000) }); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Service did not become ready: ${url}`);
}
function stop(child) { try { process.kill(-child.pid, "SIGTERM"); } catch {} }

try {
  const node = start("chain", [path.join(root, "node_modules/hardhat/internal/cli/cli.js"), "node", "--hostname", "127.0.0.1"], path.join(root, "contracts"));
  await ready(env.RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
  await finish(start("deploy", [path.join(root, "node_modules/hardhat/internal/cli/cli.js"), "run", "scripts/deploy.ts", "--network", "localhost"], path.join(root, "contracts")));
  for (const service of ["issuer", "relayer"]) start(service, [path.join(root, "node_modules/ts-node/dist/bin.js"), `src/${service}/index.ts`], path.join(root, "server"));
  await ready("http://127.0.0.1:4001/status");
  await ready("http://127.0.0.1:4002/health");
  const unauthorized = await fetch("http://127.0.0.1:4001/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (unauthorized.status !== 401) throw new Error("Unauthenticated issuance was not blocked.");
  console.log("PASS  issuance requires token; public membership reads work");
  for (const endpoint of ["protocol", "site"]) {
    const response = await fetch(`http://127.0.0.1:4002/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (response.status !== 401) throw new Error(`Unauthenticated ${endpoint} was not blocked.`);
  }
  console.log("PASS  registry writes require token; public enrollment stays open");
  const web = start("web", [require.resolve("next/dist/bin/next", { paths: [path.join(root, "web")] }), "start", "-p", "3000", "-H", "127.0.0.1"], path.join(root, "web"));
  await ready("http://127.0.0.1:3000/api/relayer/health");
  await ready("http://127.0.0.1:3000/api/issuer/members");
  const protectedProxy = await fetch("http://127.0.0.1:3000/api/relayer/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (protectedProxy.status !== 401) throw new Error("Next proxy bypassed registry authorization.");
  env.ISSUER_URL = "http://127.0.0.1:3000/api/issuer";
  env.RELAYER_URL = "http://127.0.0.1:3000/api/relayer";
  console.log("PASS  production Next proxy preserves authorization and public reads");
  await finish(start("e2e", [path.join(root, "scripts/e2e.mjs")], root, true));

  const denialsBefore = (await (await fetch("http://127.0.0.1:4002/denials")).json()).denials.length;
  stop(node.child);
  await new Promise(resolve => setTimeout(resolve, 500));
  const { solidityPackedKeccak256 } = await import("ethers");
  const scope = BigInt(solidityPackedKeccak256(["string", "uint256"], ["TrialFence-Protocol-v1:", 1n])).toString();
  const outage = await fetch("http://127.0.0.1:4002/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ protocolId: "1", siteId: "1", proof: { merkleTreeDepth: 1, merkleTreeRoot: "1", message: "1", nullifier: "1", scope, points: Array(8).fill("0") } }) });
  if (outage.status !== 503) throw new Error(`RPC outage reported as ${outage.status}, expected 503.`);
  const denialsAfter = (await (await fetch("http://127.0.0.1:4002/denials")).json()).denials.length;
  if (denialsAfter !== denialsBefore) throw new Error("RPC outage was persisted as a participant denial.");
  console.log("PASS  RPC failure returns 503 without creating a denial record");
  for (const child of children.filter(child => child !== web.child)) stop(child);
  await new Promise(resolve => setTimeout(resolve, 500));
  const proxyOutage = await fetch("http://127.0.0.1:3000/api/relayer/health");
  const proxyBody = await proxyOutage.json();
  if (proxyOutage.status !== 503 || proxyBody.error !== "SERVICE_UNAVAILABLE") throw new Error("Next proxy outage did not return retryable JSON.");
  console.log("PASS  unavailable backend returns JSON 503 through the Next proxy");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const child of children) stop(child);
  rmSync(temp, { recursive: true, force: true });
}
