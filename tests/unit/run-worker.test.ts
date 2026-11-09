import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunWorkerResponse } from "../../src/features/runs/model/view-types";

let replies: RunWorkerResponse[];
let scope: {
  postMessage: (message: RunWorkerResponse) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};

beforeEach(async () => {
  replies = [];
  scope = { postMessage: (message) => replies.push(message), onmessage: null };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("../../src/features/runs/worker/run.worker");
});
afterEach(() => vi.unstubAllGlobals());

function send(request: unknown): RunWorkerResponse {
  scope.onmessage!({ data: request } as MessageEvent<unknown>);
  expect(replies.length).toBeGreaterThan(0);
  return replies.at(-1)!;
}

describe("worker request boundary", () => {
  it("returns a column peak from source even when the nearest observation is not the peak", () => {
    send({ type: "load", runId: "run-020", requestId: 1, width: 300 });
    const result = send({ type: "inspect", runId: "run-020", requestId: 2, step: 500001,
      viewport: { start: 0, end: 999999, width: 300 } });
    if (result.type !== "inspection") throw new Error("Expected column inspection");
    expect(result.inspection.step).toBe(500001);
    expect(result.inspection.readings.loss.value).toBeLessThan(2);
    expect(result.inspection.column?.metrics.loss.maximum).toEqual({ step: 500000, value: 12, sourceIndex: 500000 });
    expect(result.inspection.column?.sourceCount).toBeGreaterThan(3000);
    const outside = send({ type: "inspect", runId: "run-020", requestId: 3, step: 500000,
      viewport: { start: 0, end: 100, width: 300 } });
    if (outside.type !== "inspection") throw new Error("Expected exact inspection outside viewport");
    expect(outside.inspection.readings.loss.value).toBe(12);
    expect(outside.inspection.column).toBeNull();
  });

  it("keeps finite conflicting extrema and raw counts in a one-column query", () => {
    send({ type: "load", runId: "run-012", requestId: 1, width: 120 });
    const result = send({ type: "inspect", runId: "run-012", requestId: 2, step: 700,
      viewport: { start: 699, end: 701, width: 1 } });
    if (result.type !== "inspection") throw new Error("Expected column inspection");
    expect(result.inspection.column).toMatchObject({ sourceCount: 4, uniqueSteps: 3, duplicateRows: 1,
      metrics: { loss: { finiteCount: 4, conflictSteps: 1, maximum: { step: 700, value: 12, sourceIndex: 4000 } } } });
  });

  it.each([
    null,
    {},
    { type: "load", runId: 1, requestId: 1 },
    { type: "load", runId: "run-001", requestId: -1 },
    { type: "load", runId: "run-001", requestId: Infinity },
  ])("returns a bounded error for malformed identity %j", (request) => {
    const reply = send(request);
    expect(reply.type).toBe("error");
    if (reply.type === "error")
      expect(reply.message.length).toBeLessThanOrEqual(200);
  });

  it("requires a loaded run and rejects a different run identity", () => {
    expect(
      send({ type: "inspect", runId: "run-001", requestId: 1, step: 0 }).type,
    ).toBe("error");
    expect(
      send({ type: "load", runId: "run-001", requestId: 2, width: 120 }).type,
    ).toBe("loaded");
    expect(
      send({
        type: "viewport",
        runId: "run-002",
        requestId: 3,
        viewport: { start: 0, end: 10, width: 120 },
      }).type,
    ).toBe("error");
  });

  it("returns exact conflict provenance without posting source columns", () => {
    const loaded = send({
      type: "load",
      runId: "run-012",
      requestId: 1,
      width: 120,
    });
    expect(loaded.type).toBe("loaded");
    if (loaded.type !== "loaded") throw new Error("Expected a loaded frame");
    expect(loaded.summary.rowCount).toBe(4003);
    expect(loaded.frame.sourceVersion).toBe("soup-fixtures-v1");
    expect(loaded.frame.metrics.loss.domain?.[1]).toBe(12);
    expect(loaded).not.toHaveProperty("columns");
    expect(loaded.frame).not.toHaveProperty("columns");
    const result = send({
      type: "inspect",
      runId: "run-012",
      requestId: 2,
      step: 700,
      sourceOffset: 0,
    });
    expect(result.type).toBe("inspection");
    if (result.type !== "inspection")
      throw new Error("Expected source readings");
    expect(result.inspection.sourceOffset).toBe(0);
    expect(result.inspection.sourceRows.map((row) => row.sourceIndex)).toEqual([
      700, 4000,
    ]);
    expect(result.inspection.readings.loss.kind).toBe("conflict");
    expect(result.inspection.sourceRows[1].readings.loss.value).toBe(12);
  });

  it("rejects malformed viewport and inspection payloads without losing the valid source", () => {
    send({ type: "load", runId: "run-001", requestId: 1, width: 120 });
    const requests = [
      { type: "viewport", viewport: { start: 2, end: 1, width: 120 } },
      { type: "viewport", viewport: { start: 0, end: 1.5, width: 120 } },
      { type: "viewport", viewport: { start: 0, end: 10, width: NaN } },
      { type: "viewport" },
      { type: "inspect", step: NaN },
      { type: "inspect", step: 0, sourceOffset: -1 },
      { type: "inspect", step: 0, sourceOffset: 0.5 },
      { type: "inspect", step: 0, viewport: { start: 0, end: 10, width: 0 } },
      { type: "unsupported" },
    ];
    for (const [index, request] of requests.entries()) {
      const reply = send({
        ...request,
        runId: "run-001",
        requestId: index + 2,
      });
      expect(reply.type).toBe("error");
    }
    const recovered = send({
      type: "viewport",
      runId: "run-001",
      requestId: 20,
      viewport: { start: 100, end: 100, width: 120 },
    });
    expect(recovered.type).toBe("frame");
    if (recovered.type === "frame") expect(recovered.frame.sourceCount).toBe(1);
  });

  it("clears the prior worker source when a replacement load fails", () => {
    send({ type: "load", runId: "run-001", requestId: 1, width: 120 });
    expect(
      send({ type: "load", runId: "missing-run", requestId: 2, width: 120 })
        .type,
    ).toBe("error");
    expect(
      send({ type: "inspect", runId: "run-001", requestId: 3, step: 0 }).type,
    ).toBe("error");
    expect(
      send({ type: "load", runId: "run-002", requestId: 4, width: 120 }).type,
    ).toBe("loaded");
  });

  it.each([0, -1, NaN, Infinity])(
    "rejects invalid initial drawing width %s",
    (width) => {
      expect(
        send({ type: "load", runId: "run-001", requestId: 1, width }).type,
      ).toBe("error");
    },
  );
});
