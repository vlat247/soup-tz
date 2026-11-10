import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateRunFromDescriptor } from "../src/features/runs/data/generate";
import { RUN_MANIFEST } from "../src/features/runs/data/manifest";
import { prepareRun } from "../src/features/runs/model/prepare";
import type { CatalogEntry } from "../src/features/runs/model/view-types";

async function main() {
  const outputPath = fileURLToPath(new URL("../src/features/runs/data/catalog.json", import.meta.url));
  const catalog: CatalogEntry[] = [];
  for (const descriptor of RUN_MANIFEST) {
    // Each run's full source is released after its small exact summary is retained.
    catalog.push({ id: descriptor.id, summary: prepareRun(generateRunFromDescriptor(descriptor)).summary });
  }
  const contents = `${JSON.stringify(catalog, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const existing = await readFile(outputPath, "utf8");
    if (existing !== contents) throw new Error("Run catalog is stale; run npm run data:catalog");
    console.log(`Verified ${catalog.length} exact run summaries.`);
  } else {
    await writeFile(outputPath, contents, "utf8");
    console.log(`Generated ${catalog.length} exact run summaries.`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
