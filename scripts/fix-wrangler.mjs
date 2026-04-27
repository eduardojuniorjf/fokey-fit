// Post-build: overwrite the auto-generated dist/client/wrangler.json with a
// minimal Cloudflare Pages-compatible config. The @cloudflare/vite-plugin
// emits a Worker-style config that contains keys Pages rejects (e.g.
// `triggers: {}`, `enable_containers`, `python_modules`, etc.).
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("dist/client/wrangler.json");
const pagesConfig = {
  name: "tanstack-start-app",
  pages_build_output_dir: ".",
  compatibility_date: "2025-09-24",
  compatibility_flags: ["nodejs_compat"],
};

writeFileSync(target, JSON.stringify(pagesConfig, null, 2));
console.log(`[fix-wrangler] Wrote Pages-compatible config to ${target}`);
if (!existsSync(target)) process.exit(1);
