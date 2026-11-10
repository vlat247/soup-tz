import { describe, expect, it } from "vitest";
import { validationSource } from "../../scripts/validate-runs";
import { inspectStep } from "../../src/features/runs/model/inspect";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { METRICS, type GeneratedRun } from "../../src/features/runs/model/types";

const oneRow = () => validationSource([{ step: 0, loss: 1 }]);
const prepareUnknown = (value: unknown) => prepareRun(value as GeneratedRun);

describe("runtime source structure", () => {
  it.each([undefined, null, [], 7, "run"])("rejects non-record source %s with context", (value) => {
    expect(() => prepareUnknown(value)).toThrow(/Source must be an object/);
  });

  it.each(["descriptor", "columns"])("rejects missing %s", (field) => {
    const source = { ...oneRow(), [field]: undefined };
    expect(() => prepareUnknown(source)).toThrow(new RegExp(`${field} must be an object`));
  });

  it.each(["step", ...METRICS])("rejects ordinary and lower-precision %s columns without coercion", (field) => {
    for (const value of [["1"], [1], new Float32Array([1]), new Int32Array([1]), new DataView(new ArrayBuffer(8)), { 0: 1, length: 1 }]) {
      const source = oneRow();
      expect(() => prepareUnknown({ ...source, columns: { ...source.columns, [field]: value } }))
        .toThrow(new RegExp(`columns.${field} must be a Float64Array`));
    }
  });

  it("rejects a missing mask container", () => {
    const source = oneRow();
    expect(() => prepareUnknown({ ...source, columns: { ...source.columns, missing: null } }))
      .toThrow(/columns.missing must be an object/);
  });

  it.each(METRICS)("rejects non-byte %s masks even when their values look binary", (metric) => {
    for (const mask of [undefined, [0], new Float64Array([0]), new Uint8ClampedArray([0])]) {
      const source = oneRow();
      expect(() => prepareUnknown({ ...source, columns: { ...source.columns, missing: { ...source.columns.missing, [metric]: mask } } }))
        .toThrow(new RegExp(`columns.missing.${metric} must be a Uint8Array`));
    }
  });

  it("rejects detached source buffers instead of treating them as an empty run", () => {
    const source = validationSource([]);
    structuredClone(source.columns.step, { transfer: [source.columns.step.buffer] });
    expect(() => prepareRun(source)).toThrow(/columns.step.*detached/);
  });

  it("accepts typed-array views without copying or modifying their backing data", () => {
    const source = oneRow();
    const backing = new Float64Array([999, -0, 888]);
    const columns = { ...source.columns, loss: backing.subarray(1, 2) };
    const prepared = prepareRun({ ...source, columns });
    expect(prepared.source.columns.loss).toBe(columns.loss);
    expect([...backing]).toEqual([999, -0, 888]);
    expect(Object.is(inspectStep(prepared, 0).sourceRows[0].readings.loss.value, -0)).toBe(true);
  });
});

describe("source identity and freshness metadata", () => {
  it.each(["id", "name", "sourceVersion", "generatorVersion", "scenario"])("requires a nonempty %s string", (field) => {
    for (const value of [undefined, null, 1, "", "   "]) {
      const source = oneRow();
      expect(() => prepareUnknown({ ...source, descriptor: { ...source.descriptor, [field]: value } }))
        .toThrow(new RegExp(`descriptor.${field} must be a nonempty string`));
    }
  });

  it.each(["unknown", null, 1])("rejects unsupported run status %s", (status) => {
    const source = oneRow();
    expect(() => prepareUnknown({ ...source, descriptor: { ...source.descriptor, status } }))
      .toThrow(/descriptor.status/);
  });

  it.each([-1, 0.5, NaN, Infinity, 0x1_0000_0000, "1"])("rejects unreproducible seed %s", (seed) => {
    const source = oneRow();
    expect(() => prepareUnknown({ ...source, descriptor: { ...source.descriptor, seed } }))
      .toThrow(/descriptor.seed/);
  });

  it.each([
    "not a date", "2026-11-01", "2026-11-01T12:00:00", "2026-11-01T12:00:00+00:00",
    "2026-02-30T12:00:00.000Z", "2025-02-29T12:00:00.000Z", "2026-11-01T24:00:00.000Z", 1,
  ])("rejects invalid or non-UTC snapshot metadata %s", (snapshotAt) => {
    const source = oneRow();
    expect(() => prepareUnknown({ ...source, descriptor: { ...source.descriptor, snapshotAt } }))
      .toThrow(/descriptor.snapshotAt/);
  });

  it.each(["2024-02-29T12:00:00Z", "2026-11-01T12:00:00.1Z", "2026-11-01T12:00:00.12Z", "2026-11-01T12:00:00.123Z"])("accepts a real UTC snapshot without rewriting it: %s", (snapshotAt) => {
    const source = oneRow();
    expect(prepareRun({ ...source, descriptor: { ...source.descriptor, snapshotAt } }).source.descriptor.snapshotAt)
      .toBe(snapshotAt);
  });

  it("requires the synthetic-source declaration", () => {
    const source = oneRow();
    expect(() => prepareUnknown({ ...source, descriptor: { ...source.descriptor, synthetic: false } }))
      .toThrow(/descriptor.synthetic/);
  });

  it.each([
    { pattern: "unknown" },
    { fixture: undefined },
    { fixture: { shuffle: "true" } },
    { fixture: { allInvalidLoss: 1 } },
    { fixture: { injections: {} } },
    { fixture: { injections: [null] } },
    { fixture: { injections: [{ step: 0, metric: "accuracy", value: 1 }] } },
    { fixture: { injections: [{ step: 0, metric: "loss", value: "1" }] } },
    { fixture: { duplicates: [{ step: 0, overrides: [] }] } },
    { fixture: { duplicates: [{ step: 0, overrides: { accuracy: 1 } }] } },
    { fixture: { gaps: [{ startStep: -1, endStep: 3 }] } },
  ])("rejects malformed fixture metadata: %j", (patch) => {
    const source = oneRow();
    expect(() => prepareUnknown({ ...source, descriptor: { ...source.descriptor, ...patch } }))
      .toThrow(/descriptor\.(pattern|fixture)/);
  });
});

describe("telemetry anomalies remain data, not structural errors", () => {
  it("preserves numeric invalid readings, rejected steps and missing payload bytes", () => {
    const source = validationSource([
      { step: 0, loss: NaN, lr: Infinity, grad_norm: -Infinity },
      { step: 1, loss: Number.MIN_VALUE, lr: -0, grad_norm: -2 },
      { step: 2, loss: 999, missing: ["loss"] },
      { step: NaN, loss: Number.MAX_VALUE },
      { step: -1, loss: 4 },
      { step: 0.5, loss: 5 },
      { step: Infinity, loss: 6 },
    ]);
    const arrays = [source.columns.step, ...METRICS.map((metric) => source.columns[metric]), ...METRICS.map((metric) => source.columns.missing[metric])];
    const before = arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("hex"));
    const prepared = prepareRun(source);
    expect(prepared.summary).toMatchObject({ rejectedRows: 4, uniqueSteps: 3, invalidCounts: { loss: 1, lr: 1, grad_norm: 1 } });
    expect(inspectStep(prepared, 0).readings).toEqual({ loss: { kind: "nan", value: null }, lr: { kind: "positive-infinity", value: null }, grad_norm: { kind: "negative-infinity", value: null } });
    expect(inspectStep(prepared, 2).readings.loss).toEqual({ kind: "missing", value: null });
    expect(arrays.map((array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("hex"))).toEqual(before);
  });
});
