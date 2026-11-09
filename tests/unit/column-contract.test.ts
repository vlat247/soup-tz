import { describe, expect, it } from "vitest";
import { adversarialSource, fixtureViewports, validationSource } from "../../scripts/validate-runs";
import { inspectColumn } from "../../src/features/runs/model/inspect-column";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { normalizeViewport } from "../../src/features/runs/model/buckets";
import { isColumnInspection } from "../../src/features/runs/model/validate-column";

describe("column response contract", () => {
  const prepared = prepareRun(validationSource([
    { step: 0, loss: 1 }, { step: 1, loss: 10 }, { step: 1, loss: NaN },
    { step: 2, loss: 9, missing: ["lr"] }, { step: 20, loss: 3 },
  ]));
  const viewport = { start: 0, end: 20, width: 1 };

  it.each(["viewport", "index", "bounds", "count", "negative", "missing-metric", "infinite", "out-of-domain", "source-index", "step", "conflicts", "empty-extremum"])("rejects malformed column %s", (failure) => {
    const column = structuredClone(inspectColumn(prepared, 1, viewport))!;
    if (failure === "viewport") column.viewport.width++;
    if (failure === "index") column.column++;
    if (failure === "bounds") column.stepRange![1]--;
    if (failure === "count") column.sourceCount++;
    if (failure === "negative") column.metrics.loss.invalidCount = -1;
    if (failure === "missing-metric") delete (column.metrics as Partial<typeof column.metrics>).loss;
    if (failure === "infinite") column.metrics.loss.maximum!.value = Infinity;
    if (failure === "out-of-domain") column.metrics.loss.maximum!.value = 999;
    if (failure === "source-index") column.metrics.loss.maximum!.sourceIndex = 99;
    if (failure === "step") column.metrics.loss.maximum!.step = 21;
    if (failure === "conflicts") column.metrics.loss.conflictSteps = 3;
    if (failure === "empty-extremum") column.metrics.loss.minimum = null;
    expect(isColumnInspection(column, prepared.summary, viewport, 1)).toBe(false);
  });

  it("accepts exact empty columns and distinguishes selections outside the viewport", () => {
    const narrow = { start: 0, end: 20, width: 400 };
    const empty = inspectColumn(prepared, 10.5, narrow);
    expect(empty?.sourceCount).toBe(0);
    expect(empty?.gapCount).toBe(1);
    expect(isColumnInspection(empty, prepared.summary, narrow, 10.5)).toBe(true);
    expect(isColumnInspection(null, prepared.summary, narrow, 21)).toBe(true);
    expect(isColumnInspection(null, prepared.summary, narrow, 10.5)).toBe(false);
    expect(isColumnInspection(undefined, prepared.summary, narrow, 10.5)).toBe(false);
  });

  it("accepts bounded facts across forty adversarial sources and their viewports", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const source = adversarialSource(seed);
      const run = prepareRun(source);
      for (const request of fixtureViewports(source)) {
        const view = normalizeViewport(run.summary, request);
        for (const step of [view.start, view.end, view.start + (view.end - view.start) / 2]) {
          expect(isColumnInspection(inspectColumn(run, step, view), run.summary, view, step),
            `seed ${seed}, step ${step}, width ${view.width}`).toBe(true);
        }
      }
    }
  });
});
