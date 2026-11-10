import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env.GITHUB_PAGES === "true") {
  // Static hosts serve exported notFound() HTML with status 200. Omit these
  // development-only routes so GitHub Pages uses the real 404 fallback.
  for (const route of ["diagnostics", "benchmark"]) {
    rmSync(fileURLToPath(new URL(`../out/${route}`, import.meta.url)), { recursive: true, force: true });
  }
  writeFileSync(new URL("../out/.nojekyll", import.meta.url), "");
}
