import { describe, expect, it, vi } from "vitest";
import { createFaultTransport } from "../../src/features/diagnostics/fault-transport";
import type { RunTransport } from "../../src/features/runs/hooks/run-session";

function setup() {
  const workers: { receive(value: unknown): void; send: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const controller = createFaultTransport(() => {
    let handlers: Parameters<RunTransport["listen"]>[0];
    const worker = { receive: (value: unknown) => handlers.message(value), send: vi.fn(), stop: vi.fn() };
    workers.push(worker);
    return { postMessage: worker.send, terminate: worker.stop, listen(next) { handlers = next; } };
  });
  const messages = vi.fn();
  const errors = vi.fn();
  const transport = controller.createTransport();
  transport.listen({ message: messages, error: errors, messageError: errors });
  return { controller, workers, transport, messages, errors };
}
const load = { type: "load", runId: "run-001", requestId: 1, width: 100 } as const;

describe("real-worker diagnostic fault transport", () => {
  it("retains an already received old callback after cancellation, without sending it to a new receiver", () => {
    const { controller, transport, workers, messages } = setup();
    controller.arm("hold-load");
    transport.postMessage(load);
    const response = { type: "loaded", requestId: 1, runId: "run-001", frame: { marker: 123 } };
    workers[0].receive(response);
    expect(messages).not.toHaveBeenCalled();
    transport.terminate();
    const other = controller.createTransport();
    const receiveOther = vi.fn();
    other.listen({ message: receiveOther, error: vi.fn(), messageError: vi.fn() });
    controller.release();
    expect(messages).toHaveBeenCalledExactlyOnceWith(response);
    expect(receiveOther).not.toHaveBeenCalled();
    expect(workers[0].stop).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().held).toEqual([]);
    expect(response.frame.marker).toBe(123);
  });

  it("arms only the matching request kind and only once", () => {
    const { controller, transport, workers, messages } = setup();
    controller.arm("hold-inspection");
    transport.postMessage(load);
    workers[0].receive({ type: "loaded", runId: load.runId, requestId: 1 });
    expect(messages).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().armed).toBe("hold-inspection");
    transport.postMessage({ type: "inspect", runId: load.runId, requestId: 2, step: 100 });
    workers[0].receive({ type: "inspection", runId: load.runId, requestId: 2 });
    expect(controller.getSnapshot().held).toHaveLength(1);
    expect(controller.getSnapshot().armed).toBeNull();
    transport.postMessage({ type: "inspect", runId: load.runId, requestId: 3, step: 200 });
    workers[0].receive({ type: "inspection", runId: load.runId, requestId: 3 });
    expect(messages).toHaveBeenLastCalledWith({ type: "inspection", runId: load.runId, requestId: 3 });
  });

  it("makes a failed or dropped load distinguishable without modifying source fixtures", async () => {
    const { controller, transport, workers, messages } = setup();
    controller.arm("fail-load");
    transport.postMessage(load);
    await Promise.resolve();
    expect(messages).toHaveBeenCalledWith({ type: "error", runId: load.runId, requestId: 1, message: "Diagnostic refresh failure." });
    controller.arm("drop-load");
    transport.postMessage({ ...load, requestId: 2 });
    await Promise.resolve();
    expect(messages).toHaveBeenCalledOnce();
    expect(workers[0].send).not.toHaveBeenCalled();
  });

  it("bounds held messages and the event log", () => {
    const { controller, transport, workers, errors } = setup();
    for (let requestId = 1; requestId <= 12; requestId++) {
      controller.arm("hold-load");
      transport.postMessage({ ...load, requestId });
      workers[0].receive({ type: "loaded", runId: load.runId, requestId });
    }
    expect(controller.getSnapshot().held).toHaveLength(8);
    expect(controller.getSnapshot().events).toHaveLength(12);
    expect(errors).toHaveBeenCalledTimes(4);
  });
});
