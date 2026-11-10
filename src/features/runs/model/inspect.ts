import { METRICS, type Metric } from "./types";
import {
  groupReading,
  groupStep,
  lowerBound,
  readingAt,
  type PreparedRun,
} from "./prepare";
import type { Reading, StepInspection } from "./view-types";

/** Nearest observed step, with the lower step winning an exact distance tie. */
export function inspectStep(
  run: PreparedRun,
  requestedStep: number,
  requestedSourceOffset = 0,
): StepInspection {
  if (!Number.isFinite(requestedStep))
    throw new RangeError("Inspection step must be finite");
  if (
    !Number.isSafeInteger(requestedSourceOffset) ||
    requestedSourceOffset < 0
  ) {
    throw new RangeError("Source offset must be a nonnegative safe integer");
  }
  const groupCount = run.groupStarts.length - 1;
  if (!groupCount)
    throw new RangeError("There are no valid source steps to inspect");
  const right = lowerBound(run, requestedStep);
  let group = right;
  let inGap = false;
  if (right === groupCount) group = groupCount - 1;
  else if (right > 0) {
    const leftStep = groupStep(run, right - 1);
    const rightStep = groupStep(run, right);
    inGap =
      requestedStep > leftStep &&
      requestedStep < rightStep &&
      rightStep - leftStep > run.source.descriptor.expectedStepInterval;
    if (requestedStep - leftStep <= rightStep - requestedStep)
      group = right - 1;
  }
  const readings = {} as Record<Metric, Reading>;
  for (const metric of METRICS)
    readings[metric] = groupReading(run, group, metric);
  const start = run.groupStarts[group];
  const end = run.groupStarts[group + 1];
  const sourceCount = end - start;
  const sourceOffset = Math.min(
    Math.floor(requestedSourceOffset / 20) * 20,
    Math.floor((sourceCount - 1) / 20) * 20,
  );
  const sourceRows: StepInspection["sourceRows"] = [];
  for (
    let position = start + sourceOffset;
    position < Math.min(end, start + sourceOffset + 20);
    position++
  ) {
    const sourceIndex = run.order[position];
    const sourceReadings = {} as Record<Metric, Reading>;
    for (const metric of METRICS)
      sourceReadings[metric] = readingAt(run.source, sourceIndex, metric);
    sourceRows.push({ sourceIndex, readings: sourceReadings });
  }
  return {
    requestedStep,
    step: groupStep(run, group),
    previousStep: group > 0 ? groupStep(run, group - 1) : null,
    nextStep: group + 1 < groupCount ? groupStep(run, group + 1) : null,
    inGap,
    readings,
    sourceRows,
    sourceCount,
    sourceOffset,
  };
}
