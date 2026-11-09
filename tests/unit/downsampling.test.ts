import { describe, expect, it } from "vitest";
import { auditRun, validationSource } from "../../scripts/validate-runs";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { buildFrame } from "../../src/features/runs/model/reduce";
import { METRICS } from "../../src/features/runs/model/types";

describe("exact pixel bucket boundaries", () => {
  it("retains the last source observation before a mathematically exact boundary", () => {
    const source = validationSource(Array.from({ length: 67 }, (_, step) => ({
      step, loss: step === 43 ? 10 : step === 44 ? 5 : step === 45 ? 6 : 0,
    })));
    const frame = buildFrame(prepareRun(source), { start: 0, end: 66, width: 22 });
    // Bucket 14 contains steps 42–44. Step 45 starts bucket 15 exactly.
    // Dividing first formerly assigned 45 to bucket 14 and dropped its true last point.
    expect(frame.metrics.loss.points).toContainEqual([44, 5]);
    expect(frame.metrics.loss.points).toContainEqual([45, 6]);
  });

  it("audits retained endpoints against an independent integer-rational bucket", () => {
    const source = validationSource(Array.from({ length: 67 }, (_, step) => ({
      step, loss: step === 43 ? 10 : step === 44 ? 5 : step === 45 ? 6 : 0,
    })));
    expect(() => auditRun(source, [{ start: 0, end: 66, width: 22 }])).not.toThrow();
  });
});

describe("first/minimum/maximum/last source selection", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  it.each([
    { start: 0, span: 44, width: 22 },
    { start: 0, span: 46, width: 23 },
    { start: 0, span: 49, width: 49 },
    { start: 0, span: 66, width: 22 },
    { start: 0, span: 98, width: 49 },
    { start: 0, span: 997, width: 31 },
    { start: 0, span: maximum, width: 7 },
    { start: 0, span: maximum, width: 16_384 },
    { start: maximum - 66, span: 66, width: 22 },
    { start: maximum - 997, span: 997, width: 31 },
  ])("retains exact bucket obligations at start=$start span=$span width=$width", ({ start, span, width }) => {
    const offsets = span <= 1000
      ? Array.from({ length: span + 1 }, (_, offset) => offset)
      : [...new Set([
          0, span,
          ...Array.from({ length: 101 }, (_, index) => Number(BigInt(span) * BigInt(index) / 100n)),
          ...[1, Math.floor(width / 2), width - 1].flatMap((column) => {
            const boundary = Number((BigInt(column) * BigInt(span) + BigInt(width - 1)) / BigInt(width));
            return [boundary - 1, boundary, boundary + 1];
          }),
        ])].sort((a, b) => a - b);
    const rows = offsets.map((offset, index) => ({
      step: start + offset,
      loss: (index * 13) % 29 - 10,
      lr: ((index * 19) % 31) * 1e-8,
      grad_norm: (index * 23) % 37,
    }));
    const source = validationSource(rows, span);
    const viewport = { start, end: start + span, width };
    const frame = buildFrame(prepareRun(source), viewport);
    for (const metric of METRICS) {
      const expected = new Map<number, typeof rows>();
      for (const row of rows) {
        const column = Math.min(width - 1, Number(BigInt(row.step - start) * BigInt(width) / BigInt(span)));
        const group = expected.get(column) ?? [];
        group.push(row);
        expected.set(column, group);
      }
      const points = frame.metrics[metric].points;
      expect(frame.metrics[metric].mode).toBe("line");
      for (const group of expected.values()) {
        const low = group.reduce((previous, row) => row[metric] < previous[metric] ? row : previous);
        const high = group.reduce((previous, row) => row[metric] > previous[metric] ? row : previous);
        for (const row of [group[0], low, high, group.at(-1)!])
          expect(points, `${metric} source endpoint/extremum at step ${row.step}`).toContainEqual([row.step, row[metric]]);
      }
      expect(points.length).toBeLessThanOrEqual(4 * width);
      expect(points.map(([step]) => step)).toEqual(points.map(([step]) => step).sort((a, b) => a - b));
    }
    expect(() => auditRun(source, [viewport])).not.toThrow();
  });

  it("preserves independent metric spikes sharing a coarse bucket in chronological order", () => {
    const rows = Array.from({ length: 20 }, (_, step) => ({
      step,
      loss: step === 5 ? 100 : step === 15 ? -10 : 1,
      lr: step === 7 ? 0.1 : 0.001,
      grad_norm: step === 11 ? 250 : 2,
    }));
    const frame = buildFrame(prepareRun(validationSource(rows)), { start: 0, end: 19, width: 1 });
    expect(frame.metrics.loss.points).toEqual([[0, 1], [5, 100], [15, -10], [19, 1]]);
    expect(frame.metrics.lr.points).toContainEqual([7, 0.1]);
    expect(frame.metrics.grad_norm.points).toContainEqual([11, 250]);
  });
});

describe("fragmented source budgets", () => {
  it.each([1, 3, 17])("bounds a mixed invalid/conflict source at width %i without reconnecting it", (width) => {
    const rows = Array.from({ length: 2000 }, (_, step) => ({ step, loss: step % 2 ? NaN : step % 97 }));
    rows.push({ step: 1000, loss: 500 });
    const source = validationSource(rows);
    const viewport = { start: 0, end: 1999, width };
    const frame = buildFrame(prepareRun(source), viewport);
    const loss = frame.metrics.loss;
    expect(loss.mode).toBe("ranges");
    expect(loss.domain).toEqual([0, 500]);
    expect(loss.invalidCount).toBe(1000);
    expect(loss.conflictCount).toBe(1);
    expect(loss.points).toContainEqual([1000, 500]);
    expect(loss.points.length + loss.conflicts.length).toBeLessThanOrEqual(4 * width);
    for (let index = 1; index < loss.points.length; index++)
      expect(loss.points[index - 1][1] === null || loss.points[index][1] === null).toBe(true);
    expect(() => auditRun(source, [viewport])).not.toThrow();
  });

  it("keeps all-invalid output bounded with no fabricated finite point", () => {
    const source = validationSource(Array.from({ length: 1000 }, (_, step) => ({ step, loss: NaN })));
    const loss = buildFrame(prepareRun(source), { start: 0, end: 999, width: 1 }).metrics.loss;
    expect(loss).toMatchObject({ mode: "ranges", points: [], conflicts: [], domain: null, peak: null, invalidCount: 1000 });
  });
});
