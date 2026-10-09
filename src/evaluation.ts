import type { Row, Settings, Result } from "./engine";
export type WorkerPort = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror"
>;
export const CALCULATION_TIMEOUT = 1800;
export function startEvaluation(
  rows: Row[],
  settings: Settings,
  onResult: (results: Record<string, Result>) => void,
  onBusy: (busy: boolean) => void,
  createWorker: () => WorkerPort = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
) {
  if (!rows.some((row) => row.latex.trim())) {
    onResult({});
    onBusy(false);
    return () => {};
  }
  onBusy(true);
  let stopped = false;
  const worker = createWorker();
  const finish = (results: Record<string, Result>) => {
    if (stopped) return;
    stopped = true;
    clearTimeout(delay);
    clearTimeout(timeout);
    worker.terminate();
    onResult(results);
    onBusy(false);
  };
  const error = (message: string) =>
    Object.fromEntries(
      rows
        .filter((row) => row.latex.trim())
        .map((row) => [row.id, { error: message }]),
    );
  const delay = setTimeout(() => worker.postMessage({ rows, settings }), 70);
  const timeout = setTimeout(
    () => finish(error("Calculation took too long. Simplify the expression.")),
    CALCULATION_TIMEOUT,
  );
  worker.onmessage = (event) => finish(event.data);
  worker.onerror = () => finish(error("Unable to calculate this expression"));
  return () => {
    stopped = true;
    clearTimeout(delay);
    clearTimeout(timeout);
    worker.terminate();
  };
}
