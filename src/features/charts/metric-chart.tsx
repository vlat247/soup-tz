"use client";

import { useEffect, useRef } from "react";
import {
  init,
  use as registerECharts,
  type ComposeOption,
  type ECharts,
  type ElementEvent,
} from "echarts/core";
import {
  LineChart,
  ScatterChart,
  type LineSeriesOption,
  type ScatterSeriesOption,
} from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
  type AriaComponentOption,
  type GridComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Metric } from "../runs/model/types";
import type { MetricFrame, Viewport } from "../runs/model/view-types";
import styles from "./metric-chart.module.css";

registerECharts([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  AriaComponent,
  CanvasRenderer,
]);

type ChartOption = ComposeOption<
  | LineSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | AriaComponentOption
>;

export interface MetricChartProps {
  metric: Metric;
  data: MetricFrame;
  viewport: Viewport;
  color: string;
  onInspect: (step: number) => void;
  onZoom?: (start: number, end: number) => void;
  height?: number;
  selectedStep?: number | null;
}

const METRIC_NAMES: Record<Metric, string> = {
  loss: "Loss",
  lr: "Learning rate",
  grad_norm: "Gradient norm",
};
const GRID = { left: 68, right: 20, top: 16, bottom: 34 };
const AXIS_FONT_SIZE = 11;
const AXIS_FONT = '"IBM Plex Mono", monospace';
const AXIS_COLOR = "rgba(230, 213, 183, 0.68)";
const GRID_COLOR = "rgba(230, 213, 183, 0.12)";
const stepFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function paddedDomain(
  domain: [number, number] | null,
): [number, number] | null {
  if (!domain || !domain.every(Number.isFinite)) return null;
  const [minimum, maximum] = domain;
  const span = maximum - minimum;
  if (span < 0 || !Number.isFinite(span)) return null;
  const padding =
    span > 0
      ? span * 0.08
      : minimum === 0
        ? 1
        : Math.max(Math.abs(minimum) * 0.05, Number.MIN_VALUE);
  const lower = Number.isFinite(minimum - padding)
    ? minimum - padding
    : minimum;
  const upper = Number.isFinite(maximum + padding)
    ? maximum + padding
    : maximum;
  return lower < upper && Number.isFinite(upper - lower)
    ? [lower, upper]
    : null;
}

function tickLabel(
  value: number,
  domain: [number, number],
  metric: Metric,
): string {
  if (value === 0) return "0";
  const spacing = (domain[1] - domain[0]) / 4;
  const magnitude = Math.abs(value);
  // Precision follows the displayed interval, so nearby ticks stay distinguishable.
  const significantDigits = Math.max(
    3,
    Math.min(17, Math.ceil(Math.log10(magnitude / spacing)) + 1),
  );
  if (metric === "lr" || magnitude < 0.001 || magnitude >= 1_000_000) {
    return value
      .toExponential(significantDigits - 1)
      .replace(/\.?0+e/, "e")
      .replace("e+", "e");
  }
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: significantDigits,
  }).format(value);
}

function plotGrid(domain: [number, number] | null, metric: Metric) {
  if (!domain) return GRID;
  const span = domain[1] - domain[0];
  const longestLabel = Math.max(
    ...[0, 0.25, 0.5, 0.75, 1].map(
      (fraction) =>
        tickLabel(domain[0] + span * fraction, domain, metric).length,
    ),
  );
  // IBM Plex Mono has a 0.6em advance. Reserve the full label instead of
  // shrinking its text or truncating precision on a narrow viewport.
  return {
    ...GRID,
    left: Math.max(
      GRID.left,
      Math.ceil(longestLabel * AXIS_FONT_SIZE * 0.6) + 16,
    ),
  };
}

function standalonePoints(points: MetricFrame["points"]): [number, number][] {
  const result: [number, number][] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (
      point[1] !== null &&
      (index === 0 || points[index - 1][1] === null) &&
      (index === points.length - 1 || points[index + 1][1] === null)
    ) {
      result.push([point[0], point[1]]);
    }
  }
  return result;
}

/** ECharts only renders the worker result; it never chooses or invents samples. */
export function MetricChart({
  metric,
  data,
  viewport,
  color,
  onInspect,
  onZoom,
  height = 240,
  selectedStep = null,
}: MetricChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const interactionsRef = useRef({ onInspect, onZoom, viewport });

  useEffect(() => {
    interactionsRef.current = { onInspect, onZoom, viewport };
  }, [onInspect, onZoom, viewport]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chart = init(element, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    let pointerFrame = 0;
    let resizeFrame = 0;
    let lastPointer: [number, number] | null = null;
    let lastInspected: number | null = null;
    let lastInspectedViewport: Viewport | null = null;

    const inspectPointer = () => {
      pointerFrame = 0;
      if (
        !lastPointer ||
        chart.isDisposed() ||
        !chart.containPixel({ gridIndex: 0 }, lastPointer)
      )
        return;
      const step = chart.convertFromPixel(
        { xAxisIndex: 0 },
        lastPointer[0],
      ) as number;
      const currentViewport = interactionsRef.current.viewport;
      if (
        !Number.isFinite(step) ||
        (step === lastInspected && currentViewport === lastInspectedViewport)
      )
        return;
      lastInspected = step;
      lastInspectedViewport = currentViewport;
      interactionsRef.current.onInspect(step);
    };
    const pointer = (event: ElementEvent) => {
      lastPointer = [event.offsetX, event.offsetY];
      if (!pointerFrame) pointerFrame = requestAnimationFrame(inspectPointer);
    };
    const leave = () => {
      lastPointer = null;
      lastInspected = null;
      lastInspectedViewport = null;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
    };
    const wheel = (event: WheelEvent) => {
      const { onZoom: zoom, viewport: range } = interactionsRef.current;
      if (!event.altKey || !zoom || chart.isDisposed()) return;
      const bounds = element.getBoundingClientRect();
      const pixel: [number, number] = [
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      ];
      if (!chart.containPixel({ gridIndex: 0 }, pixel)) return;
      const center = chart.convertFromPixel(
        { xAxisIndex: 0 },
        pixel[0],
      ) as number;
      if (!Number.isFinite(center)) return;
      event.preventDefault();
      const currentSpan = Math.max(1, range.end - range.start);
      const nextSpan = Math.max(
        1,
        currentSpan * (event.deltaY > 0 ? 1.25 : 0.8),
      );
      const fraction = (center - range.start) / currentSpan;
      zoom(
        Math.round(center - nextSpan * fraction),
        Math.round(center + nextSpan * (1 - fraction)),
      );
    };
    chart.getZr().on("mousemove", pointer);
    chart.getZr().on("click", pointer);
    chart.getZr().on("globalout", leave);
    element.addEventListener("wheel", wheel, { passive: false });

    const observer = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (
          !chart.isDisposed() &&
          element.clientWidth > 0 &&
          element.clientHeight > 0
        )
          chart.resize();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pointerFrame);
      cancelAnimationFrame(resizeFrame);
      element.removeEventListener("wheel", wheel);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const domain = paddedDomain(data.domain);
    if (!domain) {
      chart.clear();
      return;
    }
    const singleton = viewport.start === viewport.end;
    const rangePoints =
      data.mode === "ranges"
        ? data.points.filter(
            (point): point is [number, number] => point[1] !== null,
          )
        : standalonePoints(data.points);
    const markerSeries: ScatterSeriesOption[] = [
      {
        id: "isolated",
        name:
          data.mode === "ranges"
            ? "Observed finite extrema"
            : "Isolated observations",
        type: "scatter",
        data: rangePoints,
        symbolSize: 4,
        clip: false,
        itemStyle: { color, opacity: 1 },
        silent: true,
        animation: false,
        progressive: 0,
      },
      {
        id: "conflicts",
        name: "Conflicting observations",
        type: "scatter",
        data: data.conflicts,
        symbol: "diamond",
        symbolSize: 7,
        clip: false,
        itemStyle: {
          color: "#141414",
          borderColor: "#E6D5B7",
          borderWidth: 1.5,
          opacity: 1,
        },
        silent: true,
        animation: false,
        progressive: 0,
      },
      {
        id: "peak",
        name: "Observed maximum",
        type: "scatter",
        data: data.peak ? [[data.peak.step, data.peak.value]] : [],
        symbolSize: 5,
        clip: false,
        itemStyle: { color, opacity: 1 },
        silent: true,
        animation: false,
        progressive: 0,
      },
    ];
    const option: ChartOption = {
      animation: false,
      backgroundColor: "transparent",
      textStyle: { fontFamily: '"Geist Variable", sans-serif' },
      aria: {
        enabled: true,
        label: {
          description:
            `${METRIC_NAMES[metric]} from step ${viewport.start} to ${viewport.end}. ` +
            `${data.finiteCount} finite readings; ${data.invalidCount} invalid, ${data.missingCount} missing, ` +
            `${data.conflictCount} conflicting steps. Linear scale without smoothing. ` +
            "Use the observation inspector for exact source values.",
        },
      },
      grid: { ...plotGrid(domain, metric), containLabel: false },
      tooltip: { show: false, trigger: "none" },
      xAxis: {
        type: "value",
        min: singleton ? viewport.start - 0.5 : viewport.start,
        max: singleton ? viewport.end + 0.5 : viewport.end,
        minInterval: 1,
        splitNumber: 5,
        boundaryGap: [0, 0],
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: AXIS_COLOR,
          fontSize: AXIS_FONT_SIZE,
          fontFamily: AXIS_FONT,
          margin: 12,
          hideOverlap: true,
          alignMinLabel: "left",
          alignMaxLabel: "right",
          formatter: (value: number) =>
            Number.isInteger(value) ? stepFormat.format(value) : "",
        },
      },
      yAxis: {
        type: "value",
        min: domain[0],
        max: domain[1],
        scale: true,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: GRID_COLOR, type: "dashed", width: 1 },
        },
        axisLabel: {
          color: AXIS_COLOR,
          fontSize: AXIS_FONT_SIZE,
          fontFamily: AXIS_FONT,
          margin: 12,
          hideOverlap: true,
          formatter: (value: number) => tickLabel(value, domain, metric),
        },
      },
      series: [
        {
          id: "observations",
          name: METRIC_NAMES[metric],
          type: "line",
          data: data.mode === "line" ? data.points : [],
          smooth: false,
          connectNulls: false,
          sampling: "none",
          showSymbol: false,
          lineStyle: { color, width: 1.5 },
          itemStyle: { color },
          emphasis: { disabled: true },
          silent: true,
          animation: false,
        },
        ...markerSeries,
      ],
    };
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
  }, [color, data, metric, viewport]);

  const domain = paddedDomain(data.domain);
  const selectedFraction =
    selectedStep !== null &&
    selectedStep >= viewport.start &&
    selectedStep <= viewport.end
      ? viewport.start === viewport.end
        ? 0.5
        : (selectedStep - viewport.start) / (viewport.end - viewport.start)
      : null;

  return (
    <div className={styles.chart}>
      <div className={styles.plot} style={{ height }}>
        <div
          ref={containerRef}
          className={styles.canvas}
          data-testid={`chart-${metric}`}
          aria-hidden={!domain}
        />
        {domain && selectedFraction !== null && (
          <div
            className={styles.guideArea}
            style={plotGrid(domain, metric)}
            aria-hidden="true"
          >
            <span
              className={styles.guide}
              style={{ left: `${selectedFraction * 100}%` }}
            />
          </div>
        )}
        {!domain && (
          <div className={styles.empty} role="status">
            <span>
              {data.domain
                ? "This range exceeds chart precision"
                : "No finite readings in this interval"}
            </span>
            <p>
              {data.domain
                ? "Exact source values remain available in the inspector."
                : "Invalid and missing values remain available in the inspector."}
            </p>
          </div>
        )}
      </div>
      {domain && (data.mode === "ranges" || data.conflicts.length > 0) && (
        <div className={styles.notes}>
          {data.mode === "ranges" && <span>Disconnected extrema</span>}
          {data.conflicts.length > 0 && (
            <span
              className={styles.conflictNote}
              title="Finite minimum and maximum from conflicting readings at the same step"
            >
              <span className={styles.conflictSymbol} aria-hidden="true" />
              Conflict min / max
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default MetricChart;
