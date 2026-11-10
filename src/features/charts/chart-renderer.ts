import type { MetricChartModel } from "./chart-model";

export interface ChartRenderer {
  render(model: MetricChartModel): void;
  clear(): void;
  resize(): void;
  dispose(): void;
  /** Normalized horizontal coordinate, or null when outside the plot. */
  coordinate(pixel: [number, number]): number | null;
}
export interface ChartPointerEvents {
  pointer(pixel: [number, number]): void;
  leave(): void;
}
export type ChartRendererFactory = (element: HTMLDivElement, events: ChartPointerEvents) => ChartRenderer;
export interface ChartRenderState {
  status: "waiting" | "ready" | "failed";
  model: MetricChartModel | null;
}

/** Own one renderer; publish a model only after its complete draw succeeds. */
export function createChartRendererController(options: {
  create(): ChartRenderer;
  clearSurface(): void;
  changed(state: ChartRenderState): void;
}) {
  let renderer: ChartRenderer | null = null;
  let desired: MetricChartModel | null = null;
  let width = 0;
  let height = 0;
  let disposed = false;
  let state: ChartRenderState = { status: "waiting", model: null };

  function publish(status: ChartRenderState["status"], model: MetricChartModel | null = null) {
    if (state.status === status && state.model === model) return;
    state = { status, model };
    options.changed(state);
  }
  function release() {
    const previous = renderer;
    renderer = null;
    // Even a broken disposal must not leave stale pixels or an active handle.
    try { previous?.dispose(); } catch { /* The surface is removed below. */ }
    options.clearSurface();
  }
  function fail() {
    publish("failed");
    release();
  }
  function draw(resize: boolean) {
    if (disposed || state.status === "failed") return;
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      publish("waiting");
      release();
      return;
    }
    try {
      const existing = renderer !== null;
      renderer ??= options.create();
      if (resize && existing) renderer.resize();
      if (!existing || desired !== state.model) {
        if (desired) renderer.render(desired);
        else renderer.clear();
      }
      publish("ready", desired);
    } catch { fail(); }
  }

  return {
    getState: () => state,
    update(model: MetricChartModel | null, nextWidth: number, nextHeight: number) {
      if (disposed) return;
      desired = model;
      const resized = nextWidth !== width || nextHeight !== height;
      width = nextWidth; height = nextHeight;
      draw(resized);
    },
    resize(nextWidth: number, nextHeight: number) {
      if (disposed || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth; height = nextHeight;
      draw(true);
    },
    retry() {
      if (disposed || state.status !== "failed") return;
      publish("waiting");
      draw(false);
    },
    inspect(pixel: [number, number]): { step: number; model: MetricChartModel } | null {
      if (disposed || state.status !== "ready" || !state.model || !renderer) return null;
      try {
        const coordinate = renderer.coordinate(pixel);
        if (coordinate === null) return null;
        if (!Number.isFinite(coordinate)) throw new Error("Invalid chart coordinate");
        const step = state.model.x.decode(coordinate);
        if (!Number.isFinite(step)) throw new Error("Invalid source coordinate");
        return { step, model: state.model };
      } catch { fail(); return null; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      state = { status: "waiting", model: null };
      release();
    },
  };
}
