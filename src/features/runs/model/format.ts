import type { Metric } from "./types";
import type { Reading, RunSummary } from "./view-types";

export const METRIC_LABELS: Record<Metric, string> = {
  loss: "Loss",
  lr: "Learning rate",
  grad_norm: "Gradient norm",
};
export const METRIC_COLORS: Record<Metric, string> = {
  loss: "#FF794B",
  lr: "#82B1FF",
  grad_norm: "#83CDA8",
};

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatValue(value: number | null, metric?: Metric): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (metric === "lr" || Math.abs(value) < 0.0001 || Math.abs(value) >= 1e7) {
    const rounded = value.toExponential(2);
    // Match the axis policy: rounding MAX_VALUE to 1.80e308 must not
    // describe a finite observation using an overflowing numeric label.
    return Number.isFinite(Number(rounded)) ? rounded : value.toString();
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
    value,
  );
}

/** Exact source text, including the sign that Number.toString loses for -0. */
export function formatExactValue(value: number | null): string {
  if (value === null) return "—";
  return Object.is(value, -0) ? "-0" : value.toString();
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
