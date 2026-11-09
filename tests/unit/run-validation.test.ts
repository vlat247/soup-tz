import { describe, expect, it } from "vitest";
import {
  adversarialSource,
  auditRun,
  fixtureViewports,
  validationSource,
} from "../../scripts/validate-runs";
import { generateRun } from "../../src/features/runs/data/generate";
import { RUN_MANIFEST } from "../../src/features/runs/data/manifest";
import { inspectStep } from "../../src/features/runs/model/inspect";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { buildFrame } from "../../src/features/runs/model/reduce";
import { METRICS } from "../../src/features/runs/model/types";

describe("independent full-source fixture audit", () => {
  it.each(RUN_MANIFEST.map(({ id }) => id))(
    "preserves facts, provenance, extrema and breaks for %s",
    (id) => {
      const source = generateRun(id);
      const result = auditRun(source, fixtureViewports(source));
      expect(result.sourceRows).toBe(source.descriptor.rowCount);
      expect(result.metricChecks).toBe(15);
    },
    30_000,
  );

  it("retains the million-row spike and exact per-metric bounds over 32 saved generated viewports", () => {
    const source = generateRun("run-020");
    const prepared = prepareRun(source);
    let seed = 0x051ced;
    const next = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed;
    };
    const widths = [1, 3, 11, 29, 191, 321, 4096, 16_385];
    for (let sample = 0; sample < 32; sample++) {
      const start = next() % 500_001;
      const end = 500_000 + (next() % 500_000);
      const frame = buildFrame(prepared, {
        start,
        end,
        width: widths[sample % widths.length],
      });
      expect(frame.metrics.loss.points).toContainEqual([500_000, 12]);
      expect(frame.metrics.loss.peak).toEqual({ step: 500_000, value: 12 });
      for (const metric of METRICS) {
        let minimum = Infinity;
        let maximum = -Infinity;
        for (let index = start; index <= end; index++) {
          minimum = Math.min(minimum, source.columns[metric][index]);
          maximum = Math.max(maximum, source.columns[metric][index]);
        }
        expect(frame.metrics[metric].domain).toEqual([minimum, maximum]);
        expect(frame.metrics[metric].finiteCount).toBe(end - start + 1);
      }
    }
  }, 30_000);
});

describe("repeatable adversarial source properties", () => {
  it.each(Array.from({ length: 40 }, (_, index) => index + 1))(
    "matches independent raw scans for saved seed %i",
    (seed) => {
      const source = adversarialSource(seed);
      const result = auditRun(source, fixtureViewports(source));
      expect(result.rejectedRows).toBe(5);
      expect(result.rangeFrames).toBeGreaterThan(0);
    },
  );

  it("keeps singleton and empty sources truthful, including wholly rejected input", () => {
    for (const rows of [
      [],
      [{ step: 7, loss: -0 }],
      [{ step: NaN, loss: 1e300 }],
    ]) {
      auditRun(validationSource(rows), [{ start: 0, end: 100, width: 1 }]);
    }
    expect(() => inspectStep(prepareRun(validationSource([])), 0)).toThrow(
      RangeError,
    );
  });

  it("uses declared cadence without confusing sparse sampling with missing rows", () => {
    const source = validationSource(
      [
        { step: 12, loss: 4 },
        { step: 0, loss: 1 },
        { step: 3, loss: 2 },
        { step: 15, loss: 5 },
        { step: 6, loss: 3 },
      ],
      3,
    );
    auditRun(source, [
      { start: 0, end: 15, width: 1 },
      { start: 7, end: 11, width: 10 },
    ]);
    expect(prepareRun(source).summary).toMatchObject({
      gapCount: 1,
      missingSteps: 1,
    });
    expect(inspectStep(prepareRun(source), 9)).toMatchObject({
      step: 6,
      inGap: true,
    });
    expect(
      buildFrame(prepareRun(source), { start: 7, end: 11, width: 10 })
        .sourceCount,
    ).toBe(0);
  });

  it("retains finite extreme magnitudes at the last supported safe-integer steps", () => {
    const last = Number.MAX_SAFE_INTEGER;
    const source = validationSource([
      {
        step: last - 2,
        loss: Number.MIN_VALUE,
        lr: -Number.MAX_VALUE,
        grad_norm: Number.MAX_VALUE,
      },
      {
        step: last - 1,
        loss: Number.MAX_VALUE,
        lr: Number.MIN_VALUE,
        grad_norm: -Number.MAX_VALUE,
      },
      {
        step: last,
        loss: -Number.MAX_VALUE,
        lr: Number.MAX_VALUE,
        grad_norm: -Number.MIN_VALUE,
      },
    ]);
    auditRun(source, [
      { start: last - 2, end: last, width: 1 },
      { start: last, end: last, width: 16_385 },
    ]);
  });

  it("raw mode preserves every unambiguous observed step and explicit breaks without a point budget", () => {
    const rows = Array.from({ length: 200 }, (_, step) => ({
      step,
      loss: step % 2 ? NaN : step,
    }));
    rows.push({ step: 8, loss: 500 });
    const prepared = prepareRun(validationSource(rows));
    const frame = buildFrame(prepared, { start: 0, end: 199, width: 1 }, "raw");
    const loss = frame.metrics.loss;
    expect(loss.mode).toBe("line");
    expect(loss.points).toHaveLength(200);
    expect(loss.points[8]).toEqual([8, null]);
    expect(loss.conflicts).toEqual([
      [8, 8],
      [8, 500],
    ]);
    for (let step = 0; step < 200; step++) {
      expect(loss.points[step]).toEqual([
        step,
        step % 2 || step === 8 ? null : step,
      ]);
    }
    expect(loss.domain).toEqual([0, 500]);
    expect(frame.metrics.grad_norm.points).toHaveLength(200);
  });
});

describe("bounded complete duplicate inspection", () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({
    step: 10,
    loss: index,
    lr: 0.001,
    grad_norm: index === 44 ? Infinity : 1,
  }));
  // Interleave unrelated steps so returned provenance cannot be fabricated from offset.
  const mixed = rows.flatMap((row, index) => [
    row,
    { step: index % 2 ? 20 : 0, loss: 1000 },
  ]);
  const prepared = prepareRun(validationSource(mixed));

  it("exposes all 45 distinct source readings in three stable pages", () => {
    const pages = [0, 20, 40].map((offset) =>
      inspectStep(prepared, 10, offset),
    );
    expect(pages.map((page) => page.sourceRows.length)).toEqual([20, 20, 5]);
    expect(pages.map((page) => page.sourceOffset)).toEqual([0, 20, 40]);
    expect(
      pages.flatMap((page) => page.sourceRows.map((row) => row.sourceIndex)),
    ).toEqual(Array.from({ length: 45 }, (_, index) => index * 2));
    expect(
      pages.flatMap((page) =>
        page.sourceRows.map((row) => row.readings.loss.value),
      ),
    ).toEqual(Array.from({ length: 45 }, (_, index) => index));
    for (const page of pages) {
      expect(page).toMatchObject({
        sourceCount: 45,
        step: 10,
        previousStep: 0,
        nextStep: 20,
        inGap: false,
      });
      expect(page.readings.loss.kind).toBe("conflict");
      expect(page.readings.grad_norm.kind).toBe("conflict");
    }
    expect(pages[2].sourceRows[4].readings.grad_norm).toEqual({
      kind: "positive-infinity",
      value: null,
    });
  });

  it.each([
    [0, 0],
    [1, 0],
    [19, 0],
    [20, 20],
    [39, 20],
    [40, 40],
    [999, 40],
    [Number.MAX_SAFE_INTEGER, 40],
  ])(
    "normalizes requested offset %s to page offset %s",
    (requested, expected) => {
      expect(inspectStep(prepared, 10, requested).sourceOffset).toBe(expected);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid source offset %s",
    (offset) => {
      expect(() => inspectStep(prepared, 10, offset)).toThrow(RangeError);
    },
  );

  it("keeps default inspection backward compatible and clamps a stale page for a smaller group", () => {
    expect(inspectStep(prepared, 10)).toEqual(inspectStep(prepared, 10, 0));
    const one = prepareRun(validationSource([{ step: 5, loss: 2 }]));
    expect(inspectStep(one, 5, 40)).toMatchObject({
      sourceOffset: 0,
      sourceCount: 1,
    });
    expect(inspectStep(one, 5, 40).sourceRows).toHaveLength(1);
  });
});

describe("malformed source boundary checks", () => {
  it.each([-1, 0, 2, 0.5, NaN, Infinity])(
    "rejects declared row count %s for a one-row source",
    (rowCount) => {
      const run = validationSource([{ step: 0, loss: 1 }]);
      expect(() =>
        prepareRun({ ...run, descriptor: { ...run.descriptor, rowCount } }),
      ).toThrow(RangeError);
    },
  );

  it.each(METRICS)(
    "rejects nonbinary %s masks instead of silently changing reading meaning",
    (metric) => {
      const source = validationSource([{ step: 0, loss: 1 }]);
      source.columns.missing[metric][0] = 2;
      expect(() => prepareRun(source)).toThrow(RangeError);
    },
  );

  it("also validates masks on rejected-step rows and preserves all bytes on failure", () => {
    const source = validationSource([{ step: NaN, loss: 7 }]);
    source.columns.missing.loss[0] = 255;
    expect(() => prepareRun(source)).toThrow(RangeError);
    expect(source.columns.missing.loss[0]).toBe(255);
    expect(source.columns.loss[0]).toBe(7);
  });

  it("rejects metric-column and mask-length mismatches", () => {
    const source = validationSource([{ step: 0, loss: 1 }]);
    expect(() =>
      prepareRun({
        ...source,
        columns: { ...source.columns, loss: new Float64Array(0) },
      }),
    ).toThrow(RangeError);
    expect(() =>
      prepareRun({
        ...source,
        columns: {
          ...source.columns,
          missing: { ...source.columns.missing, lr: new Uint8Array(0) },
        },
      }),
    ).toThrow(RangeError);
  });
});
