import { getRunDescriptor } from "./manifest";
import {
  METRICS,
  type FixtureValue,
  type GeneratedRun,
  type Metric,
  type RunDescriptor,
  type RunPattern,
  type SourceColumns,
  type StepGap,
} from "../model/types";

const PATTERNS: readonly RunPattern[] = [
  "convergence", "fast-convergence", "slow-convergence", "plateau",
  "oscillation", "noisy-convergence", "divergence", "gradient-instability",
  "zero-values", "negative-loss", "constant",
];

// Mulberry32: integer state, one reproducible stream for each generation.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function assertStep(step: number): void {
  if (!Number.isSafeInteger(step) || step < 0) {
    throw new RangeError(`Expected a nonnegative safe integer step; received ${step}`);
  }
}

function assertMetric(metric: string): asserts metric is Metric {
  if (!(METRICS as readonly string[]).includes(metric)) {
    throw new RangeError(`Unknown metric: ${metric}`);
  }
}

function assertValue(value: FixtureValue): void {
  if (
    (typeof value === "number" && Number.isFinite(value)) ||
    value === "NaN" || value === "Infinity" ||
    value === "-Infinity" || value === "missing"
  ) {
    return;
  }
  throw new RangeError(`Invalid fixture value: ${String(value)}`);
}

// The base rows are ordered and unique before duplicate rows are appended.
function sourceIndex(step: number, gaps: readonly StepGap[], finalStep: number): number {
  assertStep(step);
  if (step > finalStep) {
    throw new RangeError(`Fixture step ${step} is outside the generated source`);
  }
  let skipped = 0;
  for (const gap of gaps) {
    if (step < gap.startStep) break;
    if (step <= gap.endStep) {
      throw new RangeError(`Fixture step ${step} falls inside a declared gap`);
    }
    skipped += gap.endStep - gap.startStep + 1;
  }
  return step - skipped;
}

function validateRecipe(descriptor: RunDescriptor) {
  const { rowCount, seed, fixture, pattern } = descriptor;
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
    throw new RangeError("rowCount must be a nonnegative safe integer");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  if (descriptor.expectedStepInterval !== 1) {
    throw new RangeError("The fixture generator requires a step interval of one");
  }
  if (!PATTERNS.includes(pattern)) {
    throw new RangeError(`Unknown run pattern: ${pattern}`);
  }
  const baseCount = rowCount - (fixture.duplicates?.length ?? 0);
  if (baseCount < 0) {
    throw new RangeError("Duplicate rows exceed the declared row count");
  }

  const gaps = [...(fixture.gaps ?? [])].sort((a, b) => a.startStep - b.startStep);
  let finalStep = baseCount - 1;
  let previousEnd = -1;
  for (const gap of gaps) {
    assertStep(gap.startStep);
    assertStep(gap.endStep);
    if (gap.endStep < gap.startStep || gap.startStep <= previousEnd) {
      throw new RangeError("Step gaps must be non-overlapping inclusive intervals");
    }
    if (gap.startStep > finalStep) {
      throw new RangeError(`Gap at step ${gap.startStep} is outside the generated source`);
    }
    finalStep += gap.endStep - gap.startStep + 1;
    if (!Number.isSafeInteger(finalStep)) {
      throw new RangeError("Gaps extend the source beyond safe integer steps");
    }
    previousEnd = gap.endStep;
  }

  const injectedReadings = new Set<string>();
  for (const injection of fixture.injections ?? []) {
    sourceIndex(injection.step, gaps, finalStep);
    assertMetric(injection.metric);
    assertValue(injection.value);
    const key = `${injection.step}:${injection.metric}`;
    if (injectedReadings.has(key)) {
      throw new RangeError(`Multiple injections target the same reading: ${key}`);
    }
    injectedReadings.add(key);
  }
  for (const duplicate of fixture.duplicates ?? []) {
    sourceIndex(duplicate.step, gaps, finalStep);
    for (const [metric, value] of Object.entries(duplicate.overrides ?? {})) {
      assertMetric(metric);
      assertValue(value);
    }
  }
  return { baseCount, gaps, finalStep };
}

function writeValue(columns: SourceColumns, index: number, metric: Metric, value: FixtureValue) {
  // Missing uses a NaN payload too; the mask keeps it distinct from numerical NaN.
  columns.missing[metric][index] = value === "missing" ? 1 : 0;
  columns[metric][index] = typeof value === "number" ? value
    : value === "Infinity" ? Number.POSITIVE_INFINITY
    : value === "-Infinity" ? Number.NEGATIVE_INFINITY
    : Number.NaN;
}

function shuffle(columns: SourceColumns, seed: number): void {
  // Keep shuffle consumption independent from the numerical generation stream.
  const random = createRandom((seed ^ 0x9e3779b9) >>> 0);
  const arrays = [
    columns.step, columns.loss, columns.lr, columns.grad_norm,
    columns.missing.loss, columns.missing.lr, columns.missing.grad_norm,
  ];
  for (let index = columns.step.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    for (const array of arrays) {
      const value = array[index];
      array[index] = array[other];
      array[other] = value;
    }
  }
}

/** Generate fresh source buffers on demand; malformed readings remain unchanged. */
export function generateRunFromDescriptor(descriptor: RunDescriptor): GeneratedRun {
  const { baseCount, gaps, finalStep } = validateRecipe(descriptor);
  const columns: SourceColumns = {
    step: new Float64Array(descriptor.rowCount),
    loss: new Float64Array(descriptor.rowCount),
    lr: new Float64Array(descriptor.rowCount),
    grad_norm: new Float64Array(descriptor.rowCount),
    missing: {
      loss: new Uint8Array(descriptor.rowCount),
      lr: new Uint8Array(descriptor.rowCount),
      grad_norm: new Uint8Array(descriptor.rowCount),
    },
  };
  const random = createRandom(descriptor.seed);
  let step = 0;
  let gapIndex = 0;
  for (let index = 0; index < baseCount; index++, step++) {
    while (gapIndex < gaps.length && step === gaps[gapIndex].startStep) {
      step = gaps[gapIndex].endStep + 1;
      gapIndex++;
    }
    // Progress spans the complete step domain, including declared gaps.
    const t = finalStep > 0 ? step / finalStep : 0;
    const noise = random() - 0.5;
    const gradientNoise = random() - 0.5;
    const triangle = 1 - 4 * Math.abs(((step % 200) / 200) - 0.5);
    let loss = 1.8 / (1 + 12 * t) + noise * 0.025;
    let lr = 0.001 * (1 - 0.9 * t);
    let gradNorm = 0.8 / (1 + 4 * t) + gradientNoise * 0.06;

    switch (descriptor.pattern) {
      case "fast-convergence":
        loss = 1.8 / (1 + 36 * t) + noise * 0.02;
        break;
      case "slow-convergence":
        loss = 1.8 / (1 + 2 * t) + noise * 0.02;
        break;
      case "plateau":
        loss = 0.6 + 1.2 / (1 + 30 * t) + noise * 0.015;
        break;
      case "oscillation":
        loss = 0.8 + 0.3 * triangle + noise * 0.02;
        break;
      case "noisy-convergence":
        loss += noise * 0.2;
        break;
      case "divergence":
        loss = 0.5 + 12 * t * t + noise * 0.04;
        gradNorm = 0.6 + 8 * t * t + gradientNoise * 0.08;
        break;
      case "gradient-instability":
        gradNorm = 5 + 3 * triangle + gradientNoise * 0.5;
        break;
      case "zero-values":
        lr = 0.001 * (1 - t);
        break;
      case "negative-loss":
        loss = 0.8 - 1.6 * t + noise * 0.02;
        break;
      case "constant":
        loss = 0.75;
        lr = 0.001;
        gradNorm = 0.5;
        break;
      case "convergence":
        break;
    }

    columns.step[index] = step;
    columns.loss[index] = descriptor.fixture.allInvalidLoss ? Number.NaN : loss;
    columns.lr[index] = lr;
    columns.grad_norm[index] = gradNorm;
  }

  for (const injection of descriptor.fixture.injections ?? []) {
    writeValue(columns, sourceIndex(injection.step, gaps, finalStep), injection.metric, injection.value);
  }
  for (let index = 0; index < (descriptor.fixture.duplicates?.length ?? 0); index++) {
    const duplicate = descriptor.fixture.duplicates![index];
    const source = sourceIndex(duplicate.step, gaps, finalStep);
    const target = baseCount + index;
    columns.step[target] = columns.step[source];
    for (const metric of METRICS) {
      columns[metric][target] = columns[metric][source];
      columns.missing[metric][target] = columns.missing[metric][source];
    }
    for (const [metric, value] of Object.entries(duplicate.overrides ?? {})) {
      writeValue(columns, target, metric as Metric, value);
    }
  }
  if (descriptor.fixture.shuffle) shuffle(columns, descriptor.seed);
  return { descriptor, columns };
}

export function generateRun(runId: string): GeneratedRun {
  return generateRunFromDescriptor(getRunDescriptor(runId));
}
