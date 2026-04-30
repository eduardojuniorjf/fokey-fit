// Post-build: prepare a Cloudflare Pages-compatible output. TanStack Start
// emits the SSR worker in dist/server, while Pages serves dist/client. Without
// an _worker.js in dist/client, Pages uploads only static assets and the app 404s.
import { copyFileSync, cpSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("dist/client/wrangler.json");
const workerSource = resolve("dist/server/server.js");
const workerTarget = resolve("dist/client/_worker.js");
const serverAssetsSource = resolve("dist/server/assets");
const clientAssetsTarget = resolve("dist/client/assets");

if (!existsSync(workerSource)) {
  console.error(`[fix-wrangler] Missing SSR worker at ${workerSource}`);
  process.exit(1);
}

copyFileSync(workerSource, workerTarget);
// Split SSR chunks in dist/client/assets/*.js import from "../server.js" — i.e.
// they expect dist/client/server.js to exist alongside the assets folder.
copyFileSync(workerSource, resolve("dist/client/server.js"));
if (existsSync(serverAssetsSource)) {
  cpSync(serverAssetsSource, clientAssetsTarget, { recursive: true });
}

// Tell Cloudflare Pages to bypass the Worker for static assets, favicons,
// and other public files — otherwise the SSR worker tries to handle every
// request (including /assets/*.js) and returns 404 for static files.
const routesTarget = resolve("dist/client/_routes.json");
const routesConfig = {
  version: 1,
  include: ["/*"],
  exclude: [
    "/assets/*",
    "/favicon.ico",
    "/favicon.svg",
    "/robots.txt",
    "/placeholder.svg",
    "/_worker.js",
    "/_routes.json",
    "/server.js",
    "/wrangler.json",
    "/.assetsignore",
  ],
};
writeFileSync(routesTarget, JSON.stringify(routesConfig, null, 2));
console.log(`[fix-wrangler] Wrote _routes.json to ${routesTarget}`);

const pagesConfig = {
  name: "fokey-fit",
  pages_build_output_dir: ".",
  compatibility_date: "2025-09-24",
  compatibility_flags: ["nodejs_compat"],
};

writeFileSync(target, JSON.stringify(pagesConfig, null, 2));
console.log(`[fix-wrangler] Wrote Pages-compatible config to ${target}`);
console.log(`[fix-wrangler] Copied SSR worker to ${workerTarget}`);
if (!existsSync(target) || !existsSync(workerTarget)) process.exit(1);
