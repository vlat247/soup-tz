import { METRICS, type Metric } from "./types";
import type { MetricFrame, Reading, RunFrame, RunSummary, StepInspection, Viewport } from "./view-types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function range(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) && value[0] <= value[1];
}

function reading(value: unknown, source = false): value is Reading {
  if (!record(value)) return false;
  if (value.kind === "finite") return typeof value.value === "number" && Number.isFinite(value.value);
  return value.value === null && (
    value.kind === "nan" || value.kind === "positive-infinity" || value.kind === "negative-infinity" ||
    value.kind === "missing" || (!source && value.kind === "conflict")
  );
}

function readings(value: unknown, source = false): boolean {
  return record(value) && METRICS.every((metric) => reading(value[metric], source));
}

function withinSummary(value: Reading, summary: RunSummary, metric: Metric): boolean {
  if (value.kind !== "finite") return true;
  const domain = summary.extents[metric];
  return domain !== null && value.value! >= domain[0] && value.value! <= domain[1];
}

/** Validate the small displayed summary, without deriving facts from reduced points. */
export function isRunSummary(value: unknown): value is RunSummary {
  if (!record(value)) return false;
  const summary = value as unknown as RunSummary;
  const fields = [summary.rowCount, summary.uniqueSteps, summary.firstStep, summary.lastStep,
    summary.duplicateRows, summary.rejectedRows, summary.gapCount, summary.missingSteps];
  if (!fields.every(count) || summary.rowCount > 0xffff_ffff || typeof summary.outOfOrder !== "boolean" ||
    summary.uniqueSteps + summary.duplicateRows + summary.rejectedRows !== summary.rowCount ||
    summary.lastStep < summary.firstStep || summary.gapCount > Math.max(0, summary.uniqueSteps - 1) ||
    summary.missingSteps < summary.gapCount || (summary.gapCount === 0 && summary.missingSteps !== 0) ||
    summary.uniqueSteps > summary.lastStep - summary.firstStep + 1 ||
    (summary.uniqueSteps === 0 && (summary.firstStep !== 0 || summary.lastStep !== 0 || summary.duplicateRows !== 0)) ||
    (summary.uniqueSteps === 1 && summary.firstStep !== summary.lastStep) ||
    !record(summary.invalidCounts) || !record(summary.missingCounts) || !record(summary.conflictSteps) ||
    !readings(summary.latest) || !record(summary.lastFinite) || !record(summary.extents)) return false;
  const validRows = summary.rowCount - summary.rejectedRows;
  for (const metric of METRICS) {
    const invalid = summary.invalidCounts[metric];
    const missing = summary.missingCounts[metric];
    const conflicts = summary.conflictSteps[metric];
    const latest = summary.latest[metric];
    const last = summary.lastFinite[metric];
    const domain = summary.extents[metric];
    if (![invalid, missing, conflicts].every(count) || invalid + missing > validRows ||
      conflicts > Math.min(summary.uniqueSteps, summary.duplicateRows) ||
      (domain !== null && !range(domain)) || (domain === null) !== (invalid + missing === validRows)) return false;
    if (last !== null && (!record(last) || !count(last.step) || last.step < summary.firstStep || last.step > summary.lastStep ||
      !Number.isFinite(last.value) || !domain || last.value < domain[0] || last.value > domain[1])) return false;
    if (!summary.uniqueSteps) {
      if (latest.kind !== "missing" || last !== null || summary.missingSteps !== 0) return false;
    } else if (latest.kind === "finite") {
      if (!last || last.step !== summary.lastStep || last.value !== latest.value) return false;
    } else {
      if (last?.step === summary.lastStep ||
        (latest.kind === "conflict" ? conflicts === 0 : latest.kind === "missing" ? missing === 0 : invalid === 0)) return false;
    }
  }
  return true;
}

function metricFrame(value: unknown, viewport: Viewport, sourceCount: number, summary: RunSummary, metric: Metric): value is MetricFrame {
  if (!record(value)) return false;
  const frame = value as unknown as MetricFrame;
  if (!Array.isArray(frame.points) || !Array.isArray(frame.conflicts) ||
    frame.points.length + frame.conflicts.length > 8 * viewport.width ||
    (frame.mode !== "line" && frame.mode !== "ranges") || (frame.mode === "ranges" && frame.conflicts.length !== 0) ||
    ![frame.finiteCount, frame.invalidCount, frame.missingCount, frame.conflictCount].every(count) ||
    frame.finiteCount + frame.invalidCount + frame.missingCount !== sourceCount ||
    frame.invalidCount > summary.invalidCounts[metric] || frame.missingCount > summary.missingCounts[metric] ||
    frame.conflictCount > summary.conflictSteps[metric] || frame.conflictCount > Math.floor(sourceCount / 2) ||
    (frame.domain !== null && !range(frame.domain)) || (frame.domain === null) !== (frame.finiteCount === 0)) return false;
  const domain = frame.domain;
  const wholeDomain = summary.extents[metric];
  if (domain && (!wholeDomain || domain[0] < wholeDomain[0] || domain[1] > wholeDomain[1])) return false;
  const validStep = (step: unknown) => count(step) && step >= viewport.start && step <= viewport.end;
  for (const [points, allowBreak] of [[frame.points, true], [frame.conflicts, false]] as const) {
    let previous = -1;
    for (const point of points) {
      if (!Array.isArray(point) || point.length !== 2 || !validStep(point[0]) || point[0] < previous) return false;
      const value = point[1];
      if (value === null ? !allowBreak : !Number.isFinite(value) || !domain || value < domain[0] || value > domain[1]) return false;
      previous = point[0];
    }
  }
  if (domain) {
    if (!record(frame.peak) || !validStep(frame.peak.step) || frame.peak.value !== domain[1]) return false;
  } else if (frame.peak !== null) return false;
  return true;
}

/** The current worker returns reduced frames, bounded by eight entries per plot pixel. */
export function isRunFrame(value: unknown, summary: RunSummary): value is RunFrame {
  if (!record(value)) return false;
  const frame = value as unknown as RunFrame;
  const viewport = frame.viewport;
  if (typeof frame.runId !== "string" || !frame.runId || typeof frame.sourceVersion !== "string" || !frame.sourceVersion ||
    !record(viewport) || ![viewport.start, viewport.end, viewport.width].every(count) ||
    viewport.start > viewport.end || viewport.start < summary.firstStep || viewport.end > summary.lastStep ||
    viewport.width < 1 || viewport.width > 16_384 || !record(frame.metrics) ||
    !count(frame.sourceCount) || frame.sourceCount > summary.rowCount - summary.rejectedRows || !count(frame.plottedCount)) return false;
  const fullRange = viewport.start === summary.firstStep && viewport.end === summary.lastStep;
  if (fullRange && frame.sourceCount !== summary.rowCount - summary.rejectedRows) return false;
  let plotted = 0;
  for (const metric of METRICS) {
    if (!metricFrame(frame.metrics[metric], viewport, frame.sourceCount, summary, metric)) return false;
    const data = frame.metrics[metric];
    if (frame.sourceCount === 0 && (data.points.length !== 0 || data.conflicts.length !== 0)) return false;
    if (fullRange && (data.invalidCount !== summary.invalidCounts[metric] || data.missingCount !== summary.missingCounts[metric] ||
      data.conflictCount !== summary.conflictSteps[metric] || data.domain?.[0] !== summary.extents[metric]?.[0] ||
      data.domain?.[1] !== summary.extents[metric]?.[1])) return false;
    plotted += data.points.length + data.conflicts.length;
  }
  return plotted === frame.plottedCount;
}

/** Validate bounded provenance pages before their values become renderable state. */
export function isStepInspection(value: unknown, summary: RunSummary): value is StepInspection {
  if (!record(value)) return false;
  const inspection = value as unknown as StepInspection;
  const { step, sourceOffset, sourceCount } = inspection;
  if (!Number.isFinite(inspection.requestedStep) || !count(step) || step < summary.firstStep || step > summary.lastStep ||
    !count(sourceCount) || sourceCount < 1 || sourceCount > summary.rowCount - summary.rejectedRows ||
    !count(sourceOffset) || sourceOffset >= sourceCount || sourceOffset % 20 !== 0 ||
    typeof inspection.inGap !== "boolean" || !readings(inspection.readings) ||
    !Array.isArray(inspection.sourceRows) || inspection.sourceRows.length !== Math.min(20, sourceCount - sourceOffset)) return false;
  for (const metric of METRICS) {
    const selected = inspection.readings[metric];
    if (!withinSummary(selected, summary, metric)) return false;
    const latest = summary.latest[metric];
    if (step === summary.lastStep && (selected.kind !== latest.kind || selected.value !== latest.value)) return false;
  }
  if (inspection.previousStep === null ? step !== summary.firstStep :
    !count(inspection.previousStep) || inspection.previousStep < summary.firstStep || inspection.previousStep >= step) return false;
  if (inspection.nextStep === null ? step !== summary.lastStep :
    !count(inspection.nextStep) || inspection.nextStep > summary.lastStep || inspection.nextStep <= step) return false;
  let previousIndex = -1;
  for (const row of inspection.sourceRows) {
    if (!record(row) || !count(row.sourceIndex) || row.sourceIndex >= summary.rowCount || row.sourceIndex <= previousIndex ||
      !readings(row.readings, true)) return false;
    for (const metric of METRICS) {
      const canonical = inspection.readings[metric];
      const source = row.readings[metric];
      if (!withinSummary(source, summary, metric)) return false;
      if (canonical.kind !== "conflict" && (source.kind !== canonical.kind || source.value !== canonical.value)) return false;
    }
    previousIndex = row.sourceIndex;
  }
  return true;
}
