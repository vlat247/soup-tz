export type Variant = "raw" | "optimized";
export type SampleKind = "load" | "zoom" | "inspection";
export interface TimingSample {
  id: number;
  kind: SampleKind;
  startedAtMs: number;
  sourceReadyAtMs?: number;
  drawSubmittedAtMs?: number;
  paintProxyAtMs?: number;
  durationMs?: number;
  navigationToPaintProxyMs?: number;
  status: "pending" | "passed" | "failed";
  viewport?: { start: number; end: number; width: number };
  step?: number;
  error?: string;
}

/** Fixed source intervals, including peak on both viewport edges. */
export function zoomWorkload(): [number, number][] {
  const ranges: [number, number][] = [[450_000, 550_000], [490_000, 510_000], [499_900, 500_100], [500_000, 500_020], [499_980, 500_000], [499_000, 501_000]];
  return Array.from({ length: 30 }, (_, i) => [...ranges[i % ranges.length]]);
}
export function inspectionWorkload(): number[] {
  return Array.from({ length: 30 }, (_, i) => 500_000 + (i % 2 ? -1 : 1) * (i % 7));
}

export function sampleSummary(samples: TimingSample[], kind: SampleKind) {
  const selected = samples.filter((sample) => sample.kind === kind);
  const times = selected.filter((sample) => sample.status === "passed").map((sample) => sample.durationMs!).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  return {
    attempted: selected.length, passed: times.length, failed: selected.filter((sample) => sample.status === "failed").length,
    medianMs: times.length ? times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2 : null,
    p95Ms: times.length ? times[Math.ceil(times.length * 0.95) - 1] : null,
  };
}

/** Sequence identity prevents delayed completion from marking a newer sample passed. */
export function createTimingLedger(now: () => number, mark: (name: string) => void) {
  const samples: TimingSample[] = [];
  let active: TimingSample | null = null;
  return {
    samples,
    get active() { return active; },
    begin(kind: SampleKind, target: Pick<TimingSample, "viewport" | "step"> = {}) {
      if (active) throw new Error("A benchmark sample is already pending");
      if (samples.length >= 200) throw new Error("Export results and reload before starting more samples");
      const sample: TimingSample = { id: samples.length + 1, kind, startedAtMs: now(), status: "pending", ...target };
      samples.push(sample); active = sample; mark(`soup:${sample.id}:${kind}:input`);
      return sample.id;
    },
    stage(id: number, stage: "sourceReadyAtMs" | "drawSubmittedAtMs") {
      if (active?.id !== id) return false;
      active[stage] = now(); mark(`soup:${id}:${active.kind}:${stage}`); return true;
    },
    complete(id: number, navigation = false) {
      if (active?.id !== id) return false;
      const at = now(); active.paintProxyAtMs = at; active.durationMs = at - active.startedAtMs;
      if (navigation) active.navigationToPaintProxyMs = at;
      active.status = "passed"; mark(`soup:${id}:${active.kind}:paint-proxy`); active = null; return true;
    },
    fail(id: number, error: string) {
      if (active?.id !== id) return false;
      active.status = "failed"; active.error = error.slice(0, 240); active.durationMs = now() - active.startedAtMs;
      mark(`soup:${id}:${active.kind}:failed`); active = null; return true;
    },
  };
}
