import { describe, expect, it, vi } from "vitest";
import { buildMetricChartModel } from "../../src/features/charts/chart-model";
import { createChartRendererController, type ChartRenderer, type ChartRenderState } from "../../src/features/charts/chart-renderer";

function model(end = 4) {
  return buildMetricChartModel("loss", {
    points: [[0, 1], [end, 2]], conflicts: [], domain: [1, 2], finiteCount: 2,
    invalidCount: 0, missingCount: 0, conflictCount: 0, peak: { step: end, value: 2 }, mode: "line",
  }, { start: 0, end, width: 300 }, "#FF794B")!;
}
function fixture() {
  let pixels: ReturnType<typeof model> | "partial" | null = null;
  const states: ChartRenderState[] = [];
  const adapters: ChartRenderer[] = [];
  const create = vi.fn(() => {
    const renderer = {
      render: vi.fn((next: ReturnType<typeof model>) => { pixels = next; }),
      clear: vi.fn(() => { pixels = null; }),
      resize: vi.fn(), dispose: vi.fn(), coordinate: vi.fn((): number | null => 0.5),
    };
    adapters.push(renderer);
    return renderer;
  });
  const clearSurface = vi.fn(() => { pixels = null; });
  const controller = createChartRendererController({ create, clearSurface, changed: (state) => states.push(state) });
  return { controller, create, clearSurface, states, adapters, pixels: () => pixels, partial: () => { pixels = "partial"; } };
}

describe("chart renderer failure containment", () => {
  it("does not publish the requested model until rendering succeeds", () => {
    const test = fixture();
    const first = model();
    test.controller.update(first, 400, 240);
    expect(test.controller.getState()).toEqual({ status: "ready", model: first });
    expect(test.pixels()).toBe(first);
    expect(test.controller.inspect([200, 100])?.step).toBe(2);
    const second = model(10);
    const adapter = test.adapters[0];
    vi.mocked(adapter.render).mockImplementationOnce(() => {
      expect(test.controller.getState().model).toBe(first);
      expect(test.states.at(-1)?.model).toBe(first);
      test.partial();
    });
    test.controller.update(second, 400, 240);
    expect(test.controller.getState().model).toBe(second);
    expect(test.controller.inspect([200, 100])?.step).toBe(5);
  });

  it("contains initialization failure and waits for an explicit retry", () => {
    const test = fixture();
    test.create.mockImplementationOnce(() => { test.partial(); throw Error("init"); });
    const first = model();
    expect(() => test.controller.update(first, 400, 240)).not.toThrow();
    expect(test.controller.getState()).toEqual({ status: "failed", model: null });
    expect(test.pixels()).toBeNull();
    test.controller.resize(500, 300);
    const latest = model(10);
    test.controller.update(latest, 500, 300);
    expect(test.create).toHaveBeenCalledTimes(1);
    test.controller.retry();
    expect(test.create).toHaveBeenCalledTimes(2);
    expect(test.pixels()).toBe(latest);
    expect(test.controller.getState()).toEqual({ status: "ready", model: latest });
  });

  it.each(["render", "clear", "resize", "coordinate"] as const)("clears old pixels and blocks inspection after %s fails", (operation) => {
    const test = fixture();
    test.controller.update(model(), 400, 240);
    const old = test.adapters[0];
    vi.mocked(old[operation]).mockImplementationOnce(() => { test.partial(); throw Error(operation); });
    expect(() => {
      if (operation === "render") test.controller.update(model(10), 400, 240);
      if (operation === "clear") test.controller.update(null, 400, 240);
      if (operation === "resize") test.controller.resize(500, 240);
      if (operation === "coordinate") test.controller.inspect([100, 100]);
    }).not.toThrow();
    expect(test.controller.getState()).toEqual({ status: "failed", model: null });
    expect(test.pixels()).toBeNull();
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(test.controller.inspect([100, 100])).toBeNull();
    const latest = model(20);
    test.controller.update(latest, 500, 240);
    expect(test.create).toHaveBeenCalledTimes(1);
    test.controller.retry();
    expect(test.pixels()).toBe(latest);
    expect(test.controller.inspect([100, 100])?.step).toBe(10);
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite pointer coordinates (%s)", (coordinate) => {
    const test = fixture();
    test.controller.update(model(), 400, 240);
    vi.mocked(test.adapters[0].coordinate).mockReturnValueOnce(coordinate);
    expect(test.controller.inspect([100, 100])).toBeNull();
    expect(test.controller.getState().status).toBe("failed");
    expect(test.pixels()).toBeNull();
  });

  it("ignores outside-plot pointers without failing or inventing a source reading", () => {
    const test = fixture();
    test.controller.update(model(), 400, 240);
    vi.mocked(test.adapters[0].coordinate).mockReturnValueOnce(null);
    expect(test.controller.inspect([-100, 100])).toBeNull();
    expect(test.controller.getState().status).toBe("ready");
  });

  it("removes stale pixels even when renderer disposal itself fails", () => {
    const test = fixture();
    test.controller.update(model(), 400, 240);
    vi.mocked(test.adapters[0].dispose).mockImplementationOnce(() => { throw Error("dispose"); });
    vi.mocked(test.adapters[0].render).mockImplementationOnce(() => { throw Error("render"); });
    expect(() => test.controller.update(model(20), 400, 240)).not.toThrow();
    expect(test.pixels()).toBeNull();
    expect(test.controller.getState().status).toBe("failed");
    test.controller.retry();
    expect(test.controller.getState().status).toBe("ready");
  });
});

describe("zero-size and disposed chart surfaces", () => {
  it.each([[0, 240], [400, 0], [0, 0], [NaN, 240]])("defers creation at size %s × %s and draws the latest model when visible", (width, height) => {
    const test = fixture();
    test.controller.update(model(), width, height);
    const latest = model(20);
    test.controller.update(latest, width, height);
    expect(test.create).not.toHaveBeenCalled();
    expect(test.controller.getState()).toEqual({ status: "waiting", model: null });
    expect(test.controller.inspect([100, 100])).toBeNull();
    test.controller.resize(400, 240);
    expect(test.create).toHaveBeenCalledTimes(1);
    expect(test.pixels()).toBe(latest);
  });

  it("suspends a hidden chart and recreates it from the latest frame", () => {
    const test = fixture();
    test.controller.update(model(), 400, 240);
    test.controller.resize(0, 240);
    expect(test.adapters[0].dispose).toHaveBeenCalledOnce();
    expect(test.controller.getState()).toEqual({ status: "waiting", model: null });
    expect(test.pixels()).toBeNull();
    const latest = model(20);
    test.controller.update(latest, 0, 240);
    test.controller.resize(400, 240);
    expect(test.create).toHaveBeenCalledTimes(2);
    expect(test.pixels()).toBe(latest);
  });

  it("does not redraw unchanged models or retry an already healthy chart", () => {
    const test = fixture();
    const first = model();
    test.controller.update(first, 400, 240);
    test.controller.update(first, 400, 240);
    test.controller.resize(400, 240);
    test.controller.retry();
    expect(test.adapters[0].render).toHaveBeenCalledTimes(1);
    expect(test.adapters[0].resize).not.toHaveBeenCalled();
    test.controller.resize(500, 240);
    expect(test.adapters[0].resize).toHaveBeenCalledOnce();
    expect(test.adapters[0].render).toHaveBeenCalledTimes(1);
  });

  it("cleans up once and ignores pending callbacks after disposal", () => {
    const test = fixture();
    test.controller.update(model(), 400, 240);
    const published = test.states.length;
    test.controller.dispose(); test.controller.dispose();
    test.controller.update(model(20), 400, 240);
    test.controller.resize(500, 240); test.controller.retry();
    expect(test.controller.inspect([100, 100])).toBeNull();
    expect(test.adapters[0].dispose).toHaveBeenCalledOnce();
    expect(test.create).toHaveBeenCalledOnce();
    expect(test.states).toHaveLength(published);
    expect(test.pixels()).toBeNull();
  });
});
