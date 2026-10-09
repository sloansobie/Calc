import { evaluateWorksheet, type Row, type Settings } from "./engine";
self.onmessage = (event: MessageEvent<{ rows: Row[]; settings: Settings }>) => {
  self.postMessage(evaluateWorksheet(event.data.rows, event.data.settings));
};
