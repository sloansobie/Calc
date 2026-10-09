// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
vi.mock("mathlive", () => {
  class MathfieldElement extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }
    static fontsDirectory: string | null = null;
    static soundsDirectory: string | null = null;
    value = "";
    position = 0;
    getValue() {
      return this.value;
    }
    selection = { ranges: [[0, 0]] };
    mathVirtualKeyboardPolicy = "";
    smartFence = false;
    inlineShortcuts = {};
    executeCommand() {
      this.dispatchEvent(new CustomEvent("move-out", { cancelable: true }));
    }
    setValue(value: string) {
      this.value = value;
    }
  }
  customElements.define("test-math-field", MathfieldElement);
  return { MathfieldElement };
});
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined, container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});
async function setup() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onChange = vi.fn(),
    onEnter = vi.fn(),
    onNavigate = vi.fn(),
    register = vi.fn();
  await act(() =>
    root!.render(
      <Editor
        id="row"
        index={0}
        latex="5733^2"
        onChange={onChange}
        onFocus={() => {}}
        onEnter={onEnter}
        onNavigate={onNavigate}
        register={register}
      />,
    ),
  );
  const field = container.querySelector("test-math-field") as HTMLElement & {
    value: string;
    selection: { ranges: number[][] };
  };
  return { field, onChange, onEnter, onNavigate, register };
}
describe("safe native editor handoff", () => {
  it("keeps the focused DOM node alive until the Enter event finishes", async () => {
    const { field, onEnter, onChange } = await setup();
    field.value = "5733^2+1";
    await act(async () => {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(field.isConnected).toBe(true);
      expect(onEnter).not.toHaveBeenCalled();
    });
    expect(field.isConnected).toBe(false);
    expect(onChange).toHaveBeenCalledWith("5733^2+1");
    expect(onEnter).toHaveBeenCalledOnce();
    expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(
      onEnter.mock.invocationCallOrder[0],
    );
  });
  it("preserves notation and selection while cancelling the outgoing editor", async () => {
    const { field } = await setup();
    field.selection = { ranges: [[2, 3]] };
    await act(() =>
      field.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    const replacement = container!.querySelector(
      "test-math-field",
    ) as typeof field;
    expect(replacement).not.toBe(field);
    expect(replacement.value).toBe("5733^2");
    expect(replacement.selection).toEqual({ ranges: [[2, 3]] });
  });
  it("does not recreate editors after their row is removed", async () => {
    const { field, onEnter } = await setup();
    await act(() => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      root!.unmount();
      root = undefined;
    });
    expect(onEnter).not.toHaveBeenCalled();
    expect(container!.childElementCount).toBe(0);
  });
  it("defers row navigation and leaves ordinary keys alone", async () => {
    const { field, onNavigate, onEnter } = await setup();
    await act(() =>
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "2", bubbles: true }),
      ),
    );
    expect(field.isConnected).toBe(true);
    expect(onEnter).not.toHaveBeenCalled();
    await act(() =>
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      ),
    );
    expect(onNavigate).toHaveBeenCalledWith(-1);
  });
});

describe("input presentation and symbol shortcuts", () => {
  it("uses upright text and the output font with Greek shortcuts", async () => {
    const { field } = await setup();
    const editor = field as typeof field & {
      letterShapeStyle: string;
      inlineShortcuts: Record<string, string>;
      onInlineShortcut: (
        sender: { getValue: () => string; position: number },
        candidate: string,
      ) => string;
    };
    expect(editor.letterShapeStyle).toBe("upright");
    expect(editor.inlineShortcuts.alpha).toBe("\\alpha");
    expect(editor.inlineShortcuts.theta).toBe("\\theta");
    expect(editor.inlineShortcuts.Omega).toBe("\\Omega");
    expect(editor.inlineShortcuts.OMEGA).toBe("\\Omega");
    expect(editor.inlineShortcuts.DELTA).toBe("\\Delta");
    expect(editor.inlineShortcuts.ALPHA).toBe("Α");
    expect(editor.inlineShortcuts.PI).toBe("\\Pi");
    const sender = { getValue: () => "x", position: 1 };
    expect(editor.onInlineShortcut(sender, "x1")).toBe("x_{1}");
    expect(editor.onInlineShortcut(sender, "x12")).toBe("x_{12}");
    expect(editor.onInlineShortcut(sender, "12")).toBe("");
    field.value = "\\sin3";
    expect(
      editor.onInlineShortcut({ getValue: () => "\\sin3", position: 4 }, "n30"),
    ).toBe("");
    expect(editor.inlineShortcuts.sqrt).toBe("\\sqrt{#0}");
    expect(editor.inlineShortcuts.sum).toContain("\\sum");
    expect(editor.inlineShortcuts.integral).toContain("\\int");
    expect(editor.inlineShortcuts.derivative).toContain("\\frac{d}{dx}");
    expect(editor.inlineShortcuts.derviative).toBe(
      editor.inlineShortcuts.derivative,
    );
    expect(editor.shadowRoot!.querySelector("style")!.textContent).toContain(
      "-apple-system",
    );
  });
});

it("keeps fresh input through a lagging render and applies explicit undo restoration", async () => {
  const { field, onChange, onEnter, onNavigate, register } = await setup();
  field.value = "123";
  const props = {
    id: "row",
    index: 0,
    onChange,
    onFocus: () => {},
    onEnter,
    onNavigate,
    register,
  };
  await act(() =>
    root!.render(<Editor {...props} latex="12" restoreToken={0} />),
  );
  expect(field.value).toBe("123");
  await act(() =>
    root!.render(<Editor {...props} latex="5" restoreToken={1} />),
  );
  expect(field.value).toBe("5");
});

it("onscreen Enter saves the last math-model character before creating the next row", async () => {
  vi.stubGlobal(
    "Worker",
    class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
    },
  );
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => {};
  localStorage.clear();
  const { default: App } = await import("./App");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  try {
    await act(() => root!.render(<App />));
    const field = container.querySelector("test-math-field") as HTMLElement & {
      value: string;
    };
    await act(() => {
      field.value = "12";
      field.dispatchEvent(new Event("input"));
    });
    // MathLive's model has received the final key before its notification reaches React.
    field.value = "123";
    await act(() =>
      container!
        .querySelector<HTMLButtonElement>('button[aria-label="Enter"]')!
        .click(),
    );
    const session = JSON.parse(localStorage.getItem("scientific-session")!);
    expect(session.rows.map((row: { latex: string }) => row.latex)).toEqual([
      "123",
      "",
    ]);
  } finally {
    if (root) await act(() => root!.unmount());
    root = undefined;
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

it("keyboard mode hides ordinary keys, remembers the setting, and restores the full keypad", async () => {
  vi.stubGlobal(
    "Worker",
    class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
    },
  );
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => {};
  localStorage.clear();
  const { default: App } = await import("./App");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  try {
    await act(() => root!.render(<App />));
    await act(() =>
      container!
        .querySelector<HTMLButtonElement>('button[aria-label="Keyboard mode"]')!
        .click(),
    );
    expect(
      [...container.querySelectorAll(".keypad button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual([]);
    expect(container.querySelector('button[aria-label="Enter"]')).toBeNull();
    expect(
      container.querySelector('button[aria-label="New expression"]'),
    ).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("scientific-session")!).settings.keyboard,
    ).toBe(true);
    await act(() => root!.render(<App key="reopened" />));
    expect(container.querySelector(".keypad")).toBeNull();
    await act(() =>
      container!
        .querySelector<HTMLButtonElement>('button[aria-label="Keyboard mode"]')!
        .click(),
    );
    expect(container.querySelector('button[aria-label="7"]')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Enter"]'),
    ).not.toBeNull();
    expect(
      JSON.parse(localStorage.getItem("scientific-session")!).settings.keyboard,
    ).toBe(false);
  } finally {
    if (root) await act(() => root!.unmount());
    root = undefined;
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

it("migrates the existing worksheet and persists separate worksheets when switching", async () => {
  vi.stubGlobal(
    "Worker",
    class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
    },
  );
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => {};
  localStorage.setItem(
    "scientific-session",
    JSON.stringify({
      rows: [{ id: "original", latex: "42" }],
      settings: { angle: "deg" },
    }),
  );
  const { default: App } = await import("./App");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  try {
    await act(() => root!.render(<App />));
    await act(() =>
      container!
        .querySelector<HTMLButtonElement>('button[aria-label="New worksheet"]')!
        .click(),
    );
    let saved = JSON.parse(localStorage.getItem("scientific-session")!);
    expect(saved.worksheets).toHaveLength(2);
    expect(saved.worksheets[0].rows[0].latex).toBe("42");
    expect(saved.rows[0].latex).toBe("");
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Current worksheet"]',
    )!;
    await act(() => {
      select.value = saved.worksheets[0].id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    saved = JSON.parse(localStorage.getItem("scientific-session")!);
    expect(saved.rows[0].latex).toBe("42");
    await act(() => root!.render(<App key="reopen-worksheets" />));
    expect(container.querySelectorAll('select[aria-label="Current worksheet"] option')).toHaveLength(2);
    expect(
      JSON.parse(localStorage.getItem("scientific-session")!).rows[0].latex,
    ).toBe("42");
  } finally {
    if (root) await act(() => root!.unmount());
    root = undefined;
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

it("Enter inserts below an upper row and preserves the rows beneath it", async () => {
  vi.stubGlobal(
    "Worker",
    class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
    },
  );
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => {};
  localStorage.setItem(
    "scientific-session",
    JSON.stringify({
      rows: [
        { id: "first", latex: "1" },
        { id: "second", latex: "2" },
      ],
      settings: { angle: "deg" },
    }),
  );
  const { default: App } = await import("./App");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  try {
    await act(() => root!.render(<App />));
    const first = container.querySelector("test-math-field")!;
    await act(async () => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
    });
    const saved = JSON.parse(localStorage.getItem("scientific-session")!);
    expect(saved.rows.map((r: { latex: string }) => r.latex)).toEqual([
      "1",
      "",
      "2",
    ]);
    expect(saved.rows[0].id).toBe("first");
    expect(saved.rows[2].id).toBe("second");
    expect(container.querySelectorAll("test-math-field")).toHaveLength(3);
  } finally {
    if (root) await act(() => root!.unmount());
    root = undefined;
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});
