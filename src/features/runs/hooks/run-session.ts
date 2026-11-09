import type {
  RunFrame, RunSummary, RunWorkerRequest,
  StepInspection, Viewport,
} from "../model/view-types";
import { isColumnInspection } from "../model/validate-column";
import { isRunFrame, isRunSummary, isStepInspection } from "../model/validate-view";

export interface RunState {
  runId: string;
  status: "loading" | "ready" | "error";
  summary: RunSummary | null;
  frame: RunFrame | null;
  inspection: StepInspection | null;
  error: string | null;
  updating: boolean;
  /** Retrieval time of the displayed snapshot, independent of source snapshotAt. */
  loadedAt: string | null;
  isPreviousSnapshot: boolean;
}

export interface RunTransport {
  postMessage(request: RunWorkerRequest): void;
  terminate(): void;
  listen(handlers: {
    message: (response: unknown) => void;
    error: () => void;
    messageError: () => void;
  }): void;
}

export interface RunSession {
  readonly runId: string;
  getState(): RunState;
  setViewport(start: number, end: number): void;
  inspect(step: number, sourceOffset?: number): void;
  resize(width: number): void;
  cancel(): void;
}

interface SessionOptions {
  runId: string;
  sourceVersion: string;
  width: number;
  previous?: RunState;
  createWorker(): RunTransport;
  onState(state: RunState): void;
  nextRequestId?: () => number;
  now?: () => string;
  /** No correlated response within this interval stops the session for manual retry. */
  requestTimeoutMs?: number;
  /** Schedule once after the delay and return a cancellation function. */
  scheduleTimeout?: (callback: () => void, delayMs: number) => () => void;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function loadingState(runId: string, previous?: RunState): RunState {
  if (previous?.runId === runId && previous.frame) {
    return {
      ...previous, status: "ready", updating: true, error: null,
      inspection: null, isPreviousSnapshot: true,
    };
  }
  return {
    runId, status: "loading", summary: null, frame: null, inspection: null,
    error: null, updating: false, loadedAt: null, isPreviousSnapshot: false,
  };
}

export function drawableWidth(width: number): number {
  return Number.isFinite(width) ? Math.min(16_384, Math.max(1, Math.round(width))) : 1;
}

function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.start === b.start && a.end === b.end && a.width === b.width;
}

/** Browser-independent session: one worker, bounded queues, and atomic frame commits. */
export function createRunSession(options: SessionOptions): RunSession {
  const { runId, sourceVersion } = options;
  const now = options.now ?? (() => new Date().toISOString());
  const requestTimeoutMs = typeof options.requestTimeoutMs === "number" && Number.isFinite(options.requestTimeoutMs) &&
    options.requestTimeoutMs >= 1 && options.requestTimeoutMs <= 2_147_483_647
    ? options.requestTimeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
  const scheduleTimeout = options.scheduleTimeout ?? ((callback: () => void, delayMs: number) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  });
  const deadlines = new Map<number, () => void>();
  let sequence = 0;
  const nextRequestId = options.nextRequestId ?? (() => ++sequence);
  let width = drawableWidth(options.width);
  const loadWidth = width;
  const loadId = nextRequestId();
  let loadPending = true;
  let active = true;
  let worker: RunTransport | null = null;
  let summary: RunSummary | null = null;
  let currentViewport: Viewport | null = null;
  let pendingLoadedAt: string | null = null;
  let initialFramePending = true;
  let viewportInFlight: number | null = null;
  let inspectionInFlight: number | null = null;
  let wantedViewport: Extract<RunWorkerRequest, { type: "viewport" }> | null = null;
  let wantedInspection: Extract<RunWorkerRequest, { type: "inspect" }> | null = null;
  const previous = options.previous?.frame?.sourceVersion === sourceVersion ? options.previous : undefined;
  let state = loadingState(runId, previous);

  function publish(change: Partial<RunState>) {
    if (!active) return;
    state = { ...state, ...change };
    options.onState(state);
  }

  function fail(message: unknown) {
    const error = typeof message === "string" && message.trim()
      ? message.slice(0, 200) : "The run response could not be read. Reload this run.";
    publish({ status: "error", error, updating: false });
  }

  function halt(message: unknown) {
    fail(message);
    session.cancel();
  }

  function clearDeadline(requestId: number | null) {
    if (requestId === null) return;
    const cancel = deadlines.get(requestId);
    deadlines.delete(requestId);
    cancel?.();
  }

  function startDeadline(request: RunWorkerRequest) {
    const cancel = scheduleTimeout(() => {
      // A canceled timer may already be queued; identity still decides whether
      // it can stop the session. New queued work cannot extend a stalled request.
      if (!active || !deadlines.has(request.requestId)) return;
      deadlines.delete(request.requestId);
      halt("Run processing did not respond. Reload the run to try again.");
    }, requestTimeoutMs);
    deadlines.set(request.requestId, cancel);
  }

  function send(request: RunWorkerRequest) {
    if (!active || !worker) return;
    try {
      startDeadline(request);
      worker.postMessage(request);
    } catch (error) {
      halt(error instanceof Error ? error.message : "Unable to send the run request. Reload this run.");
    }
  }

  function sendViewport() {
    if (!active || !wantedViewport || viewportInFlight !== null) return;
    viewportInFlight = wantedViewport.requestId;
    send(wantedViewport);
  }

  function sendInspection() {
    if (!active || !wantedInspection || inspectionInFlight !== null) return;
    inspectionInFlight = wantedInspection.requestId;
    send(wantedInspection);
  }

  function validFrame(frame: unknown, viewport: Viewport, sourceSummary: RunSummary): frame is RunFrame {
    return isRunFrame(frame, sourceSummary) && frame.runId === runId && frame.sourceVersion === sourceVersion &&
      sameViewport(frame.viewport, viewport);
  }

  function commitFrame(frame: RunFrame) {
    currentViewport = frame.viewport;
    publish({
      status: "ready", summary, frame, updating: false, error: null,
      loadedAt: pendingLoadedAt ?? state.loadedAt,
      isPreviousSnapshot: false,
    });
    pendingLoadedAt = null;
    if (initialFramePending && summary) {
      initialFramePending = false;
      if (summary.uniqueSteps) session.inspect(summary.lastStep);
    }
  }

  const session: RunSession = {
    runId,
    getState: () => state,
    setViewport(start, end) {
      if (!active || !summary || !Number.isFinite(start) || !Number.isFinite(end)) return;
      const lower = Math.max(summary.firstStep, Math.min(summary.lastStep, Math.round(Math.min(start, end))));
      const upper = Math.max(lower, Math.min(summary.lastStep, Math.round(Math.max(start, end))));
      const viewport = { start: lower, end: upper, width };
      const previousViewport = wantedViewport?.viewport ?? currentViewport;
      if (previousViewport && sameViewport(previousViewport, viewport)) return;
      wantedViewport = { type: "viewport", runId, requestId: nextRequestId(), viewport };
      // Discard inspection work tied to the previous geometry without blocking
      // future inspection on a reply that may never arrive.
      wantedInspection = null;
      clearDeadline(inspectionInFlight);
      inspectionInFlight = null;
      publish({
        updating: true, error: null,
        inspection: state.inspection ? { ...state.inspection, column: undefined } : null,
      });
      sendViewport();
    },
    inspect(step, sourceOffset = 0) {
      if (!active || !summary || initialFramePending || wantedViewport || !Number.isFinite(step) ||
        !Number.isSafeInteger(sourceOffset) || sourceOffset < 0) return;
      wantedInspection = {
        type: "inspect", runId, requestId: nextRequestId(),
        step: Math.max(summary.firstStep, Math.min(summary.lastStep, step)), sourceOffset,
        ...(currentViewport && { viewport: { ...currentViewport } }),
      };
      sendInspection();
    },
    resize(nextWidth) {
      const normalized = drawableWidth(nextWidth);
      if (!active || normalized === width) return;
      width = normalized;
      const viewport = wantedViewport?.viewport ?? currentViewport;
      if (viewport) session.setViewport(viewport.start, viewport.end);
    },
    cancel() {
      if (!active) return;
      active = false;
      wantedViewport = wantedInspection = null;
      for (const cancel of deadlines.values()) cancel();
      deadlines.clear();
      worker?.terminate();
    },
  };

  function receive(response: unknown) {
    if (!active || typeof response !== "object" || response === null || Array.isArray(response)) return;
    const message = response as Record<string, unknown>;
    if (message.runId !== runId || !Number.isSafeInteger(message.requestId)) return;
    const isLoad = loadPending && message.requestId === loadId;
    const isViewport = message.requestId === viewportInFlight;
    const isInspection = message.requestId === inspectionInFlight;
    if (!isLoad && !isViewport && !isInspection) return;
    clearDeadline(message.requestId as number);
    // Superseded replies release their queue slot, regardless of payload shape.
    // Validate only the result that can become the current visible state.
    if (isViewport && message.requestId !== wantedViewport?.requestId) {
      viewportInFlight = null;
      sendViewport();
      return;
    }
    if (isInspection && message.requestId !== wantedInspection?.requestId) {
      inspectionInFlight = null;
      sendInspection();
      return;
    }
    const expectedType = isLoad ? "loaded" : isViewport ? "frame" : "inspection";
    if (message.type !== "error" && message.type !== expectedType) {
      halt("The worker returned an unexpected response. Reload this run.");
      return;
    }
    if (message.type === "loaded") {
      const incoming = message.summary;
      if (!isRunSummary(incoming) || !validFrame(message.frame,
        { start: incoming.firstStep, end: incoming.lastStep, width: loadWidth }, incoming)) {
        halt("The worker returned invalid run data, source identity, or range. Reload this run.");
        return;
      }
      loadPending = false;
      summary = incoming;
      currentViewport = message.frame.viewport;
      pendingLoadedAt = now();
      if (currentViewport.width !== width) {
        // Retain an older complete snapshot until its replacement has matching
        // geometry. Never pair the new summary with an old frame.
        session.setViewport(currentViewport.start, currentViewport.end);
      } else {
        commitFrame(message.frame);
      }
      return;
    }
    if (message.type === "frame") {
      viewportInFlight = null;
      if (wantedViewport && message.requestId === wantedViewport.requestId) {
        if (!summary || !validFrame(message.frame, wantedViewport.viewport, summary)) {
          halt("The chart contains invalid data or does not match the requested source and step range. Reload this run.");
          return;
        }
        wantedViewport = null;
        commitFrame(message.frame);
      }
      sendViewport();
      return;
    }
    if (message.type === "inspection") {
      inspectionInFlight = null;
      if (wantedInspection && message.requestId === wantedInspection.requestId) {
        const inspection = message.inspection;
        if (!summary || !isStepInspection(inspection, summary)) {
          halt("The observation contains invalid readings or source rows. Reload this run.");
          return;
        }
        const expectedOffset = Math.min(Math.floor((wantedInspection.sourceOffset ?? 0) / 20) * 20, Math.floor((inspection.sourceCount - 1) / 20) * 20);
        if (inspection.requestedStep !== wantedInspection.step || inspection.sourceOffset !== expectedOffset) {
          halt("The observation does not match the requested step or source page. Reload this run.");
          return;
        }
        if (wantedInspection.viewport && !isColumnInspection(
          inspection.column, summary, wantedInspection.viewport, wantedInspection.step,
        )) {
          halt("The chart column does not match the selected data and range. Reload this run.");
          return;
        }
        wantedInspection = null;
        publish({ inspection, status: "ready", error: null });
      }
      sendInspection();
      return;
    }
    if (message.type === "error") {
      if (loadPending && message.requestId === loadId) {
        halt(message.message);
        return;
      }
      if (message.requestId === viewportInFlight) {
        viewportInFlight = null;
        if (message.requestId === wantedViewport?.requestId) {
          wantedViewport = null;
          fail(message.message);
        }
        sendViewport();
      }
      if (message.requestId === inspectionInFlight) {
        inspectionInFlight = null;
        if (message.requestId === wantedInspection?.requestId) {
          wantedInspection = null;
          fail(message.message);
        }
        sendInspection();
      }
    }
  }

  options.onState(state);
  try {
    worker = options.createWorker();
    worker.listen({
      message: receive,
      error: () => halt("Run processing stopped unexpectedly. Reload the run to try again."),
      messageError: () => halt("The run response could not be read. Reload the run to try again."),
    });
    send({ type: "load", runId, requestId: loadId, width: loadWidth });
  } catch (error) {
    halt(error instanceof Error ? error.message : "Unable to load this run.");
  }
  return session;
}
