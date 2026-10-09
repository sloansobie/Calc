import { CopyResult } from "./CopyResult";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Undo2,
  Redo2,
  X,
  Check,
  Calculator,
  Plus,
  Keyboard,
  Settings2,
  CircleHelp,
} from "lucide-react";
import { convertLatexToMarkup, type MathfieldElement } from "mathlive";
import { Editor } from "./Editor";
import { Keypad, type KeyAction } from "./Keypad";
import type { Row, Settings, Result } from "./engine";
import { startEvaluation } from "./evaluation";
import { focusMathfield } from "./focus";
const defaults: Settings = {
  angle: "deg",
  large: false,
  contrast: true,
  complex: true,
  keyboard: false,
  significantFigures: 12,
};
const newRow = (): Row => ({ id: crypto.randomUUID(), latex: "" });
type Worksheet = { id: string; name: string; rows: Row[] };
function load(): {
  rows: Row[];
  settings: Settings;
  worksheets: Worksheet[];
  worksheetId: string;
} {
  try {
    const data = JSON.parse(
      localStorage.getItem("scientific-session") || "null",
    );
    if (
      data &&
      Array.isArray(data.rows) &&
      data.rows.length &&
      data.rows.every(
        (r: Row) => typeof r.id === "string" && typeof r.latex === "string",
      )
    ) {
      const worksheets: Worksheet[] =
        Array.isArray(data.worksheets) &&
        data.worksheets.length &&
        data.worksheets.every(
          (w: Worksheet) =>
            typeof w.id === "string" &&
            typeof w.name === "string" &&
            Array.isArray(w.rows) &&
            w.rows.length &&
            w.rows.every(
              (r: Row) =>
                typeof r.id === "string" && typeof r.latex === "string",
            ),
        )
          ? data.worksheets
          : [{ id: crypto.randomUUID(), name: "Worksheet 1", rows: data.rows }];
      const selected =
        worksheets.find((w) => w.id === data.worksheetId) || worksheets[0];
      return {
        rows: selected.rows,
        settings: {
          ...defaults,
          ...data.settings,
          contrast: true,
          complex: true,
        },
        worksheets,
        worksheetId: selected.id,
      };
    }
  } catch {}
  const rows = [newRow()];
  const id = crypto.randomUUID();
  return {
    rows,
    settings: defaults,
    worksheets: [{ id, name: "Worksheet 1", rows }],
    worksheetId: id,
  };
}
export default function App() {
  const [initial] = useState(load),
    [rows, setRows] = useState(initial.rows),
    [settings, setSettings] = useState(initial.settings);
  const [worksheets, setWorksheets] = useState(initial.worksheets);
  const [worksheetId, setWorksheetId] = useState(initial.worksheetId);
  const [renaming, setRenaming] = useState(false);
  const [worksheetName, setWorksheetName] = useState("");
  function changeWorksheet(id: string, created?: Worksheet) {
    const snapshot = currentRows.current.map((r) => ({
      ...r,
      latex: fields.current.get(r.id)?.value ?? r.latex,
    }));
    let saved = worksheets.map((w) =>
      w.id === worksheetId ? { ...w, rows: snapshot } : w,
    );
    if (created) saved = [...saved.filter((w) => w.id !== created.id), created];
    const target = saved.find((w) => w.id === id)!;
    setWorksheets(saved);
    setWorksheetId(id);
    currentRows.current = target.rows;
    history.current = [target.rows];
    cursor.current = 0;
    lastEdit.current = { id: "", time: 0 };
    setRows(target.rows);
    setResults({});
    setActive(target.rows[0].id);
    setRestoreToken((n) => n + 1);
    setRenaming(false);
    pendingFocus.current = target.rows[0].id;
  }
  useEffect(() => {
    const open = (event: Event) => {
      const worksheet = (event as CustomEvent<Worksheet>).detail;
      if (!worksheet || typeof worksheet.id !== "string" || typeof worksheet.name !== "string" ||
          !Array.isArray(worksheet.rows) || !worksheet.rows.length ||
          !worksheet.rows.every((row) => typeof row.id === "string" && typeof row.latex === "string")) return;
      changeWorksheet(worksheet.id, worksheet);
    };
    window.addEventListener("calculator-open-worksheet", open);
    return () => window.removeEventListener("calculator-open-worksheet", open);
  });
  function renameWorksheet() {
    const name = worksheetName.trim();
    if (name && (window as Window & { calculatorRename?: (id: string, name: string) => void }).calculatorRename) {
      (window as Window & { calculatorRename?: (id: string, name: string) => void }).calculatorRename?.(worksheetId, name);
      setRenaming(false);
      return;
    }
    if (name)
      setWorksheets((list) =>
        list.map((w) => (w.id === worksheetId ? { ...w, name } : w)),
      );
    setRenaming(false);
  }
  const [active, setActive] = useState(initial.rows[0].id),
    [tab, setTab] = useState<"main" | "abc" | "func">("main"),
    [shift, setShift] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({}),
    [busy, setBusy] = useState(false),
    [help, setHelp] = useState(false);
  const fields = useRef(new Map<string, MathfieldElement>()),
    currentRows = useRef(initial.rows),
    history = useRef<Row[][]>([initial.rows]),
    cursor = useRef(0),
    lastEdit = useRef({ id: "", time: 0 });
  const helpPanel = useRef<HTMLElement>(null);
  const expressionList = useRef<HTMLDivElement>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [headerOverlap, setHeaderOverlap] = useState(false);
  useEffect(() => {
    const list = expressionList.current;
    if (!list) return;
    const update = () => {
      const top = list.getBoundingClientRect().top;
      setHeaderOverlap(
        [...list.querySelectorAll<HTMLElement>('[data-filled="true"]')].some(
          (row) => row.getBoundingClientRect().top < top - 1,
        ),
      );
    };
    list.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(list);
    for (const child of list.children) observer?.observe(child);
    update();
    return () => {
      list.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [rows, results]);
  const resetEditors = useRef(new Map<string, () => void>());
  const [restoreToken, setRestoreToken] = useState(0);
  const [, refreshHistory] = useState(0),
    pendingFocus = useRef<string | null>(initial.rows[0].id);
  const register = useCallback(
    (id: string, field: MathfieldElement | null, reset?: () => void) => {
      if (field) {
        fields.current.set(id, field);
        if (reset) resetEditors.current.set(id, reset);
        if (pendingFocus.current === id) {
          pendingFocus.current = null;
          focusMathfield(field);
        }
      } else {
        fields.current.delete(id);
        resetEditors.current.delete(id);
      }
    },
    [],
  );
  function commit(next: Row[], editId = "") {
    currentRows.current = next;
    const now = Date.now(),
      coalesce =
        editId &&
        lastEdit.current.id === editId &&
        now - lastEdit.current.time < 650 &&
        cursor.current === history.current.length - 1;
    history.current = history.current.slice(0, cursor.current + 1);
    if (coalesce && cursor.current > 0) history.current[cursor.current] = next;
    else {
      history.current.push(next);
      cursor.current++;
      if (history.current.length > 100) {
        history.current.shift();
        cursor.current--;
      }
    }
    lastEdit.current = { id: editId, time: now };
    setRows(next);
    refreshHistory((n) => n + 1);
  }
  function focus(id: string) {
    setActive(id);
    focusMathfield(fields.current.get(id));
  }
  function add(after = active) {
    const liveValue = fields.current.get(after)?.value;
    if (
      liveValue !== undefined &&
      currentRows.current.find((row) => row.id === after)?.latex !== liveValue
    ) {
      commit(
        currentRows.current.map((row) =>
          row.id === after ? { ...row, latex: liveValue } : row,
        ),
        after,
      );
    }
    const snapshot = currentRows.current;
    if (fields.current.get(after)?.hasFocus?.())
      resetEditors.current.get(after)?.();
    const index = snapshot.findIndex((r) => r.id === after);
    if (index < 0) return;
    if (!snapshot[index].latex.trim()) {
      focus(after);
      return;
    }
    const row = newRow();
    pendingFocus.current = row.id;
    flushSync(() => {
      setActive(row.id);
      commit([
        ...snapshot.slice(0, index + 1),
        row,
        ...snapshot.slice(index + 1),
      ]);
    });
  }
  function undo(direction: number) {
    const next = cursor.current + direction;
    if (next < 0 || next >= history.current.length) return;
    cursor.current = next;
    const snapshot = history.current[next];
    currentRows.current = snapshot;
    setRows(snapshot);
    setRestoreToken((token) => token + 1);
    lastEdit.current = { id: "", time: 0 };
    if (!snapshot.some((r) => r.id === active)) {
      pendingFocus.current = snapshot.at(-1)!.id;
      setActive(pendingFocus.current);
    }
    refreshHistory((n) => n + 1);
  }
  useEffect(() => {
    try {
      localStorage.setItem(
        "scientific-session",
        JSON.stringify({
          rows,
          settings,
          worksheetId,
          worksheets: worksheets.map((w) =>
            w.id === worksheetId ? { ...w, rows } : w,
          ),
        }),
      );
    } catch {}
  }, [rows, settings, worksheets, worksheetId]);
  useEffect(
    () => startEvaluation(rows, settings, setResults, setBusy),
    [rows, settings.angle, settings.complex],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        undo(e.shiftKey ? 1 : -1);
      }
      if (e.key === "Escape") {
        setHelp(false);
      }
    };
    const newExpression = () => add();
    const showHelp = () => setHelp(true);
    window.addEventListener("calculator-help", showHelp);
    window.addEventListener("calculator-new-expression", newExpression);
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("calculator-new-expression", newExpression);
      window.removeEventListener("calculator-help", showHelp);
    };
  });
  useEffect(() => {
    fields.current
      .get(active)
      ?.closest(".expression-row")
      ?.scrollIntoView({ block: "nearest" });
  }, [
    active,
    rows.length,
    results[active]?.text,
    results[active]?.error,
    settings.keyboard,
  ]);
  useEffect(() => {
    if (!help) return;
    const buttons =
      helpPanel.current!.querySelectorAll<HTMLButtonElement>("button");
    buttons[0].focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      focusMathfield(fields.current.get(active));
    };
  }, [help]);
  function action(a: KeyAction) {
    if (a.command === "shift") {
      setShift((v) => !v);
      return;
    }
    if (a.command === "enter") {
      add();
      return;
    }
    const mf = fields.current.get(active);
    if (!mf) return;
    focusMathfield(mf);
    if (a.command)
      mf.executeCommand(
        a.command === "left"
          ? "moveToPreviousChar"
          : a.command === "right"
            ? "moveToNextChar"
            : "deleteBackward",
      );
    else if (a.latex) mf.insert(a.latex, { selectionMode: "placeholder" });
  }
  function clear() {
    const row = newRow();
    pendingFocus.current = row.id;
    flushSync(() => {
      setActive(row.id);
      commit([row]);
    });
  }
  function remove(id: string) {
    const snapshot = currentRows.current;
    if (snapshot.length === 1) {
      clear();
      return;
    }
    const index = snapshot.findIndex((r) => r.id === id);
    const next = snapshot.filter((r) => r.id !== id);
    pendingFocus.current = next[Math.min(index, next.length - 1)].id;
    setActive(pendingFocus.current);
    commit(next);
  }
  return (
    <div
      className={`app contrast ${settings.large ? "large" : ""} ${settings.keyboard ? "keyboard-mode" : ""}`}
    >
      <header className="header">
        <a className="brand" href="/" aria-label="Scientific calculator home">
          <Calculator size={21} strokeWidth={1.6} />
          <span>scientific</span>
        </a>
        <span className="header-caption">A little room to think.</span>
      </header>
      <main className="main">
        <div className={`page-heading ${headerOverlap ? "has-overlap" : ""}`}>
          <span>SCIENTIFIC CALCULATOR</span>
          <div className="worksheet-controls">
            {(window as Window & { calculatorBrowse?: () => void }).calculatorBrowse && !renaming ? (
              <>
                <button className="worksheet-title" aria-label="Rename worksheet"
                  onClick={() => { setWorksheetName(worksheets.find((w) => w.id === worksheetId)?.name || "Worksheet"); setRenaming(true); }}>
                  {worksheets.find((w) => w.id === worksheetId)?.name || "Worksheet"}
                </button>
                <button aria-label="Open worksheet files" title="Open, create, or switch worksheets"
                  onClick={() => (window as Window & { calculatorBrowse?: () => void }).calculatorBrowse?.()}><Plus size={16} /></button>
              </>
            ) : renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  renameWorksheet();
                }}
              >
                <input
                  autoFocus
                  aria-label="Worksheet name"
                  maxLength={80}
                  value={worksheetName}
                  onChange={(e) => setWorksheetName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                />
                <button type="submit" aria-label="Save worksheet name">
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel rename"
                  onClick={() => setRenaming(false)}
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <>
                <select
                  aria-label="Current worksheet"
                  value={worksheetId}
                  onChange={(e) => changeWorksheet(e.target.value)}
                >
                  {worksheets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setWorksheetName(
                      worksheets.find((w) => w.id === worksheetId)!.name,
                    );
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
                <button
                  aria-label="New worksheet"
                  onClick={() => {
                    const w = {
                      id: crypto.randomUUID(),
                      name: `Worksheet ${worksheets.length + 1}`,
                      rows: [newRow()],
                    };
                    changeWorksheet(w.id, w);
                  }}
                >
                  <Plus size={14} />
                </button>
              </>
            )}
          </div>
        </div>
        <section className="calculator" aria-label="Scientific calculator">
          <div
            className="expression-list"
            ref={expressionList}
            aria-label="Expression history"
          >
            <div className="expression-spacer" />
            {rows.map((row, index) => (
              <div
                key={row.id}
                data-filled={!!row.latex.trim()}
                className={`expression-row ${active === row.id ? "active" : ""}`}
                onClick={() => focus(row.id)}
              >
                <span className="row-number">{index + 1}</span>
                <div className="expression-content">
                  <Editor
                    id={row.id}
                    index={index}
                    restoreToken={restoreToken}
                    latex={row.latex}
                    register={register}
                    onChange={(value) => {
                      if (
                        currentRows.current.find((r) => r.id === row.id)
                          ?.latex === value
                      )
                        return;
                      commit(
                        currentRows.current.map((r) =>
                          r.id === row.id ? { ...r, latex: value } : r,
                        ),
                        row.id,
                      );
                    }}
                    onFocus={() => setActive(row.id)}
                    onEnter={() => add(row.id)}
                    onNavigate={(d) => {
                      const next = rows[index + d];
                      if (next) focus(next.id);
                      else focus(row.id);
                    }}
                  />
                  {row.latex && results[row.id] && (
                    <div
                      className={`result ${results[row.id].error ? "error" : ""}`}
                      aria-live="polite"
                    >
                      {results[row.id].error ? (
                        <>
                          <span className="error-dot">!</span>
                          {results[row.id].error}
                        </>
                      ) : (
                        <>
                          <span className="equals">
                            {results[row.id].definition ? (
                              <Check size={13} />
                            ) : (
                              "="
                            )}
                          </span>
                          <CopyResult text={results[row.id].text || ""}>
                          {results[row.id].latex ? (
                            <span
                              className="symbolic-result"
                              aria-label={results[row.id].text}
                              dangerouslySetInnerHTML={{
                                __html: convertLatexToMarkup(
                                  results[row.id].latex!,
                                ),
                              }}
                            />
                          ) : (
                            <span>{results[row.id].text}</span>
                          )}
                          </CopyResult>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {row.latex && (
                  <button
                    className="remove-row"
                    aria-label={`Remove expression ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(row.id);
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="controls">
            <button
              className="keyboard-mode-toggle"
              aria-label="Keyboard mode"
              aria-pressed={!!settings.keyboard}
              title="Toggle keyboard mode"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setSettings({ ...settings, keyboard: !settings.keyboard });
                focus(active);
              }}
            >
              <Keyboard size={16} />
            </button>
            {!settings.keyboard && (
              <div className="tabs" role="tablist" aria-label="Keypad tabs">
                {(["main", "abc", "func"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? "selected" : ""}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="angle" data-angle={settings.angle} role="group" aria-label="Angle mode">
              {(["rad", "deg"] as const).map((a) => (
                <button
                  key={a}
                  aria-pressed={settings.angle === a}
                  className={settings.angle === a ? "selected" : ""}
                  onClick={() => setSettings({ ...settings, angle: a })}
                >
                  {a.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="calculator-options">
              <button className="options-button" aria-label="Calculator options" aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen(!optionsOpen)}><Settings2 size={18} /></button>
              {optionsOpen && <>
                <button className="options-dismiss" aria-label="Close calculator options" onClick={() => setOptionsOpen(false)} />
                <div className="options-popover" role="region" aria-label="Calculator options"
                  onKeyDown={(event) => { if (event.key === "Escape") setOptionsOpen(false); }}>
                  <label className="precision-control">
                    <span>Significant figures</span>
                    <select aria-label="Significant figures" value={settings.significantFigures || 12}
                      onChange={(event) => setSettings({ ...settings, significantFigures: Number(event.target.value) })}>
                      {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button className="options-help" onClick={() => { setOptionsOpen(false); setHelp(true); }}>
                    <CircleHelp size={16} /> Help & features
                  </button>
                </div>
              </>}
            </div>
            <div className="history-controls">
              <button
                aria-label="Undo"
                disabled={cursor.current === 0}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => undo(-1)}
              >
                <Undo2 size={19} />
              </button>
              <button
                aria-label="Redo"
                disabled={cursor.current === history.current.length - 1}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => undo(1)}
              >
                <Redo2 size={19} />
              </button>
            </div>
            <button
              className="clear"
              disabled={rows.length === 1 && !rows[0].latex}
              onClick={clear}
            >
              clear
            </button>
          </div>
          {!settings.keyboard && (
            <Keypad tab={tab} shift={shift} onAction={action} />
          )}
        </section>
        <div className="under-calculator">
          <span className={`status-dot ${busy ? "working" : ""}`} />
          <span>{busy ? "Calculating…" : "Saved on this device"}</span>
        </div>
      </main>
      <footer>
        <span>Made for working things out.</span>
      </footer>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            ref={helpPanel}
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-help"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">A QUICK GUIDE</span>
            <h1 id="help-title">Make room for the math.</h1>
            <p>
              Type an expression or use the keypad. Results update as you go.
            </p>
            <dl>
              <dt>Enter</dt>
              <dd>Insert a row below the current expression; empty rows stay put</dd>
              <dt>↑ / ↓</dt>
              <dd>Move between expressions</dd>
              <dt>⌘ / Ctrl + Z</dt>
              <dd>Undo; add Shift to redo</dd>
              <dt>ans</dt>
              <dd>Use the preceding successful numeric answer</dd>
            </dl>
            <div className="help-examples">
              <strong>A few things to try</strong>
              <code>a = 5</code>
              <code>f(x) = x² + a</code>
              <code>f(3)</code>
              <code>mean([2, 4, 6])</code>
              <code>f′(x), f′′(x), f′(x=5)</code>
              <code>f(x) / f′(x)</code>
            </div>
            <p className="help-note">
              Use arithmetic, fractions, roots, powers, percentages, logarithms,
              trig functions, factorials, permutations, combinations, lists, mean,
              and sample or population standard deviation. Definitions work throughout
              the worksheet. DEG and RAD control numerical trig calculations; symbolic
              calculus uses radians. Complex numbers are always supported.
            </p>
            <p className="help-note">
              Type Greek names (alpha, ALPHA) for symbols, or a letter followed by
              digits for subscripts. Type sqrt, sum, integral, or derivative for math
              templates. Repeated apostrophes create higher derivatives. General
              derivatives and supported antiderivatives return formulas; definite
              integrals and derivative templates at a point use numerical evaluation.
            </p>
            <p className="help-note">
              Click a result to copy it. Keyboard mode hides the keypad. Options let
              you choose 1–15 displayed significant figures without reducing calculation
              precision. Rename, create, and switch worksheets above; everything saves
              locally and works offline.
            </p>
            <button
              className="help-done"
              onClick={() => {
                setHelp(false);
                focusMathfield(fields.current.get(active));
              }}
            >
              Got it
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
