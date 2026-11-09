"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRunDescriptor } from "../data/manifest";
import type {
  RunFrame, RunSummary, RunWorkerRequest, RunWorkerResponse,
  StepInspection, Viewport,
} from "../model/view-types";

interface RunState {
  runId: string;
  status: "loading" | "ready" | "error";
  summary: RunSummary | null;
  frame: RunFrame | null;
  inspection: StepInspection | null;
  error: string | null;
  updating: boolean;
}

interface Session {
  setViewport: (start: number, end: number) => void;
  inspect: (step: number) => void;
  resize: () => void;
  cancel: () => void;
}

function loadingState(runId: string): RunState {
  return { runId, status: "loading", summary: null, frame: null, inspection: null, error: null, updating: false };
}

function drawableWidth(width: number): number {
  return Number.isFinite(width) ? Math.min(16_384, Math.max(1, Math.round(width))) : 1;
}

/** One worker owns the full source; React receives only summaries and render data. */
export function useRun(runId: string, width: number) {
  const [state, setState] = useState<RunState>(() => loadingState(runId));
  const [refreshVersion, setRefreshVersion] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const widthRef = useRef(drawableWidth(width));
  const sequenceRef = useRef(0);

  useEffect(() => {
    const next = drawableWidth(width);
    if (widthRef.current === next) return;
    widthRef.current = next;
    sessionRef.current?.resize();
  }, [width]);

  useEffect(() => {
    let active = true;
    let worker: Worker | null = null;
    let summary: RunSummary | null = null;
    let currentViewport: Viewport | null = null;
    let viewportInFlight: number | null = null;
    let inspectionInFlight: number | null = null;
    let wantedViewport: Extract<RunWorkerRequest, { type: "viewport" }> | null = null;
    let wantedInspection: Extract<RunWorkerRequest, { type: "inspect" }> | null = null;
    let initialInspectionPending = true;
    const loadId = ++sequenceRef.current;

    const fail = (message: string) => {
      if (!active) return;
      setState((previous) => ({
        ...(previous.runId === runId ? previous : loadingState(runId)),
        status: "error", error: message, updating: false,
      }));
    };

    const sendViewport = () => {
      if (!worker || !wantedViewport || viewportInFlight !== null) return;
      viewportInFlight = wantedViewport.requestId;
      worker.postMessage(wantedViewport);
    };

    const sendInspection = () => {
      if (!worker || !wantedInspection || inspectionInFlight !== null) return;
      inspectionInFlight = wantedInspection.requestId;
      worker.postMessage(wantedInspection);
    };

    const session: Session = {
      setViewport(start, end) {
        if (!active || !summary || !Number.isFinite(start) || !Number.isFinite(end)) return;
        const lower = Math.max(summary.firstStep, Math.min(summary.lastStep, Math.round(Math.min(start, end))));
        const upper = Math.max(lower, Math.min(summary.lastStep, Math.round(Math.max(start, end))));
        const viewport = { start: lower, end: upper, width: widthRef.current };
        const previous = wantedViewport?.viewport ?? currentViewport;
        if (previous && previous.start === lower && previous.end === upper && previous.width === viewport.width) return;
        wantedViewport = { type: "viewport", runId, requestId: ++sequenceRef.current, viewport };
        // A pointer reply from the previous geometry must not become the new selection.
        wantedInspection = null;
        // An already inspected source observation remains valid across zooms.
        // Keeping it mounted also preserves keyboard focus in the inspector.
        setState((previousState) => ({ ...previousState, updating: true, error: null }));
        sendViewport();
      },
      inspect(step) {
        // While the old frame is retained, its pointer geometry is obsolete.
        if (!active || !summary || wantedViewport || !Number.isFinite(step)) return;
        wantedInspection = {
          type: "inspect", runId, requestId: ++sequenceRef.current,
          step: Math.max(summary.firstStep, Math.min(summary.lastStep, step)),
        };
        sendInspection();
      },
      resize() {
        const viewport = wantedViewport?.viewport ?? currentViewport;
        if (viewport) session.setViewport(viewport.start, viewport.end);
      },
      cancel() {
        active = false;
        wantedViewport = null;
        wantedInspection = null;
        worker?.terminate();
        if (sessionRef.current === session) sessionRef.current = null;
      },
    };
    sessionRef.current = session;

    const halt = (message: string) => {
      fail(message);
      session.cancel();
    };

    try {
      const sourceVersion = getRunDescriptor(runId).sourceVersion;
      worker = new Worker(new URL("../worker/run.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<RunWorkerResponse>) => {
        const message = event.data;
        if (!active || message.runId !== runId) return;

        if (message.type === "loaded") {
          if (message.requestId !== loadId) return;
          if (message.frame.runId !== runId || message.frame.sourceVersion !== sourceVersion) {
            halt("The worker returned a different source snapshot. Reload this run.");
            return;
          }
          summary = message.summary;
          currentViewport = message.frame.viewport;
          const resizedDuringLoad = currentViewport.width !== widthRef.current;
          setState({
            runId, status: resizedDuringLoad ? "loading" : "ready", summary,
            frame: resizedDuringLoad ? null : message.frame,
            inspection: null, error: null, updating: resizedDuringLoad,
          });
          if (resizedDuringLoad) session.resize();
          else {
            initialInspectionPending = false;
            session.inspect(summary.lastStep);
          }
          return;
        }

        if (message.type === "frame") {
          if (message.requestId !== viewportInFlight) return;
          viewportInFlight = null;
          if (message.requestId === wantedViewport?.requestId) {
            const requested = wantedViewport.viewport;
            const returned = message.frame.viewport;
            if (message.frame.runId !== runId || message.frame.sourceVersion !== sourceVersion
              || returned.start !== requested.start || returned.end !== requested.end || returned.width !== requested.width) {
              halt("The chart does not match the requested source and step range. Reload this run.");
              return;
            }
            currentViewport = message.frame.viewport;
            wantedViewport = null;
            setState((previous) => ({
              ...previous, runId, status: "ready", summary, frame: message.frame,
              updating: false, error: null,
            }));
            if (initialInspectionPending && summary) {
              initialInspectionPending = false;
              session.inspect(summary.lastStep);
            }
          }
          sendViewport();
          return;
        }

        if (message.type === "inspection") {
          if (message.requestId !== inspectionInFlight) return;
          inspectionInFlight = null;
          if (message.requestId === wantedInspection?.requestId) {
            wantedInspection = null;
            setState((previous) => ({ ...previous, inspection: message.inspection }));
          }
          sendInspection();
          return;
        }

        if (message.type === "error") {
          if (message.requestId === loadId) fail(message.message);
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
      };
      worker.onerror = () => halt("Run processing stopped unexpectedly. Reload the run to try again.");
      worker.onmessageerror = () => halt("The run response could not be read. Reload the run to try again.");
      const load: RunWorkerRequest = { type: "load", runId, requestId: loadId, width: widthRef.current };
      worker.postMessage(load);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load this run.";
      queueMicrotask(() => { if (active) halt(message); });
    }

    return () => {
      session.cancel();
    };
  }, [runId, refreshVersion]);

  const setViewport = useCallback((start: number, end: number) => sessionRef.current?.setViewport(start, end), []);
  const inspect = useCallback((step: number) => sessionRef.current?.inspect(step), []);
  const refresh = useCallback(() => {
    // Invalidate immediately; a queued reply must not win before effect cleanup.
    sessionRef.current?.cancel();
    setState((previous) => previous.runId === runId && previous.frame
      ? { ...previous, status: "ready", error: null, updating: true, inspection: null }
      : loadingState(runId));
    setRefreshVersion((version) => version + 1);
  }, [runId]);

  // Route changes are cleared during render, before effect cleanup can run.
  const current = state.runId === runId ? state : loadingState(runId);
  return { ...current, setViewport, inspect, refresh };
}
