import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  CornerDownLeft,
  ArrowUp,
} from "lucide-react";
export type KeyAction = {
  latex?: string;
  command?: "left" | "right" | "delete" | "enter" | "shift";
};
interface Key {
  label: ReactNode;
  name: string;
  latex?: string;
  command?: KeyAction["command"];
  className?: string;
}
const key = (
  label: ReactNode,
  name: string,
  latex: string,
  className = "",
): Key => ({ label, name, latex, className });
const power = (
  <span className="math-key">
    a<sup>b</sup>
  </span>
);
const root = <span className="math-key root">√</span>;
const nthRoot = (
  <span className="math-key">
    <sup className="root-index">n</sup>√
  </span>
);
const arrowLeft: Key = {
  label: <ArrowLeft size={18} />,
  name: "Move cursor left",
  command: "left",
  className: "utility",
};
const arrowRight: Key = {
  label: <ArrowRight size={18} />,
  name: "Move cursor right",
  command: "right",
  className: "utility",
};
const backspace: Key = {
  label: <Delete size={19} />,
  name: "Backspace",
  command: "delete",
  className: "utility backspace",
};
const enter: Key = {
  label: <CornerDownLeft size={23} />,
  name: "Enter",
  command: "enter",
  className: "enter",
};
const main: Key[] = [
  key(
    <span className="math-key">
      a<sup>2</sup>
    </span>,
    "Squared",
    "^{2}",
  ),
  key(power, "Power", "^{#0}"),
  key(
    <span className="math-key">|a|</span>,
    "Absolute value",
    "\\left|#0\\right|",
  ),
  ...["7", "8", "9"].map((n) => key(n, n, n, "number")),
  key("÷", "Divide", "\\frac{#@}{#0}"),
  key("%", "Percent", "\\%"),
  key(
    <span className="fraction">
      <i>a</i>
      <i>b</i>
    </span>,
    "Fraction",
    "\\frac{#0}{#1}",
  ),
  key(root, "Square root", "\\sqrt{#0}"),
  key(nthRoot, "Nth root", "\\sqrt[#0]{#1}"),
  key("π", "Pi", "\\pi"),
  ...["4", "5", "6"].map((n) => key(n, n, n, "number")),
  key("×", "Multiply", "\\times"),
  arrowLeft,
  arrowRight,
  key("sin", "Sine", "\\sin\\left(#0\\right)"),
  key("cos", "Cosine", "\\cos\\left(#0\\right)"),
  key("tan", "Tangent", "\\tan\\left(#0\\right)"),
  ...["1", "2", "3"].map((n) => key(n, n, n, "number")),
  key("−", "Subtract", "-"),
  backspace,
  key("(", "Left parenthesis", "("),
  key(")", "Right parenthesis", ")"),
  key(",", "Comma", ","),
  key("0", "0", "0", "number"),
  key(".", "Decimal", ".", "number"),
  key("ans", "Previous answer", "\\operatorname{ans}"),
  key("+", "Add", "+"),
  enter,
];
const func: Key[] = [
  key("sin", "Sine", "\\sin(#0)"),
  key("cos", "Cosine", "\\cos(#0)"),
  key("tan", "Tangent", "\\tan(#0)"),
  key(power, "Power", "^{#0}"),
  key(root, "Square root", "\\sqrt{#0}"),
  key(nthRoot, "Nth root", "\\sqrt[#0]{#1}"),
  ...["sin", "cos", "tan"].map((n) =>
    key(
      <span>
        {n}
        <sup>−1</sup>
      </span>,
      `Inverse ${n}`,
      `\\${n}^{-1}(#0)`,
    ),
  ),
  key(
    <span className="math-key">
      e<sup>x</sup>
    </span>,
    "Exponential",
    "e^{#0}",
  ),
  key("|a|", "Absolute value", "\\left|#0\\right|"),
  key("round", "Round", "\\operatorname{round}(#0)"),
  key("mean", "Mean", "\\operatorname{mean}(#0)"),
  key("stdev", "Sample standard deviation", "\\operatorname{stdev}(#0)"),
  key("stdevp", "Population standard deviation", "\\operatorname{stdevp}(#0)"),
  key("ln", "Natural logarithm", "\\ln(#0)"),
  key("log", "Logarithm base ten", "\\log(#0)"),
  { ...backspace, className: "utility" },
  key("nPr", "Permutations", "\\operatorname{nPr}(#0,#1)"),
  key("nCr", "Combinations", "\\operatorname{nCr}(#0,#1)"),
  key("!", "Factorial", "!"),
  key("e", "Euler’s number", "e"),
  key("π", "Pi", "\\pi"),
  { ...enter, className: "enter" },
];
export function Keypad({
  tab,
  shift,
  keyboard = false,
  onAction,
}: {
  tab: "main" | "abc" | "func";
  shift: boolean;
  keyboard?: boolean;
  onAction: (a: KeyAction) => void;
}) {
  const abc: Key[] = [
    ..."qwertyuiop"
      .split("")
      .map((c) =>
        key(shift ? c.toUpperCase() : c, c, shift ? c.toUpperCase() : c),
      ),
    ..."asdfghjkl"
      .split("")
      .map((c) =>
        key(shift ? c.toUpperCase() : c, c, shift ? c.toUpperCase() : c),
      ),
    key("=", "Equals", "="),
    ..."zxcvbnm"
      .split("")
      .map((c) =>
        key(shift ? c.toUpperCase() : c, c, shift ? c.toUpperCase() : c),
      ),
    key(",", "Comma", ","),
    { ...backspace, className: "utility abc-backspace" },
    {
      label: <ArrowUp size={19} />,
      name: "Shift",
      command: "shift",
      className: shift ? "utility shifted" : "utility",
    },
    key("(", "Left parenthesis", "("),
    key(")", "Right parenthesis", ")"),
    key("[", "Left bracket", "["),
    key("]", "Right bracket", "]"),
    key("!", "Factorial", "!"),
    key("'", "Prime", "'"),
    key("π", "Pi", "\\pi"),
    { ...enter, className: "enter abc-enter" },
  ];
  const templates = [
    key(
      <span className="math-key">∑</span>,
      "Summation",
      "\\sum_{n=#0}^{#1}\\left(#2\\right)",
    ),
    key(
      <span className="math-key">∫</span>,
      "Indefinite integral",
      "\\int\\left(#0\\right)\\,dx",
    ),
    key(
      <span className="fraction">
        <i>d</i>
        <i>dx</i>
      </span>,
      "Derivative",
      "\\frac{d}{dx}\\left(#0\\right)",
    ),
    key(
      <span className="math-key">∫</span>,
      "Definite integral",
      "\\int_{#0}^{#1}\\left(#2\\right)\\,dx",
    ),
    key(
      <span className="fraction">
        <i>d</i>
        <i>dx</i>
      </span>,
      "Derivative at a point",
      "\\frac{d}{dx}\\left(#0\\right)\\big|_{x=#1}",
    ),
  ];
  const keys = keyboard
    ? templates
    : tab === "main"
      ? main
      : tab === "func"
        ? func
        : abc;
  return (
    <div
      className={`keypad keypad-${keyboard ? "compact" : tab}`}
      aria-label={keyboard ? "Math templates" : `${tab} keypad`}
    >
      {keys.map((k, i) => (
        <button
          key={i}
          type="button"
          className={`key ${k.className || ""}`}
          aria-label={k.name}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onAction(k)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
