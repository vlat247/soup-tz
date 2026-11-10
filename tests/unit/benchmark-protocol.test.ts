import { describe, expect, it } from "vitest";
import { createTimingLedger, inspectionWorkload, sampleSummary, zoomWorkload } from "../../src/features/benchmark/protocol";

describe("browser benchmark measurement identity", () => {
  it("never lets a failed or obsolete completion finish a new sample", () => {
    let time = 10; const marks: string[] = [];
    const ledger = createTimingLedger(() => time, (mark) => marks.push(mark));
    const first = ledger.begin("load"); time = 20; ledger.fail(first, "timeout");
    const next = ledger.begin("zoom", { viewport: { start: 499_980, end: 500_000, width: 320 } });
    expect(ledger.complete(first)).toBe(false);
    expect(ledger.stage(first, "sourceReadyAtMs")).toBe(false);
    time = 30; ledger.stage(next, "sourceReadyAtMs"); time = 35; ledger.stage(next, "drawSubmittedAtMs"); time = 50;
    expect(ledger.complete(next)).toBe(true);
    expect(ledger.samples).toMatchObject([{ status: "failed", error: "timeout", durationMs: 10 }, { status: "passed", durationMs: 30, sourceReadyAtMs: 30, drawSubmittedAtMs: 35, paintProxyAtMs: 50 }]);
    expect(marks).toContain("soup:1:load:failed");
    expect(marks).toContain("soup:2:zoom:paint-proxy");
  });
  it("retains navigation timing separately and excludes failures from successful percentiles", () => {
    let time = 100; const ledger = createTimingLedger(() => time, () => {});
    const id = ledger.begin("load"); time = 250; ledger.complete(id, true);
    const failed = ledger.begin("load"); time = 350; ledger.fail(failed, "failed");
    expect(ledger.samples[0]).toMatchObject({ durationMs: 150, navigationToPaintProxyMs: 250 });
    expect(sampleSummary(ledger.samples, "load")).toEqual({ attempted: 2, passed: 1, failed: 1, medianMs: 150, p95Ms: 150 });
  });
  it("bounds retained samples without truncating earlier failures", () => {
    const ledger = createTimingLedger(() => 1, () => {});
    for (let i = 0; i < 200; i++) ledger.fail(ledger.begin("inspection", { step: i }), "failure");
    expect(() => ledger.begin("load")).toThrow("Export results");
    expect(ledger.samples).toHaveLength(200);
  });
  it("uses identical repeatable workloads with the spike in every range, including both edges", () => {
    const ranges = zoomWorkload(); expect(ranges).toHaveLength(30);
    expect(ranges.every(([start, end]) => start <= 500_000 && end >= 500_000)).toBe(true);
    expect(ranges.some(([start]) => start === 500_000)).toBe(true);
    expect(ranges.some(([, end]) => end === 500_000)).toBe(true);
    expect(inspectionWorkload()).toHaveLength(30);
    expect(inspectionWorkload().every((step) => step >= ranges[29][0] && step <= ranges[29][1])).toBe(true);
  });
});
