import type { Metric } from "./types";

export type ReadingKind = "finite" | "nan" | "positive-infinity" | "negative-infinity" | "missing" | "conflict";
export interface Reading {
  kind: ReadingKind;
  value: number | null;
}

export interface RunSummary {
  rowCount: number;
  uniqueSteps: number;
  firstStep: number;
  lastStep: number;
  duplicateRows: number;
  rejectedRows: number;
  gapCount: number;
  missingSteps: number;
  outOfOrder: boolean;
  invalidCounts: Record<Metric, number>;
  missingCounts: Record<Metric, number>;
  conflictSteps: Record<Metric, number>;
  latest: Record<Metric, Reading>;
  lastFinite: Record<Metric, { step: number; value: number } | null>;
  extents: Record<Metric, [number, number] | null>;
}

export interface Viewport { start: number; end: number; width: number }
export interface MetricFrame {
  points: [number, number | null][];
  conflicts: [number, number][];
  domain: [number, number] | null;
  finiteCount: number;
  invalidCount: number;
  missingCount: number;
  conflictCount: number;
  mode: "line" | "ranges";
  peak: { step: number; value: number } | null;
}

export interface RunFrame {
  runId: string;
  sourceVersion: string;
  viewport: Viewport;
  metrics: Record<Metric, MetricFrame>;
  sourceCount: number;
  plottedCount: number;
}

export interface StepInspection {
  requestedStep: number;
  step: number;
  previousStep: number | null;
  nextStep: number | null;
  inGap: boolean;
  readings: Record<Metric, Reading>;
  sourceRows: { sourceIndex: number; readings: Record<Metric, Reading> }[];
  sourceCount: number;
}

export interface CatalogEntry { id: string; summary: RunSummary }

export type RunWorkerRequest =
  | { type: "load"; runId: string; requestId: number; width: number }
  | { type: "viewport"; runId: string; requestId: number; viewport: Viewport }
  | { type: "inspect"; runId: string; requestId: number; step: number };

export type RunWorkerResponse =
  | { type: "loaded"; runId: string; requestId: number; summary: RunSummary; frame: RunFrame }
  | { type: "frame"; runId: string; requestId: number; frame: RunFrame }
  | { type: "inspection"; runId: string; requestId: number; inspection: StepInspection }
  | { type: "error"; runId: string; requestId: number; message: string };
