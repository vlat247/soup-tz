import { describe, expect, it } from "vitest";
import { validationSource } from "../../scripts/validate-runs";
import { emptyGroupStats, prepareRun, scanGroup, type GroupStats } from "../../src/features/runs/model/prepare";
import { METRICS } from "../../src/features/runs/model/types";

const run = () => prepareRun(validationSource([
  { step: 0, loss: 3, lr: Infinity, grad_norm: NaN },
  { step: 1, loss: NaN },
  { step: 2, loss: Infinity },
  { step: 3, loss: -Infinity },
  { step: 4, loss: 999, missing: ["loss"] },
  { step: 5, loss: -0 },
  { step: 6, loss: 1 }, { step: 6, loss: 9 },
  { step: 7, loss: 2 }, { step: 7, loss: NaN },
  { step: 8, loss: 4, missing: ["loss"] }, { step: 8, loss: 5, missing: ["loss"] },
  { step: 9, loss: 7 }, { step: 9, loss: 7 },
  { step: 10, loss: 0 }, { step: 10, loss: -0 },
]));

const expected: GroupStats[] = [
  { kind: "finite", value: 3, minimum: 3, maximum: 3, finiteCount: 1, invalidCount: 0, missingCount: 0 },
  { kind: "nan", value: null, minimum: Infinity, maximum: -Infinity, finiteCount: 0, invalidCount: 1, missingCount: 0 },
  { kind: "positive-infinity", value: null, minimum: Infinity, maximum: -Infinity, finiteCount: 0, invalidCount: 1, missingCount: 0 },
  { kind: "negative-infinity", value: null, minimum: Infinity, maximum: -Infinity, finiteCount: 0, invalidCount: 1, missingCount: 0 },
  { kind: "missing", value: null, minimum: Infinity, maximum: -Infinity, finiteCount: 0, invalidCount: 0, missingCount: 1 },
  { kind: "finite", value: -0, minimum: -0, maximum: -0, finiteCount: 1, invalidCount: 0, missingCount: 0 },
  { kind: "conflict", value: null, minimum: 1, maximum: 9, finiteCount: 2, invalidCount: 0, missingCount: 0 },
  { kind: "conflict", value: null, minimum: 2, maximum: 2, finiteCount: 1, invalidCount: 1, missingCount: 0 },
  { kind: "missing", value: null, minimum: Infinity, maximum: -Infinity, finiteCount: 0, invalidCount: 0, missingCount: 2 },
  { kind: "finite", value: 7, minimum: 7, maximum: 7, finiteCount: 2, invalidCount: 0, missingCount: 0 },
  { kind: "finite", value: 0, minimum: 0, maximum: 0, finiteCount: 2, invalidCount: 0, missingCount: 0 },
];

describe("group scans with reused scratch state", () => {
  it.each(expected.map((_, index) => index))("preserves exact singleton/duplicate semantics for group %i", (group) => {
    const prepared = run();
    const scratch = { ...expected[6] }; // A prior conflicting group must not leak into this result.
    scanGroup(prepared, group, "loss", scratch);
    expect(scratch).toEqual(expected[group]);
  });

  it("resets every field through mixed classes and preserves every source byte", () => {
    const prepared = run();
    const arrays = [prepared.source.columns.step, ...METRICS.map((metric) => prepared.source.columns[metric]), ...METRICS.map((metric) => prepared.source.columns.missing[metric])];
    const before = arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("hex"));
    const scratch = emptyGroupStats();
    for (const group of [6, 0, 7, 4, 2, 3, 1, 5, 8, 9, 10, 0]) {
      scanGroup(prepared, group, "loss", scratch);
      expect(scratch).toEqual(expected[group]);
    }
    expect(arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("hex"))).toEqual(before);
  });

  it("classifies singleton metrics independently while reusing one scratch record", () => {
    const prepared = run();
    const scratch = emptyGroupStats();
    scanGroup(prepared, 0, "loss", scratch);
    expect(scratch).toEqual(expected[0]);
    scanGroup(prepared, 0, "lr", scratch);
    expect(scratch).toEqual(expected[2]);
    scanGroup(prepared, 0, "grad_norm", scratch);
    expect(scratch).toEqual(expected[1]);
  });

  it("uses sorted provenance rather than the group number as a source index", () => {
    const prepared = prepareRun(validationSource([{ step: 20, loss: 2 }, { step: 10, loss: -3 }]));
    const scratch = emptyGroupStats();
    scanGroup(prepared, 0, "loss", scratch);
    expect(scratch).toMatchObject({ kind: "finite", value: -3, minimum: -3, maximum: -3 });
    scanGroup(prepared, 1, "loss", scratch);
    expect(scratch).toMatchObject({ kind: "finite", value: 2, minimum: 2, maximum: 2 });
  });
});
