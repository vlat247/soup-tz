import { beforeEach, describe, expect, it, vi } from "vitest";

const faults = vi.hoisted(() => ({ frame: "", inspection: "" }));

vi.mock("../../src/features/runs/model/reduce", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/features/runs/model/reduce")>();
  return {
    ...original,
    buildFrame: ((run, requested, mode) => {
      const frame = original.buildFrame(run,
        faults.frame === "interval" ? { ...requested, start: 0, end: 0 }
          : faults.frame === "width" ? { ...requested, width: 1 }
            : requested, mode);
      if (faults.frame === "identity") frame.runId = "other-run";
      if (faults.frame === "version") frame.sourceVersion = "other-version";
      if (faults.frame === "source-count") frame.sourceCount++;
      if (faults.frame === "plotted-count") frame.plottedCount++;
      return frame;
    }) as typeof original.buildFrame,
  };
});

vi.mock("../../src/features/runs/model/inspect", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/features/runs/model/inspect")>();
  return {
    ...original,
    inspectStep: ((run, step, offset) => {
      const page = original.inspectStep(run, step, offset);
      if (faults.inspection === "requested-step") page.requestedStep++;
      if (faults.inspection === "step") page.step++;
      if (faults.inspection === "previous") page.previousStep = 999;
      if (faults.inspection === "next") page.nextStep = 999;
      if (faults.inspection === "gap") page.inGap = true;
      if (faults.inspection === "count") page.sourceCount++;
      if (faults.inspection === "source-value") page.sourceRows[0].readings.loss = { kind: "finite", value: 42 };
      if (faults.inspection === "source-classification") page.sourceRows[0].readings.loss = { kind: "missing", value: null };
      if (faults.inspection === "group-classification") page.readings.loss = { kind: "missing", value: null };
      if (faults.inspection === "interior" && step === 1) page.readings.loss = { kind: "finite", value: 42 };
      if (faults.inspection === "signed-zero") page.sourceRows[0].readings.loss = { kind: "finite", value: 0 };
      return page;
    }) as typeof original.inspectStep,
  };
});

import { auditRun, validationSource } from "../../scripts/validate-runs";

beforeEach(() => { faults.frame = ""; faults.inspection = ""; });

const source = () => validationSource([
  { step: 0, loss: 1 }, { step: 1, loss: 100 }, { step: 2, loss: 2 },
]);

describe("independent audit rejects coherent but incorrect worker data", () => {
  it.each(["interval", "width", "identity", "version", "source-count", "plotted-count"])(
    "rejects corrupted frame %s", (fault) => {
      faults.frame = fault;
      expect(() => auditRun(source(), [{ start: 1, end: 2, width: 10 }])).toThrow();
    },
  );

  it.each(["requested-step", "step", "previous", "next", "gap", "count", "source-value", "source-classification", "group-classification", "interior"])(
    "rejects corrupted inspection %s", (fault) => {
      faults.inspection = fault;
      expect(() => auditRun(source(), [])).toThrow();
    },
  );

  it("checks original signed-zero representation in source inspection", () => {
    faults.inspection = "signed-zero";
    expect(() => auditRun(validationSource([{ step: 0, loss: -0 }]), [])).toThrow();
  });

  it("accepts ordinary raw facts, conflicts, missing states and original signed zero", () => {
    const run = validationSource([
      { step: 0, loss: -0 },
      { step: 1, loss: 1 },
      { step: 1, loss: NaN, missing: ["lr"] },
      { step: 2, loss: Infinity },
      { step: 3, loss: -Infinity },
    ]);
    expect(() => auditRun(run, [
      { start: -10, end: 10, width: 0.5 },
      { start: 1, end: 2, width: 100_000 },
    ])).not.toThrow();
  });

  it("checks every group and every duplicate page for small adversarial sources", () => {
    const rows = Array.from({ length: 120 }, (_, step) => ({ step, loss: step }));
    rows.push(...Array.from({ length: 44 }, (_, index) => ({ step: 60, loss: index })));
    const report = auditRun(validationSource(rows), []);
    expect(report.inspectionGroups).toBe(120);
    expect(report.inspectionPages).toBe(122);
  });

  it("bounds representative source inspection for larger runs", () => {
    const rows = Array.from({ length: 5_000 }, (_, step) => ({ step, loss: step }));
    const report = auditRun(validationSource(rows), []);
    expect(report.inspectionGroups).toBeGreaterThanOrEqual(32);
    expect(report.inspectionGroups).toBeLessThanOrEqual(49);
    expect(report.inspectionPages).toBe(report.inspectionGroups);
  });

  it("samples first, middle and last pages of a large duplicate group", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({ step: 10, loss: index }));
    const report = auditRun(validationSource(rows), []);
    expect(report.inspectionGroups).toBe(1);
    expect(report.inspectionPages).toBe(3);
  });
});
