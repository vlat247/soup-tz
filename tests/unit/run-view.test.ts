import { beforeAll, describe, expect, it } from "vitest";
import { generateRun } from "../../src/features/runs/data/generate";
import { getRunDescriptor } from "../../src/features/runs/data/manifest";
import { formatReading, formatSnapshot, formatValue } from "../../src/features/runs/model/format";
import { inspectStep } from "../../src/features/runs/model/inspect";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { buildFrame } from "../../src/features/runs/model/reduce";
import { METRICS, type GeneratedRun, type Metric } from "../../src/features/runs/model/types";
import type { MetricFrame, Viewport } from "../../src/features/runs/model/view-types";

interface TestRow {
  step: number;
  loss: number;
  lr?: number;
  grad_norm?: number;
  missing?: Metric[];
}

// Handwritten source records are independent of fixture-generation mathematics.
function source(rows: TestRow[]): GeneratedRun {
  return {
    descriptor: { ...getRunDescriptor("run-001"), rowCount: rows.length, fixture: {} },
    columns: {
      step: Float64Array.from(rows, (row) => row.step),
      loss: Float64Array.from(rows, (row) => row.loss),
      lr: Float64Array.from(rows, (row) => row.lr ?? 0.001),
      grad_norm: Float64Array.from(rows, (row) => row.grad_norm ?? 1),
      missing: {
        loss: Uint8Array.from(rows, (row) => Number(row.missing?.includes("loss") ?? false)),
        lr: Uint8Array.from(rows, (row) => Number(row.missing?.includes("lr") ?? false)),
        grad_norm: Uint8Array.from(rows, (row) => Number(row.missing?.includes("grad_norm") ?? false)),
      },
    },
  };
}

function finitePoints(frame: MetricFrame): [number, number][] {
  return frame.points.filter((point): point is [number, number] => point[1] !== null);
}

function segments(frame: MetricFrame): [number, number][][] {
  const result: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const [step, value] of frame.points) {
    if (value === null) {
      if (current.length) result.push(current);
      current = [];
    } else {
      current.push([step, value]);
    }
  }
  if (current.length) result.push(current);
  return result;
}

describe("source preparation and exact summaries", () => {
  it("orders actual steps stably, collapses identical duplicates, and preserves source arrays", () => {
    const run = source([
      { step: 2, loss: 3 },
      { step: 0, loss: 5 },
      { step: 1, loss: 4 },
      { step: 1, loss: 4 },
      { step: 3, loss: 2 },
    ]);
    const originalSteps = run.columns.step.slice();
    const originalLoss = run.columns.loss.slice();
    const prepared = prepareRun(run);
    expect(prepared.summary).toMatchObject({
      rowCount: 5, uniqueSteps: 4, duplicateRows: 1, firstStep: 0, lastStep: 3,
      outOfOrder: true, gapCount: 0, missingSteps: 0,
      conflictSteps: { loss: 0, lr: 0, grad_norm: 0 },
    });
    expect(prepared.summary.extents.loss).toEqual([2, 5]);
    expect(inspectStep(prepared, 1).sourceRows.map((row) => row.sourceIndex)).toEqual([2, 3]);
    const frame = buildFrame(prepared, { start: 0, end: 3, width: 100 }, "raw");
    expect(finitePoints(frame.metrics.loss)).toEqual([[0, 5], [1, 4], [2, 3], [3, 2]]);
    expect(run.columns.step).toEqual(originalSteps);
    expect(run.columns.loss).toEqual(originalLoss);
  });

  it("resolves conflicts per metric without hiding raw extrema or choosing a latest winner", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: 10, lr: 0.01, grad_norm: 1 },
      { step: 1, loss: 1, lr: 0.01, grad_norm: 2 },
      { step: 1, loss: 100, lr: 0.01, grad_norm: 2 },
      { step: 2, loss: 5, lr: 0, grad_norm: 3 },
      { step: 3, loss: NaN, lr: 0, grad_norm: 4 },
      { step: 3, loss: 7, lr: 0, grad_norm: 4 },
    ]));
    expect(prepared.summary.conflictSteps).toEqual({ loss: 2, lr: 0, grad_norm: 0 });
    expect(prepared.summary.invalidCounts).toEqual({ loss: 1, lr: 0, grad_norm: 0 });
    expect(prepared.summary.latest.loss).toEqual({ kind: "conflict", value: null });
    expect(prepared.summary.lastFinite.loss).toEqual({ step: 2, value: 5 });
    expect(prepared.summary.latest.grad_norm).toEqual({ kind: "finite", value: 4 });
    expect(prepared.summary.extents).toEqual({ loss: [1, 100], lr: [0, 0.01], grad_norm: [1, 4] });

    const frame = buildFrame(prepared, { start: 0, end: 3, width: 100 });
    expect(frame.metrics.loss.domain).toEqual([1, 100]);
    expect(frame.metrics.loss.finiteCount).toBe(5);
    expect(frame.metrics.loss.conflicts).toEqual(expect.arrayContaining([[1, 1], [1, 100], [3, 7]]));
    expect(frame.metrics.loss.points).toEqual(expect.arrayContaining([[1, null], [3, null]]));
    expect(finitePoints(frame.metrics.loss)).toEqual([[0, 10], [2, 5]]);
    expect(finitePoints(frame.metrics.grad_norm)).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]]);
  });

  it.each([
    { label: "NaN", value: NaN, missing: false, kind: "nan" },
    { label: "+Infinity", value: Infinity, missing: false, kind: "positive-infinity" },
    { label: "-Infinity", value: -Infinity, missing: false, kind: "negative-infinity" },
    { label: "missing", value: NaN, missing: true, kind: "missing" },
  ])("keeps a latest $label state separate from the earlier finite value", ({ value, missing, kind }) => {
    const prepared = prepareRun(source([
      { step: 0, loss: 3 },
      { step: 1, loss: value, missing: missing ? ["loss"] : [] },
    ]));
    expect(prepared.summary.latest.loss).toEqual({ kind, value: null });
    expect(prepared.summary.lastFinite.loss).toEqual({ step: 0, value: 3 });
    expect(prepared.summary.extents.loss).toEqual([3, 3]);
    expect(prepared.summary.latest.lr).toEqual({ kind: "finite", value: 0.001 });
  });

  it("collapses identical invalid classes but distinguishes signed infinity and missing conflicts", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: NaN }, { step: 0, loss: NaN },
      { step: 1, loss: Infinity }, { step: 1, loss: Infinity },
      { step: 2, loss: Infinity }, { step: 2, loss: -Infinity },
      { step: 3, loss: NaN, missing: ["loss"] }, { step: 3, loss: NaN },
    ]));
    expect(inspectStep(prepared, 0).readings.loss.kind).toBe("nan");
    expect(inspectStep(prepared, 1).readings.loss.kind).toBe("positive-infinity");
    expect(inspectStep(prepared, 2).readings.loss.kind).toBe("conflict");
    expect(inspectStep(prepared, 3).readings.loss.kind).toBe("conflict");
    expect(prepared.summary.conflictSteps.loss).toBe(2);
    expect(prepared.summary.invalidCounts.loss).toBe(7);
    expect(prepared.summary.missingCounts.loss).toBe(1);
    expect(prepared.summary.extents.loss).toBeNull();
    expect(prepared.summary.lastFinite.loss).toBeNull();
  });

  it("rejects malformed steps without changing or erasing their source rows", () => {
    const run = source([
      { step: NaN, loss: 100 },
      { step: 2, loss: 3 },
      { step: -1, loss: 200 },
      { step: 1.5, loss: 300 },
      { step: Infinity, loss: 400 },
      { step: Number.MAX_SAFE_INTEGER + 1, loss: 500 },
      { step: 0, loss: 5 },
    ]);
    const prepared = prepareRun(run);
    expect(Array.from(prepared.rejectedSourceIndexes)).toEqual([0, 2, 3, 4, 5]);
    expect(prepared.summary).toMatchObject({ rowCount: 7, uniqueSteps: 2, firstStep: 0, lastStep: 2 });
    expect(prepared.summary.extents.loss).toEqual([3, 5]);
    expect(run.columns.loss[0]).toBe(100);
    expect(Number.isNaN(run.columns.step[0])).toBe(true);
    expect(buildFrame(prepared, { start: 0, end: 2, width: 100 }).metrics.loss.domain).toEqual([3, 5]);
  });
});

describe("truthful frame geometry", () => {
  it("breaks at NaN, both infinities, and missing values without inventing zeros", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: 4 }, { step: 1, loss: NaN },
      { step: 2, loss: 3 }, { step: 3, loss: Infinity },
      { step: 4, loss: 2 }, { step: 5, loss: -Infinity },
      { step: 6, loss: 1 }, { step: 7, loss: NaN, missing: ["loss"] },
      { step: 8, loss: 0 },
    ]));
    const loss = buildFrame(prepared, { start: 0, end: 8, width: 100 }).metrics.loss;
    expect(loss.domain).toEqual([0, 4]);
    expect(loss.invalidCount).toBe(3);
    expect(loss.missingCount).toBe(1);
    expect(loss.finiteCount).toBe(5);
    expect(finitePoints(loss)).toEqual([[0, 4], [2, 3], [4, 2], [6, 1], [8, 0]]);
    expect(loss.points).toEqual(expect.arrayContaining([[1, null], [3, null], [5, null], [7, null]]));
    expect(segments(loss).every((segment) => segment.length === 1)).toBe(true);
    expect(loss.points.every(([, value]) => value === null || Number.isFinite(value))).toBe(true);
  });

  it("breaks a known-cadence gap while keeping a singleton segment represented", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: 3 }, { step: 1, loss: 2 }, { step: 5, loss: 1 },
    ]));
    expect(prepared.summary.gapCount).toBe(1);
    expect(prepared.summary.missingSteps).toBe(3);
    const loss = buildFrame(prepared, { start: 0, end: 5, width: 100 }).metrics.loss;
    expect(loss.points).toContainEqual([2, null]);
    expect(segments(loss)).toEqual([[[0, 3], [1, 2]], [[5, 1]]]);
  });

  it("preserves first/minimum/maximum/last source positions in chronological order", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: 9 }, { step: 1, loss: 100 }, { step: 2, loss: 4 },
      { step: 3, loss: 1 }, { step: 4, loss: 8 },
    ]));
    const loss = buildFrame(prepared, { start: 0, end: 4, width: 1 }).metrics.loss;
    expect(loss.mode).toBe("line");
    expect(finitePoints(loss)).toEqual([[0, 9], [1, 100], [3, 1], [4, 8]]);
    expect(loss.domain).toEqual([1, 100]);
    expect(loss.peak).toEqual({ step: 1, value: 100 });
  });

  it("reduces each metric independently so a gradient-only spike survives", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: 8, grad_norm: 1 }, { step: 1, loss: 7, grad_norm: 1 },
      { step: 2, loss: 6, grad_norm: 99 }, { step: 3, loss: 1, grad_norm: 1 },
      { step: 4, loss: 2, grad_norm: 1 },
    ]));
    const frame = buildFrame(prepared, { start: 0, end: 4, width: 1 });
    expect(finitePoints(frame.metrics.loss)).not.toContainEqual([2, 6]);
    expect(finitePoints(frame.metrics.grad_norm)).toContainEqual([2, 99]);
    expect(frame.metrics.grad_norm.domain).toEqual([1, 99]);
  });

  it("derives exact viewport bounds from raw readings and excludes an outside peak", () => {
    const prepared = prepareRun(source([
      { step: 0, loss: 1 }, { step: 1, loss: 100 },
      { step: 2, loss: -2 }, { step: 3, loss: 0 },
    ]));
    const viewport = { start: 2, end: 3, width: 1 };
    const reduced = buildFrame(prepared, viewport);
    const raw = buildFrame(prepared, viewport, "raw");
    expect(reduced.metrics.loss.domain).toEqual([-2, 0]);
    expect(reduced.metrics.loss.domain).toEqual(raw.metrics.loss.domain);
    expect(finitePoints(reduced.metrics.loss)).toEqual([[2, -2], [3, 0]]);
    expect(reduced.metrics.loss.peak).toEqual({ step: 3, value: 0 });
    expect(prepared.summary.extents.loss).toEqual([-2, 100]);
  });

  it("represents constant, all-invalid, and empty inputs without fabricated data values", () => {
    const constant = prepareRun(source([{ step: 8, loss: 0.75 }]));
    const one = buildFrame(constant, { start: 8, end: 8, width: 100 }).metrics.loss;
    expect(one.domain).toEqual([0.75, 0.75]);
    expect(finitePoints(one)).toEqual([[8, 0.75]]);

    const invalid = prepareRun(source([{ step: 0, loss: NaN }, { step: 1, loss: Infinity }]));
    const none = buildFrame(invalid, { start: 0, end: 1, width: 100 }).metrics.loss;
    expect(none.domain).toBeNull();
    expect(none.peak).toBeNull();
    expect(none.finiteCount).toBe(0);
    expect(finitePoints(none)).toEqual([]);
    expect(invalid.summary.lastFinite.loss).toBeNull();

    const empty = prepareRun(source([]));
    expect(empty.summary.uniqueSteps).toBe(0);
    for (const metric of METRICS) {
      expect(buildFrame(empty, { start: 0, end: 0, width: 100 }).metrics[metric].domain).toBeNull();
    }
    expect(() => inspectStep(empty, 0)).toThrow(RangeError);
  });

  it("clamps a valid viewport and rejects invalid dimensions and range values", () => {
    const prepared = prepareRun(source([{ step: 2, loss: 2 }, { step: 3, loss: 1 }]));
    expect(buildFrame(prepared, { start: -20, end: 100, width: 0.5 }).viewport).toEqual({ start: 2, end: 3, width: 1 });
    for (const viewport of [
      { start: 2, end: 3, width: 0 }, { start: 2, end: 3, width: -1 },
      { start: 2, end: 3, width: Infinity }, { start: 2, end: 3, width: NaN },
      { start: 3, end: 2, width: 100 }, { start: NaN, end: 3, width: 100 },
      { start: 2.5, end: 3, width: 100 },
    ]) {
      expect(() => buildFrame(prepared, viewport)).toThrow(RangeError);
    }
  });

  it("bounds highly fragmented output without connecting across invalid readings", () => {
    const rows = Array.from({ length: 100 }, (_, step) => ({ step, loss: step % 2 ? NaN : step + 1 }));
    const frame = buildFrame(prepareRun(source(rows)), { start: 0, end: 99, width: 1 }).metrics.loss;
    expect(frame.mode).toBe("ranges");
    expect(frame.points.length + frame.conflicts.length).toBeLessThanOrEqual(4);
    expect(frame.domain).toEqual([1, 99]);
    expect(frame.invalidCount).toBe(50);
    expect(finitePoints(frame)).toEqual(expect.arrayContaining([[0, 1], [98, 99]]));
    expect(segments(frame).every((segment) => segment.length === 1)).toBe(true);
  });

  it("includes conflict markers in the fragmentation budget and retains their exact extrema", () => {
    const rows = Array.from({ length: 100 }, (_, step) => [
      { step, loss: step }, { step, loss: step + 100 },
    ]).flat();
    const frame = buildFrame(prepareRun(source(rows)), { start: 0, end: 99, width: 1 }).metrics.loss;
    expect(frame.mode).toBe("ranges");
    expect(frame.points.length + frame.conflicts.length).toBeLessThanOrEqual(4);
    expect(frame.domain).toEqual([0, 199]);
    expect(frame.conflictCount).toBe(100);
    expect(frame.finiteCount).toBe(200);
    expect(finitePoints(frame)).toEqual(expect.arrayContaining([[0, 0], [99, 199]]));
    expect(segments(frame).every((segment) => segment.length === 1)).toBe(true);
  });
});

describe("exact source inspection", () => {
  it("uses the lower step for ties, identifies gaps, and retains duplicate provenance", () => {
    const prepared = prepareRun(source([
      { step: 4, loss: 2 }, { step: 2, loss: 3 },
      { step: 0, loss: 4 }, { step: 2, loss: 8 },
    ]));
    const tie = inspectStep(prepared, 1);
    expect(tie).toMatchObject({ requestedStep: 1, step: 0, inGap: true, sourceCount: 1 });
    expect(tie.readings.loss).toEqual({ kind: "finite", value: 4 });
    expect(inspectStep(prepared, 3).step).toBe(2);

    const conflict = inspectStep(prepared, 2);
    expect(conflict.inGap).toBe(false);
    expect(conflict.sourceCount).toBe(2);
    expect(conflict.readings.loss).toEqual({ kind: "conflict", value: null });
    expect(conflict.sourceRows.map((row) => row.sourceIndex)).toEqual([1, 3]);
    expect(conflict.sourceRows.map((row) => row.readings.loss)).toEqual([
      { kind: "finite", value: 3 }, { kind: "finite", value: 8 },
    ]);
  });
});

describe("numerical and time presentation", () => {
  it("does not round tiny positive or negative readings to an apparent zero", () => {
    for (const value of [1e-8, -1e-8, 1e-12, -1e-12]) {
      expect(Number(formatValue(value))).toBe(value);
      expect(Number(formatValue(value, "lr"))).toBe(value);
    }
    expect(formatValue(0)).toBe("0");
    expect(formatReading({ kind: "nan", value: null })).toBe("NaN");
    expect(formatReading({ kind: "positive-infinity", value: null })).toBe("+Infinity");
    expect(formatReading({ kind: "negative-infinity", value: null })).toContain("Infinity");
    expect(formatReading({ kind: "missing", value: null })).toBe("Missing");
    expect(formatReading({ kind: "conflict", value: null })).toBe("Conflicting");
  });

  it("formats the same source instant in UTC across a date-boundary offset", () => {
    const utc = formatSnapshot("2026-11-01T23:30:00.000Z");
    expect(utc).toContain("Nov 1");
    expect(utc).toContain("23:30");
    expect(utc.endsWith(" UTC")).toBe(true);
    expect(formatSnapshot("2026-11-02T04:30:00.000+05:00")).toBe(utc);
  });
});

describe("million-point spike preservation", () => {
  let prepared: ReturnType<typeof prepareRun>;
  beforeAll(() => {
    prepared = prepareRun(generateRun("run-020"));
  });

  const intervals: [number, number][] = [
    [0, 999_999], [0, 500_000], [500_000, 999_999],
    [499_998, 500_002], [500_000, 500_000],
  ];
  const viewports: Viewport[] = intervals.flatMap(([start, end]) =>
    [1, 2, 17, 320, 1024].map((width) => ({ start, end, width })),
  );

  it.each(viewports)("retains the exact spike in [$start, $end] at width $width", (viewport) => {
    const loss = buildFrame(prepared, viewport).metrics.loss;
    expect(finitePoints(loss)).toContainEqual([500_000, 12]);
    expect(loss.domain?.[1]).toBe(12);
    expect(loss.peak).toEqual({ step: 500_000, value: 12 });
    const plottedSteps = finitePoints(loss).map(([step]) => step);
    expect(plottedSteps.every((step, index) => index === 0 || step >= plottedSteps[index - 1])).toBe(true);
    expect(plottedSteps.every((step) => step >= viewport.start && step <= viewport.end)).toBe(true);
  });

  it("does not leak an excluded spike into the visible domain or inspection values", () => {
    const loss = buildFrame(prepared, { start: 0, end: 499_999, width: 320 }).metrics.loss;
    expect(finitePoints(loss).some(([step]) => step === 500_000)).toBe(false);
    expect(loss.domain![1]).toBeLessThan(2);
    expect(inspectStep(prepared, 500_000).readings.loss).toEqual({ kind: "finite", value: 12 });
    expect(inspectStep(prepared, 499_999).readings.loss.value).toBe(prepared.source.columns.loss[499_999]);
  });
});
