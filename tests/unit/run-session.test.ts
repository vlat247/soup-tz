import { describe, expect, it } from "vitest";
import {
  createRunSession, type RunState, type RunTransport,
} from "../../src/features/runs/hooks/run-session";
import type {
  MetricFrame, Reading, RunFrame, RunSummary, RunWorkerRequest,
  RunWorkerResponse, StepInspection, Viewport,
} from "../../src/features/runs/model/view-types";

type Request<T extends RunWorkerRequest["type"]> = Extract<RunWorkerRequest, { type: T }>;
const SOURCE_VERSION = "unchanged-historical-fixture-v1";
const FIRST_LOAD = "2026-11-10T12:00:00.000Z";
const SECOND_LOAD = "2026-11-10T12:05:00.000Z";

class FakeWorker implements RunTransport {
  sent: RunWorkerRequest[] = [];
  terminated = 0;
  handlers: Parameters<RunTransport["listen"]>[0] | null = null;
  throwOn: RunWorkerRequest["type"] | null = null;
  postMessage(request: RunWorkerRequest) {
    if (request.type === this.throwOn) throw new Error("Cannot send worker message");
    this.sent.push(request);
  }
  terminate() { this.terminated++; }
  listen(handlers: Parameters<RunTransport["listen"]>[0]) { this.handlers = handlers; }
  reply(response: RunWorkerResponse) { this.handlers?.message(response); }
  latest<T extends RunWorkerRequest["type"]>(type: T): Request<T> {
    const request = this.sent.findLast((entry) => entry.type === type);
    if (!request) throw new Error(`No ${type} request was sent`);
    return request as Request<T>;
  }
}

function finite(value = 1): Reading { return { kind: "finite", value }; }

function summary(lastStep = 99): RunSummary {
  return {
    rowCount: lastStep + 1, uniqueSteps: lastStep + 1, firstStep: 0, lastStep,
    duplicateRows: 0, rejectedRows: 0, gapCount: 0, missingSteps: 0, outOfOrder: false,
    invalidCounts: { loss: 0, lr: 0, grad_norm: 0 },
    missingCounts: { loss: 0, lr: 0, grad_norm: 0 },
    conflictSteps: { loss: 0, lr: 0, grad_norm: 0 },
    latest: { loss: finite(), lr: finite(), grad_norm: finite() },
    lastFinite: { loss: { step: lastStep, value: 1 }, lr: { step: lastStep, value: 1 }, grad_norm: { step: lastStep, value: 1 } },
    extents: { loss: [1, 2], lr: [1, 2], grad_norm: [1, 2] },
  };
}

function frame(runId: string, viewport: Viewport): RunFrame {
  const metric: MetricFrame = {
    points: [[viewport.start, 2], [viewport.end, 1]], conflicts: [], domain: [1, 2],
    finiteCount: viewport.end - viewport.start + 1, invalidCount: 0, missingCount: 0, conflictCount: 0,
    mode: "line", peak: { step: viewport.start, value: 2 },
  };
  return {
    runId, sourceVersion: SOURCE_VERSION, viewport,
    metrics: { loss: metric, lr: { ...metric }, grad_norm: { ...metric } },
    sourceCount: viewport.end - viewport.start + 1, plottedCount: 6,
  };
}

function inspected(request: Request<"inspect">, sourceCount = 1): StepInspection {
  const sourceOffset = Math.min(Math.floor((request.sourceOffset ?? 0) / 20) * 20, Math.floor((sourceCount - 1) / 20) * 20);
  const step = Math.round(request.step);
  const readings = { loss: finite(), lr: finite(), grad_norm: finite() };
  return {
    requestedStep: request.step, step, previousStep: step > 0 ? step - 1 : null,
    nextStep: step < 99 ? step + 1 : null, inGap: false, readings, sourceOffset, sourceCount,
    sourceRows: Array.from({ length: Math.min(20, sourceCount - sourceOffset) }, (_, index) => ({
      sourceIndex: sourceOffset + index, readings,
    })),
  };
}

function setup(options: { runId?: string; width?: number; previous?: RunState; now?: string; worker?: FakeWorker } = {}) {
  const worker = options.worker ?? new FakeWorker();
  const states: RunState[] = [];
  let clock = options.now ?? FIRST_LOAD;
  const session = createRunSession({
    runId: options.runId ?? "run-a", sourceVersion: SOURCE_VERSION, width: options.width ?? 800,
    previous: options.previous, createWorker: () => worker,
    onState: (state) => states.push(state), now: () => clock,
  });
  return { worker, session, states, setNow: (value: string) => { clock = value; } };
}

type Harness = ReturnType<typeof setup>;

function finishLoad(harness: Harness, sourceSummary = summary()) {
  const request = harness.worker.latest("load");
  const loadedFrame = frame(request.runId, { start: sourceSummary.firstStep, end: sourceSummary.lastStep, width: request.width });
  harness.worker.reply({ type: "loaded", runId: request.runId, requestId: request.requestId, summary: sourceSummary, frame: loadedFrame });
  return loadedFrame;
}

function finishFrame(harness: Harness, request = harness.worker.latest("viewport")) {
  const result = frame(request.runId, request.viewport);
  harness.worker.reply({ type: "frame", runId: request.runId, requestId: request.requestId, frame: result });
  return result;
}

function finishInspection(harness: Harness, request = harness.worker.latest("inspect"), count = 1) {
  const inspection = inspected(request, count);
  harness.worker.reply({ type: "inspection", runId: request.runId, requestId: request.requestId, inspection });
  return inspection;
}

describe("run identity and snapshot loading", () => {
  it("publishes one complete source frame and records retrieval time separately", () => {
    const h = setup();
    expect(h.session.getState()).toMatchObject({ status: "loading", frame: null, summary: null, loadedAt: null });
    const result = finishLoad(h);
    expect(h.session.getState()).toMatchObject({ status: "ready", frame: result, loadedAt: FIRST_LOAD, isPreviousSnapshot: false });
    expect(result.sourceVersion).toBe(SOURCE_VERSION);
    expect(h.worker.latest("inspect").step).toBe(99);
  });

  it("rejects late A replies after switching to B, including A to B to A", () => {
    const a = setup({ runId: "run-a" });
    const loadA = a.worker.latest("load");
    a.session.cancel();
    const b = setup({ runId: "run-b", previous: a.session.getState() });
    expect(b.session.getState().frame).toBeNull();
    const resultB = finishLoad(b);
    const bState = b.session.getState();
    finishLoad(a);
    a.worker.reply({ type: "error", runId: "run-a", requestId: loadA.requestId, message: "Late failure" });
    expect(b.session.getState()).toBe(bState);
    expect(b.session.getState().frame).toBe(resultB);
    expect(a.states).toHaveLength(1);
    b.session.cancel();
    const newA = setup({ runId: "run-a", previous: bState });
    finishLoad(a);
    expect(newA.session.getState().frame).toBeNull();
    finishLoad(newA);
    expect(a.worker.terminated).toBe(1);
    expect(b.worker.terminated).toBe(1);
  });

  it("ignores wrong run IDs, unsolicited replies, and replayed load results/errors", () => {
    const h = setup();
    const load = h.worker.latest("load");
    h.worker.reply({ type: "loaded", runId: "wrong-run", requestId: load.requestId, summary: summary(), frame: frame("wrong-run", { start: 0, end: 99, width: 800 }) });
    expect(h.session.getState().frame).toBeNull();
    finishLoad(h);
    h.session.setViewport(10, 20);
    const zoomed = finishFrame(h);
    const current = h.session.getState();
    finishLoad(h);
    h.worker.reply({ type: "error", runId: load.runId, requestId: load.requestId, message: "Replayed load failure" });
    h.worker.reply({ type: "frame", runId: load.runId, requestId: 999, frame: frame(load.runId, { start: 0, end: 99, width: 800 }) });
    expect(h.session.getState()).toBe(current);
    expect(current.frame).toBe(zoomed);
  });

  it.each(["source", "range"])("rejects a load with a mismatched %s", (mismatch) => {
    const h = setup();
    const load = h.worker.latest("load");
    const result = frame(load.runId, { start: 0, end: 99, width: 800 });
    if (mismatch === "source") result.sourceVersion = "wrong-version";
    else result.viewport.end = 98;
    h.worker.reply({ type: "loaded", runId: load.runId, requestId: load.requestId, summary: summary(), frame: result });
    expect(h.session.getState()).toMatchObject({ status: "error", frame: null, loadedAt: null });
    expect(h.worker.terminated).toBe(1);
  });

  it("waits for the final width when resized during initial load", () => {
    const h = setup({ width: 800 });
    h.session.resize(400);
    h.session.resize(320);
    finishLoad(h);
    expect(h.session.getState()).toMatchObject({ status: "loading", frame: null, summary: null, updating: true, loadedAt: null });
    expect(h.worker.latest("viewport").viewport.width).toBe(320);
    finishFrame(h);
    expect(h.session.getState()).toMatchObject({ status: "ready", loadedAt: FIRST_LOAD, updating: false });
  });
});

describe("viewport and inspection races", () => {
  it("coalesces overlapping zoom/resize requests and never pairs new axes with the previous frame", () => {
    const h = setup();
    const original = finishLoad(h);
    h.session.setViewport(10, 90);
    const old = h.worker.latest("viewport");
    h.session.setViewport(20, 80);
    h.session.resize(400);
    expect(h.worker.sent.filter((request) => request.type === "viewport")).toHaveLength(1);
    finishFrame(h, old);
    expect(h.session.getState().frame).toBe(original);
    expect(h.session.getState().updating).toBe(true);
    const latest = h.worker.latest("viewport");
    expect(latest.viewport).toEqual({ start: 20, end: 80, width: 400 });
    expect(latest.requestId).toBeGreaterThan(old.requestId);
    const result = finishFrame(h, latest);
    expect(h.session.getState().frame).toBe(result);
    expect(h.session.getState().updating).toBe(false);
    finishFrame(h, old);
    expect(h.session.getState().frame).toBe(result);
    expect(h.session.getState().loadedAt).toBe(FIRST_LOAD);
  });

  it("ignores an obsolete viewport error and continues the latest queued request", () => {
    const h = setup();
    const original = finishLoad(h);
    h.session.setViewport(10, 80);
    const old = h.worker.latest("viewport");
    h.session.setViewport(20, 70);
    h.worker.reply({ type: "error", runId: old.runId, requestId: old.requestId, message: "Obsolete zoom failed" });
    expect(h.session.getState()).toMatchObject({ frame: original, error: null, updating: true });
    const result = finishFrame(h);
    expect(h.session.getState().frame).toBe(result);
  });

  it.each(["source", "width", "range"])("rejects a latest frame with the wrong %s", (mismatch) => {
    const h = setup();
    const original = finishLoad(h);
    h.session.setViewport(10, 20);
    const request = h.worker.latest("viewport");
    const result = frame(request.runId, { ...request.viewport });
    if (mismatch === "source") result.sourceVersion = "different-source";
    if (mismatch === "width") result.viewport.width++;
    if (mismatch === "range") result.viewport.start++;
    h.worker.reply({ type: "frame", runId: request.runId, requestId: request.requestId, frame: result });
    expect(h.session.getState()).toMatchObject({ status: "error", frame: original, updating: false });
    expect(h.worker.terminated).toBe(1);
  });

  it("invalidates old hover work on zoom without blocking inspection behind its late reply", () => {
    const h = setup();
    finishLoad(h);
    const oldHover = h.worker.latest("inspect");
    h.session.setViewport(10, 30);
    h.session.inspect(20);
    expect(h.worker.latest("inspect")).toBe(oldHover);
    finishFrame(h);
    h.session.inspect(20.5);
    const nextHover = h.worker.latest("inspect");
    expect(nextHover.step).toBe(20.5);
    const wanted = finishInspection(h, nextHover);
    finishInspection(h, oldHover);
    expect(h.session.getState().inspection).toBe(wanted);
  });

  it("keeps only the newest inspection step/page and rejects late page results", () => {
    const h = setup();
    finishLoad(h);
    finishInspection(h);
    h.session.inspect(10, 0);
    const first = h.worker.latest("inspect");
    h.session.inspect(10, 20);
    h.session.inspect(11, 40);
    const previous = h.session.getState().inspection;
    finishInspection(h, first, 45);
    expect(h.session.getState().inspection).toBe(previous);
    const last = h.worker.latest("inspect");
    expect(last).toMatchObject({ step: 11, sourceOffset: 40 });
    const result = finishInspection(h, last, 45);
    finishInspection(h, first, 45);
    expect(h.session.getState().inspection).toBe(result);
  });

  it("accepts documented page-boundary normalization and clamping", () => {
    const h = setup();
    finishLoad(h);
    finishInspection(h);
    for (const [offset, expected] of [[1, 0], [21, 20], [999, 40]]) {
      h.session.inspect(10, offset);
      finishInspection(h, h.worker.latest("inspect"), 45);
      expect(h.session.getState().inspection?.sourceOffset).toBe(expected);
      expect(h.session.getState().error).toBeNull();
    }
  });

  it.each(["step", "page", "invalid-count"])("rejects an invalid inspection %s even with the current request ID", (mismatch) => {
    const h = setup();
    finishLoad(h);
    finishInspection(h);
    h.session.inspect(10, 20);
    const request = h.worker.latest("inspect");
    const result = inspected(request, 45);
    if (mismatch === "step") result.requestedStep = 11;
    else if (mismatch === "page") result.sourceOffset = 0;
    else { result.sourceCount = 0; result.sourceOffset = -1; }
    h.worker.reply({ type: "inspection", runId: request.runId, requestId: request.requestId, inspection: result });
    expect(h.session.getState().status).toBe("error");
    expect(h.worker.terminated).toBe(1);
  });

  it("retains a complete frame on a current viewport failure and can retry", () => {
    const h = setup();
    const original = finishLoad(h);
    h.session.setViewport(10, 20);
    const failed = h.worker.latest("viewport");
    h.worker.reply({ type: "error", runId: failed.runId, requestId: failed.requestId, message: "Zoom failed" });
    expect(h.session.getState()).toMatchObject({ status: "error", frame: original, error: "Zoom failed", updating: false });
    h.session.setViewport(10, 20);
    const recovered = finishFrame(h);
    expect(h.session.getState()).toMatchObject({ status: "ready", frame: recovered, error: null });
  });
});

describe("worker failures, reloads, and historical snapshots", () => {
  it("retains the old summary/frame/timestamp atomically through refresh and resize", () => {
    const initial = setup();
    const oldFrame = finishLoad(initial);
    const oldState = initial.session.getState();
    initial.session.cancel();
    const refresh = setup({ previous: oldState, now: SECOND_LOAD });
    expect(refresh.session.getState()).toMatchObject({ frame: oldFrame, summary: oldState.summary, loadedAt: FIRST_LOAD, isPreviousSnapshot: true, updating: true });
    refresh.session.resize(400);
    finishLoad(refresh, summary(199));
    expect(refresh.session.getState()).toMatchObject({ frame: oldFrame, summary: oldState.summary, loadedAt: FIRST_LOAD, isPreviousSnapshot: true });
    const newFrame = finishFrame(refresh);
    expect(refresh.session.getState()).toMatchObject({ status: "ready", frame: newFrame, loadedAt: SECOND_LOAD, isPreviousSnapshot: false });
    expect(refresh.session.getState().summary?.lastStep).toBe(199);
    expect(newFrame.sourceVersion).toBe(oldFrame.sourceVersion);
  });

  it("keeps the historical source and previous load time after a failed reload, then recovers", () => {
    const initial = setup();
    const original = finishLoad(initial);
    initial.session.cancel();
    const refresh = setup({ previous: initial.session.getState(), now: SECOND_LOAD });
    const load = refresh.worker.latest("load");
    refresh.worker.reply({ type: "error", runId: load.runId, requestId: load.requestId, message: "Reload failed" });
    expect(refresh.session.getState()).toMatchObject({ status: "error", frame: original, loadedAt: FIRST_LOAD, isPreviousSnapshot: true, error: "Reload failed", updating: false });
    finishLoad(refresh);
    expect(refresh.session.getState().loadedAt).toBe(FIRST_LOAD);
    const retry = setup({ previous: refresh.session.getState(), now: SECOND_LOAD });
    finishLoad(retry);
    expect(retry.session.getState()).toMatchObject({ status: "ready", loadedAt: SECOND_LOAD, isPreviousSnapshot: false, error: null });
    expect(retry.session.getState().frame?.sourceVersion).toBe(SOURCE_VERSION);
  });

  it.each(["error", "messageError"] as const)("terminates on worker %s and ignores all later messages", (event) => {
    const h = setup();
    const original = finishLoad(h);
    h.worker.handlers?.[event]();
    const failed = h.session.getState();
    expect(failed).toMatchObject({ status: "error", frame: original, updating: false });
    finishLoad(h);
    finishInspection(h);
    h.session.setViewport(20, 30);
    h.session.cancel();
    expect(h.session.getState()).toBe(failed);
    expect(h.worker.terminated).toBe(1);
  });

  it.each(["load", "viewport", "inspect"] as const)("turns %s postMessage exceptions into a recoverable error", (type) => {
    const worker = new FakeWorker();
    if (type === "load") worker.throwOn = "load";
    const h = setup({ worker });
    if (type !== "load") {
      finishLoad(h);
      finishInspection(h);
      worker.throwOn = type;
      if (type === "viewport") h.session.setViewport(10, 20);
      else h.session.inspect(10);
    }
    expect(h.session.getState()).toMatchObject({ status: "error", error: "Cannot send worker message", updating: false });
    expect(worker.terminated).toBe(1);
  });

  it("reports worker construction failures without scheduling automatic retries", () => {
    let attempts = 0;
    const session = createRunSession({
      runId: "run-a", sourceVersion: SOURCE_VERSION, width: 800,
      createWorker: () => { attempts++; throw new Error("Worker unavailable"); },
      onState: () => {},
    });
    expect(session.getState()).toMatchObject({ status: "error", frame: null, error: "Worker unavailable" });
    session.resize(300);
    session.inspect(10);
    expect(attempts).toBe(1);
  });
});

describe("worker response contract", () => {
  it("rejects a finite-tagged NaN summary instead of publishing it", () => {
    const h = setup();
    const sourceSummary = summary();
    sourceSummary.latest.loss = { kind: "finite", value: NaN };
    finishLoad(h, sourceSummary);
    expect(h.session.getState()).toMatchObject({ status: "error", summary: null, frame: null });
    expect(h.worker.terminated).toBe(1);
  });

  it("retains the complete prior frame when a current metric payload is absent", () => {
    const h = setup();
    const original = finishLoad(h);
    h.session.setViewport(10, 20);
    const request = h.worker.latest("viewport");
    const result = { ...frame(request.runId, request.viewport), metrics: null };
    h.worker.reply({ type: "frame", runId: request.runId, requestId: request.requestId, frame: result } as unknown as RunWorkerResponse);
    expect(h.session.getState()).toMatchObject({ status: "error", frame: original, loadedAt: FIRST_LOAD });
    expect(h.worker.terminated).toBe(1);
  });

  it("turns malformed worker errors into a bounded recoverable message", () => {
    const h = setup();
    const request = h.worker.latest("load");
    expect(() => h.worker.reply({ type: "error", runId: request.runId, requestId: request.requestId, message: null } as unknown as RunWorkerResponse)).not.toThrow();
    expect(h.session.getState()).toMatchObject({ status: "error", updating: false });
    expect(h.session.getState().error?.length).toBeLessThanOrEqual(200);
    expect(h.worker.terminated).toBe(1);
  });

  it("rejects source pages whose rows do not match the declared count", () => {
    const h = setup();
    finishLoad(h);
    const request = h.worker.latest("inspect");
    const result = inspected(request);
    result.sourceRows.push(result.sourceRows[0]);
    h.worker.reply({ type: "inspection", runId: request.runId, requestId: request.requestId, inspection: result });
    expect(h.session.getState()).toMatchObject({ status: "error", inspection: null });
    expect(h.worker.terminated).toBe(1);
  });

  it("rejects a wrong response kind for a current request", () => {
    const h = setup();
    const request = h.worker.latest("load");
    h.worker.reply({ type: "unexpected", runId: request.runId, requestId: request.requestId } as unknown as RunWorkerResponse);
    expect(h.session.getState().status).toBe("error");
    expect(h.worker.terminated).toBe(1);
  });

  it("discards malformed obsolete payloads before validation and sends the latest request", () => {
    const h = setup();
    const original = finishLoad(h);
    h.session.setViewport(10, 80);
    const obsolete = h.worker.latest("viewport");
    h.session.setViewport(20, 70);
    h.worker.reply({ type: "unexpected", runId: obsolete.runId, requestId: obsolete.requestId } as unknown as RunWorkerResponse);
    expect(h.session.getState()).toMatchObject({ frame: original, updating: true, error: null });
    expect(h.worker.latest("viewport").viewport).toMatchObject({ start: 20, end: 70 });
    finishFrame(h);
    expect(h.session.getState().status).toBe("ready");
  });
});
