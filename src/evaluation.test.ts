import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startEvaluation,
  CALCULATION_TIMEOUT,
  type WorkerPort,
} from "./evaluation";
import type { Settings } from "./engine";
const settings: Settings = {
  angle: "deg",
  large: false,
  contrast: false,
  complex: false,
};
const rows = [
  { id: "a", latex: "2+2" },
  { id: "b", latex: "" },
];
function setup() {
  vi.useFakeTimers();
  const port: WorkerPort = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  const factory = vi.fn(() => port),
    result = vi.fn(),
    busy = vi.fn();
  const cancel = startEvaluation(rows, settings, result, busy, factory);
  return { port, factory, result, busy, cancel };
}
afterEach(() => vi.useRealTimers());
describe("interruptible worker calculations", () => {
  it("submits the worksheet and stops the worker after receiving results", () => {
    const { port, result, busy } = setup();
    vi.advanceTimersByTime(70);
    expect(port.postMessage).toHaveBeenCalledWith({ rows, settings });
    port.onmessage!.call(
      port as Worker,
      new MessageEvent("message", { data: { a: { text: "4" } } }),
    );
    expect(result).toHaveBeenLastCalledWith({ a: { text: "4" } });
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(port.terminate).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(CALCULATION_TIMEOUT);
    expect(result).toHaveBeenCalledOnce();
  });
  it("terminates costly calculations and produces a useful error", () => {
    const { port, result, busy } = setup();
    vi.advanceTimersByTime(CALCULATION_TIMEOUT);
    expect(port.terminate).toHaveBeenCalledOnce();
    expect(result).toHaveBeenCalledWith({
      a: { error: "Calculation took too long. Simplify the expression." },
    });
    expect(busy).toHaveBeenLastCalledWith(false);
  });
  it("cancels work when the worksheet changes and ignores stale output", () => {
    const { port, result, cancel } = setup();
    vi.advanceTimersByTime(70);
    cancel();
    port.onmessage!.call(
      port as Worker,
      new MessageEvent("message", { data: { a: { text: "4" } } }),
    );
    vi.advanceTimersByTime(CALCULATION_TIMEOUT);
    expect(result).not.toHaveBeenCalled();
    expect(port.terminate).toHaveBeenCalledOnce();
  });
  it("does not submit an abandoned edit during the debounce interval", () => {
    const { port, cancel } = setup();
    cancel();
    vi.advanceTimersByTime(CALCULATION_TIMEOUT);
    expect(port.postMessage).not.toHaveBeenCalled();
  });
  it("reports worker failures", () => {
    const { port, result } = setup();
    port.onerror!.call(port as Worker, new Event("error") as ErrorEvent);
    expect(result).toHaveBeenCalledWith({
      a: { error: "Unable to calculate this expression" },
    });
    expect(port.terminate).toHaveBeenCalledOnce();
  });
  it("skips workers for empty worksheets", () => {
    const factory = vi.fn(),
      result = vi.fn(),
      busy = vi.fn();
    startEvaluation([{ id: "a", latex: "" }], settings, result, busy, factory);
    expect(factory).not.toHaveBeenCalled();
    expect(result).toHaveBeenCalledWith({});
    expect(busy).toHaveBeenCalledWith(false);
  });
});
