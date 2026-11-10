"""Reproduce the saved Chrome trace comparison; never drives a browser.

Use Python 3: python3 scripts/analyze-browser-evidence.py
Paint is a renderer trace event, not a measurement of physical display latency.
"""
import base64
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/performance"


def read(path):
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt") as stream:
        return json.load(stream)


def describe(values):
    values = sorted(values)
    return {"n": len(values), "medianMs": statistics.median(values),
            "p95Ms": values[math.ceil(len(values) * .95) - 1],
            "minMs": values[0], "maxMs": values[-1]}


def correlate(trace, report, report_file):
    events = trace["traceEvents"]
    assert trace["metadata"]["cpuThrottling"] == 4
    first = report["samples"][0]
    endpoints = [event for event in events
                 if event["name"] == "soup:1:load:paint-proxy"
                 # The ledger reads now(), then calls performance.mark(); allow
                 # one millisecond for those separate clock reads, not a new event.
                 and abs(event["args"]["data"]["startTime"] - first["paintProxyAtMs"]) <= 1]
    assert len(endpoints) == 1, (report_file, "ambiguous navigation")
    endpoint = endpoints[0]
    navigation_id = endpoint["args"]["data"]["navigationId"]
    marks = {event["name"]: event for event in events
             if event["name"].startswith("soup:")
             and event.get("args", {}).get("data", {}).get("navigationId") == navigation_id}
    navigation = next(event for event in events if event["name"] == "navigationStart"
                      and event["args"]["data"]["navigationId"] == navigation_id)
    paints = sorted((event for event in events if event["name"] == "Paint"
                     and event["pid"] == endpoint["pid"] and event["tid"] == endpoint["tid"]
                     and event.get("args", {}).get("data", {}).get("frame") == navigation["args"]["frame"]),
                    key=lambda event: event["ts"])
    rows = []
    for sample in report["samples"]:
        assert sample["status"] == "passed", (report_file, sample)
        prefix = f'soup:{sample["id"]}:{sample["kind"]}:'
        start, draw, proxy = [marks[prefix + name] for name in ("input", "drawSubmittedAtMs", "paint-proxy")]
        # A Paint in this same renderer/frame must follow this sample's draw/DOM
        # commit and precede its own proxy. Never borrow a later sample's paint.
        candidates = [event for event in paints if draw["ts"] <= event["ts"] and event["ts"] + event.get("dur", 0) <= proxy["ts"]]
        # Canvas can paint before React publishes the row/range facts. Use the
        # last Paint before the completion marker for load/zoom (a conservative
        # complete-update endpoint). Inspection has an explicit DOM commit mark,
        # so its first following Paint is sufficient. Keep both bounds in CSV.
        paint = (candidates[-1] if sample["kind"] in ("load", "zoom") else candidates[0]) if candidates else None
        assert paint is not None, (report_file, prefix, "no correlated Paint")
        end = paint["ts"] + paint.get("dur", 0)
        assert end <= proxy["ts"], (report_file, prefix, "Paint not complete before proxy")
        rows.append({"report": report_file, "variant": report["variant"], "id": sample["id"],
                     "kind": sample["kind"], "navigationId": navigation_id,
                     "inputTraceUs": start["ts"], "commitTraceUs": draw["ts"],
                     "paintTraceUs": paint["ts"], "paintEndTraceUs": end,
                     "inputToPaintMs": (end - start["ts"]) / 1000,
                     "firstPaintEndTraceUs": candidates[0]["ts"] + candidates[0].get("dur", 0),
                     "paintEndpointRule": "last Paint before completion marker" if sample["kind"] in ("load", "zoom") else "first Paint after inspector DOM commit",
                     "paintProxyMs": sample["durationMs"],
                     "navigationToPaintMs": (end - navigation["ts"]) / 1000 if sample["kind"] == "load" else "",
                     "inputQueueMs": sample.get("inputReceivedAtMs", sample["startedAtMs"]) - sample["startedAtMs"],
                     "paintNode": paint["args"]["data"].get("nodeName", "")})
    return rows


all_rows = []
summary = {"sourceRevision": "0eb0e3d", "method": "Load/zoom: last same-frame Paint before completion marker (conservative complete update). Inspection/hover: first Paint after inspector DOM commit. Neither is physical display latency.", "variants": {}}
for variant in ("raw", "optimized"):
    trace = read(EVIDENCE / f"{variant}-4x.trace.json.gz")
    report_file = f"{variant}-4x-report.json"
    report = read(EVIDENCE / report_file)
    rows = correlate(trace, report, report_file)
    all_rows.extend(rows)
    assert report["environment"]["width"] == 915
    assert report["environment"]["height"] == 837
    assert report["environment"]["dpr"] == 2
    assert report["observedPeak"]["value"] == 12
    data = {"interactionViewport": report["environment"], "scriptedAndPointerSamples": report["summary"],
            "tracePaint": {kind: describe([row["inputToPaintMs"] for row in rows if row["kind"] == kind])
                           for kind in ("load", "zoom", "inspection", "hover")},
            "ignoredBusyPointerMoves": report["hoverProtocol"]["ignoredPointerEvents"]}
    # Preserve a filmstrip frame from the original trace, without altering pixels.
    first_paint = rows[0]["paintEndTraceUs"]
    proxy = next(event for event in trace["traceEvents"] if event["name"] == "soup:1:load:paint-proxy" and event["args"]["data"]["navigationId"] == rows[0]["navigationId"])
    snapshots = sorted((event for event in trace["traceEvents"] if event["name"] == "Screenshot"), key=lambda event: event["ts"])
    screenshot = next(event for event in snapshots if event["ts"] >= proxy["ts"])
    (EVIDENCE / f"{variant}-first-chart-filmstrip.jpg").write_bytes(base64.b64decode(screenshot["args"]["snapshot"]))
    data["filmstrip"] = {"traceScreenshotUs": screenshot["ts"], "afterPaintMs": (screenshot["ts"] - first_paint) / 1000}
    series = read(EVIDENCE / f"{variant}-cold-series-4x.trace.json.gz")
    numbers = range(1, 6) if variant == "raw" else range(2, 7)
    cold = []
    fcps = []
    for number in numbers:
        file = f"{variant}-cold-{number}.json"
        report = read(EVIDENCE / file)
        assert report["environment"]["width"] == 727
        assert report["environment"]["height"] == 837
        assert report["environment"]["dpr"] == 2
        matched = correlate(series, report, file)
        assert len(matched) == 1
        all_rows.extend(matched)
        cold.append(matched[0]["navigationToPaintMs"])
        fcps.append(report["fcpMs"])
    data["coldNavigationToPaint"] = describe(cold)
    data["coldFcp"] = describe(fcps)
    summary["variants"][variant] = data

with open(EVIDENCE / "trace-observations.csv", "w") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(all_rows[0]))
    writer.writeheader()
    writer.writerows(all_rows)
(EVIDENCE / "comparison.json").write_text(json.dumps(summary, indent=2) + "\n")
originals = sorted([*EVIDENCE.glob("*.trace.json.gz"), *EVIDENCE.glob("*-report.json"), *EVIDENCE.glob("*-cold-[0-9].json")])
(EVIDENCE / "SHA256SUMS").write_text("".join(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n" for file in originals))
print(json.dumps({variant: {key: value for key, value in data.items() if key in ("tracePaint", "coldNavigationToPaint", "coldFcp", "filmstrip")} for variant, data in summary["variants"].items()}, indent=2))
