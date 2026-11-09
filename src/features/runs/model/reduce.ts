import { METRICS, type Metric } from "./types";
import { emptyGroupStats, groupStep, lowerBound, scanGroup, type PreparedRun } from "./prepare";
import type { MetricFrame, RunFrame, Viewport } from "./view-types";

function clampViewport(run: PreparedRun, requested: Viewport): Viewport {
  if (!Number.isSafeInteger(requested.start) || !Number.isSafeInteger(requested.end) || requested.start > requested.end) {
    throw new RangeError("Viewport bounds must be ordered safe integer steps");
  }
  if (!Number.isFinite(requested.width) || requested.width <= 0) {
    throw new RangeError("Viewport width must be positive and finite");
  }
  const { firstStep, lastStep } = run.summary;
  return {
    start: Math.max(firstStep, Math.min(lastStep, requested.start)),
    end: Math.max(firstStep, Math.min(lastStep, requested.end)),
    width: Math.min(16_384, Math.max(1, Math.floor(requested.width))),
  };
}

function metricFrame(run: PreparedRun, metric: Metric, viewport: Viewport, first: number, end: number, raw: boolean): MetricFrame {
  const result: MetricFrame = {
    points: [], conflicts: [], domain: null,
    finiteCount: 0, invalidCount: 0, missingCount: 0, conflictCount: 0,
    mode: "line", peak: null,
  };
  const width = viewport.width;
  const span = viewport.end - viewport.start;
  const bucketFor = (step: number) => span === 0 ? Math.floor(width / 2)
    : Math.min(width - 1, Math.max(0, Math.floor((step - viewport.start) / span * width)));
  const minValues = new Float64Array(width).fill(Infinity);
  const maxValues = new Float64Array(width).fill(-Infinity);
  const minSteps = new Float64Array(width);
  const maxSteps = new Float64Array(width);
  const stats = emptyGroupStats();
  let minimum = Infinity;
  let maximum = -Infinity;
  let previousStep = -1;
  let activeBucket = -1;
  let firstGroup = -1;
  let minGroup = -1;
  let maxGroup = -1;
  let lastGroup = -1;
  let bucketMin = Infinity;
  let bucketMax = -Infinity;

  const valueAt = (group: number) => run.source.columns[metric][run.order[run.groupStarts[group]]];
  const flush = () => {
    if (firstGroup < 0) return;
    if (result.mode === "line") {
      // Select by extrema, emit by chronology; repeated indexes appear once.
      const selected = [firstGroup, minGroup, maxGroup, lastGroup].sort((a, b) => a - b);
      let previous = -1;
      for (const group of selected) {
        if (group !== previous) result.points.push([groupStep(run, group), valueAt(group)]);
        previous = group;
      }
    }
    firstGroup = minGroup = maxGroup = lastGroup = -1;
    activeBucket = -1;
    bucketMin = Infinity;
    bucketMax = -Infinity;
  };
  const enforceBudget = () => {
    if (!raw && result.mode === "line" && result.points.length + result.conflicts.length > 8 * width) {
      result.mode = "ranges";
      result.points = [];
      result.conflicts = [];
      firstGroup = minGroup = maxGroup = lastGroup = -1;
    }
  };

  for (let group = first; group < end; group++) {
    const step = groupStep(run, group);
    const bucket = bucketFor(step);
    scanGroup(run, group, metric, stats);
    result.finiteCount += stats.finiteCount;
    result.invalidCount += stats.invalidCount;
    result.missingCount += stats.missingCount;
    if (stats.kind === "conflict") result.conflictCount++;
    if (stats.minimum < minimum) minimum = stats.minimum;
    if (stats.maximum > maximum) {
      maximum = stats.maximum;
      result.peak = { step, value: maximum };
    }
    // Always keep a bounded fallback, including finite conflicting observations.
    if (stats.minimum < minValues[bucket]) {
      minValues[bucket] = stats.minimum;
      minSteps[bucket] = step;
    }
    if (stats.maximum > maxValues[bucket]) {
      maxValues[bucket] = stats.maximum;
      maxSteps[bucket] = step;
    }
    if (result.mode === "ranges") continue;

    if (previousStep >= 0 && step - previousStep > run.source.descriptor.expectedStepInterval) {
      flush();
      result.points.push([previousStep + run.source.descriptor.expectedStepInterval, null]);
    }
    previousStep = step;
    if (stats.kind !== "finite") {
      flush();
      result.points.push([step, null]);
      if (stats.kind === "conflict" && stats.finiteCount) {
        result.conflicts.push([step, stats.minimum]);
        if (stats.maximum !== stats.minimum) result.conflicts.push([step, stats.maximum]);
      }
      enforceBudget();
      continue;
    }
    if (raw) {
      result.points.push([step, stats.value]);
      continue;
    }
    if (bucket !== activeBucket) flush();
    if (firstGroup < 0) {
      firstGroup = group;
      activeBucket = bucket;
    }
    lastGroup = group;
    if (stats.value! < bucketMin) { bucketMin = stats.value!; minGroup = group; }
    if (stats.value! > bucketMax) { bucketMax = stats.value!; maxGroup = group; }
    enforceBudget();
  }
  flush();
  enforceBudget();
  if (result.mode === "ranges") {
    for (let bucket = 0; bucket < width; bucket++) {
      if (minValues[bucket] === Infinity) continue;
      const low: [number, number] = [minSteps[bucket], minValues[bucket]];
      const high: [number, number] = [maxSteps[bucket], maxValues[bucket]];
      const points = low[0] <= high[0] ? [low, high] : [high, low];
      result.points.push(points[0], [points[0][0], null]);
      if (low[0] !== high[0] || low[1] !== high[1]) {
        result.points.push(points[1], [points[1][0], null]);
      }
    }
  }
  if (minimum !== Infinity) result.domain = [minimum, maximum];
  return result;
}

/** Recompute from preserved source on each viewport, never from prior output. */
export function buildFrame(run: PreparedRun, requested: Viewport, mode: "reduced" | "raw" = "reduced"): RunFrame {
  const viewport = clampViewport(run, requested);
  const first = lowerBound(run, viewport.start);
  const end = lowerBound(run, viewport.end, true);
  const metrics = {} as Record<Metric, MetricFrame>;
  let plottedCount = 0;
  for (const metric of METRICS) {
    metrics[metric] = metricFrame(run, metric, viewport, first, end, mode === "raw");
    plottedCount += metrics[metric].points.length + metrics[metric].conflicts.length;
  }
  return {
    runId: run.source.descriptor.id,
    sourceVersion: run.source.descriptor.sourceVersion,
    viewport,
    metrics,
    sourceCount: run.groupStarts[end] - run.groupStarts[first],
    plottedCount,
  };
}
