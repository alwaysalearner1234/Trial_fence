// Render entrypoint: boots the entire TrialFence stack inside ONE web-service
// container so a free Render instance can serve the demo end-to-end.
//
//   1. spawn a local Hardhat node (in-memory chain),
//   2. deploy TrialFence.sol onto it (writes contracts/deployments/localhost.json),
//   3. start the issuer (4001) and relayer (4002) services,
//   4. serve the built Next.js app on $PORT.
//
// The chain + sqlite DB are ephemeral (reset on every container restart) —
// fine for a demo; for persistence use a managed chain provider + Postgres.
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PORT = process.env.PORT ?? "3000";
const DEPLOYMENT_FILE = path.join(ROOT, "contracts", "deployments", "localhost.json");

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

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("error", (err) => console.error(`[${name}] error:`, err.message));
  child.on("exit", (code) => console.error(`[${name}] exited with code ${code}`));
  return child;
}

const hardhatReady = await isReachable(8545, 30000);
if (!hardhatReady) {
  console.log("[render] starting local Hardhat node…");
  run("hardhat-node", "npx", ["hardhat", "node"], path.join(ROOT, "contracts"));
  const ready = await isReachable(8545, 60000);
  if (!ready) {
    console.error("[render] Hardhat node failed to start");
    process.exit(1);
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
  process.exit(1);
}

console.log("[render] starting issuer + relayer…");
run("issuer", "npm", ["run", "issuer", "-w", "server"], ROOT);
run("relayer", "npm", ["run", "relayer", "-w", "server"], ROOT);
const [iReady, rReady] = await Promise.all([isReachable(4001, 60000), isReachable(4002, 60000)]);
if (!iReady || !rReady) {
  console.error("[render] issuer/relayer failed to start", { iReady, rReady });
  process.exit(1);
}

console.log(`[render] serving web on :${PORT}`);
const web = run("web", "npm", ["run", "start", "-w", "web", "--", "-p", PORT], ROOT);
web.on("exit", (code) => process.exit(code ?? 0));