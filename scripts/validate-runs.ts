import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
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
    const frame = buildFrame(prepared, requested);
    const { start, end, width } = frame.viewport;
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
  if (order.length) {
    for (const step of [expectedSummary.firstStep, expectedSummary.lastStep]) {
      const expectedIndexes = order.filter(
        (index) => run.columns.step[index] === step,
      );
      const inspected: number[] = [];
      for (let offset = 0; offset < expectedIndexes.length; offset += 20) {
        const page = inspectStep(prepared, step, offset);
        assert.equal(page.sourceOffset, offset);
        inspected.push(...page.sourceRows.map((row) => row.sourceIndex));
      }
      assert.deepEqual(
        inspected,
        expectedIndexes,
        "every duplicate remains reachable by paging",
      );
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
  const reports = RUN_MANIFEST.map(({ id }) => {
    const run = generateRun(id);
    return auditRun(run, fixtureViewports(run));
  });
  const adversarial = Array.from({ length: 40 }, (_, index) => {
    const run = adversarialSource(index + 1);
    return auditRun(run, fixtureViewports(run));
  });
  console.log(
    JSON.stringify(
      {
        passed: true,
        fixtures: reports,
        fixtureRows: reports.reduce(
          (sum, report) => sum + report.sourceRows,
          0,
        ),
        adversarialSeeds: [1, 40],
        adversarialCases: adversarial.length,
        viewportChecks: [...reports, ...adversarial].reduce(
          (sum, report) => sum + report.viewports,
          0,
        ),
        metricChecks: [...reports, ...adversarial].reduce(
          (sum, report) => sum + report.metricChecks,
          0,
        ),
        fragmentedMetricFrames: [...reports, ...adversarial].reduce(
          (sum, report) => sum + report.rangeFrames,
          0,
        ),
        limitations:
          "Source and numerical engine validation only. Finite deterministic cases do not prove all inputs, painted chart geometry, async races, accessibility, browser performance, or memory budgets.",
      },
      null,
      2,
    ),
  );
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
