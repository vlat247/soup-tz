"use client";

import { useEffect, useMemo, useRef } from "react";
import { init, use as registerECharts, type ECharts, type ElementEvent } from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Metric } from "../runs/model/types";
import type { MetricFrame, Viewport } from "../runs/model/view-types";
import { buildMetricChartModel, drawablePlotWidth, zoomStepRange, type MetricChartModel } from "./chart-model";
import styles from "./metric-chart.module.css";

registerECharts([LineChart, ScatterChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

export interface MetricChartProps {
  metric: Metric;
  data: MetricFrame;
  viewport: Viewport;
  color: string;
  onInspect: (step: number) => void;
  onZoom?: (start: number, end: number) => void;
  onPlotWidth?: (metric: Metric, width: number) => void;
  height?: number;
  selectedStep?: number | null;
}

/** ECharts renders a linear coordinate mapping of the independently reduced source. */
export function MetricChart({
  metric, data, viewport, color, onInspect, onZoom, onPlotWidth,
  height = 240, selectedStep = null,
}: MetricChartProps) {
  const model = useMemo(() => buildMetricChartModel(metric, data, viewport, color), [metric, data, viewport, color]);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const renderedModel = useRef<MetricChartModel | null>(null);
  const lastReportedWidth = useRef<number | null>(null);
  const interactionsRef = useRef({ metric, onInspect, onZoom, onPlotWidth, viewport });

  useEffect(() => {
    interactionsRef.current = { metric, onInspect, onZoom, onPlotWidth, viewport };
  }, [metric, onInspect, onZoom, onPlotWidth, viewport]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chart = init(element, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    let pointerFrame = 0;
    let resizeFrame = 0;
    let lastPointer: [number, number] | null = null;
    let lastInspected: number | null = null;
    let lastInspectedModel: MetricChartModel | null = null;

    const inspectPointer = () => {
      pointerFrame = 0;
      const current = renderedModel.current;
      if (!lastPointer || !current || chart.isDisposed() || !chart.containPixel({ gridIndex: 0 }, lastPointer)) return;
      const coordinate = chart.convertFromPixel({ xAxisIndex: 0 }, lastPointer[0]) as number;
      const step = current.x.decode(coordinate);
      if (!Number.isFinite(step) || (step === lastInspected && current === lastInspectedModel)) return;
      lastInspected = step;
      lastInspectedModel = current;
      interactionsRef.current.onInspect(step);
    };
    const pointer = (event: ElementEvent) => {
      lastPointer = [event.offsetX, event.offsetY];
      if (!pointerFrame) pointerFrame = requestAnimationFrame(inspectPointer);
    };
    const leave = () => {
      lastPointer = null;
      lastInspected = null;
      lastInspectedModel = null;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
    };
    const wheel = (event: WheelEvent) => {
      const { onZoom: zoom, viewport: range } = interactionsRef.current;
      const current = renderedModel.current;
      if (!event.altKey || !event.deltaY || !zoom || !current || chart.isDisposed()) return;
      const bounds = element.getBoundingClientRect();
      const pixel: [number, number] = [event.clientX - bounds.left, event.clientY - bounds.top];
      if (!chart.containPixel({ gridIndex: 0 }, pixel)) return;
      const coordinate = chart.convertFromPixel({ xAxisIndex: 0 }, pixel[0]) as number;
      const center = current.x.decode(coordinate);
      if (!Number.isFinite(center)) return;
      event.preventDefault();
      const next = zoomStepRange(range, center, event.deltaY > 0);
      if (next.start !== range.start || next.end !== range.end) zoom(next.start, next.end);
    };
    chart.getZr().on("mousemove", pointer);
    chart.getZr().on("click", pointer);
    chart.getZr().on("globalout", leave);
    element.addEventListener("wheel", wheel, { passive: false });

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (chart.isDisposed() || element.clientWidth <= 0 || element.clientHeight <= 0) return;
        chart.resize();
        const { metric: currentMetric, onPlotWidth: report } = interactionsRef.current;
        const grid = renderedModel.current?.grid ?? { left: 68, right: 20, top: 16, bottom: 34 };
        const width = drawablePlotWidth(element.clientWidth, grid);
        if (lastReportedWidth.current !== width) {
          lastReportedWidth.current = width;
          report?.(currentMetric, width);
        }
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
      renderedModel.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const element = containerRef.current;
    if (!chart || !element) return;
    if (model) chart.setOption(model.option, { notMerge: true, lazyUpdate: false });
    else chart.clear();
    renderedModel.current = model;
    const width = drawablePlotWidth(element.clientWidth, model?.grid ?? { left: 68, right: 20, top: 16, bottom: 34 });
    if (element.clientWidth > 0 && lastReportedWidth.current !== width) {
      lastReportedWidth.current = width;
      onPlotWidth?.(metric, width);
    }
  }, [model, metric, onPlotWidth]);

  const selectedFraction = model && selectedStep !== null && selectedStep >= viewport.start && selectedStep <= viewport.end
    ? model.x.encode(selectedStep) : null;

  return (
    <div className={styles.chart}>
      <div className={styles.plot} style={{ height }}>
        <div ref={containerRef} className={styles.canvas} data-testid={`chart-${metric}`} aria-hidden={!model} />
        {model && selectedFraction !== null && (
          <div className={styles.guideArea} style={model.grid} aria-hidden="true">
            <span className={styles.guide} style={{ left: `${selectedFraction * 100}%` }} />
          </div>
        )}
        {!model && (
          <div className={styles.empty} role="status">
            <span>{data.domain ? "This range cannot be plotted safely" : "No finite readings in this interval"}</span>
            <p>{data.domain ? "Exact source values remain available in the inspector." : "Invalid and missing values remain available in the inspector."}</p>
          </div>
        )}
      </div>
      {model && (data.mode === "ranges" || data.conflicts.length > 0) && (
        <div className={styles.notes}>
          {data.mode === "ranges" && <span>Disconnected extrema</span>}
          {data.conflicts.length > 0 && (
            <span className={styles.conflictNote} title="Finite minimum and maximum from conflicting readings at the same step">
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
