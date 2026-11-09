import type { RunSummary, Viewport } from "./view-types";

/** Normalize the shared query geometry once, before reduction or inspection. */
export function normalizeViewport(
  summary: Pick<RunSummary, "firstStep" | "lastStep">,
  requested: Viewport,
): Viewport {
  if (!requested || !Number.isSafeInteger(requested.start) || !Number.isSafeInteger(requested.end) || requested.start > requested.end)
    throw new RangeError("Viewport bounds must be ordered safe integer steps");
  if (!Number.isFinite(requested.width) || requested.width <= 0)
    throw new RangeError("Viewport width must be positive and finite");
  return {
    start: Math.max(summary.firstStep, Math.min(summary.lastStep, requested.start)),
    end: Math.max(summary.firstStep, Math.min(summary.lastStep, requested.end)),
    width: Math.min(16_384, Math.max(1, Math.floor(requested.width))),
  };
}

/** Exact integer source membership; fractional pointer positions use float projection. */
export function createBuckets(viewport: Viewport) {
  const { start, end, width } = viewport;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start ||
    !Number.isInteger(width) || width < 1 || width > 16_384)
    throw new RangeError("Buckets require a normalized viewport");
  const span = end - start;
  const quotient = Math.floor(span / width);
  const remainder = span % width;
  const center = Math.floor(width / 2);
  // c*quotient <= span and c*remainder <= width²: all integer intermediates
  // stay within safe precision, even when the source span is MAX_SAFE_INTEGER.
  const floorBoundary = (column: number) => column * quotient + Math.floor(column * remainder / width);
  const ceilBoundary = (column: number) => column * quotient + Math.ceil(column * remainder / width);
  const validColumn = (column: number) => {
    if (!Number.isInteger(column) || column < 0 || column >= width)
      throw new RangeError("Column must be inside the normalized viewport width");
  };
  return {
    index(step: number): number {
      if (!Number.isFinite(step) || step < start || step > end)
        throw new RangeError("Bucket step must be finite and inside the viewport");
      if (span === 0) return center;
      const offset = step - start;
      let column = Math.min(width - 1, Math.floor(offset / span * width));
      if (Number.isSafeInteger(step)) {
        // Division can round an exact boundary just below its integer column.
        // Correct the estimate using exact thresholds, rather than an epsilon.
        while (column > 0 && offset < ceilBoundary(column)) column--;
        while (column < width - 1 && offset >= ceilBoundary(column + 1)) column++;
      }
      return column;
    },
    /** Inclusive integer source-step range; a narrow empty column has no range. */
    range(column: number): [number, number] | null {
      validColumn(column);
      if (span === 0) return column === center ? [start, end] : null;
      const low = start + ceilBoundary(column);
      const high = column === width - 1 ? end : start + ceilBoundary(column + 1) - 1;
      return low <= high ? [low, high] : null;
    },
    /** Whether an open interval between integer observations touches this band. */
    intersectsGap(column: number, leftStep: number, rightStep: number): boolean {
      validColumn(column);
      if (!Number.isSafeInteger(leftStep) || !Number.isSafeInteger(rightStep) || leftStep < 0 || leftStep >= rightStep)
        throw new RangeError("Gap endpoints must be ordered nonnegative integer steps");
      if (span === 0)
        return column === center && leftStep < start && rightStep > start;
      return leftStep < start + ceilBoundary(column + 1) && rightStep > start + floorBoundary(column);
    },
  };
}
