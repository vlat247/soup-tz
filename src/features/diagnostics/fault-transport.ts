import type { RunTransport } from "../runs/hooks/run-session";
import type { RunWorkerRequest } from "../runs/model/view-types";

export type TransportFault = "hold-load" | "hold-viewport" | "hold-inspection" | "fail-load" | "drop-load" | "malformed-viewport";
interface Snapshot { armed: TransportFault | null; held: string[]; events: string[] }
type Handlers = Parameters<RunTransport["listen"]>[0];

/** Development diagnostics only. Faults wrap actual worker messages, never fixture values. */
export function createFaultTransport(createWorker: () => RunTransport) {
  let snapshot: Snapshot = { armed: null, held: [], events: [] };
  const listeners = new Set<() => void>();
  const held: { label: string; deliver(): void }[] = [];
  function publish(event: string, armed = snapshot.armed) {
    snapshot = { armed, held: held.map((entry) => entry.label), events: [...snapshot.events.slice(-11), event] };
    listeners.forEach((listener) => listener());
  }
  const matches = (fault: TransportFault, request: RunWorkerRequest) =>
    fault.endsWith("load") ? request.type === "load" :
      fault.endsWith("viewport") ? request.type === "viewport" : request.type === "inspect";
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    arm(fault: TransportFault) { publish(`Armed ${fault}`, fault); },
    release() {
      const next = held.shift();
      if (!next) return;
      publish(`Released ${next.label}`);
      // Deliberately retain the original receiver after termination: models a
      // message already queued when a run was canceled. Session identity must reject it.
      next.deliver();
    },
    createTransport(): RunTransport {
      const worker = createWorker();
      const faults = new Map<number, TransportFault>();
      let handlers: Handlers;
      return {
        listen(next) {
          handlers = next;
          worker.listen({ ...next, message(response) {
            const envelope = response as { requestId?: number; type?: string; runId?: string } | null;
            const id = envelope?.requestId;
            const fault = typeof id === "number" ? faults.get(id) : undefined;
            if (typeof id === "number") faults.delete(id);
            const label = `${envelope?.runId} ${envelope?.type} #${id}`;
            if (fault?.startsWith("hold-")) {
              if (held.length >= 8) { next.error(); publish("Held reply limit reached"); return; }
              held.push({ label, deliver: () => next.message(response) });
              publish(`Held ${label}`);
            } else if (fault === "malformed-viewport") {
              publish(`Corrupted ${label}`);
              next.message({ ...envelope, type: "unexpected" });
            } else next.message(response);
          } });
        },
        postMessage(request) {
          const fault = snapshot.armed;
          if (fault && matches(fault, request)) {
            publish(`Applied ${fault} to ${request.runId} ${request.type} #${request.requestId}`, null);
            if (fault === "fail-load") {
              queueMicrotask(() => handlers.message({ type: "error", runId: request.runId, requestId: request.requestId, message: "Diagnostic refresh failure." }));
              return;
            }
            if (fault === "drop-load") return;
            faults.set(request.requestId, fault);
          }
          worker.postMessage(request);
        },
        terminate() { faults.clear(); worker.terminate(); },
      };
    },
  };
}
