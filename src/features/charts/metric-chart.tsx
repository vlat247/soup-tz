"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getInstanceByDom, init, use as registerECharts, type ECharts, type ElementEvent } from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Metric } from "../runs/model/types";
import type { MetricFrame, Viewport } from "../runs/model/view-types";
import { METRIC_LABELS } from "../runs/model/format";
import { buildMetricChartModel, drawablePlotWidth, zoomStepRange, type MetricChartModel } from "./chart-model";
import { createChartRendererController, type ChartRendererFactory, type ChartRenderState } from "./chart-renderer";
import styles from "./metric-chart.module.css";

registerECharts([LineChart, ScatterChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

/** The factory can be replaced by development diagnostics without changing data. */
export const createCanvasRenderer: ChartRendererFactory = (element, events) => {
  let chart: ECharts | null = null;
  try {
    chart = init(element, undefined, { renderer: "canvas" });
    const active = chart;
    const pointer = (event: ElementEvent) => events.pointer([event.offsetX, event.offsetY]);
    active.getZr().on("mousemove", pointer);
    active.getZr().on("click", pointer);
    active.getZr().on("globalout", events.leave);
    return {
      render: (model) => active.setOption(model.option, { notMerge: true, lazyUpdate: false }),
      clear: () => active.clear(),
      resize: () => active.resize(),
      dispose: () => active.dispose(),
      coordinate(pixel) {
        if (active.isDisposed()) throw new Error("Chart renderer was disposed");
        if (!active.containPixel({ gridIndex: 0 }, pixel)) return null;
        return active.convertFromPixel({ xAxisIndex: 0 }, pixel[0]) as number;
      },
    };
  } catch (error) {
    try { (chart ?? getInstanceByDom(element))?.dispose(); } catch { /* Remove partial pixels below. */ }
    element.replaceChildren();
    throw error;
  }
};

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
  createRenderer?: ChartRendererFactory;
}

/** ECharts renders a linear coordinate mapping of the independently reduced source. */
export function MetricChart({
  metric, data, viewport, color, onInspect, onZoom, onPlotWidth,
  height = 240, selectedStep = null, createRenderer = createCanvasRenderer,
}: MetricChartProps) {
  const model = useMemo(() => buildMetricChartModel(metric, data, viewport, color), [metric, data, viewport, color]);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ReturnType<typeof createChartRendererController> | null>(null);
  const [renderState, setRenderState] = useState<ChartRenderState>({ status: "waiting", model: null });
  const lastReportedWidth = useRef<number | null>(null);
  const interactionsRef = useRef({ metric, onInspect, onZoom, onPlotWidth, viewport });

  useEffect(() => {
    interactionsRef.current = { metric, onInspect, onZoom, onPlotWidth, viewport };
  }, [metric, onInspect, onZoom, onPlotWidth, viewport]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let pointerFrame = 0;
    let resizeFrame = 0;
    let lastPointer: [number, number] | null = null;
    let lastInspected: number | null = null;
    let lastInspectedModel: MetricChartModel | null = null;

    const inspectPointer = () => {
      pointerFrame = 0;
      const inspected = lastPointer && controller.inspect(lastPointer);
      if (!inspected) return;
      const { step, model: current } = inspected;
      if (step === lastInspected && current === lastInspectedModel) return;
      lastInspected = step;
      lastInspectedModel = current;
      interactionsRef.current.onInspect(step);
    };
    const pointer = (pixel: [number, number]) => {
      lastPointer = pixel;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(inspectPointer);
    };
    const leave = () => {
      lastPointer = null;
      lastInspected = null;
      lastInspectedModel = null;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
    };
    const controller = createChartRendererController({
      create: () => createRenderer(element, { pointer, leave }),
      clearSurface: () => element.replaceChildren(),
      changed(state) {
        if (state.status !== "ready") leave();
        setRenderState(state);
        if (state.status === "ready") reportWidth();
      },
    });
    controllerRef.current = controller;
    lastReportedWidth.current = null;
    const reportWidth = () => {
      const current = controller.getState();
      if (current.status !== "ready" || element.clientWidth <= 0 || element.clientHeight <= 0) return;
      const { metric: currentMetric, onPlotWidth: report } = interactionsRef.current;
      const width = drawablePlotWidth(element.clientWidth, current.model?.grid ?? { left: 68, right: 20, top: 16, bottom: 34 });
      if (lastReportedWidth.current !== width) {
        lastReportedWidth.current = width;
        report?.(currentMetric, width);
      }
    };
    const wheel = (event: WheelEvent) => {
      const { onZoom: zoom, viewport: range } = interactionsRef.current;
      if (!event.altKey || !event.deltaY || !zoom) return;
      const bounds = element.getBoundingClientRect();
      const pixel: [number, number] = [event.clientX - bounds.left, event.clientY - bounds.top];
      const inspected = controller.inspect(pixel);
      if (!inspected) return;
      const center = inspected.step;
      event.preventDefault();
      const next = zoomStepRange(range, center, event.deltaY > 0);
      if (next.start !== range.start || next.end !== range.end) zoom(next.start, next.end);
    };
    element.addEventListener("wheel", wheel, { passive: false });

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        controller.resize(element.clientWidth, element.clientHeight);
        reportWidth();
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pointerFrame);
      cancelAnimationFrame(resizeFrame);
      element.removeEventListener("wheel", wheel);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [createRenderer]);

  useEffect(() => {
    const controller = controllerRef.current;
    const element = containerRef.current;
    if (!controller || !element) return;
    controller.update(model, element.clientWidth, element.clientHeight);
    const width = drawablePlotWidth(element.clientWidth, model?.grid ?? { left: 68, right: 20, top: 16, bottom: 34 });
    if (controller.getState().status === "ready" && element.clientWidth > 0 && element.clientHeight > 0 && lastReportedWidth.current !== width) {
      lastReportedWidth.current = width;
      onPlotWidth?.(metric, width);
    }
  }, [model, metric, onPlotWidth, createRenderer]);

  const visible = renderState.status === "ready" && renderState.model === model;
  const selectedFraction = visible && model && selectedStep !== null && selectedStep >= viewport.start && selectedStep <= viewport.end
    ? model.x.encode(selectedStep) : null;

  return (
    <div className={styles.chart}>
      <div className={styles.plot} style={{ height }}>
        <div ref={containerRef} className={styles.canvas} data-testid={`chart-${metric}`} aria-hidden={!model || !visible} style={{ visibility: visible ? "visible" : "hidden" }} />
        {visible && model && selectedFraction !== null && (
          <div className={styles.guideArea} style={model.grid} aria-hidden="true">
            <span className={styles.guide} style={{ left: `${selectedFraction * 100}%` }} />
          </div>
        )}
        {renderState.status === "failed" ? (
          <div className={styles.empty} role="alert">
            <span>{METRIC_LABELS[metric]} chart unavailable</span>
            <p>Exact source values remain available in the inspector.</p>
            <button type="button" onClick={() => controllerRef.current?.retry()}>Retry chart</button>
          </div>
        ) : !model && (
          <div className={styles.empty} role="status">
            <span>{data.domain ? "This range cannot be plotted safely" : "No finite readings in this interval"}</span>
            <p>{data.domain ? "Exact source values remain available in the inspector." : "Invalid and missing values remain available in the inspector."}</p>
          </div>
        )}
      </div>
      {visible && model && (data.mode === "ranges" || data.conflicts.length > 0) && (
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
