"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createCanvasRenderer } from "../charts/metric-chart";
import { buildMetricChartModel, drawablePlotWidth, type MetricChartModel } from "../charts/chart-model";
import type { ChartRenderer } from "../charts/chart-renderer";
import { generateRun } from "../runs/data/generate";
import { getRunDescriptor } from "../runs/data/manifest";
import { createRunSession, type RunSession } from "../runs/hooks/run-session";
import { createWorkerTransport } from "../runs/hooks/use-run";
import { prepareRun, type PreparedRun } from "../runs/model/prepare";
import { buildFrame } from "../runs/model/reduce";
import { inspectStep } from "../runs/model/inspect";
import { inspectColumn } from "../runs/model/inspect-column";
import { formatCount, formatExactValue, METRIC_COLORS, METRIC_LABELS } from "../runs/model/format";
import { METRICS, type Metric } from "../runs/model/types";
import type { RunFrame, RunSummary, StepInspection, Viewport } from "../runs/model/view-types";
import { createTimingLedger, inspectionWorkload, sampleSummary, zoomWorkload, type SampleKind, type Variant } from "./protocol";
import styles from "./browser-benchmark.module.css";

const descriptor = getRunDescriptor("run-020");
const timeoutMs = 120_000;
type Surface = Record<Metric, HTMLDivElement | null>;
interface View { status: string; busy: boolean; loaded: boolean; error: string | null; rows: number; plotted: number; width: number; range: string; inspection: StepInspection | null }
const emptyView: View = { status: "Empty baseline — no source or renderer allocated", busy: false, loaded: false, error: null, rows: 0, plotted: 0, width: 0, range: "—", inspection: null };

/** A controlled comparison shell; production algorithms and Canvas adapter are shared. */
export function BrowserBenchmark() {
  const [variant, setVariant] = useState<Variant>("optimized");
  const [view, setView] = useState<View>(emptyView);
  const [reportText, setReportText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [hasSamples, setHasSamples] = useState(false);
  const [hoverArmed, setHoverArmed] = useState(false);
  const surfaces = useRef<Surface>({ loss: null, lr: null, grad_norm: null });
  const engine = useRef<ReturnType<typeof createEngine> | null>(null);
  const variantRef = useRef<Variant>("optimized");
  const initialization = useRef(false);

  function createEngine() {
    const ledger = createTimingLedger(() => performance.now(), (name, at) => performance.mark(name, at === undefined ? undefined : { startTime: at }));
    let prepared: PreparedRun | null = null;
    let session: RunSession | null = null;
    let frame: RunFrame | null = null;
    let summary: RunSummary | null = null;
    let renderers: Partial<Record<Metric, ChartRenderer>> = {};
    let models: Partial<Record<Metric, MetricChartModel>> = {};
    let hoverEnabled = false;
    let hoverFrame = 0;
    let ignoredPointerEvents = 0;
    let activeVariant: Variant = "optimized";
    let operation: { id: number; resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; navigation: boolean } | null = null;
    let sequence = 0;
    let epoch = 0;
    let disposed = false;
    let runningWorkload = false;
    let geometryCorrections = 0;
    let firstRaf = 0;
    let secondRaf = 0;
    let painted = false;
    let loadedAt: string | null = null;

    const dimensions = () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio,
      charts: METRICS.map((metric) => ({ metric, width: surfaces.current[metric]?.clientWidth ?? 0, height: surfaces.current[metric]?.clientHeight ?? 0 })) });
    const report = () => ({
      schemaVersion: 1, variant: activeVariant, run: { id: descriptor.id, seed: descriptor.seed, rows: descriptor.rowCount, sourceVersion: descriptor.sourceVersion, generatorVersion: descriptor.generatorVersion, expectedPeak: { step: 500_000, loss: 12 } },
      environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, ...dimensions(), timeOrigin: performance.timeOrigin },
      protocol: { timeoutMs, cpuThrottling: "Set and verify 4x in Chrome DevTools; this page cannot attest the browser setting.", source: activeVariant === "raw" ? "Main-thread generation/preparation/raw finite segments" : "Production worker/session and per-metric reduction", endpoint: "Second requestAnimationFrame after synchronous Canvas draw and text commit; paint proxy, correlate with trace frames/screenshots.", commandTiming: "Scripted range/inspection command start; excludes physical device/input dispatch latency.", memory: "No tab-memory estimate is made. Record browser Task Manager footprint and worker attribution separately.", timeoutLimit: "A watchdog cannot preempt a blocked main thread or guarantee recovery from an out-of-memory crash.", coldLoad: "Only autorun query loads report navigation-to-paint proxy. Disable cache and use independent reloads for cold samples." },
      loadedAt, activeViewport: frame?.viewport ?? null, sourceRows: summary?.rowCount ?? 0, plottedEntries: frame?.plottedCount ?? 0,
      observedPeak: frame?.metrics.loss.peak ?? null,
      fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      hoverProtocol: { input: "Trusted DOM mousemove timestamp, one requestAnimationFrame before the same renderer coordinate mapping and source inspection", endpoint: "React inspector DOM commit, then double-animation-frame paint proxy; correlate with trace Paint", ignoredPointerEvents, mode: "Discrete pointer moves while armed; busy moves are counted and ignored, not a continuous-sweep benchmark" },
      summary: { load: sampleSummary(ledger.samples, "load"), zoom: sampleSummary(ledger.samples, "zoom"), inspection: sampleSummary(ledger.samples, "inspection"), hover: sampleSummary(ledger.samples, "hover") },
      samples: ledger.samples,
    });
    const publishReport = () => setReportText(JSON.stringify(report(), null, 2));
    function releaseData() {
      epoch++;
      session?.cancel(); session = null;
      prepared = null; frame = null; summary = null; painted = false; loadedAt = null;
      cancelAnimationFrame(firstRaf); cancelAnimationFrame(secondRaf);
      for (const metric of METRICS) {
        try { renderers[metric]?.dispose(); } catch { /* Always remove the surface. */ }
        const surface = surfaces.current[metric];
        surface?.replaceChildren();
        surface?.removeAttribute("role");
        surface?.removeAttribute("aria-label");
      }
      renderers = {};
      models = {}; hoverEnabled = false; setHoverArmed(false);
      cancelAnimationFrame(hoverFrame);
    }
    function fail(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const pending = operation;
      operation = null;
      if (pending) { clearTimeout(pending.timer); ledger.fail(pending.id, message); }
      releaseData();
      setView({ ...emptyView, status: "Benchmark failed", error: message.slice(0, 240) });
      publishReport(); pending?.reject(new Error(message));
    }
    function completePaint(id: number) {
      if (operation?.id !== id || disposed) return;
      cancelAnimationFrame(firstRaf); cancelAnimationFrame(secondRaf);
      firstRaf = requestAnimationFrame(() => {
        secondRaf = requestAnimationFrame(() => {
          if (operation?.id !== id || disposed) return;
          const pending = operation;
          ledger.complete(id, pending.navigation);
          clearTimeout(pending.timer); operation = null; painted = true;
          setView((previous) => ({ ...previous, busy: false, loaded: true, status: "Ready — sample complete" }));
          publishReport(); pending.resolve();
        });
      });
    }
    function begin(kind: SampleKind, target: { viewport?: Viewport; step?: number; inputEventAtMs?: number }, navigation = false) {
      if (disposed) return Promise.reject(new Error("Benchmark is disposed"));
      const id = ledger.begin(kind, target);
      setHasSamples(true);
      setView((previous) => ({ ...previous, busy: true, error: null, status: `Running ${kind} sample ${id}` }));
      return new Promise<void>((resolve, reject) => {
        operation = { id, resolve, reject, navigation, timer: setTimeout(() => fail(new Error("Benchmark exceeded the 120-second watchdog")), timeoutMs) };
      });
    }
    function draw(nextFrame: RunFrame) {
      if (!operation || disposed) return;
      const pending = ledger.active!;
      if (pending.kind === "inspection" || pending.kind === "hover") return;
      if (pending.viewport && (pending.viewport.start !== nextFrame.viewport.start || pending.viewport.end !== nextFrame.viewport.end)) return;
      try {
        // Resolve label padding using lightweight frames first, avoiding an extra
        // copy of all raw chart vertices just to determine the shared budget.
        const grids = METRICS.map((metric) => buildMetricChartModel(metric, { ...nextFrame.metrics[metric], points: [], conflicts: [] }, nextFrame.viewport, METRIC_COLORS[metric])?.grid ?? { left: 68, right: 20, top: 16, bottom: 34 });
        const width = Math.min(...METRICS.map((metric, index) => drawablePlotWidth(surfaces.current[metric]!.clientWidth, grids[index])));
        if (nextFrame.viewport.width !== width) {
          if (++geometryCorrections > 3) throw new Error("Benchmark layout did not settle; reload at a fixed viewport");
          pending.viewport = { ...nextFrame.viewport, width };
          if (activeVariant === "raw") draw(buildFrame(prepared!, pending.viewport, "raw"));
          else session?.resize(width);
          return;
        }
        ledger.stage(operation.id, "sourceReadyAtMs");
        frame = nextFrame;
        pending.viewport = { ...frame.viewport };
        for (const metric of METRICS) {
          const element = surfaces.current[metric]!;
          renderers[metric] ??= createCanvasRenderer(element, { pointer: () => {}, leave: () => {} });
          const model = buildMetricChartModel(metric, frame.metrics[metric], frame.viewport, METRIC_COLORS[metric]);
          models[metric] = model ?? undefined;
          if (model) renderers[metric]!.render(model); else renderers[metric]!.clear();
        }
        if (frame.viewport.start <= 500_000 && frame.viewport.end >= 500_000 &&
          (frame.metrics.loss.peak?.step !== 500_000 || frame.metrics.loss.peak?.value !== 12)) throw new Error("Known source spike is missing");
        ledger.stage(operation.id, "drawSubmittedAtMs");
        setView((previous) => ({ ...previous, rows: summary!.rowCount, plotted: frame!.plottedCount, width, range: `${frame!.viewport.start}–${frame!.viewport.end}`, loaded: true }));
        completePaint(operation.id);
      } catch (error) { fail(error); }
    }
    function acceptInspection(inspection: StepInspection) {
      if (!ledger.active || !["inspection", "hover"].includes(ledger.active.kind) || ledger.active.step !== inspection.requestedStep || !operation) return;
      ledger.stage(operation.id, "sourceReadyAtMs");
      setView((previous) => ({ ...previous, inspection }));
    }
    async function load(mode: Variant, navigation = false) {
      if (operation) return Promise.reject(new Error("Wait for the active sample"));
      if (ledger.samples.length && activeVariant !== mode) return Promise.reject(new Error("Export this report and reload before changing variants"));
      releaseData(); activeVariant = mode; geometryCorrections = 0;
      const width = Math.max(1, Math.floor(Math.min(...METRICS.map((metric) => surfaces.current[metric]!.clientWidth)) - 88));
      const currentEpoch = epoch;
      const done = begin("load", {}, navigation);
      // Yield once before synchronous baseline work; this does not prove a paint.
      setTimeout(() => {
        if (disposed || epoch !== currentEpoch || !operation) return;
        try {
          if (mode === "raw") {
            prepared = prepareRun(generateRun("run-020")); summary = prepared.summary;
            loadedAt = new Date().toISOString();
            draw(buildFrame(prepared, { start: 0, end: 999_999, width }, "raw"));
          } else {
            session = createRunSession({ runId: "run-020", sourceVersion: descriptor.sourceVersion, width, requestTimeoutMs: timeoutMs,
              createWorker: createWorkerTransport, nextRequestId: () => ++sequence,
              onState(state) {
                if (disposed || currentEpoch !== epoch) return;
                if (state.error) { fail(new Error(state.error)); return; }
                if (state.summary) summary = state.summary;
                if (state.loadedAt) loadedAt = state.loadedAt;
                if (state.frame && !state.updating && state.frame !== frame) draw(state.frame);
                if (state.inspection) acceptInspection(state.inspection);
              },
            });
          }
        } catch (error) { fail(error); }
      }, 0);
      return done;
    }
    function zoom(start: number, end: number) {
      if (!painted || !frame) return Promise.reject(new Error("Load the run before zooming"));
      const viewport = { start, end, width: frame.viewport.width };
      geometryCorrections = 0;
      const done = begin("zoom", { viewport });
      try {
        if (activeVariant === "raw") draw(buildFrame(prepared!, viewport, "raw"));
        else session!.setViewport(start, end);
      } catch (error) { fail(error); }
      return done;
    }
    function inspect(step: number) {
      if (!painted || !frame) return Promise.reject(new Error("Load the run before inspecting"));
      const done = begin("inspection", { step });
      try {
        if (activeVariant === "raw") {
          const inspection = inspectStep(prepared!, step);
          inspection.column = inspectColumn(prepared!, step, frame.viewport);
          acceptInspection(inspection);
        } else session!.inspect(step);
      } catch (error) { fail(error); }
      return done;
    }
    return {
      load, report,
      inspectionCommitted(inspection: StepInspection | null) {
        if (!inspection || !operation || !ledger.active || !["inspection", "hover"].includes(ledger.active.kind) || ledger.active.step !== inspection.requestedStep) return;
        ledger.stage(operation.id, "drawSubmittedAtMs");
        completePaint(operation.id);
      },
      armHover() { hoverEnabled = !hoverEnabled; setHoverArmed(hoverEnabled); publishReport(); },
      pointer(metric: Metric, pixel: [number, number], inputEventAtMs: number, trusted: boolean) {
        if (!hoverEnabled || !trusted || !painted || !frame) return;
        if (operation || runningWorkload) { ignoredPointerEvents++; return; }
        const model = models[metric];
        if (!model) return;
        // Reject moves outside the grid before creating a sample. Inspection itself
        // uses the production Canvas coordinate conversion on the next frame.
        const surface = surfaces.current[metric]!;
        if (pixel[0] < model.grid.left || pixel[0] > surface.clientWidth - model.grid.right || pixel[1] < model.grid.top || pixel[1] > surface.clientHeight - model.grid.bottom) return;
        const done = begin("hover", { inputEventAtMs });
        void done.catch(() => {});
        hoverFrame = requestAnimationFrame(() => {
          try {
            const coordinate = renderers[metric]!.coordinate(pixel);
            if (coordinate === null || !Number.isFinite(coordinate)) throw new Error("Pointer left the chart grid");
            const step = model.x.decode(coordinate);
            ledger.active!.step = step;
            if (activeVariant === "raw") {
              const inspection = inspectStep(prepared!, step);
              inspection.column = inspectColumn(prepared!, step, frame!.viewport);
              acceptInspection(inspection);
            } else session!.inspect(step);
          } catch (error) { fail(error); }
        });
      },
      async workload(kind: "zoom" | "inspection" | "both") {
        if (runningWorkload || operation) throw new Error("A workload is already active");
        runningWorkload = true;
        const currentEpoch = epoch;
        try {
          if (kind !== "inspection") for (const [start, end] of zoomWorkload()) { if (epoch !== currentEpoch) throw new Error("Workload canceled"); await zoom(start, end); }
          if (kind !== "zoom") for (const step of inspectionWorkload()) { if (epoch !== currentEpoch) throw new Error("Workload canceled"); await inspect(step); }
        } finally { runningWorkload = false; publishReport(); }
      },
      unload() {
        if (operation) fail(new Error("Sample canceled by Unload"));
        else { releaseData(); setView(emptyView); publishReport(); }
      },
      dispose() { disposed = true; if (operation) { clearTimeout(operation.timer); operation.reject(new Error("Benchmark disposed")); operation = null; } releaseData(); },
    };
  }

  useEffect(() => {
    const current = createEngine(); engine.current = current;
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("variant") === "raw" ? "raw" : "optimized";
    variantRef.current = requested;
    // Defer initial query state out of the effect's synchronous lifecycle.
    const timer = setTimeout(() => {
      setVariant(requested);
      if (!initialization.current && query.get("autorun") === "1") {
        initialization.current = true;
        void current.load(requested, true).catch(() => {});
      }
    }, 0);
    return () => { clearTimeout(timer); current.dispose(); engine.current = null; };
    // This isolated measurement engine owns mutable data and reads DOM only at runtime.
  }, []);

  useLayoutEffect(() => { engine.current?.inspectionCommitted(view.inspection); }, [view.inspection]);

  async function run(kind: "zoom" | "inspection" | "both") {
    setRunning(true);
    try { await engine.current?.workload(kind); } catch (error) { setView((previous) => ({ ...previous, error: error instanceof Error ? error.message : "Workload failed" })); }
    finally { setRunning(false); }
  }
  function exportResults() {
    const data = JSON.stringify(engine.current?.report(), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `soup-browser-${variant}-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className={styles.page}>
    <Link href="/runs">Back to runs</Link>
    <h1>Browser performance comparison</h1>
    <p>Use a production build, a fixed viewport and verified 4× CPU slowdown. Both variants draw the same million-point source with the same Canvas adapter. Record a Chrome trace and Task Manager memory separately.</p>
    <div className={styles.controls}>
      <label>Variant <select aria-label="Benchmark variant" value={variant} disabled={hasSamples || view.loaded || view.busy} onChange={(event) => { const next = event.target.value as Variant; variantRef.current = next; setVariant(next); }}><option value="optimized">Worker + reduction</option><option value="raw">Raw main-thread baseline</option></select></label>
      <button disabled={view.busy || view.loaded || running} onClick={() => void engine.current?.load(variantRef.current).catch(() => {})}>Load million-point run</button>
      <button onClick={() => engine.current?.unload()}>Unload run</button>
      <button disabled={!view.loaded || view.busy || running} onClick={() => void run("both")}>Run 30 zooms + 30 inspections</button>
      <button disabled={!view.loaded || view.busy || running} onClick={() => void run("zoom")}>Run 30 zooms</button>
      <button disabled={!view.loaded || view.busy || running} onClick={() => void run("inspection")}>Run 30 inspections</button>
      <button disabled={view.busy || running} onClick={exportResults}>Export measurements</button>
      <button disabled={!view.loaded || view.busy || running} aria-pressed={hoverArmed} onClick={() => engine.current?.armHover()}>{hoverArmed ? "Stop hover capture" : "Start hover capture"}</button>
    </div>
    {hasSamples && <p>Variant locked for this report. Export results and reload to compare the other variant.</p>}
    <p className={styles.status} role="status">{view.status}</p>
    {view.error && <p role="alert">{view.error}</p>}
    <div className={styles.facts}><span>{formatCount(view.rows)} source rows</span><span>{formatCount(view.plotted)} drawing entries</span><span>{view.width} reduction columns</span><span>Steps {view.range}</span></div>
    <div className={styles.inspector} aria-live="polite">{view.inspection ? `Step ${view.inspection.step} · Loss ${formatExactValue(view.inspection.readings.loss.value)} · Learning rate ${formatExactValue(view.inspection.readings.lr.value)} · Gradient norm ${formatExactValue(view.inspection.readings.grad_norm.value)}` : "No observation selected"}</div>
    <div className={styles.charts}>{METRICS.map((metric) => <section key={metric}><h2>{METRIC_LABELS[metric]}</h2><div className={styles.chart} ref={(element) => { surfaces.current[metric] = element; }} data-testid={`benchmark-${metric}`} onMouseMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); engine.current?.pointer(metric, [event.clientX - rect.left, event.clientY - rect.top], event.timeStamp, event.isTrusted); }} /></section>)}</div>
    <details><summary>Measurement report and limits</summary><p>These timings end at a double-animation-frame paint proxy. They are not a Performance trace or total tab-memory measurement. A watchdog cannot interrupt synchronous main-thread work. Preserve failed samples and correlate successful endpoints with trace frames.</p><pre data-testid="benchmark-report" className={styles.results}>{reportText}</pre></details>
  </main>;
}
