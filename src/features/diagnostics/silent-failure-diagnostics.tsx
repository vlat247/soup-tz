"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RunDashboard } from "../dashboard/run-dashboard";
import { createCanvasRenderer } from "../charts/metric-chart";
import type { ChartRendererFactory } from "../charts/chart-renderer";
import { createWorkerTransport } from "../runs/hooks/use-run";
import { createFaultTransport, type TransportFault } from "./fault-transport";
import styles from "./silent-failure-diagnostics.module.css";

const faults: [TransportFault, string][] = [
  ["hold-load", "Hold next load"], ["hold-viewport", "Hold next range"],
  ["hold-inspection", "Hold next inspection"], ["fail-load", "Fail next load"],
  ["drop-load", "Drop next load"], ["malformed-viewport", "Corrupt next range"],
];

export function SilentFailureDiagnostics() {
  const [controller] = useState(() => createFaultTransport(createWorkerTransport));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [runId, setRunId] = useState("run-001");
  const failRender = useRef(false);
  const [renderArmed, setRenderArmed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const environment = useMemo(() => ({ createTransport: controller.createTransport, requestTimeoutMs: 10_000 }), [controller]);
  const createRenderer = useMemo<ChartRendererFactory>(() => (element, events) => {
    const renderer = createCanvasRenderer(element, events);
    return { ...renderer, render(model) {
      if (failRender.current) {
        failRender.current = false;
        setRenderArmed(false);
        throw new Error("Diagnostic draw failure");
      }
      renderer.render(model);
    } };
  }, []);
  return (
    <main className={styles.lab}>
      <header className={styles.controls}>
        <Link href="/runs">Back to runs</Link>
        <h1>Silent failure diagnostics</h1>
        <p>Development only. These controls wrap real worker replies and the real charts. Requests expire after 10 seconds here; the dashboard default is 30 seconds.</p>
        <nav aria-label="Diagnostic run selection">
          <button aria-pressed={runId === "run-001"} onClick={() => setRunId("run-001")}>Run A · steady</button>
          <button aria-pressed={runId === "run-002"} onClick={() => setRunId("run-002")}>Run B · fast</button>
        </nav>
        <div className={styles.buttons}>
          {faults.map(([fault, label]) => <button key={fault} onClick={() => controller.arm(fault)}>{label}</button>)}
          <button disabled={!snapshot.held.length} onClick={() => controller.release()}>Release oldest reply</button>
          <button onClick={() => { failRender.current = true; setRenderArmed(true); }}>Fail next loss draw</button>
          <button aria-pressed={hidden} onClick={() => setHidden(!hidden)}>{hidden ? "Show dashboard" : "Hide dashboard"}</button>
        </div>
        <p role="status">{snapshot.armed ? `Armed: ${snapshot.armed}.` : "No transport fault armed."} {snapshot.held.length} held replies.{renderArmed ? " Loss draw will fail once." : ""}</p>
        <details><summary>Replay instructions and event log</summary>
          <ol>
            <li>Hold next load, Reload, wait for a held reply, select Run B, then release the old reply. Only B should remain.</li>
            <li>Fail next load then Reload. Source time and last successful load must stay unchanged; retry with Try again.</li>
            <li>Hold next range; select Last 25%, then Last 10%, then release. The newest range must win.</li>
            <li>Hold next inspection; inspect 100 then 200, then release. Only 200 should commit.</li>
            <li>Drop next load then Reload. Wait 10 seconds for an error, then retry. No automatic retry occurs.</li>
            <li>Fail next loss draw then change range. Loss should show a retry action while other charts and source inspection remain available.</li>
            <li>Hide and show the dashboard to exercise zero-sized chart recovery.</li>
          </ol>
          <ol aria-label="Fault events">{snapshot.events.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}</ol>
        </details>
      </header>
      <div hidden={hidden}>
        <RunDashboard runId={runId} environment={environment} createRenderer={createRenderer} />
      </div>
    </main>
  );
}
