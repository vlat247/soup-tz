import type { ComposeOption } from "echarts/core";
import type { LineSeriesOption, ScatterSeriesOption } from "echarts/charts";
import type { AriaComponentOption, GridComponentOption, TooltipComponentOption } from "echarts/components";
import type { Metric } from "../runs/model/types";
import type { MetricFrame, Viewport } from "../runs/model/view-types";

export type ChartOption = ComposeOption<LineSeriesOption | ScatterSeriesOption
  | GridComponentOption | TooltipComponentOption | AriaComponentOption>;

export const AXIS_FONT_SIZE = 11;
export const AXIS_FONT = '"IBM Plex Mono", monospace';
export const AXIS_LABEL_MARGIN = 12;
const AXIS_COLOR = "rgba(230, 213, 183, 0.68)";
const GRID_COLOR = "rgba(230, 213, 183, 0.12)";
const STEP_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const METRIC_NAMES: Record<Metric, string> = { loss: "Loss", lr: "Learning rate", grad_norm: "Gradient norm" };

export interface AxisTick { value: number; position: number; label: string }
export interface LinearAxis {
  domain: [number, number];
  ticks: AxisTick[];
  /** Bounded display coordinates avoid ECharts affine overflow/cancellation. */
  encode: (value: number) => number;
  decode: (position: number) => number;
}
export interface ChartGrid { left: number; right: number; top: number; bottom: number }
export interface MetricChartModel {
  option: ChartOption;
  x: LinearAxis;
  y: LinearAxis;
  grid: ChartGrid;
}

function interpolate(minimum: number, maximum: number, position: number): number {
  if (position <= 0) return minimum;
  if (position >= 1) return maximum;
  const span = maximum - minimum;
  // The convex form keeps opposite-sign extreme bounds from overflowing.
  return Number.isFinite(span)
    ? minimum + span * position
    : minimum * (1 - position) + maximum * position;
}

function coordinates(domain: [number, number]) {
  const [minimum, maximum] = domain;
  const span = maximum - minimum;
  return {
    encode(value: number) {
      if (minimum === maximum) return 0.5;
      if (value === minimum) return 0;
      if (value === maximum) return 1;
      return Number.isFinite(span) ? (value - minimum) / span
        : (value / 2 - minimum / 2) / (maximum / 2 - minimum / 2);
    },
    decode(position: number) { return interpolate(minimum, maximum, position); },
  };
}

/** Keep constant readings visible without manufacturing a nonfinite bound. */
export function metricDomain(domain: [number, number] | null): [number, number] | null {
  if (!domain || !domain.every(Number.isFinite) || domain[0] > domain[1]) return null;
  if (domain[0] !== domain[1]) return [...domain];
  const value = domain[0];
  if (value === 0) return [-1, 1];
  const pad = Math.max(Math.abs(value) * 0.05, Number.MIN_VALUE);
  const lower = Number.isFinite(value - pad) ? value - pad : value;
  const upper = Number.isFinite(value + pad) ? value + pad : value;
  return lower < upper ? [lower, upper] : null;
}

function tickValues(domain: [number, number], integer: boolean): number[] {
  const [minimum, maximum] = domain;
  if (minimum === maximum) return [minimum];
  const roughStep = (maximum - minimum) / (integer ? 5 : 4);
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const factor = [1, 2, 2.5, 5, 10].find((candidate) => candidate >= roughStep / power) ?? 10;
  const step = integer ? Math.max(1, Math.ceil(power * factor)) : power * factor;
  const values: number[] = [];
  // An enormous quotient cannot identify consecutive tick multiples precisely.
  if (Number.isFinite(step) && step > 0
    && Math.max(Math.abs(minimum / step), Math.abs(maximum / step)) < 2 ** 50) {
    const first = Math.ceil(minimum / step);
    for (let index = 0; index < 24; index++) {
      const value = (first + index) * step;
      if (value > maximum) break;
      if (Number.isFinite(value) && value >= minimum) values.push(value === 0 ? 0 : value);
    }
  }
  if (new Set(values).size >= 2) return [...new Set(values)];
  // Adjacent floats and subnormals may admit fewer than five distinct ticks.
  return [...new Set([0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const value = interpolate(minimum, maximum, fraction);
    return integer ? Math.round(value) : value === 0 ? 0 : value;
  }))];
}

function metricLabel(value: number, spacing: number, metric: Metric, extraPrecision = 0): string {
  if (value === 0) return "0";
  const digits = Math.max(3, Math.min(17,
    Math.ceil(Math.log10(Math.abs(value)) - Math.log10(spacing)) + 2 + extraPrecision));
  let label: string;
  if (metric === "lr" || Math.abs(value) < 0.001 || Math.abs(value) >= 1_000_000) {
    label = value.toExponential(digits - 1).replace(/\.?0+e/, "e").replace("e+", "e");
  } else {
    label = new Intl.NumberFormat("en-US", { maximumSignificantDigits: digits }).format(value);
  }
  // Rounding MAX_VALUE up to "1.8e308" would label a finite tick as Infinity.
  return Number.isFinite(Number(label.replaceAll(",", ""))) ? label : value.toString().replace("e+", "e");
}

export function makeAxis(domain: [number, number], metric: Metric | "step"): LinearAxis {
  const mapping = coordinates(domain);
  const values = tickValues(domain, metric === "step");
  let spacing = Infinity;
  for (let index = 1; index < values.length; index++) spacing = Math.min(spacing, values[index] - values[index - 1]);
  let labels = values.map((value) => metric === "step" ? STEP_FORMAT.format(value) : metricLabel(value, spacing, metric));
  for (let extra = 1; new Set(labels).size !== labels.length && extra <= 17; extra++) {
    labels = values.map((value) => metric === "step" ? STEP_FORMAT.format(value) : metricLabel(value, spacing, metric, extra));
  }
  return { domain, ...mapping, ticks: values.map((value, index) => ({ value, position: mapping.encode(value), label: labels[index] })) };
}

export function gridForAxis(axis: LinearAxis): ChartGrid {
  const longest = Math.max(...axis.ticks.map((tick) => tick.label.length), 0);
  return {
    left: Math.max(68, Math.ceil(longest * AXIS_FONT_SIZE * 0.6) + AXIS_LABEL_MARGIN + 4),
    right: 20, top: 16, bottom: 34,
  };
}

export function drawablePlotWidth(containerWidth: number, grid: ChartGrid): number {
  if (!Number.isFinite(containerWidth)) return 1;
  return Math.max(1, Math.floor(containerWidth - grid.left - grid.right));
}

/** Integer steps must still expand when proportional rounding would do nothing. */
export function zoomStepRange(range: Pick<Viewport, "start" | "end">, center: number, zoomOut: boolean) {
  const span = range.end - range.start;
  if (!Number.isFinite(center) || (!zoomOut && span <= 1)) return range;
  const nextSpan = zoomOut
    ? Math.min(Number.MAX_SAFE_INTEGER, span === 0 ? 2 : Math.max(span + 1, Math.ceil(span * 1.25)))
    : Math.max(1, Math.floor(span * 0.8));
  const fraction = span === 0 ? 0.5 : Math.max(0, Math.min(1, (center - range.start) / span));
  const start = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER - nextSpan, Math.round(center - nextSpan * fraction)));
  return { start, end: start + nextSpan };
}

function isolated(points: MetricFrame["points"]): [number, number][] {
  return points.filter((point, index): point is [number, number] => point[1] !== null
    && (index === 0 || points[index - 1][1] === null)
    && (index === points.length - 1 || points[index + 1][1] === null));
}

export function buildMetricChartModel(metric: Metric, data: MetricFrame, viewport: Viewport, color: string): MetricChartModel | null {
  const rawDomain = data.domain;
  const domain = metricDomain(rawDomain);
  if (!domain || !rawDomain) return null;
  // A malformed/stale frame must never reach the renderer as fabricated zeroes
  // or off-axis observations. Source inspection remains available to the UI.
  if (!Number.isSafeInteger(viewport.start) || !Number.isSafeInteger(viewport.end)
    || viewport.start > viewport.end) return null;
  const validPoint = ([step, value]: [number, number | null]) => Number.isSafeInteger(step)
    && step >= viewport.start && step <= viewport.end
    && (value === null || (Number.isFinite(value) && value >= rawDomain[0] && value <= rawDomain[1]));
  if (!data.points.every(validPoint) || !data.conflicts.every(validPoint)
    || (data.peak && !validPoint([data.peak.step, data.peak.value]))) return null;
  const x = makeAxis([viewport.start, viewport.end], "step");
  const y = makeAxis(domain, metric);
  const grid = gridForAxis(y);
  // Additional dimensions retain the exact source observation. Native numeric
  // tooltips stay disabled; inspection is always queried from the raw source.
  const point = ([step, value]: [number, number | null]) => [x.encode(step), value === null ? null : y.encode(value), step, value];
  const rawMarkers = data.mode === "ranges"
    ? data.points.filter((entry): entry is [number, number] => entry[1] !== null)
    : isolated(data.points);
  const label = (axis: LinearAxis) => (position: number) => axis.ticks.find((tick) => tick.position === position)?.label ?? "";
  const option: ChartOption = {
    animation: false, backgroundColor: "transparent",
    textStyle: { fontFamily: '"Geist Variable", sans-serif' },
    aria: { enabled: true, label: { description:
      `${METRIC_NAMES[metric]} from step ${viewport.start} to ${viewport.end}. `
      + `${data.finiteCount} finite readings; ${data.invalidCount} invalid, ${data.missingCount} missing, `
      + `${data.conflictCount} conflicting steps. Linear scale without smoothing. `
      + "Axis labels show source values. Use the observation inspector for exact readings.",
    } },
    grid: { ...grid, containLabel: false, outerBoundsMode: "none" },
    tooltip: { show: false, trigger: "none" },
    xAxis: {
      type: "value", min: 0, max: 1, boundaryGap: [0, 0],
      axisLine: { show: false }, axisTick: { show: false, customValues: x.ticks.map((tick) => tick.position) },
      splitLine: { show: false },
      axisLabel: {
        color: AXIS_COLOR, fontSize: AXIS_FONT_SIZE, fontFamily: AXIS_FONT,
        margin: AXIS_LABEL_MARGIN, hideOverlap: true, alignMinLabel: "left", alignMaxLabel: "right",
        customValues: x.ticks.map((tick) => tick.position), formatter: label(x),
      },
    },
    yAxis: {
      type: "value", min: -0.08, max: 1.08, scale: true,
      axisLine: { show: false }, axisTick: { show: false, customValues: y.ticks.map((tick) => tick.position) },
      splitLine: { show: true, lineStyle: { color: GRID_COLOR, type: "dashed", width: 1 } },
      axisLabel: {
        color: AXIS_COLOR, fontSize: AXIS_FONT_SIZE, fontFamily: AXIS_FONT,
        margin: AXIS_LABEL_MARGIN, hideOverlap: true,
        customValues: y.ticks.map((tick) => tick.position), formatter: label(y),
      },
    },
    series: [
      {
        id: "observations", name: METRIC_NAMES[metric], type: "line",
        data: data.mode === "line" ? data.points.map(point) : [], encode: { x: 0, y: 1 },
        smooth: false, connectNulls: false, sampling: "none", showSymbol: false,
        lineStyle: { color, width: 1.5 }, itemStyle: { color }, clip: true,
        emphasis: { disabled: true }, silent: true, animation: false,
      },
      {
        id: "isolated", name: data.mode === "ranges" ? "Observed finite extrema" : "Isolated observations",
        type: "scatter", data: rawMarkers.map(point), encode: { x: 0, y: 1 },
        symbolSize: 4, clip: false, itemStyle: { color, opacity: 1 },
        silent: true, animation: false, progressive: 0,
      },
      {
        id: "conflicts", name: "Conflicting observations", type: "scatter", data: data.conflicts.map(point),
        encode: { x: 0, y: 1 }, symbol: "diamond", symbolSize: 7, clip: false,
        itemStyle: { color: "#141414", borderColor: "#E6D5B7", borderWidth: 1.5, opacity: 1 },
        silent: true, animation: false, progressive: 0,
      },
      {
        id: "peak", name: "Observed maximum", type: "scatter",
        data: data.peak ? [point([data.peak.step, data.peak.value])] : [], encode: { x: 0, y: 1 },
        symbolSize: 5, clip: false, itemStyle: { color, opacity: 1 },
        silent: true, animation: false, progressive: 0,
      },
    ],
  };
  return { option, x, y, grid };
}
