import path from "path";
import type { NextConfig } from "next";

const BROWSER_SEMAPHORE = path.resolve(
  __dirname,
  "../node_modules/@semaphore-protocol/proof/dist/index.browser.js"
);
const BROWSER_SNARKJS = path.resolve(__dirname, "../node_modules/snarkjs/build/browser.esm.js");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config, { isServer }) {
    if (!isServer) {
      // Force the browser builds of the Semaphore proof pipeline. The "node"
      // builds of snarkjs / @semaphore-protocol/proof import Node builtins
      // (fs, path, worker threads) that break proof generation in-browser.
      const alias: Record<string, string> = config.resolve.alias ?? {};
      config.resolve.alias = {
        ...alias,
        "@semaphore-protocol/proof": BROWSER_SEMAPHORE,
        snarkjs: BROWSER_SNARKJS,
      };
    }
    return config;
  },
};

export default nextConfig;