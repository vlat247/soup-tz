import { describe, expect, it } from "vitest";
import { init, use as registerECharts } from "echarts/core";
import { LineChart, ScatterChart, type LineSeriesOption, type ScatterSeriesOption } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import {
  AXIS_FONT_SIZE, AXIS_LABEL_MARGIN, buildMetricChartModel, drawablePlotWidth,
  gridForAxis, makeAxis, metricDomain, zoomStepRange, type MetricChartModel,
} from "../../src/features/charts/chart-model";
import type { MetricFrame, Viewport } from "../../src/features/runs/model/view-types";

// SSR exercises the installed ECharts scale/layout engine without a DOM or
// browser automation. It does not establish what the Canvas renderer paints.
registerECharts([LineChart, ScatterChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);

const viewport: Viewport = { start: 0, end: 4, width: 300 };
function frame(overrides: Partial<MetricFrame> = {}): MetricFrame {
  return {
    domain: [0, 4], points: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    conflicts: [], finiteCount: 5, invalidCount: 0, missingCount: 0,
    conflictCount: 0, mode: "line", peak: { step: 4, value: 4 }, ...overrides,
  };
}
function model(data = frame(), range = viewport) {
  const result = buildMetricChartModel("loss", data, range, "#FF794B");
  expect(result).not.toBeNull();
  return result!;
}
function series(result: MetricChartModel, id: string) {
  return (result.option.series as (LineSeriesOption | ScatterSeriesOption)[]).find((entry) => entry.id === id)!;
}
function tuples(result: MetricChartModel, id: string) {
  return series(result, id).data as [number, number | null, number, number | null][];
}
function numericLabel(label: string) { return Number(label.replaceAll(",", "")); }

describe("raw-domain linear chart mapping", () => {
  it.each([
    ["zero", 0], ["negative", -3], ["positive", 0.75],
    ["smallest subnormal", Number.MIN_VALUE], ["largest finite", Number.MAX_VALUE],
    ["lowest finite", -Number.MAX_VALUE],
  ] as const)("expands a constant %s into finite distinct bounds", (_name, value) => {
    const domain = metricDomain([value, value])!;
    expect(domain.every(Number.isFinite)).toBe(true);
    expect(domain[0]).toBeLessThan(domain[1]);
    expect(domain[0]).toBeLessThanOrEqual(value);
    expect(domain[1]).toBeGreaterThanOrEqual(value);
    const axis = makeAxis(domain, "loss");
    expect(Number.isFinite(axis.encode(value))).toBe(true);
    expect(axis.encode(value)).toBeGreaterThanOrEqual(0);
    expect(axis.encode(value)).toBeLessThanOrEqual(1);
  });

  it.each([
    ["normal", -2, 4], ["tiny", 1e-300, 2e-300],
    ["subnormal", Number.MIN_VALUE, 2 * Number.MIN_VALUE],
    ["adjacent floats", 1, 1 + Number.EPSILON],
    ["large", 1e300, 1.5e300],
    ["opposite extremes", -Number.MAX_VALUE, Number.MAX_VALUE],
  ] as const)("maps %s endpoints without overflow, collapse, or nonfinite ticks", (_name, minimum, maximum) => {
    const axis = makeAxis([minimum, maximum], "loss");
    expect(axis.encode(minimum)).toBe(0);
    expect(axis.encode(maximum)).toBe(1);
    expect(axis.decode(0)).toBe(minimum);
    expect(axis.decode(1)).toBe(maximum);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(axis.ticks.map((tick) => tick.label)).size).toBe(axis.ticks.length);
    for (const tick of axis.ticks) {
      expect(Number.isFinite(tick.value)).toBe(true);
      expect(Number.isFinite(numericLabel(tick.label))).toBe(true);
      expect(tick.position).toBe(axis.encode(tick.value));
      expect(tick.position).toBeGreaterThanOrEqual(0);
      expect(tick.position).toBeLessThanOrEqual(1);
      if (tick.value !== 0) expect(numericLabel(tick.label)).not.toBe(0);
    }
  });

  it("keeps raw step ticks and coordinates at the safe-integer limit", () => {
    const end = Number.MAX_SAFE_INTEGER;
    const axis = makeAxis([end - 2, end], "step");
    expect(axis.encode(end - 2)).toBe(0);
    expect(axis.encode(end - 1)).toBe(0.5);
    expect(axis.encode(end)).toBe(1);
    expect(axis.decode(0.5)).toBe(end - 1);
    expect(axis.ticks.every((tick) => Number.isSafeInteger(tick.value))).toBe(true);
    expect(axis.ticks.map((tick) => numericLabel(tick.label))).toEqual(axis.ticks.map((tick) => tick.value));
  });

  it("does not label distinct close ticks as equal or mislabel a finite maximum as infinity", () => {
    const adjacent = makeAxis([1, 1 + Number.EPSILON], "loss");
    expect(adjacent.ticks.map((tick) => numericLabel(tick.label))).toEqual([1, 1 + Number.EPSILON]);
    const largest = makeAxis([-Number.MAX_VALUE, Number.MAX_VALUE], "loss");
    expect(largest.ticks.every((tick) => Number.isFinite(numericLabel(tick.label)))).toBe(true);
  });

  it("retains the half-step precision of large nice ticks", () => {
    const axis = makeAxis([1.7e308, 1.79e308], "loss");
    const tick = axis.ticks.find((entry) => Math.abs(entry.value / 1e308 - 1.725) < 1e-12)!;
    expect(tick).toBeDefined();
    expect(numericLabel(tick.label) / 1e308).toBeCloseTo(1.725, 12);
  });

  it("reserves width from the actual tick strings, including signs and exponents", () => {
    const axis = makeAxis([1, 1 + Number.EPSILON], "loss");
    const grid = gridForAxis(axis);
    for (const tick of axis.ticks) {
      expect(grid.left - AXIS_LABEL_MARGIN).toBeGreaterThanOrEqual(tick.label.length * AXIS_FONT_SIZE * 0.6);
    }
    expect(drawablePlotWidth(280, grid)).toBe(280 - grid.left - grid.right);
    expect(drawablePlotWidth(280, grid)).toBeGreaterThan(24);
    expect(drawablePlotWidth(20, grid)).toBe(1);
    expect(drawablePlotWidth(NaN, grid)).toBe(1);
  });

  it("uses a center coordinate for a single source step without inventing neighboring steps", () => {
    const axis = makeAxis([8, 8], "step");
    expect(axis.ticks).toEqual([{ value: 8, position: 0.5, label: "8" }]);
    expect(axis.encode(8)).toBe(0.5);
    expect(axis.decode(0)).toBe(8);
    expect(axis.decode(1)).toBe(8);
  });

  it("has no chart model for empty, all-invalid, or malformed domains", () => {
    for (const domain of [null, [NaN, 1], [0, Infinity], [2, 1]] as ([number, number] | null)[]) {
      expect(buildMetricChartModel("loss", frame({ domain, points: [], peak: null }), viewport, "#FF794B")).toBeNull();
    }
  });

  it.each([
    { points: [[0, NaN]] }, { points: [[0, Infinity]] },
    { points: [[5, 1]] }, { conflicts: [[2, -1]] },
    { peak: { step: 4, value: Infinity } },
  ] satisfies Partial<MetricFrame>[])("rejects invalid or mismatched frame coordinates instead of rendering them", (invalid) => {
    expect(buildMetricChartModel("loss", frame(invalid), viewport, "#FF794B")).toBeNull();
  });

  it("rejects a reversed or nonfinite viewport", () => {
    for (const range of [{ ...viewport, start: 5 }, { ...viewport, end: Infinity }]) {
      expect(buildMetricChartModel("loss", frame(), range, "#FF794B")).toBeNull();
    }
  });
});

describe("integer-step wheel zoom", () => {
  it("can zoom out of a one-step span at either edge or its center", () => {
    for (const center of [10, 10.5, 11]) {
      const next = zoomStepRange({ start: 10, end: 11 }, center, true);
      expect(next.end - next.start).toBe(2);
      expect(next.start).toBeLessThanOrEqual(10);
      expect(next.end).toBeGreaterThanOrEqual(11);
    }
  });

  it("expands a singleton in both directions so a run's final step can zoom out", () => {
    expect(zoomStepRange({ start: 42, end: 42 }, 42, true)).toEqual({ start: 41, end: 43 });
    expect(zoomStepRange({ start: 0, end: 0 }, 0, true)).toEqual({ start: 0, end: 2 });
  });

  it("does not expand minimal ranges when zooming in", () => {
    expect(zoomStepRange({ start: 42, end: 42 }, 42, false)).toEqual({ start: 42, end: 42 });
    expect(zoomStepRange({ start: 42, end: 43 }, 42.5, false)).toEqual({ start: 42, end: 43 });
  });

  it("keeps a normal zoom centered and safe-integer endpoints bounded", () => {
    expect(zoomStepRange({ start: 100, end: 200 }, 150, false)).toEqual({ start: 110, end: 190 });
    const maximum = Number.MAX_SAFE_INTEGER;
    expect(zoomStepRange({ start: maximum, end: maximum }, maximum, true)).toEqual({ start: maximum - 2, end: maximum });
  });
});

describe("ECharts options preserve observation semantics", () => {
  it("keeps all explicit null breaks, actual values and isolated observations", () => {
    const input = frame({ points: [[0, 2], [1, null], [2, 0], [3, null], [4, 4]], invalidCount: 2 });
    const snapshot = structuredClone(input);
    const result = model(input);
    expect(tuples(result, "observations").map((entry) => entry.slice(2))).toEqual(input.points);
    expect(tuples(result, "isolated").map((entry) => entry.slice(2))).toEqual([[0, 2], [2, 0], [4, 4]]);
    expect(series(result, "observations")).toMatchObject({
      smooth: false, connectNulls: false, sampling: "none", showSymbol: false, animation: false, clip: true,
    });
    expect(result.option.tooltip).toMatchObject({ show: false });
    expect(input).toEqual(snapshot);
  });

  it("retains conflict extrema as separate markers and never bridges the conflict", () => {
    const result = model(frame({ points: [[0, 1], [2, null], [4, 4]], conflicts: [[2, 0], [2, 3]], conflictCount: 1 }));
    expect(tuples(result, "conflicts").map((entry) => entry.slice(2))).toEqual([[2, 0], [2, 3]]);
    expect(tuples(result, "observations").find((entry) => entry[2] === 2)?.[1]).toBeNull();
    expect(series(result, "conflicts")).toMatchObject({ symbol: "diamond", clip: false });
  });

  it("uses disconnected markers only in a fragmented range view", () => {
    const result = model(frame({ mode: "ranges", points: [[0, 0], [0, null], [4, 4], [4, null]] }));
    expect(tuples(result, "observations")).toEqual([]);
    expect(tuples(result, "isolated").map((entry) => entry.slice(2))).toEqual([[0, 0], [4, 4]]);
  });

  it("keeps an exact zero maximum and takes the axis domain from raw metadata", () => {
    const result = model(frame({ domain: [-100, 0], points: [[0, -2], [4, 0]], peak: { step: 4, value: 0 } }));
    expect(result.y.domain).toEqual([-100, 0]);
    expect(tuples(result, "peak")[0].slice(2)).toEqual([4, 0]);
    expect(tuples(result, "peak")[0][1]).toBe(1);
  });
});

describe("installed ECharts coordinate engine", () => {
  it.each([
    ["tiny", 1e-300, 2e-300], ["subnormal", Number.MIN_VALUE, Number.MIN_VALUE * 2],
    ["adjacent", 1, 1 + Number.EPSILON], ["extreme", -Number.MAX_VALUE, Number.MAX_VALUE],
    ["zero constant", 0, 0], ["maximum constant", Number.MAX_VALUE, Number.MAX_VALUE],
  ] as const)("places %s readings inside the plot with finite geometry at two widths", (_name, low, high) => {
    const result = model(frame({ domain: [low, high], points: [[0, low], [4, high]], peak: { step: 4, value: high } }));
    const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 400, height: 240 });
    try {
      chart.setOption(result.option);
      for (const width of [400, 280]) {
        chart.resize({ width, height: 240 });
        const first = chart.convertToPixel({ gridIndex: 0 }, [result.x.encode(0), result.y.encode(low)]) as number[];
        const last = chart.convertToPixel({ gridIndex: 0 }, [result.x.encode(4), result.y.encode(high)]) as number[];
        expect(first[0]).toBeCloseTo(result.grid.left, 8);
        expect(last[0]).toBeCloseTo(width - result.grid.right, 8);
        for (const point of [first, last]) {
          expect(point.every(Number.isFinite)).toBe(true);
          expect(point[1]).toBeGreaterThan(result.grid.top + 4.25);
          expect(point[1]).toBeLessThan(240 - result.grid.bottom - 4.25);
          // The biggest marker is a 7px diamond with a 1.5px outline.
          expect(point[0] - 4.25).toBeGreaterThan(0);
          expect(point[0] + 4.25).toBeLessThan(width);
        }
        const fromPixel = chart.convertFromPixel({ xAxisIndex: 0 }, last[0]) as number;
        expect(result.x.decode(fromPixel)).toBeCloseTo(4, 10);
        expect(chart.renderToSVGString()).not.toMatch(/(?:NaN|Infinity)/);
      }
    } finally {
      chart.dispose();
    }
  });

  it("uses identical label and grid-line tick coordinates", () => {
    const result = model();
    const axis = result.option.yAxis as { axisLabel: { customValues: number[]; formatter: (value: number) => string }; axisTick: { customValues: number[] } };
    expect(axis.axisLabel.customValues).toEqual(axis.axisTick.customValues);
    for (const tick of result.y.ticks) expect(axis.axisLabel.formatter(tick.position)).toBe(tick.label);
  });
});
