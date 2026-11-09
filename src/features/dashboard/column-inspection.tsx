import { CaretDown } from "@phosphor-icons/react";
import { METRICS, type Metric } from "../runs/model/types";
import { formatCount, formatExactValue, formatValue, METRIC_LABELS } from "../runs/model/format";
import type { ColumnInspection as ColumnFacts, SourceExtremum } from "../runs/model/view-types";
import styles from "./column-inspection.module.css";

export function ColumnInspection({ column, disabled, onInspect }: {
  column: ColumnFacts | null;
  disabled: boolean;
  onInspect(step: number): void;
}) {
  if (!column) return null;
  function extremum(value: SourceExtremum | null, metric: Metric, kind: string) {
    return value ? (
      <button
        type="button"
        disabled={disabled}
        title={`${formatExactValue(value.value)} · source row ${value.sourceIndex}`}
        aria-label={`Inspect ${METRIC_LABELS[metric]} ${kind} ${formatExactValue(value.value)} at step ${value.step}, source row ${value.sourceIndex}`}
        onClick={() => onInspect(value.step)}
      >
        {formatValue(value.value, metric)} <span>at {formatCount(value.step)}</span>
      </button>
    ) : "—";
  }
  return (
    <details className={styles.details}>
      <summary>Samples in this chart column <span>{formatCount(column.sourceCount)} {column.sourceCount === 1 ? "observation" : "observations"}</span><CaretDown size={11} /></summary>
      <p className={styles.scope}>
        {column.stepRange ? `Steps ${formatCount(column.stepRange[0])}–${formatCount(column.stepRange[1])}` : "No integer steps in this column"}
        {column.duplicateRows > 0 && ` · ${formatCount(column.duplicateRows)} duplicate ${column.duplicateRows === 1 ? "row" : "rows"}`}
        {column.gapCount > 0 && ` · ${formatCount(column.gapCount)} missing ${column.gapCount === 1 ? "interval" : "intervals"}`}
      </p>
      <div className={styles.table} role="region" aria-label="Chart column source statistics" tabIndex={0}>
        <table>
          <thead><tr><th>Metric</th><th>Minimum · step</th><th>Maximum · step</th><th>Finite</th><th>Invalid</th><th>Missing</th><th>Conflicting steps</th></tr></thead>
          <tbody>{METRICS.map((metric) => {
            const facts = column.metrics[metric];
            return <tr key={metric}>
              <th scope="row">{METRIC_LABELS[metric]}</th>
              <td>{extremum(facts.minimum, metric, "minimum")}</td>
              <td>{extremum(facts.maximum, metric, "maximum")}</td>
              <td>{formatCount(facts.finiteCount)}</td><td>{formatCount(facts.invalidCount)}</td>
              <td>{formatCount(facts.missingCount)}</td><td>{formatCount(facts.conflictSteps)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {METRICS.some((metric) => column.metrics[metric].conflictSteps > 0) &&
        <p className={styles.scope}>Extrema include finite conflicting readings.</p>}
    </details>
  );
}
