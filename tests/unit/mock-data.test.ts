import { describe, expect, it } from "vitest";
import {
  generateRun,
  generateRunFromDescriptor,
} from "../../src/features/runs/data/generate";
import {
  DATASET_VERSION,
  GENERATOR_VERSION,
  getRunDescriptor,
  RUN_MANIFEST,
} from "../../src/features/runs/data/manifest";
import {
  METRICS,
  type SourceColumns,
} from "../../src/features/runs/model/types";

function indexesAtStep(columns: SourceColumns, step: number): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < columns.step.length; index += 1) {
    if (columns.step[index] === step) indexes.push(index);
  }
  return indexes;
}

function onlyIndexAtStep(columns: SourceColumns, step: number): number {
  const indexes = indexesAtStep(columns, step);
  expect(indexes, `Expected one source row at step ${step}`).toHaveLength(1);
  return indexes[0];
}

function numericToken(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

// This comparison preserves NaN/infinities, mask states, and duplicate multiplicity.
// JSON.stringify on numerical rows would erase the invalid-number distinction.
function rowToken(columns: SourceColumns, index: number): string {
  return [
    numericToken(columns.step[index]),
    ...METRICS.flatMap((metric) => [
      numericToken(columns[metric][index]),
      columns.missing[metric][index],
    ]),
  ].join("|");
}

function sortedRowTokens(columns: SourceColumns): string[] {
  return Array.from({ length: columns.step.length }, (_, index) =>
    rowToken(columns, index),
  ).sort();
}

function equalBytes(left: ArrayBufferView, right: ArrayBufferView): boolean {
  return Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(
    Buffer.from(right.buffer, right.byteOffset, right.byteLength),
  );
}

function assertFrozenMetadata(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(ArrayBuffer.isView(value)).toBe(false);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozenMetadata(child);
}

function duplicateGroups(columns: SourceColumns): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (let index = 0; index < columns.step.length; index += 1) {
    const step = columns.step[index];
    const group = groups.get(step);
    if (group) group.push(index);
    else groups.set(step, [index]);
  }
  return new Map([...groups].filter(([, indexes]) => indexes.length > 1));
}

describe("versioned run manifest", () => {
  it("contains exactly 20 unique, compact descriptors without point arrays", () => {
    expect(RUN_MANIFEST).toHaveLength(20);
    expect(new Set(RUN_MANIFEST.map((run) => run.id)).size).toBe(20);
    expect(RUN_MANIFEST.map((run) => run.id)).toEqual(
      Array.from({ length: 20 }, (_, index) =>
        `run-${String(index + 1).padStart(3, "0")}`,
      ),
    );
    expect(Buffer.byteLength(JSON.stringify(RUN_MANIFEST))).toBeLessThan(40_000);
    for (const descriptor of RUN_MANIFEST) {
      expect(descriptor.generatorVersion).toBe(GENERATOR_VERSION);
      expect(descriptor.sourceVersion).toBe(DATASET_VERSION);
      expect(descriptor.synthetic).toBe(true);
      expect(descriptor.expectedStepInterval).toBe(1);
      expect(descriptor.snapshotAt).toBe("2026-11-01T12:00:00.000Z");
      expect(Number.isSafeInteger(descriptor.rowCount)).toBe(true);
      expect(descriptor.rowCount).toBeGreaterThan(0);
      expect(descriptor).not.toHaveProperty("columns");
      expect(getRunDescriptor(descriptor.id)).toBe(descriptor);
    }
  });

  it("freezes nested recipes so consumers cannot alter future generation", () => {
    assertFrozenMetadata(RUN_MANIFEST);
    const descriptor = getRunDescriptor("run-012");
    expect(Reflect.set(descriptor, "seed", 0)).toBe(false);
    expect(Reflect.set(descriptor.fixture.duplicates![0].overrides!, "loss", 0)).toBe(false);
    expect(descriptor.seed).toBe(1012);
    expect(descriptor.fixture.duplicates![0].overrides!.loss).toBe(12);
  });

  it("rejects an unknown run instead of silently generating a default", () => {
    expect(() => getRunDescriptor("run-021")).toThrow(RangeError);
    expect(() => generateRun("run-021")).toThrow(/run-021/);
  });
});

describe("source-column contract", () => {
  it.each(RUN_MANIFEST)("$id generates declared columns and valid source steps", (descriptor) => {
    const { columns, descriptor: actualDescriptor } = generateRun(descriptor.id);
    expect(actualDescriptor).toBe(descriptor);
    expect(columns.step).toBeInstanceOf(Float64Array);
    expect(columns.step).toHaveLength(descriptor.rowCount);
    expect(columns.step.every((step) => Number.isSafeInteger(step) && step >= 0)).toBe(true);

    for (const metric of METRICS) {
      expect(columns[metric]).toBeInstanceOf(Float64Array);
      expect(columns[metric]).toHaveLength(descriptor.rowCount);
      expect(columns.missing[metric]).toBeInstanceOf(Uint8Array);
      expect(columns.missing[metric]).toHaveLength(descriptor.rowCount);
      expect(columns.missing[metric].every((mask) => mask === 0 || mask === 1)).toBe(true);
    }
  });

  it.each(RUN_MANIFEST)("$id regenerates every source byte deterministically", (descriptor) => {
    const first = generateRun(descriptor.id).columns;
    const second = generateRun(descriptor.id).columns;
    expect(equalBytes(first.step, second.step)).toBe(true);
    for (const metric of METRICS) {
      expect(equalBytes(first[metric], second[metric])).toBe(true);
      expect(equalBytes(first.missing[metric], second.missing[metric])).toBe(true);
    }
  });

  it("returns fresh buffers whose mutation cannot contaminate another load", () => {
    const first = generateRun("run-015").columns;
    const second = generateRun("run-015").columns;
    const missingIndex = onlyIndexAtStep(first, 2400);
    const invalidIndex = onlyIndexAtStep(first, 200);
    expect(first.step.buffer).not.toBe(second.step.buffer);
    for (const metric of METRICS) {
      expect(first[metric].buffer).not.toBe(second[metric].buffer);
      expect(first.missing[metric].buffer).not.toBe(second.missing[metric].buffer);
    }

    first.step[0] = -1;
    first.loss[invalidIndex] = 0;
    first.missing.loss[missingIndex] = 0;
    first.lr[0] = -1;
    first.grad_norm[0] = -1;
    const third = generateRun("run-015").columns;
    expect(third.step[0]).toBe(second.step[0]);
    expect(Number.isNaN(third.loss[invalidIndex])).toBe(true);
    expect(third.missing.loss[missingIndex]).toBe(1);
    for (const metric of METRICS) {
      expect(equalBytes(second[metric], third[metric])).toBe(true);
      expect(equalBytes(second.missing[metric], third.missing[metric])).toBe(true);
    }
  });

  it.each(["run-013", "run-015"])("%s shuffles complete rows without losing values or masks", (runId) => {
    const descriptor = getRunDescriptor(runId);
    const shuffled = generateRun(runId).columns;
    const unshuffled = generateRunFromDescriptor({
      ...descriptor,
      fixture: { ...descriptor.fixture, shuffle: false },
    }).columns;
    expect(shuffled.step.some((step, index) => index > 0 && step < shuffled.step[index - 1])).toBe(true);
    expect(equalBytes(shuffled.step, unshuffled.step)).toBe(false);
    expect(sortedRowTokens(shuffled)).toEqual(sortedRowTokens(unshuffled));
  });
});

describe("independent anomaly oracles", () => {
  it("keeps a gradient-only spike without injecting a loss spike", () => {
    const columns = generateRun("run-008").columns;
    const index = onlyIndexAtStep(columns, 2500);
    expect(columns.grad_norm[index]).toBe(30);
    expect(columns.grad_norm.filter((value) => value === 30)).toHaveLength(1);
    expect(columns.loss.every((value) => Number.isFinite(value) && value > 0 && value < 2)).toBe(true);
    expect(columns.loss[index]).toBeLessThan(
      Math.max(columns.loss[index - 1], columns.loss[index + 1]) + 0.1,
    );
  });

  it("preserves three numerical NaNs, including the final loss reading", () => {
    const columns = generateRun("run-009").columns;
    expect(columns.loss.filter(Number.isNaN)).toHaveLength(3);
    for (const step of [400, 1600, 3999]) {
      const index = onlyIndexAtStep(columns, step);
      expect(Number.isNaN(columns.loss[index])).toBe(true);
      expect(columns.missing.loss[index]).toBe(0);
      expect(Number.isFinite(columns.lr[index])).toBe(true);
      expect(Number.isFinite(columns.grad_norm[index])).toBe(true);
    }
    expect(columns.step[columns.step.length - 1]).toBe(3999);
  });

  it("preserves positive and negative Infinity as distinct numerical values", () => {
    const columns = generateRun("run-010").columns;
    expect(columns.loss[onlyIndexAtStep(columns, 900)]).toBe(Infinity);
    expect(columns.loss[onlyIndexAtStep(columns, 2100)]).toBe(-Infinity);
    expect(columns.loss.filter((value) => !Number.isFinite(value))).toHaveLength(2);
    expect(columns.missing.loss.every((mask) => mask === 0)).toBe(true);
  });

  it("adds exactly three identical duplicate rows, preserving every metric", () => {
    const columns = generateRun("run-011").columns;
    const groups = duplicateGroups(columns);
    expect([...groups.keys()].sort((left, right) => left - right)).toEqual([500, 1500, 2500]);
    for (const indexes of groups.values()) {
      expect(indexes).toHaveLength(2);
      expect(rowToken(columns, indexes[0])).toBe(rowToken(columns, indexes[1]));
    }
    expect(columns.step.length - new Set(columns.step).size).toBe(3);
  });

  it("retains both sides of finite, invalid, and final-step metric conflicts", () => {
    const columns = generateRun("run-012").columns;
    const groups = duplicateGroups(columns);
    expect([...groups.keys()].sort((left, right) => left - right)).toEqual([700, 1700, 3999]);
    for (const indexes of groups.values()) expect(indexes).toHaveLength(2);

    const extreme = groups.get(700)!;
    expect(extreme.map((index) => columns.loss[index]).sort((a, b) => a - b)[1]).toBe(12);
    expect(extreme.some((index) => columns.loss[index] > 0 && columns.loss[index] < 2)).toBe(true);
    const invalid = groups.get(1700)!;
    expect(invalid.filter((index) => Number.isNaN(columns.loss[index]))).toHaveLength(1);
    expect(invalid.filter((index) => Number.isFinite(columns.loss[index]))).toHaveLength(1);
    const final = groups.get(3999)!;
    expect(final.map((index) => columns.grad_norm[index]).sort((a, b) => a - b)[1]).toBe(25);
    expect(columns.loss[final[0]]).toBe(columns.loss[final[1]]);
    for (const indexes of [extreme, invalid, final]) {
      expect(columns.lr[indexes[0]]).toBe(columns.lr[indexes[1]]);
    }
    expect(columns.missing.loss.every((mask) => mask === 0)).toBe(true);
  });

  it("omits exactly the declared step gaps while keeping 4,000 source rows", () => {
    const columns = generateRun("run-014").columns;
    const expectedSteps: number[] = [];
    for (let step = 0; step <= 4069; step += 1) {
      if ((step >= 600 && step <= 619) || (step >= 2200 && step <= 2249)) continue;
      expectedSteps.push(step);
    }
    expect(columns.step).toHaveLength(4000);
    expect(Array.from(columns.step)).toEqual(expectedSteps);
  });

  it("keeps mixed gaps, conflicts, invalid numbers, and missing telemetry distinct", () => {
    const columns = generateRun("run-015").columns;
    const groups = duplicateGroups(columns);
    expect([...groups.keys()].sort((left, right) => left - right)).toEqual([450, 900, 1800, 3600]);
    expect(columns.step).toHaveLength(4004);
    expect(new Set(columns.step).size).toBe(4000);
    expect(Math.max(...columns.step)).toBe(4034);
    expect(columns.step.some((step) => step >= 1200 && step <= 1224)).toBe(false);
    expect(columns.step.some((step) => step >= 2800 && step <= 2809)).toBe(false);
    expect(rowToken(columns, groups.get(450)![0])).toBe(rowToken(columns, groups.get(450)![1]));
    expect(groups.get(900)!.some((index) => columns.loss[index] === 18)).toBe(true);
    expect(groups.get(1800)!.filter((index) => Number.isNaN(columns.loss[index]))).toHaveLength(1);
    expect(groups.get(3600)!.some((index) => columns.grad_norm[index] === 22)).toBe(true);

    const missing = onlyIndexAtStep(columns, 2400);
    const nan = onlyIndexAtStep(columns, 200);
    expect(Number.isNaN(columns.loss[missing])).toBe(true);
    expect(columns.missing.loss[missing]).toBe(1);
    expect(Number.isNaN(columns.loss[nan])).toBe(true);
    expect(columns.missing.loss[nan]).toBe(0);
    expect(columns.loss[onlyIndexAtStep(columns, 2200)]).toBe(Infinity);
    expect(columns.missing.loss.reduce((total, mask) => total + mask, 0)).toBe(1);
    for (const metric of ["lr", "grad_norm"] as const) {
      expect(columns[metric].every(Number.isFinite)).toBe(true);
      expect(columns.missing[metric].every((mask) => mask === 0)).toBe(true);
    }
  });

  it("keeps valid zeros, including the final learning rate", () => {
    const columns = generateRun("run-016").columns;
    for (const step of [500, 999]) {
      const index = onlyIndexAtStep(columns, step);
      expect(columns.loss[index]).toBe(0);
      expect(columns.missing.loss[index]).toBe(0);
    }
    expect(columns.grad_norm[onlyIndexAtStep(columns, 1200)]).toBe(0);
    expect(columns.lr[onlyIndexAtStep(columns, 3999)]).toBe(0);
    for (const metric of METRICS) expect(columns[metric].every(Number.isFinite)).toBe(true);
  });

  it("retains finite negative loss instead of classifying it as missing", () => {
    const columns = generateRun("run-017").columns;
    expect(columns.loss[onlyIndexAtStep(columns, 2000)]).toBe(-0.25);
    expect(columns.loss.some((value) => value < 0)).toBe(true);
    expect(columns.loss.every(Number.isFinite)).toBe(true);
    expect(columns.missing.loss.every((mask) => mask === 0)).toBe(true);
  });

  it("uses independently specified constant metric values", () => {
    const columns = generateRun("run-018").columns;
    expect(columns.loss.every((value) => value === 0.75)).toBe(true);
    expect(columns.lr.every((value) => value === 0.001)).toBe(true);
    expect(columns.grad_norm.every((value) => value === 0.5)).toBe(true);
  });

  it("keeps every loss invalid while the other two metrics remain usable", () => {
    const columns = generateRun("run-019").columns;
    expect(columns.loss).toHaveLength(3000);
    expect(columns.loss.every(Number.isNaN)).toBe(true);
    expect(columns.missing.loss.every((mask) => mask === 0)).toBe(true);
    expect(columns.lr.every(Number.isFinite)).toBe(true);
    expect(columns.grad_norm.every(Number.isFinite)).toBe(true);
  });

  it("has exactly one known isolated spike in one million unbroken source rows", () => {
    const columns = generateRun("run-020").columns;
    expect(columns.step).toHaveLength(1_000_000);
    expect(columns.step[0]).toBe(0);
    expect(columns.step[999_999]).toBe(999_999);
    expect(columns.step.every((step, index) => step === index)).toBe(true);
    expect(columns.loss[500_000]).toBe(12);

    let spikeCount = 0;
    let unexpectedLossCount = 0;
    for (let index = 0; index < columns.loss.length; index += 1) {
      const value = columns.loss[index];
      if (value === 12) spikeCount += 1;
      if (index !== 500_000 && !(Number.isFinite(value) && value > 0 && value < 2)) {
        unexpectedLossCount += 1;
      }
    }
    expect(spikeCount).toBe(1);
    expect(unexpectedLossCount).toBe(0);
    expect(columns.lr.every((value) => Number.isFinite(value) && value > 0 && value <= 0.001)).toBe(true);
    expect(columns.grad_norm.every((value) => Number.isFinite(value) && value > 0 && value < 2)).toBe(true);
    for (const metric of METRICS) {
      expect(columns.missing[metric].every((mask) => mask === 0)).toBe(true);
    }
    expect(columns.grad_norm[500_000]).toBeLessThan(2);
  });
});
