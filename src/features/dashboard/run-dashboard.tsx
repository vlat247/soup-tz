"use client";

import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  Clock,
  DownloadSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  ArrowsHorizontal,
  Plus,
  Minus,
  WarningCircle,
  ShieldCheck,
  ChartLine,
  Info,
  Crosshair,
} from "@phosphor-icons/react";
import { MetricChart } from "../charts/metric-chart";
import { ColumnInspection } from "./column-inspection";
import { useRun, type RunEnvironment } from "../runs/hooks/use-run";
import type { ChartRendererFactory } from "../charts/chart-renderer";
import { getRunDescriptor } from "../runs/data/manifest";
import { METRICS, type Metric } from "../runs/model/types";
import type { RunSummary, Viewport } from "../runs/model/view-types";
import {
  formatCount,
  formatExactValue,
  formatReading,
  formatSnapshot,
  formatValue,
  METRIC_COLORS,
  METRIC_LABELS,
  qualityCount,
} from "../runs/model/format";
import { serializeSummaryExport } from "../runs/model/export-summary";
import styles from "./run-dashboard.module.css";

function RangePicker({
  viewport,
  summary,
  onChange,
}: {
  viewport: Viewport;
  summary: RunSummary;
  onChange: (start: number, end: number) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const rangeTrigger = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = Number(form.get("start"));
    const end = Number(form.get("end"));
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < summary.firstStep ||
      end > summary.lastStep ||
      start > end
    ) {
      setError(
        `Use steps ${summary.firstStep}–${summary.lastStep}, with start ≤ end.`,
      );
      return;
    }
    onChange(start, end);
    setError("");
    details.current?.removeAttribute("open");
    rangeTrigger.current?.focus();
  }
  return (
    <details ref={details} className={styles.rangePicker}>
      <summary ref={rangeTrigger}>
        <ArrowsHorizontal size={14} />
        {formatCount(viewport.start)}
        <span>—</span>
        {formatCount(viewport.end)}
        <CaretDown size={11} />
      </summary>
      <form key={`${viewport.start}-${viewport.end}`} onSubmit={submit}>
        <strong>Visible step range</strong>
        <div>
          <label>
            Start step
            <input
              name="start"
              type="number"
              min={summary.firstStep}
              max={summary.lastStep}
              defaultValue={viewport.start}
              required
            />
          </label>
          <label>
            End step
            <input
              name="end"
              type="number"
              min={summary.firstStep}
              max={summary.lastStep}
              defaultValue={viewport.end}
              required
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Apply range</button>
      </form>
    </details>
  );
}

function QualityView({
  summary,
  scenario,
}: {
  summary: RunSummary;
  scenario: string;
}) {
  const hasIssues = qualityCount(summary) > 0;
  return (
    <div className={styles.qualityView}>
      <div className={styles.qualityIntro}>
        {hasIssues ? (
          <WarningCircle size={27} weight="light" />
        ) : (
          <ShieldCheck size={27} weight="light" />
        )}
        <div>
          <h2>{hasIssues ? "Data quality" : "No data issues found"}</h2>
          <p>{scenario}</p>
        </div>
      </div>
      <div
        className={styles.qualityTableWrapper}
        role="region"
        aria-label="Metric quality"
        tabIndex={0}
      >
        <table className={styles.qualityTable}>
          <caption>Metric quality across the complete run</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Invalid readings</th>
              <th scope="col">Missing readings</th>
              <th scope="col">Conflicting steps</th>
              <th scope="col">Latest reading</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <tr key={metric}>
                <th scope="row">{METRIC_LABELS[metric]}</th>
                <td>{formatCount(summary.invalidCounts[metric])}</td>
                <td>{formatCount(summary.missingCounts[metric])}</td>
                <td>{formatCount(summary.conflictSteps[metric])}</td>
                <td
                  className={
                    summary.latest[metric].kind !== "finite"
                      ? styles.warningText
                      : ""
                  }
                >
                  {formatReading(summary.latest[metric], metric)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className={styles.qualityFacts}>
        <div>
          <dt>Source observations</dt>
          <dd>{formatCount(summary.rowCount)}</dd>
        </div>
        <div>
          <dt>Unique steps</dt>
          <dd>{formatCount(summary.uniqueSteps)}</dd>
        </div>
        <div>
          <dt>Extra duplicate rows</dt>
          <dd>{formatCount(summary.duplicateRows)}</dd>
        </div>
        <div>
          <dt>Missing expected steps</dt>
          <dd>
            {formatCount(summary.missingSteps)}{" "}
            <span>in {summary.gapCount} intervals</span>
          </dd>
        </div>
        <div>
          <dt>Source order</dt>
          <dd>
            {summary.outOfOrder
              ? "Unsorted · normalized for display"
              : "Chronological"}
          </dd>
        </div>
        <div>
          <dt>Rejected step rows</dt>
          <dd>{summary.rejectedRows}</dd>
        </div>
      </dl>
      <div className={styles.explanation}>
        <Info size={17} />
        <p>
          Invalid readings and missing intervals break the line. Conflicting
          duplicates keep their finite extremes, with every original reading
          available in the observation inspector. Quality counts can overlap.
        </p>
      </div>
    </div>
  );
}

export function RunDashboard({ runId, environment, createRenderer }: {
  runId: string;
  environment?: RunEnvironment;
  createRenderer?: ChartRendererFactory;
}) {
  const descriptor = getRunDescriptor(runId);
  const plotWidths = useRef<Partial<Record<Metric, number>>>({});
  const [width, setWidth] = useState(420);
  const [tab, setTab] = useState<"metrics" | "quality">("metrics");
  const [stepDraft, setStepDraft] = useState("");
  const [announcedStep, setAnnouncedStep] = useState<number | null>(null);
  const metricsTab = useRef<HTMLButtonElement>(null);
  const qualityTab = useRef<HTMLButtonElement>(null);
  const [inputError, setInputError] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const {
    status,
    summary,
    frame,
    inspection,
    updating,
    loadedAt,
    isPreviousSnapshot,
    error,
    setViewport,
    inspect,
    refresh,
  } = useRun(runId, width, environment);

  const measurePlot = useCallback((metric: Metric, drawableWidth: number) => {
    plotWidths.current[metric] = drawableWidth;
    const measured = Object.values(plotWidths.current);
    if (measured.length === METRICS.length) {
      // All charts share a conservative budget based on the narrowest actual
      // plot, including responsive layout and precision-dependent axis padding.
      setWidth(Math.max(1, Math.floor(Math.min(...measured))));
    }
  }, []);

  function selectTab(next: "metrics" | "quality", focus = false) {
    setTab(next);
    if (focus) (next === "metrics" ? metricsTab : qualityTab).current?.focus();
  }

  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    selectTab(
      event.key === "Home"
        ? "metrics"
        : event.key === "End"
          ? "quality"
          : tab === "metrics"
            ? "quality"
            : "metrics",
      true,
    );
  }

  function inspectExplicitly(step: number, sourceOffset = 0) {
    if (updating) return;
    setAnnouncedStep(step);
    inspect(step, sourceOffset);
  }

  function exportSummary() {
    if (!summary) return;
    setExportError(null);
    let url: string | null = null;
    try {
      const data = serializeSummaryExport(descriptor, summary, loadedAt);
      url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${runId}-summary.json`;
      link.click();
    } catch {
      setExportError("The summary could not be exported. Try Export summary again.");
    } finally {
      if (url) { const createdUrl = url; setTimeout(() => URL.revokeObjectURL(createdUrl), 1000); }
    }
  }

  function zoom(factor: number) {
    if (!frame || !summary) return;
    const span = Math.min(
      summary.lastStep - summary.firstStep,
      Math.max(
        1,
        Math.round((frame.viewport.end - frame.viewport.start) * factor),
      ),
    );
    const center = (frame.viewport.start + frame.viewport.end) / 2;
    const start = Math.max(
      summary.firstStep,
      Math.min(summary.lastStep - span, Math.round(center - span / 2)),
    );
    setViewport(start, start + span);
  }

  function inspectEnteredStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const step = Number(stepDraft);
    if (
      !summary ||
      !stepDraft.trim() ||
      !Number.isSafeInteger(step) ||
      step < summary.firstStep ||
      step > summary.lastStep
    ) {
      setInputError(
        `Enter a step from ${summary?.firstStep ?? 0} to ${summary?.lastStep ?? 0}.`,
      );
      return;
    }
    setInputError("");
    inspectExplicitly(step);
  }

  const hasQualityIssues = summary ? qualityCount(summary) > 0 : false;
  const invalidTotal = summary
    ? Object.values(summary.invalidCounts).reduce((a, b) => a + b, 0)
    : 0;
  const StatusIcon =
    descriptor.status === "completed"
      ? CheckCircle
      : descriptor.status === "running"
        ? CircleNotch
        : WarningCircle;
  const isFullRange =
    frame &&
    summary &&
    frame.viewport.start === summary.firstStep &&
    frame.viewport.end === summary.lastStep;

  return (
    <div className={styles.dashboard}>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.runIdentifier}>
            <span>{runId}</span>
            <span className={`${styles.status} ${styles[descriptor.status]}`}>
              <StatusIcon size={12} />
              {descriptor.status}
            </span>
          </div>
          <h1>{descriptor.name}</h1>
          <div className={styles.subtitle}>
            <details className={styles.snapshotDetails}>
              <summary>
                <Clock size={13} />
                <span>Snapshot {formatSnapshot(descriptor.snapshotAt)}</span>
                <CaretDown size={11} />
              </summary>
              <dl>
                <div>
                  <dt>Dataset version</dt>
                  <dd>{descriptor.sourceVersion}</dd>
                </div>
                <div>
                  <dt>Source snapshot</dt>
                  <dd>
                    <time dateTime={descriptor.snapshotAt}>
                      {descriptor.snapshotAt
                        .replace("T", " ")
                        .replace(/\.\d{3}Z$/, " UTC")}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Last successful load</dt>
                  <dd>
                    {loadedAt ? (
                      <time dateTime={loadedAt}>
                        {loadedAt
                          .replace("T", " ")
                          .replace(/\.\d{3}Z$/, " UTC")}
                      </time>
                    ) : (
                      "Not loaded yet"
                    )}
                  </dd>
                </div>
              </dl>
            </details>
            <span className={styles.subtitleSeparator}>/</span>
            <span>{formatCount(descriptor.rowCount)} observations</span>
          </div>
        </div>
        <div className={styles.headingActions}>
          <button
            title="Reload the same source snapshot"
            onClick={refresh}
            disabled={status === "loading" || updating}
          >
            <ArrowClockwise size={15} />
            <span>Reload</span>
          </button>
          <button
            aria-label="Export summary"
            onClick={exportSummary}
            disabled={!summary}
            className={styles.exportButton}
          >
            <DownloadSimple size={15} />
            <span>Export summary</span>
          </button>
        </div>
      </div>

      <section
        className={styles.summaryStrip}
        aria-label="Whole-run latest readings"
      >
        <div className={styles.summaryMetric}>
          <div className={styles.summaryLabel}>Latest step</div>
          <strong>{summary ? formatCount(summary.lastStep) : "—"}</strong>
        </div>
        {METRICS.map((metric) => (
          <div key={metric} className={styles.summaryMetric}>
            <div className={styles.summaryLabel}>
              Latest {METRIC_LABELS[metric].toLowerCase()}
            </div>
            <strong
              className={
                summary && summary.latest[metric].kind !== "finite"
                  ? styles.warningText
                  : ""
              }
            >
              {summary ? formatReading(summary.latest[metric], metric) : "—"}
            </strong>
            <span>
              {summary
                ? summary.latest[metric].kind === "finite"
                  ? ""
                  : summary.lastFinite[metric]
                    ? `Last valid ${formatValue(summary.lastFinite[metric]!.value, metric)} at ${formatCount(summary.lastFinite[metric]!.step)}`
                    : "No finite observations"
                : ""}
            </span>
          </div>
        ))}
      </section>

      <div className={styles.tabsBar}>
        <div className={styles.tabs} role="tablist" aria-label="Run view">
          <button
            ref={metricsTab}
            tabIndex={tab === "metrics" ? 0 : -1}
            onKeyDown={tabKeyDown}
            id="metrics-tab"
            role="tab"
            aria-selected={tab === "metrics"}
            aria-controls="metrics-panel"
            onClick={() => setTab("metrics")}
          >
            <ChartLine size={15} />
            Metrics
          </button>
          <button
            ref={qualityTab}
            tabIndex={tab === "quality" ? 0 : -1}
            onKeyDown={tabKeyDown}
            id="quality-tab"
            role="tab"
            aria-selected={tab === "quality"}
            aria-controls="quality-panel"
            onClick={() => setTab("quality")}
          >
            <ShieldCheck size={15} />
            Data quality
            {hasQualityIssues && (
              <span className={styles.qualityTabCount}>
                {formatCount(qualityCount(summary!))}
              </span>
            )}
          </button>
        </div>
        {updating && (
          <div className={styles.trustLabel}>
            <CircleNotch size={13} />
            {isPreviousSnapshot
              ? "Reloading · previous snapshot"
              : "Updating chart"}
          </div>
        )}
      </div>

      {exportError && <p className={styles.errorNotice} role="alert">{exportError}</p>}
      {error && (
        <div className={styles.errorNotice} role="alert">
          <WarningCircle size={19} />
          <div>
            <strong>Unable to update this run</strong>
            <p>
              {error}
              {frame ? " The previous snapshot is still shown." : ""}
            </p>
          </div>
          <button onClick={refresh}>Try again</button>
        </div>
      )}

      <div>
        {status === "loading" && (
          <div className={styles.loadingState} role="status">
            <CircleNotch size={26} weight="light" />
            <strong>
              Preparing {formatCount(descriptor.rowCount)} observations
            </strong>
          </div>
        )}
        {frame && summary && tab === "metrics" && (
          <div id="metrics-panel" role="tabpanel" aria-labelledby="metrics-tab">
            <div className={styles.chartToolbar}>
              <div className={styles.rangePresets}>
                <button
                  className={isFullRange ? styles.presetActive : ""}
                  onClick={() =>
                    setViewport(summary.firstStep, summary.lastStep)
                  }
                >
                  All steps
                </button>
                <button
                  onClick={() =>
                    setViewport(
                      Math.round(
                        summary.lastStep -
                          (summary.lastStep - summary.firstStep) * 0.25,
                      ),
                      summary.lastStep,
                    )
                  }
                >
                  Last 25%
                </button>
                <button
                  onClick={() =>
                    setViewport(
                      Math.round(
                        summary.lastStep -
                          (summary.lastStep - summary.firstStep) * 0.1,
                      ),
                      summary.lastStep,
                    )
                  }
                >
                  Last 10%
                </button>
              </div>
              <div className={styles.zoomControls}>
                <RangePicker
                  viewport={frame.viewport}
                  summary={summary}
                  onChange={setViewport}
                />
                <button
                  aria-label="Zoom out"
                  title="Zoom out"
                  disabled={!!isFullRange || updating}
                  onClick={() => zoom(2)}
                >
                  <Minus size={14} />
                </button>
                <button
                  aria-label="Zoom in"
                  title="Zoom in"
                  disabled={
                    frame.viewport.end - frame.viewport.start <= 1 || updating
                  }
                  onClick={() => zoom(0.5)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {hasQualityIssues && (
              <div className={styles.qualityNotice}>
                <WarningCircle size={16} />
                <span>
                  {invalidTotal > 0
                    ? `${formatCount(invalidTotal)} invalid ${invalidTotal === 1 ? "reading" : "readings"}`
                    : "Data quality issues"}
                  {summary.duplicateRows
                    ? ` · ${summary.duplicateRows} duplicate rows`
                    : ""}
                  {summary.gapCount ? ` · ${summary.gapCount} gaps` : ""}
                  <span> — across the whole run</span>
                </span>
                <button onClick={() => selectTab("quality", true)}>
                  Review <CaretRight size={12} />
                </button>
              </div>
            )}

            <section
              className={`${styles.chartPanel} ${styles.primaryChart}`}
              aria-labelledby="loss-title"
            >
              <div className={styles.chartHeading}>
                <div>
                  <h2 id="loss-title">
                    <span style={{ background: METRIC_COLORS.loss }} />
                    Loss
                  </h2>
                </div>
                <div className={styles.chartRange}>
                  <span>Visible max</span>
                  <strong>
                    {formatValue(frame.metrics.loss.domain?.[1] ?? null)}
                  </strong>
                </div>
              </div>
              <MetricChart
                metric="loss"
                createRenderer={createRenderer}
                data={frame.metrics.loss}
                viewport={frame.viewport}
                color={METRIC_COLORS.loss}
                onInspect={inspect}
                onZoom={setViewport}
                onPlotWidth={measurePlot}
                selectedStep={inspection?.step}
                height={255}
              />
              <div className={styles.chartFooter}>
                <span>Training step</span>
              </div>
            </section>

            <div className={styles.secondaryCharts}>
              {(["lr", "grad_norm"] as Metric[]).map((metric) => (
                <section
                  key={metric}
                  className={styles.chartPanel}
                  aria-labelledby={`${metric}-title`}
                >
                  <div className={styles.chartHeading}>
                    <div>
                      <h2 id={`${metric}-title`}>
                        <span style={{ background: METRIC_COLORS[metric] }} />
                        {METRIC_LABELS[metric]}
                      </h2>
                    </div>
                    <div className={styles.chartRange}>
                      <span>Visible max</span>
                      <strong>
                        {formatValue(
                          frame.metrics[metric].domain?.[1] ?? null,
                          metric,
                        )}
                      </strong>
                    </div>
                  </div>
                  <MetricChart
                    metric={metric}
                    data={frame.metrics[metric]}
                    viewport={frame.viewport}
                    color={METRIC_COLORS[metric]}
                    onInspect={inspect}
                    onZoom={setViewport}
                    onPlotWidth={measurePlot}
                    selectedStep={inspection?.step}
                    height={188}
                  />
                  <div className={styles.chartFooter}>
                    <span>Training step</span>
                  </div>
                </section>
              ))}
            </div>

            <section
              className={styles.inspector}
              aria-label="Original observation inspector"
            >
              <div className={styles.inspectorHeading}>
                <div>
                  <Crosshair size={16} />
                  <h2>Observation inspector</h2>
                </div>
                <form onSubmit={inspectEnteredStep}>
                  <label htmlFor="inspect-step">Step</label>
                  <input
                    id="inspect-step"
                    type="number"
                    min={summary.firstStep}
                    max={summary.lastStep}
                    placeholder={String(inspection?.step ?? summary.lastStep)}
                    value={stepDraft}
                    onChange={(event) => setStepDraft(event.target.value)}
                  />
                  <button type="submit" disabled={updating}>
                    Inspect
                  </button>
                </form>
              </div>
              <span className={styles.srOnly} role="status" aria-live="polite">
                {inspection && inspection.requestedStep === announcedStep
                  ? `Step ${inspection.step}. ${METRICS.map((metric) => `${METRIC_LABELS[metric]} ${formatReading(inspection.readings[metric], metric)}`).join(". ")}${inspection.inGap ? ". Requested step is in a missing interval; showing the nearest recorded step." : ""}`
                  : ""}
              </span>
              {inputError && (
                <p className={styles.inputError} role="alert">
                  {inputError}
                </p>
              )}
              {inspection ? (
                <>
                  <div
                    className={styles.inspectorValues}
                    role="group"
                    tabIndex={0}
                    aria-label="Selected observation; use left and right arrow keys to move between recorded steps"
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowLeft" &&
                        inspection.previousStep !== null
                      ) {
                        event.preventDefault();
                        inspectExplicitly(inspection.previousStep);
                      }
                      if (
                        event.key === "ArrowRight" &&
                        inspection.nextStep !== null
                      ) {
                        event.preventDefault();
                        inspectExplicitly(inspection.nextStep);
                      }
                      if (event.key === "Home") {
                        event.preventDefault();
                        inspectExplicitly(summary.firstStep);
                      }
                      if (event.key === "End") {
                        event.preventDefault();
                        inspectExplicitly(summary.lastStep);
                      }
                    }}
                  >
                    <div className={styles.inspectedStep}>
                      <span>Step</span>
                      <div>
                        <strong>{formatCount(inspection.step)}</strong>
                        <button
                          aria-label="Previous observation"
                          disabled={
                            updating || inspection.previousStep === null
                          }
                          onClick={() =>
                            inspection.previousStep !== null &&
                            inspectExplicitly(inspection.previousStep)
                          }
                        >
                          <CaretLeft size={13} />
                        </button>
                        <button
                          aria-label="Next observation"
                          disabled={updating || inspection.nextStep === null}
                          onClick={() =>
                            inspection.nextStep !== null &&
                            inspectExplicitly(inspection.nextStep)
                          }
                        >
                          <CaretRight size={13} />
                        </button>
                      </div>
                    </div>
                    {METRICS.map((metric) => (
                      <div key={metric}>
                        <span>{METRIC_LABELS[metric]}</span>
                        <strong
                          title={formatExactValue(inspection.readings[metric].value)}
                          className={
                            inspection.readings[metric].kind !== "finite"
                              ? styles.warningText
                              : ""
                          }
                        >
                          {formatReading(inspection.readings[metric], metric)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  {inspection.inGap && (
                    <p className={styles.gapNotice}>
                      The requested step is in a missing interval. Showing the
                      nearest recorded step, {formatCount(inspection.step)}.
                    </p>
                  )}
                  <details className={styles.rawReadings}>
                    <summary>
                      Exact source readings{" "}
                      <span>
                        {inspection.sourceCount}{" "}
                        {inspection.sourceCount === 1 ? "row" : "rows"}
                      </span>
                      <CaretDown size={11} />
                    </summary>
                    <div
                      className={styles.rawTableWrapper}
                      role="region"
                      aria-label="Exact source readings"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Source row</th>
                            <th>Loss</th>
                            <th>Learning rate</th>
                            <th>Gradient norm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspection.sourceRows.map((row) => (
                            <tr key={row.sourceIndex}>
                              <td>{row.sourceIndex}</td>
                              {METRICS.map((metric) => (
                                <td key={metric}>
                                  {row.readings[metric].kind === "finite"
                                    ? formatExactValue(row.readings[metric].value)
                                    : formatReading(
                                        row.readings[metric],
                                        metric,
                                      )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {inspection.sourceCount > 20 && (
                      <div className={styles.sourcePagination}>
                        <span aria-live="polite">
                          Rows {inspection.sourceOffset + 1}–
                          {inspection.sourceOffset +
                            inspection.sourceRows.length}{" "}
                          of {formatCount(inspection.sourceCount)}
                        </span>
                        <button
                          disabled={updating || inspection.sourceOffset === 0}
                          onClick={() =>
                            inspectExplicitly(
                              inspection.step,
                              inspection.sourceOffset - 20,
                            )
                          }
                        >
                          Previous rows
                        </button>
                        <button
                          disabled={
                            updating ||
                            inspection.sourceOffset +
                              inspection.sourceRows.length >=
                              inspection.sourceCount
                          }
                          onClick={() =>
                            inspectExplicitly(
                              inspection.step,
                              inspection.sourceOffset + 20,
                            )
                          }
                        >
                          Next rows
                        </button>
                      </div>
                    )}
                  </details>
                  {inspection.column !== undefined && (
                    <ColumnInspection column={inspection.column} disabled={updating} onInspect={inspectExplicitly} />
                  )}
                </>
              ) : (
                <p className={styles.inspectHint}>
                  Hover over a chart or enter a step to inspect its original
                  readings.
                </p>
              )}
            </section>
          </div>
        )}
        {summary && tab === "quality" && (
          <div id="quality-panel" role="tabpanel" aria-labelledby="quality-tab">
            <QualityView summary={summary} scenario={descriptor.scenario} />
          </div>
        )}
      </div>
      {frame && tab === "metrics" && (
        <footer className={styles.pageFooter}>
          <span>
            {updating
              ? "Updating view…"
              : `${formatCount(frame.sourceCount)} observations in view`}
          </span>
          <details className={styles.sourceNote}>
            <summary>How points are shown</summary>
            <p>
              Charts use linear scales without smoothing. Dense charts show
              selected source points, preserving first, last, minimum and
              maximum readings per column. Smaller details may be omitted; gaps
              remain open. Use the inspector for exact readings.
            </p>
          </details>
        </footer>
      )}
      <span className={styles.srOnly} role="status">
        {status === "ready"
          ? `${descriptor.name} loaded. ${summary?.rowCount} source observations.`
          : status === "loading"
            ? "Loading training run."
            : "Run processing error."}
      </span>
    </div>
  );
}
