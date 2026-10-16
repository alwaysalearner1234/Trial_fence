// Render entrypoint: boots the entire TrialFence stack inside ONE web-service
// container so a free Render instance can serve the demo end-to-end.
//
// LOCAL MODE (default: RPC_URL is loopback + DEPLOYMENT_FILE is localhost.json):
//   1. spawn a local Hardhat node (in-memory chain),
//   2. deploy TrialFence.sol onto it (writes contracts/deployments/localhost.json),
//   3. start the issuer (4001) and relayer (4002) services,
//   4. serve the built Next.js app on $PORT.
//
// HOSTED MODE (any other RPC_URL, e.g. Polygon Amoy, or a non-localhost
// deployment file): the script NEVER starts a local chain and NEVER deploys.
// It uses the configured deployment file as-is and fails fast if the file is
// missing, so a hosted startup can never silently fall back to localhost.
//
// The local chain + sqlite DB are ephemeral (reset on every container
// restart) — fine for a demo; for persistence use a managed chain provider +
// Postgres (see README "Production notes").
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const issuerPort = process.env.PORT_ISSUER ?? "4001";
const relayerPort = process.env.PORT_RELAYER ?? "4002";
process.env.ISSUER_INTERNAL_URL ??= `http://127.0.0.1:${issuerPort}`;
process.env.RELAYER_INTERNAL_URL ??= `http://127.0.0.1:${relayerPort}`;
const PORT = process.env.PORT ?? "3000";
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const DEPLOYMENT_FILE = path.isAbsolute(process.env.DEPLOYMENT_FILE ?? "")
  ? process.env.DEPLOYMENT_FILE
  : path.join(ROOT, process.env.DEPLOYMENT_FILE ?? path.join("contracts", "deployments", "localhost.json"));

function isLoopbackRpc(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

// Hosted unless BOTH the RPC and the deployment file are local.
const hostedMode = !isLoopbackRpc(RPC_URL) || !DEPLOYMENT_FILE.endsWith("localhost.json");

function isReachable(port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const socket = net.connect(Number(port), "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        clearInterval(timer);
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      });
    }, 300);
  });
}

const children = [];
let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try { process.platform === "win32" ? child.kill("SIGTERM") : process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  process.exit(code);
}
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    detached: process.platform !== "win32",
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  children.push(child);
  child.on("error", (err) => { console.error(`[${name}] could not start:`, err.message); shutdown(1); });
  child.on("exit", (code) => { if (!stopping) { console.error(`[${name}] exited with code ${code}`); shutdown(code || 1); } });
  return child;
}

if (hostedMode) {
  console.log(`[render] HOSTED MODE: rpcHost=${new URL(RPC_URL).host} deployment=${DEPLOYMENT_FILE}`);
  console.log("[render] will NOT start a local chain and will NOT deploy; using the configured deployment as-is.");
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    console.error(`[render] deployment file missing: ${DEPLOYMENT_FILE} (refusing to silently fall back to localhost)`);
    shutdown(1);
  }
} else {
  console.log("[render] LOCAL EPHEMERAL DEMO MODE (in-memory chain, reset on restart)");
  const hardhatReady = await isReachable(8545, 1000);
  if (!hardhatReady) {
    console.log("[render] starting local Hardhat node…");
    run("hardhat-node", "npx", ["hardhat", "node"], path.join(ROOT, "contracts"));
    const ready = await isReachable(8545, 60000);
    if (!ready) {
      console.error("[render] Hardhat node failed to start");
      shutdown(1);
    }
  }

  console.log("[render] deploying TrialFence…");
  const deploy = spawnSync(
    "npx",
    ["hardhat", "run", "scripts/deploy.ts", "--network", "localhost"],
    { cwd: path.join(ROOT, "contracts"), stdio: "inherit", env: process.env }
  );
  if (deploy.status !== 0 || !fs.existsSync(DEPLOYMENT_FILE)) {
    console.error("[render] contract deployment failed");
    shutdown(1);
  }
}

console.log("[render] starting issuer + relayer…");
run("issuer", "npm", ["run", "issuer", "-w", "server"], ROOT);
run("relayer", "npm", ["run", "relayer", "-w", "server"], ROOT);
const [iReady, rReady] = await Promise.all([isReachable(issuerPort, 60000), isReachable(relayerPort, 60000)]);
if (!iReady || !rReady) {
  console.error("[render] issuer/relayer failed to start", { iReady, rReady });
  shutdown(1);
}

console.log(`[render] serving web on :${PORT}`);
const web = run("web", "npm", ["run", "start", "-w", "web", "--", "-p", PORT], ROOT);
