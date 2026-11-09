import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateRun } from "../src/features/runs/data/generate";
import { getRunDescriptor } from "../src/features/runs/data/manifest";
import { prepareRun, type PreparedRun } from "../src/features/runs/model/prepare";
import { buildFrame } from "../src/features/runs/model/reduce";
import { METRICS, type GeneratedRun, type Metric } from "../src/features/runs/model/types";
import type { RunFrame, Viewport } from "../src/features/runs/model/view-types";

const WARMUPS = 3;
const REPETITIONS = 12;
const root = fileURLToPath(new URL("..", import.meta.url));
const reducerPath = new URL("../src/features/runs/model/reduce.ts", import.meta.url);
const preparationPath = new URL("../src/features/runs/model/prepare.ts", import.meta.url);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function sourceFingerprint(run: GeneratedRun): string {
  const hash = createHash("sha256");
  for (const array of [run.columns.step, ...METRICS.map((metric) => run.columns[metric]), ...METRICS.map((metric) => run.columns.missing[metric])])
    hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  return hash.digest("hex");
}

function fragmentedSource(): GeneratedRun {
  const rowCount = 60_000;
  const step = new Float64Array(rowCount);
  const loss = new Float64Array(rowCount);
  const lr = new Float64Array(rowCount);
  const grad_norm = new Float64Array(rowCount);
  const missing = Object.fromEntries(METRICS.map((metric) => [metric, new Uint8Array(rowCount)])) as Record<Metric, Uint8Array>;
  for (let index = 0; index < rowCount; index++) {
    step[index] = index + Math.floor(index / 1000) * 7;
    loss[index] = index % 2 ? NaN : (index % 997) / 1000;
    lr[index] = 0.001;
    missing.lr[index] = Number(index % 11 === 0);
    grad_norm[index] = index % 3 ? 0.5 : index % 499;
  }
  return {
    descriptor: {
      ...getRunDescriptor("run-001"), id: "benchmark-fragmented", name: "Benchmark fragmented readings",
      seed: 20261110, rowCount, fixture: {}, scenario: "Deterministic alternating invalid loss, periodic missing learning rate and known step gaps.",
    },
    columns: { step, loss, lr, grad_norm, missing },
  };
}

function primitiveCounts(frame: RunFrame) {
  return {
    total: frame.plottedCount,
    metrics: Object.fromEntries(METRICS.map((metric) => [metric, {
      mode: frame.metrics[metric].mode,
      points: frame.metrics[metric].points.length,
      conflicts: frame.metrics[metric].conflicts.length,
      finiteCount: frame.metrics[metric].finiteCount,
      invalidCount: frame.metrics[metric].invalidCount,
      missingCount: frame.metrics[metric].missingCount,
      domain: frame.metrics[metric].domain,
      peak: frame.metrics[metric].peak,
    }])),
  };
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    samplesMs: samples,
    medianMs: (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    minimumMs: sorted[0],
    maximumMs: sorted.at(-1),
  };
}

export function main() {
  const startedAt = new Date().toISOString();
  const reducerSha256 = sha256(readFileSync(reducerPath));
  const preparationSha256 = sha256(readFileSync(preparationPath));
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).length > 0;
  // All generation, preparation, fingerprints and case construction are outside timings.
  const millionSource = generateRun("run-020");
  const fragmented = fragmentedSource();
  const million = prepareRun(millionSource);
  const broken = prepareRun(fragmented);
  const sources = [millionSource, fragmented].map((source) => ({
    id: source.descriptor.id, rows: source.descriptor.rowCount, seed: source.descriptor.seed,
    datasetVersion: source.descriptor.sourceVersion, generatorVersion: source.descriptor.generatorVersion,
    sourceSha256: sourceFingerprint(source),
  }));
  const cases: { id: string; run: PreparedRun; viewport: Viewport }[] = [];
  for (const width of [320, 1024]) {
    cases.push({ id: `million-full-${width}`, run: million, viewport: { start: 0, end: 999_999, width } });
    cases.push({ id: `million-zoom-${width}`, run: million, viewport: { start: 499_000, end: 501_000, width } });
    cases.push({ id: `fragmented-full-${width}`, run: broken, viewport: { start: broken.summary.firstStep, end: broken.summary.lastStep, width } });
  }
  // Do not allocate the multi-million-entry raw frames until reduced timings are complete.
  const results = cases.map(({ id, run, viewport }) => {
    for (let iteration = 0; iteration < WARMUPS; iteration++) buildFrame(run, viewport);
    const samples: number[] = [];
    let frame: RunFrame | null = null;
    for (let iteration = 0; iteration < REPETITIONS; iteration++) {
      const start = performance.now();
      frame = buildFrame(run, viewport);
      samples.push(performance.now() - start);
    }
    return { id, runId: run.source.descriptor.id, viewport, sourceCount: frame!.sourceCount,
      reduced: { ...summarize(samples), primitives: primitiveCounts(frame!) } };
  });
  const withRaw = results.map((result, index) => {
    const { run, viewport } = cases[index];
    const start = performance.now();
    const frame = buildFrame(run, viewport, "raw");
    const elapsedMs = performance.now() - start;
    for (const metric of METRICS) {
      assert.deepEqual(frame.metrics[metric].domain, result.reduced.primitives.metrics[metric].domain);
      assert.deepEqual(frame.metrics[metric].peak, result.reduced.primitives.metrics[metric].peak);
    }
    return { ...result, raw: { samplesMs: [elapsedMs], primitives: primitiveCounts(frame) } };
  });
  assert.equal(sha256(readFileSync(reducerPath)), reducerSha256, "Reducer changed while benchmark ran");
  assert.equal(sha256(readFileSync(preparationPath)), preparationSha256, "Group scanning changed while benchmark ran");
  for (const [index, source] of [millionSource, fragmented].entries())
    assert.equal(sourceFingerprint(source), sources[index].sourceSha256, "Benchmark changed source bytes");
  console.log(JSON.stringify({
    schemaVersion: 1, startedAt, completedAt: new Date().toISOString(), revision, workingTreeDirty, reducerSha256, preparationSha256,
    environment: { node: process.version, platform: process.platform, arch: process.arch, osRelease: release(),
      cpuModel: cpus()[0]?.model ?? null, logicalCpus: cpus().length, hostRamBytes: totalmem() },
    protocol: { timingScope: "Synchronous buildFrame only; generation, prepareRun, hashing and report construction excluded",
      reducedWarmupsPerCase: WARMUPS, reducedSamplesPerCase: REPETITIONS, rawWarmupsPerCase: 0, rawSamplesPerCase: 1,
      order: "All reduced cases first, then one raw allocation per case; order recorded below",
      p95: "nearest rank; with 12 samples the p95 is the maximum", forcedGc: false, cpuThrottling: "none",
      limitations: "Node numerical-engine timings only, not browser input-to-paint, worker messaging, 4x CPU traces, chart rendering, tab memory, or a release performance verdict. Raw timings are single observations, not reliable percentiles. The machine was not reserved or verified idle." },
    sources, cases: withRaw,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
