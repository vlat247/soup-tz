import { METRICS, type GeneratedRun, type Metric } from "./types";
import type { Reading, ReadingKind, RunSummary } from "./view-types";

export interface IndexedRun {
  source: GeneratedRun;
  /** Source indexes in ascending (step, source index) order. */
  order: Uint32Array;
  /** Start of each unique-step group in order, followed by an end sentinel. */
  groupStarts: Uint32Array;
  rejectedSourceIndexes: Uint32Array;
}

export interface PreparedRun extends IndexedRun {
  summary: RunSummary;
}

export interface GroupStats {
  kind: ReadingKind;
  value: number | null;
  minimum: number;
  maximum: number;
  finiteCount: number;
  invalidCount: number;
  missingCount: number;
}

export function emptyGroupStats(): GroupStats {
  return {
    kind: "missing",
    value: null,
    minimum: Infinity,
    maximum: -Infinity,
    finiteCount: 0,
    invalidCount: 0,
    missingCount: 0,
  };
}

function readingKind(
  run: GeneratedRun,
  index: number,
  metric: Metric,
): ReadingKind {
  if (run.columns.missing[metric][index]) return "missing";
  const value = run.columns[metric][index];
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "positive-infinity";
  if (value === -Infinity) return "negative-infinity";
  return "finite";
}

export function readingAt(
  run: GeneratedRun,
  index: number,
  metric: Metric,
): Reading {
  const kind = readingKind(run, index, metric);
  return { kind, value: kind === "finite" ? run.columns[metric][index] : null };
}

export function groupStep(run: IndexedRun, group: number): number {
  return run.source.columns.step[run.order[run.groupStarts[group]]];
}

/** Reuses a caller-owned scratch record instead of allocating a record per row. */
export function scanGroup(
  run: IndexedRun,
  group: number,
  metric: Metric,
  result: GroupStats,
): void {
  const first = run.order[run.groupStarts[group]];
  const firstKind = readingKind(run.source, first, metric);
  const firstValue = run.source.columns[metric][first];
  result.kind = firstKind;
  result.value = firstKind === "finite" ? firstValue : null;
  result.minimum = Infinity;
  result.maximum = -Infinity;
  result.finiteCount = result.invalidCount = result.missingCount = 0;
  for (
    let position = run.groupStarts[group];
    position < run.groupStarts[group + 1];
    position++
  ) {
    const index = run.order[position];
    const kind = readingKind(run.source, index, metric);
    const value = run.source.columns[metric][index];
    if (kind !== firstKind || (kind === "finite" && value !== firstValue)) {
      result.kind = "conflict";
      result.value = null;
    }
    if (kind === "finite") {
      result.finiteCount++;
      if (value < result.minimum) result.minimum = value;
      if (value > result.maximum) result.maximum = value;
    } else if (kind === "missing") {
      result.missingCount++;
    } else {
      result.invalidCount++;
    }
  }
}

export function groupReading(
  run: IndexedRun,
  group: number,
  metric: Metric,
): Reading {
  const stats = emptyGroupStats();
  scanGroup(run, group, metric, stats);
  return { kind: stats.kind, value: stats.value };
}

function summarize(run: IndexedRun, outOfOrder: boolean): RunSummary {
  const count = run.groupStarts.length - 1;
  const summary: RunSummary = {
    rowCount: run.source.columns.step.length,
    uniqueSteps: count,
    firstStep: count ? groupStep(run, 0) : 0,
    lastStep: count ? groupStep(run, count - 1) : 0,
    duplicateRows: run.order.length - count,
    rejectedRows: run.rejectedSourceIndexes.length,
    gapCount: 0,
    missingSteps: 0,
    outOfOrder,
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
  const cadence = run.source.descriptor.expectedStepInterval;
  for (let group = 1; group < count; group++) {
    const distance = groupStep(run, group) - groupStep(run, group - 1);
    if (distance > cadence) {
      summary.gapCount++;
      summary.missingSteps += Math.max(0, Math.ceil(distance / cadence) - 1);
    }
  }
  const stats = emptyGroupStats();
  for (const metric of METRICS) {
    let minimum = Infinity;
    let maximum = -Infinity;
    let lastFiniteStep = -1;
    let lastFiniteValue = 0;
    for (let group = 0; group < count; group++) {
      scanGroup(run, group, metric, stats);
      summary.invalidCounts[metric] += stats.invalidCount;
      summary.missingCounts[metric] += stats.missingCount;
      if (stats.kind === "conflict") summary.conflictSteps[metric]++;
      if (stats.minimum < minimum) minimum = stats.minimum;
      if (stats.maximum > maximum) maximum = stats.maximum;
      if (stats.kind === "finite") {
        lastFiniteStep = groupStep(run, group);
        lastFiniteValue = stats.value!;
      }
    }
    if (count)
      summary.latest[metric] = { kind: stats.kind, value: stats.value };
    if (lastFiniteStep >= 0)
      summary.lastFinite[metric] = {
        step: lastFiniteStep,
        value: lastFiniteValue,
      };
    if (minimum !== Infinity) summary.extents[metric] = [minimum, maximum];
  }
  return summary;
}

export function prepareRun(source: GeneratedRun): PreparedRun {
  const { columns, descriptor } = source;
  const length = columns.step.length;
  if (length > 0xffff_ffff)
    throw new RangeError("Source exceeds 32-bit provenance capacity");
  if (
    !Number.isSafeInteger(descriptor.rowCount) ||
    descriptor.rowCount !== length
  ) {
    throw new RangeError(
      "Declared source row count must match the source columns",
    );
  }
  if (
    !Number.isSafeInteger(descriptor.expectedStepInterval) ||
    descriptor.expectedStepInterval <= 0
  ) {
    throw new RangeError(
      "Expected step interval must be a positive safe integer",
    );
  }
  for (const metric of METRICS) {
    if (
      columns[metric].length !== length ||
      columns.missing[metric].length !== length
    ) {
      throw new RangeError("Source columns must have equal lengths");
    }
    for (let index = 0; index < length; index++) {
      const missing = columns.missing[metric][index];
      if (missing !== 0 && missing !== 1) {
        throw new RangeError("Missing-value masks must contain only 0 or 1");
      }
    }
  }
  let validCount = 0;
  let previous = -1;
  let outOfOrder = false;
  for (let index = 0; index < length; index++) {
    const step = columns.step[index];
    if (!Number.isSafeInteger(step) || step < 0) continue;
    validCount++;
    if (step < previous) outOfOrder = true;
    previous = step;
  }
  const order = new Uint32Array(validCount);
  const rejectedSourceIndexes = new Uint32Array(length - validCount);
  let valid = 0;
  let rejected = 0;
  for (let index = 0; index < length; index++) {
    const step = columns.step[index];
    if (Number.isSafeInteger(step) && step >= 0) order[valid++] = index;
    else rejectedSourceIndexes[rejected++] = index;
  }
  if (outOfOrder)
    order.sort((a, b) => columns.step[a] - columns.step[b] || a - b);
  let groupCount = 0;
  for (let position = 0; position < order.length; position++) {
    if (
      !position ||
      columns.step[order[position]] !== columns.step[order[position - 1]]
    )
      groupCount++;
  }
  const groupStarts = new Uint32Array(groupCount + 1);
  let group = 0;
  for (let position = 0; position < order.length; position++) {
    if (
      !position ||
      columns.step[order[position]] !== columns.step[order[position - 1]]
    )
      groupStarts[group++] = position;
  }
  groupStarts[groupCount] = order.length;
  const indexed: IndexedRun = {
    source,
    order,
    groupStarts,
    rejectedSourceIndexes,
  };
  return { ...indexed, summary: summarize(indexed, outOfOrder) };
}

/** First group with a step >= target (or > target when strict is true). */
export function lowerBound(
  run: IndexedRun,
  target: number,
  strict = false,
): number {
  let low = 0;
  let high = run.groupStarts.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const step = groupStep(run, middle);
    if (step < target || (strict && step === target)) low = middle + 1;
    else high = middle;
  }
  return low;
}
