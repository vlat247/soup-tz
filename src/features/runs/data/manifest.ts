import type { RunDescriptor } from "../model/types";

export const GENERATOR_VERSION = "1.0.0";
export const DATASET_VERSION = "soup-fixtures-v1";

type Definition = Omit<
  RunDescriptor,
  "generatorVersion" | "sourceVersion" | "expectedStepInterval" | "snapshotAt" | "synthetic"
>;

function defineRun(definition: Definition): RunDescriptor {
  const fixture = definition.fixture;
  // Freeze public recipe metadata so another consumer cannot change future loads.
  return Object.freeze({
    ...definition,
    generatorVersion: GENERATOR_VERSION,
    sourceVersion: DATASET_VERSION,
    expectedStepInterval: 1,
    snapshotAt: "2026-11-01T12:00:00.000Z",
    synthetic: true as const,
    fixture: Object.freeze({
      ...fixture,
      ...(fixture.injections && {
        injections: Object.freeze(fixture.injections.map((entry) => Object.freeze({ ...entry }))),
      }),
      ...(fixture.duplicates && {
        duplicates: Object.freeze(fixture.duplicates.map((entry) => Object.freeze({
          ...entry,
          ...(entry.overrides && { overrides: Object.freeze({ ...entry.overrides }) }),
        }))),
      }),
      ...(fixture.gaps && {
        gaps: Object.freeze(fixture.gaps.map((entry) => Object.freeze({ ...entry }))),
      }),
    }),
  });
}

// Only descriptors are allocated here. Importing the manifest generates no points.
export const RUN_MANIFEST: readonly RunDescriptor[] = Object.freeze([
  defineRun({
    id: "run-001", name: "Steady convergence", status: "completed", seed: 1001,
    rowCount: 6000, pattern: "convergence", fixture: {},
    scenario: "Clean reference with steadily decreasing loss.",
  }),
  defineRun({
    id: "run-002", name: "Fast convergence", status: "completed", seed: 1002,
    rowCount: 5000, pattern: "fast-convergence", fixture: {},
    scenario: "Clean reference that converges quickly.",
  }),
  defineRun({
    id: "run-003", name: "Slow progress", status: "running", seed: 1003,
    rowCount: 8000, pattern: "slow-convergence", fixture: {},
    scenario: "Clean reference with slow but sustained progress.",
  }),
  defineRun({
    id: "run-004", name: "Early plateau", status: "completed", seed: 1004,
    rowCount: 4000, pattern: "plateau", fixture: {},
    scenario: "Finite loss settles on a plateau.",
  }),
  defineRun({
    id: "run-005", name: "Oscillating loss", status: "running", seed: 1005,
    rowCount: 4000, pattern: "oscillation", fixture: {},
    scenario: "Finite periodic oscillations without missing telemetry.",
  }),
  defineRun({
    id: "run-006", name: "Noisy convergence", status: "completed", seed: 1006,
    rowCount: 6000, pattern: "noisy-convergence", fixture: {},
    scenario: "Converging loss with reproducible noise.",
  }),
  defineRun({
    id: "run-007", name: "Loss divergence", status: "failed", seed: 1007,
    rowCount: 6000, pattern: "divergence", fixture: {},
    scenario: "Sustained finite loss divergence with increasing gradient norms.",
  }),
  defineRun({
    id: "run-008", name: "Unstable gradients", status: "running", seed: 1008,
    rowCount: 5000, pattern: "gradient-instability",
    fixture: { injections: [{ step: 2500, metric: "grad_norm", value: 30 }] },
    scenario: "High gradient norms and a gradient-only spike at step 2500.",
  }),
  defineRun({
    id: "run-009", name: "NaN loss readings", status: "failed", seed: 1009,
    rowCount: 4000, pattern: "convergence",
    fixture: { injections: [
      { step: 400, metric: "loss", value: "NaN" },
      { step: 1600, metric: "loss", value: "NaN" },
      { step: 3999, metric: "loss", value: "NaN" },
    ] },
    scenario: "Interior NaN readings and an invalid final loss observation.",
  }),
  defineRun({
    id: "run-010", name: "Infinite loss readings", status: "failed", seed: 1010,
    rowCount: 4000, pattern: "convergence",
    fixture: { injections: [
      { step: 900, metric: "loss", value: "Infinity" },
      { step: 2100, metric: "loss", value: "-Infinity" },
    ] },
    scenario: "Both positive and negative infinite loss readings.",
  }),
  defineRun({
    id: "run-011", name: "Repeated identical observations", status: "completed", seed: 1011,
    rowCount: 4003, pattern: "convergence",
    fixture: { duplicates: [{ step: 500 }, { step: 1500 }, { step: 2500 }] },
    scenario: "Three appended duplicate rows with identical metric readings.",
  }),
  defineRun({
    id: "run-012", name: "Conflicting duplicate steps", status: "failed", seed: 1012,
    rowCount: 4003, pattern: "convergence",
    fixture: { duplicates: [
      { step: 700, overrides: { loss: 12 } },
      { step: 1700, overrides: { loss: "NaN" } },
      { step: 3999, overrides: { grad_norm: 25 } },
    ] },
    scenario: "Finite-extreme and finite/NaN loss conflicts, plus a final-step gradient conflict.",
  }),
  defineRun({
    id: "run-013", name: "Out-of-order observations", status: "completed", seed: 1013,
    rowCount: 4096, pattern: "convergence", fixture: { shuffle: true },
    scenario: "A deterministic permutation of unique steps; all metric columns move together.",
  }),
  defineRun({
    id: "run-014", name: "Missing step intervals", status: "running", seed: 1014,
    rowCount: 4000, pattern: "convergence",
    fixture: { gaps: [
      { startStep: 600, endStep: 619 },
      { startStep: 2200, endStep: 2249 },
    ] },
    scenario: "Missing steps 600-619 and 2200-2249 with a declared cadence of one.",
  }),
  defineRun({
    id: "run-015", name: "Mixed telemetry defects", status: "failed", seed: 1015,
    rowCount: 4004, pattern: "convergence",
    fixture: {
      shuffle: true,
      gaps: [
        { startStep: 1200, endStep: 1224 },
        { startStep: 2800, endStep: 2809 },
      ],
      injections: [
        { step: 200, metric: "loss", value: "NaN" },
        { step: 2200, metric: "loss", value: "Infinity" },
        { step: 2400, metric: "loss", value: "missing" },
      ],
      duplicates: [
        { step: 450 },
        { step: 900, overrides: { loss: 18 } },
        { step: 1800, overrides: { loss: "NaN" } },
        { step: 3600, overrides: { grad_norm: 22 } },
      ],
    },
    scenario: "Shuffled gaps, identical/conflicting duplicates, invalid and missing loss readings.",
  }),
  defineRun({
    id: "run-016", name: "Valid zero readings", status: "completed", seed: 1016,
    rowCount: 4000, pattern: "zero-values",
    fixture: { injections: [
      { step: 500, metric: "loss", value: 0 },
      { step: 999, metric: "loss", value: 0 },
      { step: 1200, metric: "grad_norm", value: 0 },
    ] },
    scenario: "Valid metric zeros and a learning-rate schedule ending at zero.",
  }),
  defineRun({
    id: "run-017", name: "Negative loss values", status: "completed", seed: 1017,
    rowCount: 4000, pattern: "negative-loss",
    fixture: { injections: [{ step: 2000, metric: "loss", value: -0.25 }] },
    scenario: "Finite loss crosses below zero; negative is a value, not invalid telemetry.",
  }),
  defineRun({
    id: "run-018", name: "Constant metrics", status: "completed", seed: 1018,
    rowCount: 3000, pattern: "constant", fixture: {},
    scenario: "Loss 0.75, learning rate 0.001, and gradient norm 0.5 at every step.",
  }),
  defineRun({
    id: "run-019", name: "No finite loss", status: "failed", seed: 1019,
    rowCount: 3000, pattern: "convergence", fixture: { allInvalidLoss: true },
    scenario: "Every loss is NaN while learning rate and gradient norm remain usable.",
  }),
  defineRun({
    id: "run-020", name: "Million-point isolated spike", status: "completed", seed: 1020,
    rowCount: 1_000_000, pattern: "convergence",
    fixture: { injections: [{ step: 500_000, metric: "loss", value: 12 }] },
    scenario: "Steps 0-999999 with one loss spike of exactly 12 at step 500000; other loss values stay below 2.",
  }),
]);

export function getRunDescriptor(runId: string): RunDescriptor {
  const descriptor = RUN_MANIFEST.find((run) => run.id === runId);
  if (!descriptor) {
    throw new RangeError(`Unknown training run: ${runId}`);
  }
  return descriptor;
}
