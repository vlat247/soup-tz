import { createBuckets, normalizeViewport } from "./buckets";
import { emptyGroupStats, groupStep, lowerBound, scanGroup, type PreparedRun } from "./prepare";
import { METRICS, type Metric } from "./types";
import type { ColumnInspection, ColumnMetric, Viewport } from "./view-types";

function emptyMetric(): ColumnMetric {
  return { finiteCount: 0, invalidCount: 0, missingCount: 0, conflictSteps: 0, minimum: null, maximum: null };
}

/** Query original rows in the requested drawing column, never the reduced vertices. */
export function inspectColumn(run: PreparedRun, requestedStep: number, requestedViewport: Viewport): ColumnInspection | null {
  if (!Number.isFinite(requestedStep)) throw new RangeError("Inspection step must be finite");
  const viewport = normalizeViewport(run.summary, requestedViewport);
  if (requestedStep < viewport.start || requestedStep > viewport.end) return null;
  const buckets = createBuckets(viewport);
  const column = buckets.index(requestedStep);
  const stepRange = buckets.range(column);
  const first = lowerBound(run, stepRange?.[0] ?? requestedStep);
  const end = stepRange ? lowerBound(run, stepRange[1], true) : first;
  const sourceCount = run.groupStarts[end] - run.groupStarts[first];
  const result: ColumnInspection = {
    viewport, column, stepRange, sourceCount, uniqueSteps: end - first,
    duplicateRows: sourceCount - (end - first), gapCount: 0,
    metrics: { loss: emptyMetric(), lr: emptyMetric(), grad_norm: emptyMetric() },
  };
  const groupCount = run.groupStarts.length - 1;
  const cadence = run.source.descriptor.expectedStepInterval;
  // Neighbors reveal a gap even when no observed step falls inside this column.
  for (let group = Math.max(0, first - 1); group < Math.min(groupCount - 1, end); group++) {
    const left = groupStep(run, group);
    const right = groupStep(run, group + 1);
    if (right - left > cadence && buckets.intersectsGap(column, left, right)) result.gapCount++;
  }
  const stats = emptyGroupStats();
  const sourceIndexFor = (group: number, metric: Metric, value: number) => {
    for (let position = run.groupStarts[group]; position < run.groupStarts[group + 1]; position++) {
      const sourceIndex = run.order[position];
      if (!run.source.columns.missing[metric][sourceIndex] && run.source.columns[metric][sourceIndex] === value)
        return sourceIndex;
    }
    throw new Error("A finite source extremum must have original-row provenance");
  };
  for (let group = first; group < end; group++) {
    const step = groupStep(run, group);
    for (const metric of METRICS) {
      scanGroup(run, group, metric, stats);
      const facts = result.metrics[metric];
      facts.finiteCount += stats.finiteCount;
      facts.invalidCount += stats.invalidCount;
      facts.missingCount += stats.missingCount;
      if (stats.kind === "conflict") facts.conflictSteps++;
      if (stats.finiteCount && (!facts.minimum || stats.minimum < facts.minimum.value))
        facts.minimum = { step, value: stats.minimum, sourceIndex: sourceIndexFor(group, metric, stats.minimum) };
      if (stats.finiteCount && (!facts.maximum || stats.maximum > facts.maximum.value))
        facts.maximum = { step, value: stats.maximum, sourceIndex: sourceIndexFor(group, metric, stats.maximum) };
    }
  }
  return result;
}
