"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { MetricChart } from "../charts/metric-chart";
import { inspectStep } from "../runs/model/inspect";
import { prepareRun } from "../runs/model/prepare";
import { buildFrame } from "../runs/model/reduce";
import { METRICS, type Metric } from "../runs/model/types";
import {
  formatReading,
  METRIC_COLORS,
  METRIC_LABELS,
} from "../runs/model/format";
import { CHART_DIAGNOSTICS, makeDiagnosticSource } from "./fixtures";
import styles from "./chart-diagnostics.module.css";

export function ChartDiagnostics() {
  const [id, setId] = useState<string>("singleton");
  const [width, setWidth] = useState(300);
  const widths = useRef<Partial<Record<Metric, number>>>({});
  const [request, setRequest] = useState<{
    step: number;
    offset: number;
  } | null>(null);
  const fixture = CHART_DIAGNOSTICS.find((entry) => entry.id === id)!;
  const prepared = useMemo(() => prepareRun(makeDiagnosticSource(id)), [id]);
  const frame = useMemo(
    () =>
      buildFrame(prepared, {
        start: prepared.summary.firstStep,
        end: prepared.summary.lastStep,
        width,
      }),
    [prepared, width],
  );
  const inspection = useMemo(
    () =>
      prepared.summary.uniqueSteps
        ? inspectStep(
            prepared,
            request?.step ?? prepared.summary.firstStep,
            request?.offset ?? 0,
          )
        : null,
    [prepared, request],
  );
  const measure = useCallback((metric: Metric, next: number) => {
    widths.current[metric] = next;
    if (Object.keys(widths.current).length === METRICS.length)
      setWidth(
        Math.max(1, Math.floor(Math.min(...Object.values(widths.current)))),
      );
  }, []);
  const inspect = useCallback(
    (step: number) => setRequest({ step, offset: 0 }),
    [],
  );

  return (
    <main className={styles.lab}>
      <Link href="/runs">← Training runs</Link>
      <h1>Chart diagnostics</h1>
      <p>
        Local development checks using the same renderer and data pipeline as
        the dashboard.
      </p>
      <label>
        Scenario{" "}
        <select
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setRequest(null);
          }}
        >
          {CHART_DIAGNOSTICS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <p role="status">{fixture.expect}</p>
      <div className={styles.charts}>
        {METRICS.map((metric) => (
          <section
            key={metric}
            aria-label={`${METRIC_LABELS[metric]} diagnostic`}
          >
            <h2>{METRIC_LABELS[metric]}</h2>
            <MetricChart
              metric={metric}
              data={frame.metrics[metric]}
              viewport={frame.viewport}
              color={METRIC_COLORS[metric]}
              selectedStep={inspection?.step}
              onInspect={inspect}
              onPlotWidth={measure}
              height={260}
            />
            <p>
              {frame.metrics[metric].finiteCount} finite ·{" "}
              {frame.metrics[metric].invalidCount} invalid ·{" "}
              {frame.metrics[metric].conflictCount} conflicting steps ·{" "}
              {frame.metrics[metric].mode}
            </p>
          </section>
        ))}
      </div>
      {inspection && (
        <section aria-label="Diagnostic source inspection">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const step = Number(
                new FormData(event.currentTarget).get("step"),
              );
              if (Number.isFinite(step)) inspect(step);
            }}
          >
            <label>
              Step{" "}
              <input
                key={id}
                name="step"
                type="number"
                required
                defaultValue={prepared.summary.firstStep}
                min={prepared.summary.firstStep}
                max={prepared.summary.lastStep}
              />
            </label>
            <button>Inspect</button>
          </form>
          <p>
            Selected step {inspection.step}
            {inspection.inGap
              ? " · Missing interval; nearest observed step"
              : ""}
          </p>
          <div
            role="region"
            aria-label="Diagnostic source rows"
            tabIndex={0}
            className={styles.table}
          >
            <table>
              <thead>
                <tr>
                  <th>Source row</th>
                  {METRICS.map((metric) => (
                    <th key={metric}>{METRIC_LABELS[metric]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspection.sourceRows.map((row) => (
                  <tr key={row.sourceIndex}>
                    <td>{row.sourceIndex}</td>
                    {METRICS.map((metric) => (
                      <td key={metric}>
                        {row.readings[metric].kind === "finite"
                          ? row.readings[metric].value?.toString()
                          : formatReading(row.readings[metric], metric)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.pager}>
            <span role="status">
              Rows {inspection.sourceOffset + 1}–
              {inspection.sourceOffset + inspection.sourceRows.length} of{" "}
              {inspection.sourceCount}
            </span>
            <button
              disabled={inspection.sourceOffset === 0}
              onClick={() =>
                setRequest({
                  step: inspection.step,
                  offset: inspection.sourceOffset - 20,
                })
              }
            >
              Previous rows
            </button>
            <button
              disabled={
                inspection.sourceOffset + inspection.sourceRows.length >=
                inspection.sourceCount
              }
              onClick={() =>
                setRequest({
                  step: inspection.step,
                  offset: inspection.sourceOffset + 20,
                })
              }
            >
              Next rows
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
