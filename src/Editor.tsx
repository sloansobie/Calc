import { flattenPrimes } from "./primes";
import { useEffect, useLayoutEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import { numberedVariables } from "./subscripts";
import { greekShortcuts } from "./greek";
MathfieldElement.fontsDirectory = "/fonts";
MathfieldElement.soundsDirectory = null;
const scientificShortcuts = {
  ...greekShortcuts,
  sum: "\\sum_{n=1}^{\\placeholder{}}\\left(\\placeholder{}\\right)",
  integral: "\\int\\left(#0\\right)\\,dx",
  derivative: "\\frac{d}{dx}\\left(#0\\right)",
  derviative: "\\frac{d}{dx}\\left(#0\\right)",
  sin: "\\sin",
  cos: "\\cos",
  tan: "\\tan",
  asin: "\\arcsin",
  acos: "\\arccos",
  atan: "\\arctan",
  ln: "\\ln",
  log: "\\log",
  pi: "\\pi",
  sqrt: "\\sqrt{#0}",
  ...Object.fromEntries(
    ["ans", "mean", "stdev", "stdevp", "round", "nPr", "nCr", "exp"].map(
      (name) => [name, `\\operatorname{${name}}`],
    ),
  ),
};
interface Props {
  id: string;
  latex: string;
  index: number;
  restoreToken?: number;
  onChange: (value: string) => void;
  onFocus: () => void;
  onEnter: () => void;
  onNavigate: (direction: number) => void;
  register: (
    id: string,
    field: MathfieldElement | null,
    reset?: () => void,
  ) => void;
}
export function Editor({
  id,
  latex,
  index,
  restoreToken = 0,
  onChange,
  onFocus,
  onEnter,
  onNavigate,
  register,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    field = useRef<MathfieldElement | null>(null);
  const callbacks = useRef({ onChange, onFocus, onEnter, onNavigate });
  const lastRestoreToken = useRef(restoreToken);
  callbacks.current = { onChange, onFocus, onEnter, onNavigate };
  useLayoutEffect(() => {
    function mount(value: string) {
      const mf = new MathfieldElement();
      let numbered:
        | { start: number; end: number; base: string; digits: string }
        | undefined;
      let primes: { start: number; end: number; base: string; count: number } | undefined;
      field.current = mf;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.smartFence = true;
      mf.letterShapeStyle = "upright";
      mf.setAttribute("aria-label", `Expression ${index + 1}`);
      const normalized = flattenPrimes(numberedVariables(value));
      mf.value = normalized;
      if (normalized !== value)
        queueMicrotask(() => {
          if (field.current === mf) callbacks.current.onChange(normalized);
        });
      mf.addEventListener("input", () => callbacks.current.onChange(mf.value));
      mf.addEventListener("focus", () => callbacks.current.onFocus());
      const reset = () => {
        if (!host.current?.isConnected || field.current !== mf) return;
        const currentValue = mf.value,
          selection = mf.selection;
        mf.remove();
        const replacement = mount(currentValue);
        replacement.selection = selection;
      };
      mf.addEventListener(
        "keydown",
        (event: KeyboardEvent) => {
          if ((event.key === ")" || event.key === "]") &&
              !event.metaKey && !event.ctrlKey &&
              mf.selection.ranges.every(([a, b]) => a === b)) {
            const position = mf.position;
            const prefix = mf.getValue(0, position);
            const opening = event.key === ")" ? "(" : "[";
            const balance = [...prefix].reduce((count, char) =>
              count + (char === opening ? 1 : char === event.key ? -1 : 0), 0);
            if (prefix.trim() && balance === 0) {
              event.preventDefault();
              event.stopImmediatePropagation();
              mf.selection = { ranges: [[0, position]] };
              mf.insert(`\\left${opening}${prefix}\\right${event.key}`, { selectionMode: "after" });
              primes = undefined;
              numbered = undefined;
              return;
            }
          }
          if (event.key === "'" && !event.metaKey && !event.ctrlKey &&
              mf.selection.ranges.every(([a, b]) => a === b)) {
            const position = mf.position;
            const previous = mf.getValue(position - 1, position);
            if (primes && position === primes.end || /^[a-zA-Z]$/.test(previous)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              if (!primes || position !== primes.end)
                primes = { start: position - 1, end: position, base: previous, count: 0 };
              primes.count++;
              mf.selection = { ranges: [[primes.start, primes.end]] };
              mf.insert(`${primes.base}^{${"\\prime".repeat(primes.count)}}`, { selectionMode: "after" });
              primes.end = mf.position;
              return;
            }
          }
          primes = undefined;
          if (
            /^\d$/.test(event.key) &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            mf.selection.ranges.every(([a, b]) => a === b)
          ) {
            const position = mf.position;
            if (numbered && position === numbered.end) {
              event.preventDefault();
              event.stopImmediatePropagation();
              numbered.digits += event.key;
              mf.selection = { ranges: [[numbered.start, numbered.end]] };
              mf.insert(`${numbered.base}_{${numbered.digits}}`, {
                selectionMode: "after",
              });
              numbered.end = mf.position;
              return;
            }
            const previous = mf.getValue(position - 1, position);
            const prefix = mf.getValue(0, position);
            const isFunction =
              /\\(?:sin|cos|tan|arcsin|arccos|arctan|ln|log)\s*\d*$/.test(
                prefix,
              );
            if (
              !isFunction &&
              (/^[\p{L}]$/u.test(previous) ||
                /^\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|rho|sigma|tau|upsilon|phi|chi|psi|omega)$/.test(
                  previous,
                ))
            ) {
              event.preventDefault();
              event.stopImmediatePropagation();
              mf.selection = { ranges: [[position - 1, position]] };
              mf.insert(`${previous}_{${event.key}}`, {
                selectionMode: "after",
              });
              numbered = {
                start: position - 1,
                end: mf.position,
                base: previous,
                digits: event.key,
              };
              return;
            }
          }
          numbered = undefined;
          const navigating =
            (event.key === "ArrowUp" || event.key === "ArrowDown") &&
            !event.shiftKey;
          if (event.key !== "Enter" && !navigating) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (navigating) {
            const selected = mf.getValue(mf.selection.ranges[0][0], mf.selection.ranges[0][1]);
            if (event.key === "ArrowDown" && /\\(?:d?frac|tfrac)/.test(selected) && /\\placeholder/.test(selected)) {
              mf.executeCommand("moveToNextPlaceholder");
              return;
            }
            let movedOut = false;
            const boundary = (out: Event) => { movedOut = true; out.preventDefault(); };
            mf.addEventListener("move-out", boundary);
            mf.executeCommand(event.key === "ArrowDown" ? "moveDown" : "moveUp");
            mf.removeEventListener("move-out", boundary);
            if (!movedOut) return;
          }
          const value = mf.value;
          const direction = event.key === "ArrowUp" ? -1 : 1;
          const entering = event.key === "Enter";
          // Finish the native keyboard event before disposing its focused editor.
          // WebKit can otherwise fail while updating the text input context.
          // The handoff still precedes the next key and cancels stale focus timers.
          queueMicrotask(() => {
            if (!host.current?.isConnected || field.current !== mf) return;
            callbacks.current.onChange(value);
            reset();
            if (entering) callbacks.current.onEnter();
            else callbacks.current.onNavigate(direction);
          });
        },
        { capture: true },
      );
      host.current!.append(mf);
      const typography = document.createElement("style");
      typography.textContent = `.ML__cmr, .ML__mathit, .ML__sans, .ML__text {
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif !important;
        font-style: normal !important;
      }`;
      mf.shadowRoot?.append(typography);
      mf.inlineShortcuts = scientificShortcuts;
      mf.onInlineShortcut = (_sender, candidate) => {
        const beforeCursor = mf.getValue(0, mf.position);
        if (
          /\\(?:sin|cos|tan|arcsin|arccos|arctan|ln|log)\s*\d*$/.test(
            beforeCursor,
          )
        )
          return "";
        const match = candidate.match(/^([a-zA-Z])(\d+)$/);
        return match ? `${match[1]}_{${match[2]}}` : "";
      };
      register(id, mf, reset);
      return mf;
    }
    mount(latex);
    return () => {
      register(id, null);
      field.current?.remove();
    };
  }, [id]);
  useEffect(() => {
    // Ordinary typing already updates MathLive synchronously. Reapplying a lagging
    // React value can erase the last key just before Enter; only restore on undo.
    if (lastRestoreToken.current === restoreToken) return;
    lastRestoreToken.current = restoreToken;
    if (field.current && field.current.value !== latex)
      field.current.setValue(latex, { silenceNotifications: true });
  }, [latex, restoreToken]);
  return <div className="math-host" ref={host} />;
}
