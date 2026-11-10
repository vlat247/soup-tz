/** Reporting/selection only: expected numerical facts remain in validate-runs.ts. */
export type ValidationCase =
  | { kind: "fixture"; id: string }
  | { kind: "adversarial"; seed: number };

export interface AuditFacts {
  id: string;
  sourceRows: number;
  viewports: number;
  metricChecks: number;
  rangeFrames: number;
  inspectionGroups: number;
  inspectionPages: number;
  rejectedRows: number;
  sourceSha256: string;
}

export function selectValidationCases(
  args: readonly string[],
  fixtureIds: readonly string[],
): ValidationCase[] {
  if (!args.length) {
    return [
      ...fixtureIds.map((id): ValidationCase => ({ kind: "fixture", id })),
      ...Array.from({ length: 40 }, (_, index): ValidationCase => ({
        kind: "adversarial",
        seed: index + 1,
      })),
    ];
  }
  const selected = new Map<string, ValidationCase>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag !== "--run" && flag !== "--seed")
      throw new RangeError(`Unknown validation option: ${flag}`);
    if (value === undefined || value.startsWith("--"))
      throw new RangeError(`${flag} requires a value`);
    if (flag === "--run") {
      if (!fixtureIds.includes(value))
        throw new RangeError(`Unknown fixture: ${value}`);
      selected.set(`fixture:${value}`, { kind: "fixture", id: value });
    } else {
      const seed = Number(value);
      if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isInteger(seed) || seed > 0xffff_ffff)
        throw new RangeError("Seed must be a decimal integer from 0 to 4294967295");
      selected.set(`adversarial:${seed}`, { kind: "adversarial", seed });
    }
  }
  return [...selected.values()];
}

export function replayCommand(selected: ValidationCase): string {
  return selected.kind === "fixture"
    ? `npm run data:validate -- --run ${selected.id}`
    : `npm run data:validate -- --seed ${selected.seed}`;
}

/** One failed case must not hide the results of every later fixture or seed. */
export function collectValidationResults(
  cases: readonly ValidationCase[],
  audit: (selected: ValidationCase) => AuditFacts,
) {
  const results = cases.map((selected) => {
    const context = { selected, replay: replayCommand(selected) };
    try {
      return { ...context, status: "passed" as const, audit: audit(selected) };
    } catch (error) {
      return {
        ...context,
        status: "failed" as const,
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        },
      };
    }
  });
  const passed = results.filter((result) => result.status === "passed");
  return {
    passed: cases.length > 0 && passed.length === cases.length,
    caseCounts: {
      attempted: cases.length,
      passed: passed.length,
      failed: cases.length - passed.length,
    },
    // These totals describe completed audits, never partially checked failures.
    completed: {
      fixtureRows: passed.reduce((sum, result) =>
        sum + (result.selected.kind === "fixture" ? result.audit.sourceRows : 0), 0),
      viewportChecks: passed.reduce((sum, result) => sum + result.audit.viewports, 0),
      metricChecks: passed.reduce((sum, result) => sum + result.audit.metricChecks, 0),
      fragmentedMetricFrames: passed.reduce((sum, result) => sum + result.audit.rangeFrames, 0),
      inspectionGroups: passed.reduce((sum, result) => sum + result.audit.inspectionGroups, 0),
      inspectionPages: passed.reduce((sum, result) => sum + result.audit.inspectionPages, 0),
    },
    results,
  };
}
