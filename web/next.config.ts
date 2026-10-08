import path from "path";
import type { NextConfig } from "next";

// The Semaphore proof pipeline ships THREE separate "node" vs "browser"
// module graphs. Their node builds pull in snarkjs → ffjavascript → wasmcurves,
// which fresh installs cannot reliably resolve ("Can't resolve 'wasmcurves'"
// — even with wasmcurves declared, npm's reify drops it). To make the web
// build deterministic we vendor the fully self-contained BROWSER bundles in
// web/vendor/ and alias every compilation (client AND server/RSC) to them.
//
// Licenses: @semaphore-protocol/proof  → MIT  (ethereum foundation)
//           snarkjs  → GPL-3.0  (iden3)
//           ffjavascript → GPL-3.0 (iden3)
//        vendored byte-for-byte from the npm tarballs at
//        @semaphore-protocol/proof@4.14.3, snarkjs@0.7.5, ffjavascript@0.3.1.
const BROWSER_SEMAPHORE = path.join(__dirname, "vendor", "semaphore-proof.browser.js");
const BROWSER_SNARKJS = path.join(__dirname, "vendor", "snarkjs.browser.esm.js");
const BROWSER_FFJAVASCRIPT = path.join(__dirname, "vendor", "ffjavascript.browser.esm.js");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    const alias: Record<string, string> = config.resolve.alias ?? {};
    config.resolve.alias = {
      ...alias,
      "@semaphore-protocol/proof": BROWSER_SEMAPHORE,
      snarkjs: BROWSER_SNARKJS,
      ffjavascript: BROWSER_FFJAVASCRIPT,
    };
    return config;
  },
};

export default nextConfig;