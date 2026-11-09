import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectValidationResults, selectValidationCases } from "./validation-report";
import { generateRun } from "../src/features/runs/data/generate";
import {
  getRunDescriptor,
  RUN_MANIFEST,
} from "../src/features/runs/data/manifest";
import { inspectStep } from "../src/features/runs/model/inspect";
import { prepareRun } from "../src/features/runs/model/prepare";
import { buildFrame } from "../src/features/runs/model/reduce";
import {
  METRICS,
  type GeneratedRun,
  type Metric,
} from "../src/features/runs/model/types";
import type {
  Reading,
  RunSummary,
  Viewport,
} from "../src/features/runs/model/view-types";

export interface ValidationRow {
  step: number;
  loss: number;
  lr?: number;
  grad_norm?: number;
  missing?: Metric[];
}

export function validationSource(
  rows: ValidationRow[],
  cadence = 1,
): GeneratedRun {
  return {
    descriptor: {
      ...getRunDescriptor("run-001"),
      id: "validation",
      rowCount: rows.length,
      expectedStepInterval: cadence,
      fixture: {},
    },
    columns: {
      step: Float64Array.from(rows, (row) => row.step),
      loss: Float64Array.from(rows, (row) => row.loss),
      lr: Float64Array.from(rows, (row) => row.lr ?? 0.001),
      grad_norm: Float64Array.from(rows, (row) => row.grad_norm ?? 1),
      missing: Object.fromEntries(
        METRICS.map((metric) => [
          metric,
          Uint8Array.from(rows, (row) =>
            Number(row.missing?.includes(metric) ?? false),
          ),
        ]),
      ) as Record<Metric, Uint8Array>,
    },
  };
}

function fingerprint(run: GeneratedRun): string {
  const hash = createHash("sha256");
  for (const array of [
    run.columns.step,
    ...METRICS.map((metric) => run.columns[metric]),
    ...METRICS.map((metric) => run.columns.missing[metric]),
  ]) {
    hash.update(
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
    );
  }
  return hash.digest("hex");
}

// Deliberately separate from prepare/scanGroup: use ordinary sorted source indexes
// and a Set of reading identities. No numerical helper computes an expected value.
function referenceReading(
  run: GeneratedRun,
  index: number,
  metric: Metric,
): Reading {
  const value = run.columns[metric][index];
  if (run.columns.missing[metric][index] === 1)
    return { kind: "missing", value: null };
  if (Number.isNaN(value)) return { kind: "nan", value: null };
  if (!Number.isFinite(value))
    return {
      kind: value > 0 ? "positive-infinity" : "negative-infinity",
      value: null,
    };
  return { kind: "finite", value };
}

function* referenceGroups(run: GeneratedRun, order: number[]) {
  let offset = 0;
  while (offset < order.length) {
    const step = run.columns.step[order[offset]];
    const indexes: number[] = [];
    do {
      indexes.push(order[offset++]);
    } while (offset < order.length && run.columns.step[order[offset]] === step);
    yield { step, indexes };
  }
}

function referenceGroup(run: GeneratedRun, indexes: number[], metric: Metric) {
  const readings = indexes.map((index) => referenceReading(run, index, metric));
  const identities = new Set(
    readings.map((reading) =>
      reading.kind === "finite" ? reading.value : reading.kind,
    ),
  );
  const finite = readings
    .filter((reading) => reading.kind === "finite")
    .map((reading) => reading.value!);
  return {
    reading:
      identities.size > 1
        ? ({ kind: "conflict", value: null } as Reading)
        : readings[0],
    finite,
    invalid: readings.filter(
      (reading) => reading.kind !== "finite" && reading.kind !== "missing",
    ).length,
    missing: readings.filter((reading) => reading.kind === "missing").length,
  };
}

function sourceOrder(run: GeneratedRun) {
  return Array.from(run.columns.step.keys())
    .filter(
      (index) =>
        Number.isSafeInteger(run.columns.step[index]) &&
        run.columns.step[index] >= 0,
    )
    .sort(
      (left, right) =>
        run.columns.step[left] - run.columns.step[right] || left - right,
    );
}

function referenceSummary(run: GeneratedRun, order: number[]): RunSummary {
  const unique = new Set(order.map((index) => run.columns.step[index]));
  const steps = [...unique];
  const gaps = steps
    .slice(1)
    .map((step, index) => step - steps[index])
    .filter((distance) => distance > run.descriptor.expectedStepInterval);
  const summary: RunSummary = {
    rowCount: run.columns.step.length,
    uniqueSteps: unique.size,
    firstStep: steps[0] ?? 0,
    lastStep: steps.at(-1) ?? 0,
    duplicateRows: order.length - unique.size,
    rejectedRows: run.columns.step.length - order.length,
    gapCount: gaps.length,
    missingSteps: gaps.reduce(
      (sum, distance) =>
        sum + Math.ceil(distance / run.descriptor.expectedStepInterval) - 1,
      0,
    ),
    outOfOrder: order.some(
      (sourceIndex, index) => index > 0 && sourceIndex < order[index - 1],
    ),
    invalidCounts: { loss: 0, lr: 0, grad_norm: 0 },
    missingCounts: { loss: 0, lr: 0, grad_norm: 0 },
    conflictSteps: { loss: 0, lr: 0, grad_norm: 0 },
    latest: {
      loss: { kind: "missing", value: null },
      lr: { kind: "missing", value: null },
      grad_norm: { kind: "missing", value: null },
    },
    lastFinite: { loss: null, lr: null, grad_norm: null },
    extents: { loss: null, lr: null, grad_norm: null },
  };
  for (const { step, indexes } of referenceGroups(run, order)) {
    for (const metric of METRICS) {
      const group = referenceGroup(run, indexes, metric);
      summary.invalidCounts[metric] += group.invalid;
      summary.missingCounts[metric] += group.missing;
      if (group.reading.kind === "conflict") summary.conflictSteps[metric]++;
      summary.latest[metric] = group.reading;
      if (group.reading.kind === "finite")
        summary.lastFinite[metric] = { step, value: group.reading.value! };
      for (const value of group.finite) {
        const extent = summary.extents[metric];
        summary.extents[metric] = extent
          ? [Math.min(extent[0], value), Math.max(extent[1], value)]
          : [value, value];
      }
    }
  }
  return summary;
}

function referenceViewport(summary: RunSummary, requested: Viewport): Viewport {
  assert(
    Number.isSafeInteger(requested.start) &&
      Number.isSafeInteger(requested.end),
  );
  assert(requested.start <= requested.end);
  assert(Number.isFinite(requested.width) && requested.width > 0);
  const bound = (step: number) =>
    step < summary.firstStep
      ? summary.firstStep
      : step > summary.lastStep
        ? summary.lastStep
        : step;
  return {
    start: bound(requested.start),
    end: bound(requested.end),
    width: Math.max(1, Math.min(16_384, Math.floor(requested.width))),
  };
}

/** Exhaust small sources; sample large ones without making the audit quadratic. */
function inspectionGroups(run: GeneratedRun, order: number[]) {
  const selectedSteps = new Set<number>();
  if (order.length) {
    selectedSteps.add(run.columns.step[order[Math.floor(order.length / 2)]]);
    for (let sample = 0; sample < 32; sample++) {
      selectedSteps.add(
        run.columns.step[order[Math.floor((order.length - 1) * sample / 31)]],
      );
    }
  }
  const groups: {
    step: number;
    start: number;
    end: number;
    previous: number | null;
    next: number | null;
  }[] = [];
  let anomalyGroups = 0;
  for (let start = 0; start < order.length;) {
    const step = run.columns.step[order[start]];
    let end = start + 1;
    while (end < order.length && run.columns.step[order[end]] === step) end++;
    const anomalous =
      end - start > 1 ||
      METRICS.some(
        (metric) =>
          run.columns.missing[metric][order[start]] === 1 ||
          !Number.isFinite(run.columns[metric][order[start]]),
      );
    const includeAnomaly = anomalous && anomalyGroups < 16;
    if (includeAnomaly) anomalyGroups++;
    if (order.length <= 512 || selectedSteps.has(step) || includeAnomaly) {
      groups.push({
        step,
        start,
        end,
        previous: start > 0 ? run.columns.step[order[start - 1]] : null,
        next: end < order.length ? run.columns.step[order[end]] : null,
      });
    }
    start = end;
  }
  return groups;
}

type Point = [number, number];
const pointKey = ([step, value]: Point) => `${step}:${value}`;
// +0 and -0 share a numeric chart coordinate. Source-byte hashing separately
// verifies that their original IEEE representations are never rewritten.
const numericExtent = (extent: [number, number] | null) =>
  extent?.map((value) => (value === 0 ? 0 : value)) ?? null;

interface BucketEvidence {
  first: Point;
  last: Point;
  minimum: Point;
  maximum: Point;
}
function addBucket(
  buckets: Map<string, BucketEvidence>,
  key: string,
  point: Point,
) {
  const previous = buckets.get(key);
  if (!previous)
    buckets.set(key, {
      first: point,
      last: point,
      minimum: point,
      maximum: point,
    });
  else {
    previous.last = point;
    if (point[1] < previous.minimum[1]) previous.minimum = point;
    if (point[1] > previous.maximum[1]) previous.maximum = point;
  }
}

/** Independent source scans check facts and required selections, not exact reducer output. */
export function auditRun(run: GeneratedRun, viewports: Viewport[]) {
  const before = fingerprint(run);
  const order = sourceOrder(run);
  const expectedSummary = referenceSummary(run, order);
  const prepared = prepareRun(run);
  const comparableSummary = (summary: RunSummary) => ({
    ...summary,
    extents: Object.fromEntries(
      METRICS.map((metric) => [metric, numericExtent(summary.extents[metric])]),
    ),
  });
  assert.deepEqual(
    comparableSummary(prepared.summary),
    comparableSummary(expectedSummary),
    `${run.descriptor.id}: summary`,
  );
  assert.deepEqual(
    Array.from(prepared.order),
    order,
    `${run.descriptor.id}: sorted provenance`,
  );
  const rejected = Array.from(run.columns.step.keys()).filter(
    (index) =>
      !Number.isSafeInteger(run.columns.step[index]) ||
      run.columns.step[index] < 0,
  );
  assert.deepEqual(
    Array.from(prepared.rejectedSourceIndexes),
    rejected,
    "rejected source rows preserved",
  );
  let metricChecks = 0;
  let rangeFrames = 0;
  for (const requested of viewports) {
    const expectedViewport = referenceViewport(expectedSummary, requested);
    const frame = buildFrame(prepared, requested);
    assert.equal(frame.runId, run.descriptor.id, "frame run identity");
    assert.equal(
      frame.sourceVersion,
      run.descriptor.sourceVersion,
      "frame source version",
    );
    assert.deepEqual(
      frame.viewport,
      expectedViewport,
      "independently clamped requested viewport",
    );
    const { start, end, width } = expectedViewport;
    const visible = order.filter(
      (index) =>
        run.columns.step[index] >= start && run.columns.step[index] <= end,
    );
    assert.equal(
      frame.sourceCount,
      visible.length,
      "viewport source count includes duplicates",
    );
    assert.equal(
      frame.plottedCount,
      METRICS.reduce(
        (count, metric) =>
          count +
          frame.metrics[metric].points.length +
          frame.metrics[metric].conflicts.length,
        0,
      ),
    );
    for (const metric of METRICS) {
      const label = `${run.descriptor.id} ${metric} [${start},${end}] width=${width}`;
      const actual = frame.metrics[metric];
      const finitePoints = actual.points.filter(
        (point): point is Point => point[1] !== null,
      );
      const plotted = [...finitePoints, ...actual.conflicts];
      const plottedSteps = new Set(plotted.map(([step]) => step));
      const allowed = new Map<number, ReturnType<typeof referenceGroup>>();
      const segments = new Map<string, BucketEvidence>();
      const columns = new Map<string, BucketEvidence>();
      const breaks: number[] = [];
      const requiredConflicts = new Set<string>();
      let segment = 0;
      let previousStep: number | undefined;
      let minimum = Infinity;
      let maximum = -Infinity;
      let peak: { step: number; value: number } | null = null;
      let finiteCount = 0;
      let invalidCount = 0;
      let missingCount = 0;
      let conflictCount = 0;
      for (const { step, indexes } of referenceGroups(run, visible)) {
        const group = referenceGroup(run, indexes, metric);
        if (plottedSteps.has(step)) allowed.set(step, group);
        finiteCount += group.finite.length;
        invalidCount += group.invalid;
        missingCount += group.missing;
        if (group.reading.kind === "conflict") {
          conflictCount++;
          if (group.finite.length) {
            let low = Infinity;
            let high = -Infinity;
            for (const value of group.finite) {
              low = Math.min(low, value);
              high = Math.max(high, value);
            }
            requiredConflicts.add(pointKey([step, low]));
            requiredConflicts.add(pointKey([step, high]));
          }
        }
        const column =
          start === end
            ? Math.floor(width / 2)
            : Math.min(
                width - 1,
                Math.floor(width * ((step - start) / (end - start))),
              );
        for (const value of group.finite) {
          minimum = Math.min(minimum, value);
          if (value > maximum) {
            maximum = value;
            peak = { step, value };
          }
          addBucket(columns, String(column), [step, value]);
        }
        if (
          previousStep !== undefined &&
          step - previousStep > run.descriptor.expectedStepInterval
        ) {
          breaks.push(previousStep + run.descriptor.expectedStepInterval);
          segment++;
        }
        if (group.reading.kind !== "finite") {
          breaks.push(step);
          segment++;
        } else
          addBucket(segments, `${segment}/${column}`, [
            step,
            group.reading.value!,
          ]);
        previousStep = step;
      }
      assert.deepEqual(
        numericExtent(actual.domain),
        minimum === Infinity ? null : numericExtent([minimum, maximum]),
        `${label}: raw domain`,
      );
      assert.deepEqual(
        actual.peak,
        peak,
        `${label}: raw visible maximum and first step`,
      );
      assert.deepEqual(
        [
          actual.finiteCount,
          actual.invalidCount,
          actual.missingCount,
          actual.conflictCount,
        ],
        [finiteCount, invalidCount, missingCount, conflictCount],
        `${label}: independent quality counts`,
      );
      for (const [step, value] of plotted) {
        assert(
          Number.isFinite(value) &&
            Number.isSafeInteger(step) &&
            step >= start &&
            step <= end,
          `${label}: finite visible coordinates`,
        );
        assert(
          allowed.get(step)?.finite.includes(value),
          `${label}: every plotted point has unchanged raw provenance`,
        );
      }
      for (const [step, value] of actual.conflicts) {
        const group = allowed.get(step)!;
        assert.equal(
          group.reading.kind,
          "conflict",
          `${label}: conflict marker type`,
        );
        assert(
          group.finite.every((reading) => reading >= value) ||
            group.finite.every((reading) => reading <= value),
          `${label}: conflict extrema`,
        );
      }
      const selected = new Set(plotted.map(pointKey));
      if (actual.mode === "line") {
        const conflictMarkers = new Set(actual.conflicts.map(pointKey));
        for (const point of requiredConflicts) {
          assert(
            conflictMarkers.has(point),
            `${label}: finite conflict evidence omitted at ${point}`,
          );
        }
      }
      const expectedBuckets = actual.mode === "ranges" ? columns : segments;
      for (const evidence of expectedBuckets.values()) {
        const required =
          actual.mode === "ranges"
            ? [evidence.minimum, evidence.maximum]
            : [
                evidence.first,
                evidence.minimum,
                evidence.maximum,
                evidence.last,
              ];
        for (const point of required)
          assert(
            selected.has(pointKey(point)),
            `${label}: missing required source extremum/endpoint ${point}`,
          );
      }
      let previous: Point | undefined;
      let previousCoordinate = -Infinity;
      for (const [step, value] of actual.points) {
        assert(step >= previousCoordinate, `${label}: chronological drawing`);
        previousCoordinate = step;
        if (value === null) {
          previous = undefined;
          continue;
        }
        if (actual.mode === "line")
          assert.equal(
            allowed.get(step)?.reading.kind,
            "finite",
            `${label}: ambiguous/invalid group cannot join a line`,
          );
        if (previous) {
          assert.equal(
            actual.mode,
            "line",
            `${label}: range extrema must remain disconnected`,
          );
          assert(
            !breaks.some(
              (boundary) => boundary > previous![0] && boundary <= step,
            ),
            `${label}: connected across invalid/conflict/missing interval`,
          );
        }
        previous = [step, value];
      }
      assert(
        actual.points.length + actual.conflicts.length <=
          (actual.mode === "ranges" ? 4 : 8) * width,
        `${label}: bounded primitive count`,
      );
      if (actual.mode === "ranges") rangeFrames++;
      metricChecks++;
    }
  }
  const selectedGroups = inspectionGroups(run, order);
  let inspectionPages = 0;
  for (const group of selectedGroups) {
    const indexes = order.slice(group.start, group.end);
    const expectedReadings = Object.fromEntries(
      METRICS.map((metric) => [
        metric,
        referenceGroup(run, indexes, metric).reading,
      ]),
    );
    const pageCount = Math.ceil(indexes.length / 20);
    const pageNumbers =
      indexes.length <= 512
        ? Array.from({ length: pageCount }, (_, page) => page)
        : [...new Set([0, Math.floor(pageCount / 2), pageCount - 1])];
    for (const pageNumber of pageNumbers) {
      const offset = pageNumber * 20;
      const page = inspectStep(prepared, group.step, offset);
      const expectedRows = indexes.slice(offset, offset + 20).map(
        (sourceIndex) => ({
          sourceIndex,
          readings: Object.fromEntries(
            METRICS.map((metric) => [
              metric,
              referenceReading(run, sourceIndex, metric),
            ]),
          ),
        }),
      );
      assert.deepEqual(
        page,
        {
          requestedStep: group.step,
          step: group.step,
          previousStep: group.previous,
          nextStep: group.next,
          inGap: false,
          readings: expectedReadings,
          sourceRows: expectedRows,
          sourceCount: indexes.length,
          sourceOffset: offset,
        },
        `${run.descriptor.id}: exact inspection at step ${group.step}, source offset ${offset}`,
      );
      inspectionPages++;
    }
  }
  assert.equal(
    fingerprint(run),
    before,
    "preparation, reduction, and inspection must not mutate any source byte",
  );
  return {
    id: run.descriptor.id,
    sourceRows: run.columns.step.length,
    viewports: viewports.length,
    metricChecks,
    rangeFrames,
    inspectionGroups: selectedGroups.length,
    inspectionPages,
    rejectedRows: rejected.length,
    sourceSha256: before,
  };
}

export function fixtureViewports(run: GeneratedRun): Viewport[] {
  let last = 0;
  for (const step of run.columns.step)
    if (Number.isSafeInteger(step) && step > last) last = step;
  const middle = Math.floor(last / 2);
  return [
    { start: 0, end: last, width: 1 },
    { start: 0, end: last, width: 97 },
    { start: middle, end: Math.min(last, middle + 31), width: 7 },
    { start: last, end: last, width: 0.5 },
    { start: -100, end: last + 100, width: 320 },
  ];
}

/** Deterministic test-only data, independent of the production fixture PRNG. */
export function adversarialSource(seed: number): GeneratedRun {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const rows: ValidationRow[] = [];
  const values = [
    NaN,
    Infinity,
    -Infinity,
    0,
    -0,
    -1000,
    1e-280,
    -1e-280,
    1e280,
    -1e280,
    0.5,
    2,
  ];
  let step = 0;
  for (let index = 0; index < 80; index++) {
    step += next() % 7 === 0 ? 4 : 1;
    const row: ValidationRow = {
      step,
      loss: values[next() % values.length],
      lr: values[next() % values.length],
      grad_norm: values[next() % values.length],
    };
    if (next() % 5 === 0) row.missing = [METRICS[next() % METRICS.length]];
    rows.push(row);
    if (next() % 3 === 0)
      rows.push({
        ...row,
        missing: row.missing?.slice(),
        loss: next() % 2 ? row.loss : values[next() % values.length],
      });
  }
  for (const rejectedStep of [
    NaN,
    -1,
    0.25,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    rows.push({ step: rejectedStep, loss: 1e300, lr: 1e300, grad_norm: 1e300 });
  for (let index = rows.length - 1; index > 0; index--) {
    const swap = next() % (index + 1);
    [rows[index], rows[swap]] = [rows[swap], rows[index]];
  }
  return validationSource(rows);
}

export function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log([
      "Usage: npm run data:validate -- [--run <run-id>] [--seed <uint32>]",
      "Without selectors: validate all 20 fixtures and adversarial seeds 1–40.",
      "With selectors: validate only the specified cases; flags may repeat or combine.",
      "Each result includes a replay command. Any failed case produces exit status 1.",
    ].join("\n"));
    return;
  }
  const selected = selectValidationCases(args, RUN_MANIFEST.map(({ id }) => id));
  let revision: string | null = null;
  let workingTreeDirty: boolean | null = null;
  try {
    const options = { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" as const, stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"] };
    revision = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    workingTreeDirty = execFileSync("git", ["status", "--porcelain"], options).length > 0;
  } catch {
    // Source archives can be validated without Git; unavailable metadata stays explicit.
  }
  const report = collectValidationResults(selected, (selection) => {
    const run = selection.kind === "fixture"
      ? generateRun(selection.id)
      : adversarialSource(selection.seed);
    return auditRun(run, fixtureViewports(run));
  });
  console.log(
    JSON.stringify(
      {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        environment: { node: process.version, platform: process.platform, arch: process.arch },
        source: {
          revision, workingTreeDirty,
          datasetVersions: [...new Set(RUN_MANIFEST.map((run) => run.sourceVersion))],
          generatorVersions: [...new Set(RUN_MANIFEST.map((run) => run.generatorVersion))],
        },
        arguments: args,
        ...report,
        limitations:
          "Source and numerical engine validation only. Finite deterministic cases do not prove all inputs, painted chart geometry, async races, accessibility, browser performance, or memory budgets.",
      },
      null,
      2,
    ),
  );
  process.exitCode = report.passed ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
