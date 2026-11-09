import { generateRun } from "../data/generate";
import { inspectStep } from "../model/inspect";
import { prepareRun, type PreparedRun } from "../model/prepare";
import { buildFrame } from "../model/reduce";
import type { RunWorkerRequest, RunWorkerResponse } from "../model/view-types";

let current: PreparedRun | null = null;
const reply = (message: RunWorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<RunWorkerRequest>) => {
  const request = event.data;
  // The worker owns the full source buffers; no source array is posted or detached.
  try {
    if (
      !request ||
      typeof request.runId !== "string" ||
      !Number.isSafeInteger(request.requestId) ||
      request.requestId < 0
    ) {
      throw new RangeError("Invalid worker request identity");
    }
    if (request.type === "load") {
      current = null;
      const prepared = prepareRun(generateRun(request.runId));
      const frame = buildFrame(prepared, {
        start: prepared.summary.firstStep,
        end: prepared.summary.lastStep,
        width: request.width,
      });
      current = prepared;
      reply({
        type: "loaded",
        runId: request.runId,
        requestId: request.requestId,
        summary: prepared.summary,
        frame,
      });
      return;
    }
    if (!current || current.source.descriptor.id !== request.runId)
      throw new RangeError("The requested run is not loaded");
    if (request.type === "viewport") {
      reply({
        type: "frame",
        runId: request.runId,
        requestId: request.requestId,
        frame: buildFrame(current, request.viewport),
      });
    } else if (request.type === "inspect") {
      reply({
        type: "inspection",
        runId: request.runId,
        requestId: request.requestId,
        inspection: inspectStep(current, request.step, request.sourceOffset),
      });
    } else {
      throw new RangeError("Unknown worker request type");
    }
  } catch (error) {
    reply({
      type: "error",
      runId: typeof request?.runId === "string" ? request.runId : "",
      requestId: Number.isSafeInteger(request?.requestId)
        ? request.requestId
        : -1,
      message:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "Unable to process this run",
    });
  }
};
