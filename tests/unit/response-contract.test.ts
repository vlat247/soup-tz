import { describe, expect, it } from "vitest";
import { generateRun } from "../../src/features/runs/data/generate";
import { RUN_MANIFEST } from "../../src/features/runs/data/manifest";
import { inspectStep } from "../../src/features/runs/model/inspect";
import { prepareRun } from "../../src/features/runs/model/prepare";
import { buildFrame } from "../../src/features/runs/model/reduce";
import { isRunFrame, isRunSummary, isStepInspection } from "../../src/features/runs/model/validate-view";
import type { RunFrame, RunSummary, StepInspection } from "../../src/features/runs/model/view-types";
import { METRICS, type GeneratedRun } from "../../src/features/runs/model/types";

const prepared = prepareRun(generateRun("run-012"));
const sourceSummary = prepared.summary;
const sourceFrame = buildFrame(prepared, { start: 0, end: 3999, width: 120 });
const sourceInspection = inspectStep(prepared, 700);

describe("summary response contract", () => {
  const cases: [string, (summary: RunSummary) => void][] = [
    ["finite-tagged NaN", (s) => { s.latest.loss = { kind: "finite", value: NaN }; }],
    ["nonfinite tagged payload", (s) => { s.latest.loss = { kind: "nan", value: 0 }; }],
    ["missing metric", (s) => { delete (s.latest as Partial<typeof s.latest>).loss; }],
    ["impossible row accounting", (s) => { s.rowCount++; }],
    ["negative quality count", (s) => { s.invalidCounts.loss = -1; }],
    ["fractional quality count", (s) => { s.missingCounts.lr = 0.5; }],
    ["infinite extent", (s) => { s.extents.loss = [0, Infinity]; }],
    ["reversed extent", (s) => { s.extents.loss = [12, 0]; }],
    ["invalid last finite value", (s) => { s.lastFinite.loss!.value = NaN; }],
    ["last finite outside source steps", (s) => { s.lastFinite.lr!.step = 4000; }],
    ["latest/last-finite disagreement", (s) => { s.lastFinite.loss!.step--; }],
  ];
  it.each(cases)("rejects %s", (_, mutate) => {
    const summary = structuredClone(sourceSummary);
    mutate(summary);
    expect(isRunSummary(summary)).toBe(false);
  });
});

describe("reduced frame response contract", () => {
  const cases: [string, (frame: RunFrame) => void][] = [
    ["missing metrics", (f) => { delete (f.metrics as Partial<typeof f.metrics>).loss; }],
    ["NaN coordinate", (f) => { f.metrics.loss.points[0][1] = NaN; }],
    ["infinite conflict", (f) => { f.metrics.loss.conflicts[0][1] = Infinity; }],
    ["coordinate outside viewport", (f) => { f.metrics.lr.points[0][0] = -1; }],
    ["value outside raw domain", (f) => { f.metrics.loss.points[0][1] = 13; }],
    ["sparse point array", (f) => { delete f.metrics.loss.points[0]; }],
    ["out-of-order points", (f) => { f.metrics.lr.points.reverse(); }],
    ["unbounded point payload", (f) => { f.metrics.loss.points = Array(961).fill([0, 1]); }],
    ["wrong total plotted count", (f) => { f.plottedCount++; }],
    ["wrong metric counts", (f) => { f.metrics.loss.finiteCount++; }],
    ["wrong full-run source count", (f) => { f.sourceCount--; }],
    ["fractional width", (f) => { f.viewport.width = 2.5; }],
    ["empty domain with finite readings", (f) => { f.metrics.loss.domain = null; }],
    ["peak outside domain", (f) => { f.metrics.loss.peak!.value = 13; }],
    ["unknown representation", (f) => { Object.assign(f.metrics.loss, { mode: "smoothed" }); }],
    ["full-range quality counts disagree with summary", (f) => {
      f.metrics.loss.finiteCount += f.metrics.loss.invalidCount;
      f.metrics.loss.invalidCount = 0;
    }],
    ["full-range domain hides known source maximum", (f) => {
      const loss = f.metrics.loss;
      loss.domain = [sourceSummary.extents.loss![0], 1];
      for (const point of [...loss.points, ...loss.conflicts]) if (point[1] !== null) point[1] = Math.min(1, point[1]);
      loss.peak!.value = 1;
    }],
  ];
  it.each(cases)("rejects %s", (_, mutate) => {
    const frame = structuredClone(sourceFrame);
    mutate(frame);
    expect(isRunFrame(frame, sourceSummary)).toBe(false);
  });
});

describe("inspection response contract", () => {
  it("rejects latest-step readings that disagree with the summary even inside its extent", () => {
    const inspection = inspectStep(prepared, sourceSummary.lastStep);
    expect(sourceSummary.extents.loss![0]).toBeLessThan(0.5);
    expect(sourceSummary.extents.loss![1]).toBeGreaterThan(0.5);
    expect(sourceSummary.latest.loss.value).not.toBe(0.5);
    inspection.readings.loss = { kind: "finite", value: 0.5 };
    for (const row of inspection.sourceRows) row.readings.loss = { kind: "finite", value: 0.5 };
    expect(isStepInspection(inspection, sourceSummary)).toBe(false);
  });

  const cases: [string, (inspection: StepInspection) => void][] = [
    ["wrong source page length", (i) => { i.sourceRows.pop(); }],
    ["oversized source page", (i) => { i.sourceCount = 21; i.sourceRows = Array(21).fill(i.sourceRows[0]); }],
    ["repeated provenance", (i) => { i.sourceRows[1].sourceIndex = i.sourceRows[0].sourceIndex; }],
    ["out-of-bounds provenance", (i) => { i.sourceRows[1].sourceIndex = sourceSummary.rowCount; }],
    ["fractional provenance", (i) => { i.sourceRows[0].sourceIndex = 0.5; }],
    ["finite-tagged infinity", (i) => { i.sourceRows[0].readings.loss = { kind: "finite", value: Infinity }; }],
    ["raw conflict reading", (i) => { i.sourceRows[0].readings.loss = { kind: "conflict", value: null }; }],
    ["missing raw metric", (i) => { delete (i.sourceRows[0].readings as Partial<typeof i.readings>).loss; }],
    ["canonical/source disagreement", (i) => { i.sourceRows[0].readings.lr.value = 0; }],
    ["matching invented values outside source extent", (i) => {
      i.readings.loss = { kind: "finite", value: 999 };
      for (const row of i.sourceRows) row.readings.loss = { kind: "finite", value: 999 };
    }],
    ["invalid neighbor", (i) => { i.previousStep = i.step; }],
    ["missing interior neighbor", (i) => { i.nextStep = null; }],
    ["invalid page offset", (i) => { i.sourceOffset = 1; }],
    ["unsafe selected step", (i) => { i.step = Number.MAX_SAFE_INTEGER + 1; }],
  ];
  it.each(cases)("rejects %s", (_, mutate) => {
    const inspection = structuredClone(sourceInspection);
    mutate(inspection);
    expect(isStepInspection(inspection, sourceSummary)).toBe(false);
  });
});

describe("real source compatibility", () => {
  it.each(RUN_MANIFEST)("accepts $id summaries, reduced frames and exact inspections", (descriptor) => {
    const run = prepareRun(generateRun(descriptor.id));
    expect(isRunSummary(run.summary)).toBe(true);
    for (const width of [1, 120]) {
      const full = buildFrame(run, { start: run.summary.firstStep, end: run.summary.lastStep, width });
      expect(isRunFrame(full, run.summary)).toBe(true);
      const latest = buildFrame(run, { start: run.summary.lastStep, end: run.summary.lastStep, width });
      expect(isRunFrame(latest, run.summary)).toBe(true);
    }
    for (const step of [run.summary.firstStep, 700, run.summary.lastStep]) {
      expect(isStepInspection(inspectStep(run, step), run.summary)).toBe(true);
    }
    if (descriptor.id === "run-019") {
      expect(run.summary.latest.loss).toEqual({ kind: "nan", value: null });
      expect(run.summary.extents.loss).toBeNull();
    }
    if (descriptor.id === "run-012") {
      const inspection = inspectStep(run, 3999);
      expect(inspection.readings.grad_norm.kind).toBe("conflict");
      expect(inspection.sourceRows.map((row) => row.readings.grad_norm.value)).toContain(25);
    }
  });

  it.each([{ name: "empty", steps: [] }, { name: "rejected-only", steps: [NaN] }, { name: "singleton", steps: [7] }])("accepts $name source", ({ steps }) => {
    const columns = {
      step: new Float64Array(steps), loss: new Float64Array(steps.length).fill(-0),
      lr: new Float64Array(steps.length).fill(Number.MIN_VALUE), grad_norm: new Float64Array(steps.length).fill(Number.MAX_VALUE),
      missing: Object.fromEntries(METRICS.map((metric) => [metric, new Uint8Array(steps.length)])),
    } as GeneratedRun["columns"];
    const run = prepareRun({ descriptor: { ...RUN_MANIFEST[0], rowCount: steps.length }, columns });
    expect(isRunSummary(run.summary)).toBe(true);
    const frame = buildFrame(run, { start: run.summary.firstStep, end: run.summary.lastStep, width: 1 });
    expect(isRunFrame(frame, run.summary)).toBe(true);
    if (run.summary.uniqueSteps) expect(isStepInspection(inspectStep(run, 7), run.summary)).toBe(true);
  });
});
