import type { Metric } from "./types";
import type { Reading, RunSummary } from "./view-types";

export const METRIC_LABELS: Record<Metric, string> = {
  loss: "Loss",
  lr: "Learning rate",
  grad_norm: "Gradient norm",
};
export const METRIC_COLORS: Record<Metric, string> = {
  loss: "#b6e6bd",
  lr: "#b5bdf4",
  grad_norm: "#e9c485",
};

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatValue(value: number | null, metric?: Metric): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (metric === "lr" || Math.abs(value) < 0.0001 || Math.abs(value) >= 1e7) {
    return value.toExponential(2);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
    value,
  );
}

export function formatReading(reading: Reading, metric?: Metric): string {
  const labels = {
    nan: "NaN",
    "positive-infinity": "+Infinity",
    "negative-infinity": "−Infinity",
    missing: "Missing",
    conflict: "Conflicting",
  };
  return reading.kind === "finite"
    ? formatValue(reading.value, metric)
    : labels[reading.kind];
}

export function qualityCount(summary: RunSummary): number {
  return (
    summary.rejectedRows +
    summary.duplicateRows +
    summary.gapCount +
    Number(summary.outOfOrder) +
    Object.values(summary.invalidCounts).reduce((a, b) => a + b, 0) +
    Object.values(summary.missingCounts).reduce((a, b) => a + b, 0)
  );
}

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatSnapshot(instant: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return "Unknown snapshot";
  // ICU punctuation differs between Node and browsers even for the same locale.
  // Build the fixed English UTC label explicitly so server/client hydration agrees.
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${hour}:${minute} UTC`;
}
