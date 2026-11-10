import { generateRun } from "../src/features/runs/data/generate";
import { RUN_MANIFEST } from "../src/features/runs/data/manifest";
import { METRICS } from "../src/features/runs/model/types";
import type { GeneratedRun, Metric, SourceColumns } from "../src/features/runs/model/types";

function inspectMetric(columns: SourceColumns, metric: Metric) {
  const values = columns[metric];
  const mask = columns.missing[metric];
  const counts = {
    finite: 0, nan: 0, positiveInfinity: 0, negativeInfinity: 0,
    missing: 0, zero: 0, negativeFinite: 0,
  };
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (mask[index]) counts.missing += 1;
    else if (Number.isNaN(value)) counts.nan += 1;
    else if (value === Infinity) counts.positiveInfinity += 1;
    else if (value === -Infinity) counts.negativeInfinity += 1;
    else {
      counts.finite += 1;
      if (value === 0) counts.zero += 1;
      if (value < 0) counts.negativeFinite += 1;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  return {
    ...counts,
    minimum: counts.finite ? minimum : null,
    maximum: counts.finite ? maximum : null,
  };
}

function inspectSteps(run: GeneratedRun) {
  const steps = run.columns.step;
  let descendingPairs = 0;
  for (let index = 1; index < steps.length; index += 1) {
    if (steps[index] < steps[index - 1]) descendingPairs += 1;
  }
  // Only copy steps when necessary. Never sort the actual source columns.
  const ordered = descendingPairs ? steps.slice().sort() : steps;
  let duplicateExtraRows = 0;
  let gapIntervals = 0;
  let missingSteps = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const distance = ordered[index] - ordered[index - 1];
    if (distance === 0) duplicateExtraRows += 1;
    else if (distance > run.descriptor.expectedStepInterval) {
      gapIntervals += 1;
      missingSteps += distance / run.descriptor.expectedStepInterval - 1;
    }
  }
  return {
    sourceRows: steps.length,
    uniqueSteps: steps.length - duplicateExtraRows,
    minimumStep: ordered.length ? ordered[0] : null,
    maximumStep: ordered.length ? ordered[ordered.length - 1] : null,
    duplicateExtraRows,
    gapIntervals,
    missingSteps,
    descendingPairs,
  };
}

function sourceIndexesAt(columns: SourceColumns, step: number): number[] {
  const result: number[] = [];
  for (let index = 0; index < columns.step.length; index += 1) {
    if (columns.step[index] === step) result.push(index);
  }
  return result;
}

function encodeReading(value: number, missing: number): number | string {
  if (missing) return "missing";
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  return value;
}

function sourceRowsAt(columns: SourceColumns, step: number) {
  return sourceIndexesAt(columns, step).map((sourceIndex) => ({
    sourceIndex,
    step,
    loss: encodeReading(columns.loss[sourceIndex], columns.missing.loss[sourceIndex]),
    lr: encodeReading(columns.lr[sourceIndex], columns.missing.lr[sourceIndex]),
    grad_norm: encodeReading(columns.grad_norm[sourceIndex], columns.missing.grad_norm[sourceIndex]),
  }));
}

function reportRun(run: GeneratedRun) {
  const { descriptor, columns } = run;
  return {
    descriptor,
    steps: inspectSteps(run),
    metrics: Object.fromEntries(METRICS.map((metric) => [metric, inspectMetric(columns, metric)])) as
      Record<Metric, ReturnType<typeof inspectMetric>>,
    fixturePositions: {
      injections: (descriptor.fixture.injections ?? []).map((injection) => ({
        ...injection,
        rows: sourceRowsAt(columns, injection.step),
      })),
      duplicates: (descriptor.fixture.duplicates ?? []).map((duplicate) => ({
        ...duplicate,
        rows: sourceRowsAt(columns, duplicate.step),
      })),
      gaps: (descriptor.fixture.gaps ?? []).map((gap) => ({
        ...gap,
        previousSourceIndexes: sourceIndexesAt(columns, gap.startStep - descriptor.expectedStepInterval),
        nextSourceIndexes: sourceIndexesAt(columns, gap.endStep + descriptor.expectedStepInterval),
      })),
      ...(descriptor.fixture.allInvalidLoss && {
        allInvalidLoss: { firstSourceIndex: 0, lastSourceIndex: columns.step.length - 1, kind: "NaN" },
      }),
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: npm run data:inspect -- [run-001 ... run-020] [--json]");
    console.log("Without a run ID, inspect all 20 runs. --json emits metadata and diagnostics, never raw point arrays.");
    return;
  }
  const json = args.includes("--json");
  const ids = args.filter((arg) => arg !== "--json");
  // Validate every requested ID before generating any arrays or printing output.
  for (const id of ids) {
    if (!RUN_MANIFEST.some((run) => run.id === id)) {
      throw new RangeError(`Unknown run or option: ${id}. Use --help for usage.`);
    }
  }
  const selectedIds = ids.length ? ids : RUN_MANIFEST.map((run) => run.id);
  // Generate and release one run at a time; reports retain no typed-array buffers.
  const reports = selectedIds.map((id) => reportRun(generateRun(id)));
  if (json || ids.length) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }
  console.table(reports.map(({ descriptor, steps, metrics }) => ({
    run: descriptor.id,
    rows: steps.sourceRows,
    "NaN loss": metrics.loss.nan,
    "+Inf loss": metrics.loss.positiveInfinity,
    "-Inf loss": metrics.loss.negativeInfinity,
    "missing loss": metrics.loss.missing,
    "duplicate rows": steps.duplicateExtraRows,
    "missing steps": steps.missingSteps,
    unsorted: steps.descendingPairs > 0,
    "max loss": metrics.loss.maximum,
  })));
  console.log("Source-data diagnostics only; chart truthfulness and browser performance are not measured here.");
  console.log("Use npm run data:inspect -- run-015 to inspect exact anomaly source positions.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
