import { createBuckets } from "./buckets";
import { METRICS } from "./types";
import type { ColumnInspection, RunSummary, SourceExtremum, Viewport } from "./view-types";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Verify the bounded column reply belongs to the requested committed geometry. */
export function isColumnInspection(
  value: unknown,
  summary: RunSummary,
  viewport: Viewport,
  requestedStep: number,
): value is ColumnInspection | null {
  if (requestedStep < viewport.start || requestedStep > viewport.end) return value === null;
  if (!record(value) || !record(value.viewport)) return false;
  const column = value as unknown as ColumnInspection;
  if (column.viewport.start !== viewport.start || column.viewport.end !== viewport.end ||
    column.viewport.width !== viewport.width) return false;
  const buckets = createBuckets(viewport);
  const expectedIndex = buckets.index(requestedStep);
  const expectedRange = buckets.range(expectedIndex);
  if (column.column !== expectedIndex || (expectedRange === null ? column.stepRange !== null :
    !Array.isArray(column.stepRange) || column.stepRange.length !== 2 ||
    column.stepRange[0] !== expectedRange[0] || column.stepRange[1] !== expectedRange[1])) return false;
  if (![column.sourceCount, column.uniqueSteps, column.duplicateRows, column.gapCount].every(count) ||
    column.sourceCount > summary.rowCount - summary.rejectedRows || column.uniqueSteps > summary.uniqueSteps ||
    column.uniqueSteps + column.duplicateRows !== column.sourceCount || column.duplicateRows > summary.duplicateRows ||
    column.gapCount > summary.gapCount || (!expectedRange && column.sourceCount !== 0) || !record(column.metrics)) return false;
  const extremum = (entry: unknown, domain: [number, number] | null): entry is SourceExtremum =>
    record(entry) && !!expectedRange && count(entry.step) && entry.step >= expectedRange[0] && entry.step <= expectedRange[1] &&
    count(entry.sourceIndex) && entry.sourceIndex < summary.rowCount && typeof entry.value === "number" &&
    Number.isFinite(entry.value) && !!domain && entry.value >= domain[0] && entry.value <= domain[1];
  for (const metric of METRICS) {
    const facts = column.metrics[metric];
    if (!record(facts) || ![facts.finiteCount, facts.invalidCount, facts.missingCount, facts.conflictSteps].every(count) ||
      facts.finiteCount + facts.invalidCount + facts.missingCount !== column.sourceCount ||
      facts.invalidCount > summary.invalidCounts[metric] || facts.missingCount > summary.missingCounts[metric] ||
      facts.conflictSteps > Math.min(column.uniqueSteps, column.duplicateRows, summary.conflictSteps[metric])) return false;
    if (facts.finiteCount === 0) {
      if (facts.minimum !== null || facts.maximum !== null) return false;
    } else if (!extremum(facts.minimum, summary.extents[metric]) || !extremum(facts.maximum, summary.extents[metric]) ||
      facts.minimum.value > facts.maximum.value) return false;
  }
  return true;
}
