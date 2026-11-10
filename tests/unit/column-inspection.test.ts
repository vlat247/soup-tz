import { describe, expect, it } from "vitest";
import { validationSource } from "../../scripts/validate-runs";
import { generateRun } from "../../src/features/runs/data/generate";
import { createBuckets, normalizeViewport } from "../../src/features/runs/model/buckets";
import { inspectColumn } from "../../src/features/runs/model/inspect-column";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { METRICS } from "../../src/features/runs/model/types";
import type { Viewport } from "../../src/features/runs/model/view-types";

function integerBucket(step: number, viewport: Viewport) {
  if (viewport.start === viewport.end) return Math.floor(viewport.width / 2);
  return Math.min(viewport.width - 1, Number(
    BigInt(step - viewport.start) * BigInt(viewport.width) / BigInt(viewport.end - viewport.start),
  ));
}

describe("exact source bucket geometry", () => {
  it.each([
    { start: 0, end: 49, width: 49 },
    { start: 0, end: 66, width: 22 },
    { start: 0, end: 97, width: 7 },
    { start: 0, end: 3, width: 100 },
    { start: Number.MAX_SAFE_INTEGER - 1000, end: Number.MAX_SAFE_INTEGER, width: 49 },
    { start: Number.MAX_SAFE_INTEGER - 1000, end: Number.MAX_SAFE_INTEGER, width: 16_384 },
  ])("matches independent integer arithmetic for %j", (viewport) => {
    const buckets = createBuckets(viewport);
    const span = viewport.end - viewport.start;
    for (let offset = 0; offset <= span; offset++) {
      const step = viewport.start + offset;
      const column = integerBucket(step, viewport);
      expect(buckets.index(step)).toBe(column);
      const range = buckets.range(column)!;
      expect(range[0]).toBeLessThanOrEqual(step);
      expect(range[1]).toBeGreaterThanOrEqual(step);
    }
  });

  it("matches BigInt at MAX_SAFE_INTEGER spans and every exact column boundary", () => {
    for (const width of [1, 3, 7, 49, 97, 16_384]) {
      const viewport = { start: 0, end: Number.MAX_SAFE_INTEGER, width };
      const buckets = createBuckets(viewport);
      for (let column = 0; column < width; column++) {
        const first = Number((BigInt(column) * BigInt(viewport.end) + BigInt(width - 1)) / BigInt(width));
        const last = column === width - 1 ? viewport.end :
          Number((BigInt(column + 1) * BigInt(viewport.end) + BigInt(width - 1)) / BigInt(width)) - 1;
        expect(buckets.range(column)).toEqual([first, last]);
        for (const step of [Math.max(0, first - 1), first, last, Math.min(viewport.end, last + 1)])
          expect(buckets.index(step)).toBe(integerBucket(step, viewport));
      }
    }
  });

  it("keeps singleton samples centered and records integer-empty columns", () => {
    const singleton = createBuckets({ start: 7, end: 7, width: 6 });
    expect(singleton.index(7)).toBe(3);
    expect(singleton.range(3)).toEqual([7, 7]);
    expect(singleton.range(2)).toBeNull();
    const sparse = createBuckets({ start: 0, end: 3, width: 100 });
    expect(sparse.index(1.5)).toBe(50);
    expect(sparse.range(50)).toBeNull();
    expect(sparse.range(99)).toEqual([3, 3]);
  });

  it("checks continuous gap overlap without rounding inverse pixel edges", () => {
    const buckets = createBuckets({ start: 0, end: 3, width: 100 });
    expect(buckets.intersectsGap(50, 0, 3)).toBe(true);
    expect(buckets.intersectsGap(0, 0, 3)).toBe(true);
    expect(buckets.intersectsGap(99, 0, 3)).toBe(true);
    const aligned = createBuckets({ start: 0, end: 10, width: 5 });
    expect(aligned.intersectsGap(1, 0, 2)).toBe(false);
    expect(aligned.intersectsGap(0, 2, 6)).toBe(false);
    expect(aligned.intersectsGap(1, 2, 6)).toBe(true);
    expect(aligned.intersectsGap(2, 2, 6)).toBe(true);
    expect(aligned.intersectsGap(3, 2, 6)).toBe(false);
  });

  it("matches independent rational gap overlap at tiny and maximum-safe spans", () => {
    for (const viewport of [
      { start: 0, end: 3, width: 100 },
      { start: 10, end: 59, width: 49 },
      { start: 0, end: Number.MAX_SAFE_INTEGER, width: 97 },
      { start: Number.MAX_SAFE_INTEGER - 100, end: Number.MAX_SAFE_INTEGER, width: 49 },
    ]) {
      const buckets = createBuckets(viewport);
      const span = BigInt(viewport.end - viewport.start);
      const width = BigInt(viewport.width);
      const middle = viewport.start + Math.floor((viewport.end - viewport.start) / 2);
      for (const [left, right] of [[viewport.start, viewport.end], [viewport.start, middle], [middle, viewport.end]]) {
        for (let column = 0; column < viewport.width; column++) {
          const expected = BigInt(left - viewport.start) * width < span * BigInt(column + 1) &&
            BigInt(right - viewport.start) * width > span * BigInt(column);
          expect(buckets.intersectsGap(column, left, right)).toBe(expected);
        }
      }
    }
  });

  it("normalizes geometry consistently before queries", () => {
    const summary = { firstStep: 10, lastStep: 20 };
    expect(normalizeViewport(summary, { start: -100, end: 100, width: 0.5 }))
      .toEqual({ start: 10, end: 20, width: 1 });
    expect(normalizeViewport(summary, { start: 12, end: 12, width: 20_000 }))
      .toEqual({ start: 12, end: 12, width: 16_384 });
  });

  it.each([
    { start: 0, end: 1, width: 0 }, { start: 0, end: 1, width: NaN },
    { start: 0, end: 1, width: Infinity }, { start: 2, end: 1, width: 10 },
    { start: 0.5, end: 1, width: 10 }, { start: 0, end: Infinity, width: 10 },
  ])("rejects malformed query geometry %j", (viewport) => {
    expect(() => normalizeViewport({ firstStep: 0, lastStep: 5 }, viewport)).toThrow(RangeError);
  });

  it("rejects noncanonical buckets and out-of-view or malformed positions", () => {
    expect(() => createBuckets({ start: -1, end: 5, width: 10 })).toThrow(RangeError);
    expect(() => createBuckets({ start: 0, end: 5, width: 1.5 })).toThrow(RangeError);
    const buckets = createBuckets({ start: 0, end: 5, width: 10 });
    for (const step of [-1, 6, NaN, Infinity]) expect(() => buckets.index(step)).toThrow(RangeError);
    for (const column of [-1, 10, 0.5, NaN]) expect(() => buckets.range(column)).toThrow(RangeError);
  });
});

describe("original source column facts", () => {
  it("includes finite conflict extrema and keeps each metric's quality independent", () => {
    const source = validationSource([
      { step: 2, loss: 2, lr: 2, grad_norm: 2 },
      { step: 0, loss: 5, lr: 0, grad_norm: 1 },
      { step: 1, loss: NaN, lr: Infinity, grad_norm: 2 },
      { step: 1, loss: 100, lr: Infinity, grad_norm: 2 },
      { step: 3, loss: 999, lr: 3, grad_norm: -Infinity, missing: ["loss"] },
      { step: NaN, loss: 1e300 },
    ]);
    const prepared = prepareRun(source);
    const result = inspectColumn(prepared, 1, { start: 0, end: 3, width: 1 })!;
    expect(result).toMatchObject({ sourceCount: 5, uniqueSteps: 4, duplicateRows: 1, gapCount: 0, stepRange: [0, 3] });
    expect(result.metrics.loss).toEqual({
      finiteCount: 3, invalidCount: 1, missingCount: 1, conflictSteps: 1,
      minimum: { step: 2, value: 2, sourceIndex: 0 },
      maximum: { step: 1, value: 100, sourceIndex: 3 },
    });
    expect(result.metrics.lr).toMatchObject({ finiteCount: 3, invalidCount: 2, missingCount: 0, conflictSteps: 0 });
    expect(result.metrics.grad_norm).toMatchObject({ finiteCount: 4, invalidCount: 1, missingCount: 0, conflictSteps: 0 });
    for (const metric of METRICS) {
      const facts = result.metrics[metric];
      expect(facts.finiteCount + facts.invalidCount + facts.missingCount).toBe(result.sourceCount);
    }
  });

  it("uses earliest step then original source index for tied extrema without changing signed zero", () => {
    const source = validationSource([
      { step: 2, loss: 4 }, { step: 0, loss: -0 }, { step: 0, loss: 0 },
      { step: 1, loss: -0 }, { step: 1, loss: 4 },
    ]);
    const arrays = [source.columns.step, ...METRICS.map((metric) => source.columns[metric])];
    const before = arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("hex"));
    const result = inspectColumn(prepareRun(source), 1, { start: 0, end: 2, width: 1 })!;
    expect(result.metrics.loss.minimum).toEqual({ step: 0, value: -0, sourceIndex: 1 });
    expect(result.metrics.loss.maximum).toEqual({ step: 1, value: 4, sourceIndex: 4 });
    expect(arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("hex"))).toEqual(before);
  });

  it("reports a gap for an empty column without substituting the nearest observation", () => {
    const prepared = prepareRun(validationSource([{ step: 0, loss: 5 }, { step: 100, loss: 2 }]));
    const result = inspectColumn(prepared, 50, { start: 0, end: 100, width: 10 })!;
    expect(result).toMatchObject({ column: 5, stepRange: [50, 59], sourceCount: 0, uniqueSteps: 0, duplicateRows: 0, gapCount: 1 });
    for (const metric of METRICS) expect(result.metrics[metric]).toEqual({
      finiteCount: 0, invalidCount: 0, missingCount: 0, conflictSteps: 0, minimum: null, maximum: null,
    });
    const narrow = inspectColumn(prepareRun(validationSource([{ step: 0, loss: 1 }, { step: 3, loss: 2 }])), 1.5,
      { start: 0, end: 3, width: 100 })!;
    expect(narrow).toMatchObject({ column: 50, stepRange: null, sourceCount: 0, gapCount: 1 });
  });

  it("counts gaps crossing range edges but not ordinary cadence spacing", () => {
    const prepared = prepareRun(validationSource([
      { step: 0, loss: 1 }, { step: 30, loss: 2 }, { step: 40, loss: 3 }, { step: 90, loss: 4 },
    ], 10));
    expect(inspectColumn(prepared, 35, { start: 20, end: 50, width: 1 })?.gapCount).toBe(2);
    expect(inspectColumn(prepared, 35, { start: 30, end: 40, width: 1 })?.gapCount).toBe(0);
    expect(inspectColumn(prepared, 10, { start: 10, end: 10, width: 7 }))
      .toMatchObject({ column: 3, sourceCount: 0, gapCount: 1 });
  });

  it("distinguishes all-invalid metrics from empty sources and out-of-view requests", () => {
    const prepared = prepareRun(validationSource([{ step: 0, loss: NaN }, { step: 1, loss: Infinity }]));
    const result = inspectColumn(prepared, 0, { start: 0, end: 1, width: 1 })!;
    expect(result.metrics.loss).toMatchObject({ finiteCount: 0, invalidCount: 2, minimum: null, maximum: null });
    expect(inspectColumn(prepared, 1, { start: 0, end: 0, width: 10 })).toBeNull();
    expect(inspectColumn(prepareRun(validationSource([])), 0, { start: 0, end: 0, width: 10 }))
      .toMatchObject({ sourceCount: 0, uniqueSteps: 0, gapCount: 0 });
    expect(() => inspectColumn(prepared, NaN, { start: 0, end: 1, width: 1 })).toThrow(RangeError);
  });

  it("finds the million-point spike even when another observation is nearest to the pointer", () => {
    const prepared = prepareRun(generateRun("run-020"));
    const result = inspectColumn(prepared, 499_999, { start: 0, end: 999_999, width: 97 })!;
    expect(result.metrics.loss.maximum).toEqual({ step: 500_000, value: 12, sourceIndex: 500_000 });
    expect(result.sourceCount).toBe(result.stepRange![1] - result.stepRange![0] + 1);
    expect(result.gapCount).toBe(0);
    expect(result.metrics.loss.finiteCount).toBe(result.sourceCount);
  });
});
