"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRunDescriptor } from "../data/manifest";
import {
  createRunSession, drawableWidth, loadingState,
  type RunSession, type RunState, type RunTransport,
} from "./run-session";

export function createWorkerTransport(): RunTransport {
  const worker = new Worker(new URL("../worker/run.worker.ts", import.meta.url), {
    type: "module",
  });
  return {
    postMessage: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
    listen(handlers) {
      worker.onmessage = (event) => handlers.message(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        handlers.error();
      };
      worker.onmessageerror = handlers.messageError;
    },
  };
}

/** Full source stays in one worker; only complete frames reach React state. */
export interface RunEnvironment {
  createTransport?: () => RunTransport;
  requestTimeoutMs?: number;
}

export function useRun(runId: string, width: number, environment: RunEnvironment = {}) {
  const { createTransport = createWorkerTransport, requestTimeoutMs } = environment;
  const [state, setState] = useState<RunState>(() => loadingState(runId));
  const [refreshVersion, setRefreshVersion] = useState(0);
  const stateRef = useRef(state);
  const sessionRef = useRef<RunSession | null>(null);
  const widthRef = useRef(drawableWidth(width));
  const sequenceRef = useRef(0);

  useEffect(() => {
    widthRef.current = drawableWidth(width);
    if (sessionRef.current?.runId === runId) {
      sessionRef.current.resize(widthRef.current);
    }
  }, [runId, width]);

  useEffect(() => {
    const session = createRunSession({
      runId,
      sourceVersion: getRunDescriptor(runId).sourceVersion,
      width: widthRef.current,
      previous: stateRef.current,
      createWorker: createTransport,
      requestTimeoutMs,
      nextRequestId: () => ++sequenceRef.current,
      onState(next) {
        stateRef.current = next;
        setState(next);
      },
    });
    sessionRef.current = session;
    return () => {
      session.cancel();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [runId, refreshVersion, createTransport, requestTimeoutMs]);

  const setViewport = useCallback((start: number, end: number) => {
    sessionRef.current?.setViewport(start, end);
  }, []);
  const inspect = useCallback((step: number, sourceOffset = 0) => {
    sessionRef.current?.inspect(step, sourceOffset);
  }, []);
  const refresh = useCallback(() => {
    // Invalidate before the next effect; even an already queued reply is obsolete.
    sessionRef.current?.cancel();
    const next = loadingState(runId, stateRef.current);
    stateRef.current = next;
    setState(next);
    setRefreshVersion((version) => version + 1);
  }, [runId]);

  // Clear the prior run during render, before its effect cleanup can execute.
  const current = state.runId === runId ? state : loadingState(runId);
  return { ...current, setViewport, inspect, refresh };
}
