import { describe, expect, it } from "vitest";
import { formatCount, formatExactValue, formatReading, formatSnapshot, formatValue } from "../../src/features/runs/model/format";
import { serializeSummaryExport } from "../../src/features/runs/model/export-summary";
import { validationSource } from "../../scripts/validate-runs";
import { prepareRun } from "../../src/features/runs/model/prepare";

describe("finite numeric presentation", () => {
  it.each([Number.MAX_VALUE, -Number.MAX_VALUE, 1.797e308])(
    "does not label finite %s as an overflowing scientific value", (value) => {
      for (const metric of [undefined, "loss", "lr", "grad_norm"] as const) {
        const label = formatValue(value, metric);
        expect(Number.isFinite(Number(label.replaceAll(",", "")))).toBe(true);
        expect(Math.sign(Number(label))).toBe(Math.sign(value));
      }
    },
  );

  it("keeps compact ordinary values and deterministic counts", () => {
    expect(formatValue(0)).toBe("0");
    expect(formatValue(-0)).toBe("0");
    expect(formatValue(1234.56789)).toBe("1,234.5679");
    expect(formatValue(-1.25)).toBe("-1.25");
    expect(formatValue(1e-4, "lr")).toBe("1.00e-4");
    expect(formatValue(null)).toBe("—");
    expect(formatCount(Number.MAX_SAFE_INTEGER)).toBe("9,007,199,254,740,991");
  });

  it("never rounds nonzero subnormal or threshold values to zero", () => {
    for (const value of [Number.MIN_VALUE, 1e-100, 0.00009999, 0.0001, 0.00015]) {
      for (const sign of [-1, 1]) {
        for (const metric of [undefined, "loss", "lr", "grad_norm"] as const) {
          const numeric = Number(formatValue(sign * value, metric));
          expect(Number.isFinite(numeric)).toBe(true);
          expect(Math.sign(numeric)).toBe(sign);
        }
      }
    }
  });

  it("keeps full finite precision and signed zero in exact source text", () => {
    for (const value of [-0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, 1 + Number.EPSILON, -0.12345678901234568]) {
      expect(Object.is(Number(formatExactValue(value)), value)).toBe(true);
    }
    expect(formatExactValue(-0)).toBe("-0");
    expect(formatExactValue(null)).toBe("—");
  });

  it("keeps invalid reading classes explicit instead of displaying a finite value", () => {
    expect(formatReading({ kind: "nan", value: null })).toBe("NaN");
    expect(formatReading({ kind: "positive-infinity", value: null })).toBe("+Infinity");
    expect(formatReading({ kind: "negative-infinity", value: null })).toBe("−Infinity");
    expect(formatReading({ kind: "missing", value: null })).toBe("Missing");
    expect(formatReading({ kind: "conflict", value: null })).toBe("Conflicting");
    for (const value of [NaN, Infinity, -Infinity]) expect(formatValue(value)).toBe("—");
  });
});

describe("timestamp presentation", () => {
  it.each([
    ["2026-01-01T00:15:00.000Z", "Jan 1, 00:15 UTC"],
    ["2026-01-01T00:15:00.000+05:00", "Dec 31, 19:15 UTC"],
    ["2026-12-31T23:45:00.000-08:00", "Jan 1, 07:45 UTC"],
    ["2026-03-08T10:00:00.000Z", "Mar 8, 10:00 UTC"],
    ["2026-11-01T09:00:00.000Z", "Nov 1, 09:00 UTC"],
  ])("keeps explicit UTC near date and DST boundaries: %s", (instant, expected) => {
    expect(formatSnapshot(instant)).toBe(expected);
  });
  it("does not invent a timestamp for an invalid date", () => {
    expect(formatSnapshot("not-a-date")).toBe("Unknown snapshot");
  });
});

describe("summary JSON export", () => {
  const source = validationSource([
    { step: 0, loss: 3, lr: 0.001, grad_norm: 2 },
    { step: 1, loss: NaN, lr: Infinity, grad_norm: -Infinity },
  ]);
  const summary = prepareRun(source).summary;
  const loadedAt = "2026-11-10T00:15:00.000Z";

  it("round-trips each nonfinite class and source/load metadata without making a finite zero", () => {
    const data = JSON.parse(serializeSummaryExport(source.descriptor, summary, loadedAt));
    expect(data.summary.latest).toEqual({
      loss: { kind: "nan", value: null },
      lr: { kind: "positive-infinity", value: null },
      grad_norm: { kind: "negative-infinity", value: null },
    });
    expect(data.summary.invalidCounts).toEqual({ loss: 1, lr: 1, grad_norm: 1 });
    expect(data.summary.extents).toEqual({ loss: [3, 3], lr: [0.001, 0.001], grad_norm: [2, 2] });
    expect(data.summary.lastFinite.loss).toEqual({ step: 0, value: 3 });
    expect(data.descriptor.snapshotAt).toBe(source.descriptor.snapshotAt);
    expect(data.descriptor.sourceVersion).toBe(source.descriptor.sourceVersion);
    expect(data.loadedAt).toBe(loadedAt);
    expect(data.scope).toContain("Nonfinite readings are explicitly tagged");
  });

  it("preserves missing and conflicting tags and finite conflict extrema", () => {
    const broken = validationSource([
      { step: 1, loss: 2, missing: ["lr"] },
      { step: 1, loss: NaN, missing: ["lr"] },
    ]);
    const data = JSON.parse(serializeSummaryExport(broken.descriptor, prepareRun(broken).summary, null));
    expect(data.summary.latest.loss).toEqual({ kind: "conflict", value: null });
    expect(data.summary.latest.lr).toEqual({ kind: "missing", value: null });
    expect(data.summary.extents.loss).toEqual([2, 2]);
    expect(data.summary.conflictSteps.loss).toBe(1);
    expect(data.summary.missingCounts.lr).toBe(2);
    expect(data.loadedAt).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])("rejects unexpected untagged %s instead of silently exporting null", (value) => {
    const malformed = structuredClone(summary);
    malformed.extents.loss = [3, value];
    expect(() => serializeSummaryExport(source.descriptor, malformed, loadedAt)).toThrow("untagged nonfinite");
  });
});
