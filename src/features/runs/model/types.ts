export const METRICS = ["loss", "lr", "grad_norm"] as const;

export type Metric = (typeof METRICS)[number];
export type RunStatus = "running" | "completed" | "failed";
export type RunPattern =
  | "convergence"
  | "fast-convergence"
  | "slow-convergence"
  | "plateau"
  | "oscillation"
  | "noisy-convergence"
  | "divergence"
  | "gradient-instability"
  | "zero-values"
  | "negative-loss"
  | "constant";

// Fixture recipes are JSON-safe; generated columns contain real IEEE numbers.
export type FixtureValue = number | "NaN" | "Infinity" | "-Infinity" | "missing";

export interface MetricInjection {
  readonly step: number;
  readonly metric: Metric;
  readonly value: FixtureValue;
}

export interface DuplicateInjection {
  readonly step: number;
  readonly overrides?: Readonly<Partial<Record<Metric, FixtureValue>>>;
}

export interface StepGap {
  readonly startStep: number;
  readonly endStep: number;
}

export interface FixtureRecipe {
  readonly injections?: readonly MetricInjection[];
  readonly duplicates?: readonly DuplicateInjection[];
  readonly gaps?: readonly StepGap[];
  readonly shuffle?: boolean;
  readonly allInvalidLoss?: boolean;
}

export interface RunDescriptor {
  readonly id: string;
  readonly name: string;
  readonly status: RunStatus;
  readonly seed: number;
  readonly generatorVersion: string;
  readonly sourceVersion: string;
  /** Exact source-row count, including duplicate rows. */
  readonly rowCount: number;
  readonly expectedStepInterval: number;
  readonly snapshotAt: string;
  readonly synthetic: true;
  readonly scenario: string;
  readonly pattern: RunPattern;
  readonly fixture: FixtureRecipe;
}

export interface SourceColumns {
  readonly step: Float64Array;
  readonly loss: Float64Array;
  readonly lr: Float64Array;
  readonly grad_norm: Float64Array;
  /** A mask value of 1 means absent telemetry, distinct from numerical NaN. */
  readonly missing: Readonly<Record<Metric, Uint8Array>>;
}

export interface GeneratedRun {
  readonly descriptor: RunDescriptor;
  /** Array index is source-row provenance. Do not normalize these in place. */
  readonly columns: SourceColumns;
}
