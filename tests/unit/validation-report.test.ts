import { describe, expect, it } from "vitest";
import {
  collectValidationResults,
  replayCommand,
  selectValidationCases,
  type AuditFacts,
} from "../../scripts/validation-report";

const ids = ["run-001", "run-020"];
const facts: AuditFacts = {
  id: "run-001", sourceRows: 4, viewports: 5, metricChecks: 15,
  rangeFrames: 1, rejectedRows: 0, sourceSha256: "a".repeat(64),
  inspectionGroups: 3, inspectionPages: 4,
};

describe("reproducible validation selection", () => {
  it("includes every fixture and seeds 1–40 by default", () => {
    const selected = selectValidationCases([], ids);
    expect(selected).toHaveLength(42);
    expect(selected.slice(0, 3)).toEqual([
      { kind: "fixture", id: "run-001" },
      { kind: "fixture", id: "run-020" },
      { kind: "adversarial", seed: 1 },
    ]);
    expect(selected.at(-1)).toEqual({ kind: "adversarial", seed: 40 });
  });

  it("replays only requested cases in order, without duplicate work", () => {
    expect(selectValidationCases([
      "--seed", "0", "--run", "run-020", "--seed", "4294967295", "--seed", "0",
    ], ids)).toEqual([
      { kind: "adversarial", seed: 0 },
      { kind: "fixture", id: "run-020" },
      { kind: "adversarial", seed: 4294967295 },
    ]);
  });

  it.each([
    ["--run", "run-999"], ["--run"], ["--seed"], ["--seed", "--run"],
    ["--sead", "4"], ["--seed", "-1"], ["--seed", "1.5"],
    ["--seed", "NaN"], ["--seed", "Infinity"], ["--seed", "1e2"],
    ["--seed", "0x12"], ["--seed", "4294967296"], ["--seed", ""],
    ["--seed", " 1"], ["--seed", "01"],
  ])("rejects invalid selector arguments %j", (...args) => {
    expect(() => selectValidationCases(args, ids)).toThrow(RangeError);
  });

  it("provides a precise command for an independently reproducible case", () => {
    expect(replayCommand({ kind: "adversarial", seed: 17 }))
      .toBe("npm run data:validate -- --seed 17");
    expect(replayCommand({ kind: "fixture", id: "run-020" }))
      .toBe("npm run data:validate -- --run run-020");
  });
});

describe("validation failure reporting", () => {
  it("retains a failure and continues to later cases without counting partial audits", () => {
    const seen: number[] = [];
    const report = collectValidationResults([
      { kind: "adversarial", seed: 1 },
      { kind: "adversarial", seed: 2 },
      { kind: "fixture", id: "run-001" },
    ], (selected) => {
      if (selected.kind === "adversarial") {
        seen.push(selected.seed);
        if (selected.seed === 1) throw new Error("loss: connected across gap");
      }
      return facts;
    });
    expect(seen).toEqual([1, 2]);
    expect(report.passed).toBe(false);
    expect(report.caseCounts).toEqual({ attempted: 3, passed: 2, failed: 1 });
    expect(report.completed).toEqual({
      fixtureRows: 4, viewportChecks: 10, metricChecks: 30, fragmentedMetricFrames: 2,
      inspectionGroups: 6, inspectionPages: 8,
    });
    expect(report.results[0]).toMatchObject({
      status: "failed", selected: { kind: "adversarial", seed: 1 },
      replay: "npm run data:validate -- --seed 1",
      error: { name: "Error", message: "loss: connected across gap" },
    });
  });

  it("never reports an empty selection as a successful validation", () => {
    expect(collectValidationResults([], () => facts).passed).toBe(false);
  });
});
