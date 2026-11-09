import { METRICS, type GeneratedRun, type RunPattern } from "./types";

const PATTERNS: readonly RunPattern[] = [
  "convergence", "fast-convergence", "slow-convergence", "plateau",
  "oscillation", "noisy-convergence", "divergence", "gradient-instability",
  "zero-values", "negative-loss", "constant",
];

function object(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be an object`);
}

function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new TypeError(`${path} must be a nonempty string`);
}

function step(value: unknown, path: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new RangeError(`${path} must be a nonnegative safe integer`);
}

function fixtureValue(value: unknown, path: string): void {
  if ((typeof value === "number" && Number.isFinite(value)) ||
    value === "NaN" || value === "Infinity" || value === "-Infinity" || value === "missing") return;
  throw new TypeError(`${path} must be a finite number or an explicit fixture tag`);
}

// Check the recipe's shape, not whether it recreates these columns. That semantic
// validation belongs to the generator; handwritten diagnostic sources are valid.
function recipe(value: unknown): void {
  object(value, "descriptor.fixture");
  for (const key of ["shuffle", "allInvalidLoss"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw new TypeError(`descriptor.fixture.${key} must be a boolean`);
  }
  for (const key of ["injections", "duplicates", "gaps"]) {
    const entries = value[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) throw new TypeError(`descriptor.fixture.${key} must be an array`);
    for (let index = 0; index < entries.length; index++) {
      const entry: unknown = entries[index];
      const path = `descriptor.fixture.${key}[${index}]`;
      object(entry, path);
      if (key === "gaps") {
        step(entry.startStep, `${path}.startStep`);
        step(entry.endStep, `${path}.endStep`);
      } else {
        step(entry.step, `${path}.step`);
        if (key === "injections") {
          if (!(METRICS as readonly unknown[]).includes(entry.metric))
            throw new TypeError(`${path}.metric must name a known metric`);
          fixtureValue(entry.value, `${path}.value`);
        } else if (entry.overrides !== undefined) {
          object(entry.overrides, `${path}.overrides`);
          for (const [metric, reading] of Object.entries(entry.overrides)) {
            if (!(METRICS as readonly string[]).includes(metric))
              throw new TypeError(`${path}.overrides must name known metrics`);
            fixtureValue(reading, `${path}.overrides.${metric}`);
          }
        }
      }
    }
  }
}

function snapshot(value: unknown): void {
  // Accept UTC ISO instants at second or millisecond precision, but reject
  // Date.parse's rollover of impossible dates and implicit local time zones.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
    throw new TypeError("descriptor.snapshotAt must be a valid ISO UTC instant ending in Z");
  const timestamp = Date.parse(value);
  const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction: string | undefined) =>
    `.${(fraction ?? "").padEnd(3, "0")}Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== canonical)
    throw new RangeError("descriptor.snapshotAt must be a real ISO UTC instant");
}

function numericColumn(value: unknown, path: string): asserts value is Float64Array {
  if (!(value instanceof Float64Array)) throw new TypeError(`${path} must be a Float64Array`);
  try {
    Float64Array.prototype.subarray.call(value, 0, 0);
  } catch {
    throw new TypeError(`${path} must not use a detached buffer`);
  }
}

function missingColumn(value: unknown, path: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${path} must be a Uint8Array`);
  try {
    Uint8Array.prototype.subarray.call(value, 0, 0);
  } catch {
    throw new TypeError(`${path} must not use a detached buffer`);
  }
}

/** Validate structure without coercion, copying or rejecting numeric telemetry anomalies. */
export function validateSource(source: unknown): asserts source is GeneratedRun {
  object(source, "Source");
  const { columns, descriptor } = source;
  object(descriptor, "descriptor");
  object(columns, "columns");
  for (const key of ["id", "name", "sourceVersion", "generatorVersion", "scenario"])
    text(descriptor[key], `descriptor.${key}`);
  if (!["running", "completed", "failed"].includes(descriptor.status as string))
    throw new TypeError("descriptor.status must be running, completed or failed");
  if (descriptor.synthetic !== true) throw new TypeError("descriptor.synthetic must be true");
  if (!Number.isInteger(descriptor.seed) || (descriptor.seed as number) < 0 || (descriptor.seed as number) > 0xffff_ffff)
    throw new RangeError("descriptor.seed must be an unsigned 32-bit integer");
  if (!(PATTERNS as readonly unknown[]).includes(descriptor.pattern))
    throw new TypeError("descriptor.pattern must name a known run pattern");
  snapshot(descriptor.snapshotAt);
  recipe(descriptor.fixture);
  numericColumn(columns.step, "columns.step");
  const length = columns.step.length;
  if (length > 0xffff_ffff) throw new RangeError("Source exceeds 32-bit provenance capacity");
  if (!Number.isSafeInteger(descriptor.rowCount) || descriptor.rowCount !== length)
    throw new RangeError("Declared source row count must match the source columns");
  if (!Number.isSafeInteger(descriptor.expectedStepInterval) || (descriptor.expectedStepInterval as number) <= 0)
    throw new RangeError("Expected step interval must be a positive safe integer");
  object(columns.missing, "columns.missing");
  for (const metric of METRICS) {
    const readings = columns[metric];
    const mask = columns.missing[metric];
    numericColumn(readings, `columns.${metric}`);
    missingColumn(mask, `columns.missing.${metric}`);
    if (readings.length !== length || mask.length !== length)
      throw new RangeError("Source columns must have equal lengths");
    for (let index = 0; index < length; index++) {
      if (mask[index] !== 0 && mask[index] !== 1)
        throw new RangeError(`columns.missing.${metric}[${index}] must be 0 or 1`);
    }
  }
}
