import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildMetricChartModel } from "../src/features/charts/chart-model";
import { formatCount, formatExactValue, formatReading, formatSnapshot, formatValue } from "../src/features/runs/model/format";
import type { MetricFrame } from "../src/features/runs/model/view-types";

const locales = ["en-US", "de-DE", "fr-FR"] as const;
const zones = ["UTC", "Asia/Almaty", "America/Los_Angeles"] as const;
const root = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(import.meta.url);

/** Fixed expectations are independent of the active process locale and time zone. */
function sample() {
  const output = {
    counts: [formatCount(1234567), formatCount(Number.MAX_SAFE_INTEGER)],
    values: [formatValue(1234.56789), formatValue(-0.25), formatValue(1e-12, "lr"), formatValue(Number.MAX_VALUE)],
    exact: [formatExactValue(-0), formatExactValue(Number.MIN_VALUE), formatExactValue(1 + Number.EPSILON)],
    states: (["nan", "positive-infinity", "negative-infinity", "missing", "conflict"] as const)
      .map((kind) => formatReading({ kind, value: null })),
    dates: [
      "2026-01-01T00:15:00.000Z", "2026-01-01T00:15:00.000+05:00",
      "2026-12-31T23:45:00.000-08:00", "2026-03-08T10:00:00.000Z", "2026-11-01T09:00:00.000Z",
    ].map(formatSnapshot),
  };
  assert.deepEqual(output, {
    counts: ["1,234,567", "9,007,199,254,740,991"],
    values: ["1,234.5679", "-0.25", "1.00e-12", "1.7976931348623157e+308"],
    exact: ["-0", "5e-324", "1.0000000000000002"],
    states: ["NaN", "+Infinity", "−Infinity", "Missing", "Conflicting"],
    dates: ["Jan 1, 00:15 UTC", "Dec 31, 19:15 UTC", "Jan 1, 07:45 UTC", "Mar 8, 10:00 UTC", "Nov 1, 09:00 UTC"],
  });

  const data: MetricFrame = {
    points: [[0, -1], [1, 0], [2, 2]], conflicts: [], domain: [-1, 2],
    finiteCount: 3, invalidCount: 0, missingCount: 0, conflictCount: 0,
    mode: "line", peak: { step: 2, value: 2 },
  };
  const model = buildMetricChartModel("loss", data, { start: 0, end: 2, width: 320 }, "#FF794B");
  assert.ok(model);
  // Check the actual option/source dimensions; this is not a painted Canvas assertion.
  const option = model.option as unknown as {
    xAxis: { type: string }; yAxis: { type: string };
    series: { smooth?: boolean; connectNulls?: boolean; sampling?: string; data: (number | null)[][] }[];
  };
  const line = option.series[0];
  assert.equal(option.xAxis.type, "value");
  assert.equal(option.yAxis.type, "value");
  assert.equal(line.smooth, false);
  assert.equal(line.connectNulls, false);
  assert.equal(line.sampling, "none");
  assert.deepEqual(line.data.map((point) => point.slice(2)), [[0, -1], [1, 0], [2, 2]]);
  assert.equal(model.y.encode(0) > model.y.encode(-1), true);
  assert.equal(model.y.encode(0) < model.y.encode(2), true);

  return {
    defaults: {
      locale: new Intl.NumberFormat().resolvedOptions().locale,
      timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      numberExample: new Intl.NumberFormat().format(1234.5),
      januaryOffsetMinutes: new Date("2026-01-01T00:00:00.000Z").getTimezoneOffset(),
      julyOffsetMinutes: new Date("2026-07-01T00:00:00.000Z").getTimezoneOffset(),
    },
    output,
    chart: { xScale: option.xAxis.type, yScale: option.yAxis.type, smooth: line.smooth,
      connectNulls: line.connectNulls, sampling: line.sampling,
      originalPoints: line.data.map((point) => point.slice(2)),
      xTicks: model.x.ticks, yTicks: model.y.ticks },
  };
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--sample") {
    console.log(JSON.stringify(sample()));
    return;
  }
  if (args.length) throw new RangeError("Usage: node --import tsx scripts/validate-presentation.ts");
  const startedAt = new Date().toISOString();
  const results = [];
  for (const locale of locales) {
    for (const timeZone of zones) {
      const language = `${locale.replace("-", "_")}.UTF-8`;
      const result = spawnSync(process.execPath, ["--import", "tsx", script, "--sample"], {
        cwd: root, encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, LANG: language, LC_ALL: language, LC_MESSAGES: language,
          LANGUAGE: locale.replace("-", "_"), TZ: timeZone },
      });
      try {
        assert.equal(result.status, 0, result.error?.message ?? result.stderr);
        const observed: ReturnType<typeof sample> = JSON.parse(result.stdout);
        // Verify the subprocess actually adopted the requested defaults.
        assert.equal(observed.defaults.locale, locale);
        assert.equal(observed.defaults.timeZone, timeZone);
        assert.equal(observed.defaults.januaryOffsetMinutes, timeZone === "UTC" ? 0 : timeZone === "Asia/Almaty" ? -300 : 480);
        assert.equal(observed.defaults.julyOffsetMinutes, timeZone === "UTC" ? 0 : timeZone === "Asia/Almaty" ? -300 : 420);
        results.push({ locale, timeZone, status: "passed", exitCode: result.status, observed });
      } catch (error) {
        results.push({ locale, timeZone, status: "failed", exitCode: result.status,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 3000),
          stdout: result.stdout?.slice(0, 6000), stderr: result.stderr?.slice(0, 3000) });
      }
    }
  }
  const passed = results.every((result) => result.status === "passed");
  console.log(JSON.stringify({
    schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), passed,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    source: { revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      workingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).length > 0 },
    scope: "Nine independent Node subprocesses with verified default locale/time zone. Explicit en-US/UTC presentation and linear unsmoothed chart options are checked against fixed expectations. No browser locale overrides, hydration, painted Canvas, or numeric UI sort interaction is claimed.",
    counts: { attempted: results.length, passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length },
    results,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
