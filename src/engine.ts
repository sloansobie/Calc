import { all, create, type MathNode } from "mathjs";
import nerdamer from "nerdamer/all.js";
import { normalizeGreek } from "./greek";
export interface Row {
  id: string;
  latex: string;
}
export interface Settings {
  angle: "deg" | "rad";
  large: boolean;
  contrast: boolean;
  complex: boolean;
  keyboard?: boolean;
  significantFigures?: number;
}
export interface Result {
  text?: string;
  error?: string;
  definition?: boolean;
  latex?: string;
}
const math = create(all, { number: "number", predictable: false });

const calculusNames = new Set([
  "calcSum",
  "calcIntegral",
  "calcDerivative",
  "symbolicDerivative",
  "symbolicIntegral",
  "symbolicExpression",
]);
function calculusNotation(input: string): string | undefined {
  let text = input
    .trim()
    .replace(/\\(?:left|right|big|Big)\b/g, "")
    .replace(/\\[,;! ]/g, " ");
  let kind: string;
  if (text.startsWith("\\sum")) {
    kind = "calcSum";
    text = text.slice(4);
  } else if (text.startsWith("\\int")) {
    kind = "calcIntegral";
    text = text.slice(4);
  } else if (text.startsWith("\\frac{d}{dx}")) {
    kind = "calcDerivative";
    text = text.slice(12);
  } else return undefined;
  function take(open: string, close: string): string {
    text = text.trimStart();
    if (!text.startsWith(open))
      throw new Error("Complete the calculus template");
    let depth = 0;
    for (let j = 0; j < text.length; j++) {
      if (text[j] === open) depth++;
      if (text[j] === close && --depth === 0) {
        const value = text.slice(1, j);
        text = text.slice(j + 1);
        return value;
      }
    }
    throw new Error("Complete the calculus template");
  }
  function bound(mark: string): string {
    text = text.trimStart();
    if (!text.startsWith(mark)) throw new Error("Complete the calculus bounds");
    text = text.slice(1).trimStart();
    if (!text.startsWith("{")) {
      const value = text[0];
      if (!value) throw new Error("Complete the calculus bounds");
      text = text.slice(1);
      return value;
    }
    return take("{", "}");
  }
  let variable = "x",
    lower = "",
    upper = "";
  if (kind === "calcIntegral" && !text.trimStart().startsWith("_"))
    kind = "symbolicIntegral";
  if (kind !== "calcDerivative" && kind !== "symbolicIntegral") {
    lower = bound("_");
    upper = bound("^");
    if (kind === "calcSum") {
      const match = lower.match(/^\s*([\p{L}][\p{L}\d_]*)\s*=(.+)$/u);
      if (!match) throw new Error("Use an index and lower bound, such as n=1");
      variable = match[1];
      lower = match[2];
    }
  }
  const body = take("(", ")");
  if (kind === "calcIntegral" || kind === "symbolicIntegral") {
    const match = text.trim().match(/^d\s*([\p{L}][\p{L}\d_]*)$/u);
    if (!match) throw new Error("Complete the integral differential");
    variable = match[1];
  } else if (kind === "calcDerivative") {
    text = text.trimStart();
    if (!text) kind = "symbolicDerivative";
    else {
      if (!text.startsWith("|"))
        throw new Error("Complete the derivative evaluation point");
      text = text.slice(1);
      const point = bound("_").match(/^\s*x\s*=(.+)$/);
      if (!point || text.trim())
        throw new Error("Specify x at the evaluation point");
      lower = point[1];
    }
  } else if (text.trim())
    throw new Error("Put the whole summand inside the parentheses");
  const source = fromLatex(body);
  if (kind.startsWith("symbolic"))
    return `${kind}(${JSON.stringify(source)},${JSON.stringify(variable)})`;
  return `${kind}(${JSON.stringify(source)},${JSON.stringify(variable)},(${fromLatex(lower)})${upper ? `,(${fromLatex(upper)})` : ""})`;
}

/** Translate mathematical editing syntax before parsing it into a math.js AST. */
export function fromLatex(input: string): string {
  if (/\\placeholder/.test(input)) throw new Error("Complete the expression");
  const primeInput = input.trim().replace(/\\(?:left|right)/g, "");
  const prime = primeInput.match(
    /^([a-zA-Z][a-zA-Z0-9_]*)\s*((?:'|′|\\prime|\^\{(?:\\prime\s*)+\}|\^\\prime)+)\s*\((.+)\)$/,
  );
  if (prime) {
    const order = (prime[2].match(/'|′|\\prime/g) || []).length;
    if (order > 10) throw new Error("Derivative order must be at most 10");
    const argument = prime[3].trim();
    if (/^[a-zA-Z]$/.test(argument))
      return `symbolicDerivative(${JSON.stringify(`${prime[1]}(${argument})`)},${JSON.stringify(argument)},${order})`;
    const point = argument.match(/^([a-zA-Z])\s*=(.+)$/);
    const variable = point?.[1] || "x";
    return `symbolicDerivative(${JSON.stringify(`${prime[1]}(${variable})`)},${JSON.stringify(variable)},${order},(${fromLatex(point?.[2] || argument)}))`;
  }
  const embedded = primeInput.replace(
    /([a-zA-Z][a-zA-Z0-9_]*)\s*((?:'|′|\\prime|\^\{(?:\\prime\s*)+\}|\^\\prime)+)\s*\(([a-zA-Z])\)/g,
    (_, name, marks, variable) => `primeDerivative(${name}(${variable}),${variable},${(marks.match(/'|′|\\prime/g) || []).length})`,
  );
  if (embedded !== primeInput)
    return `symbolicExpression(${JSON.stringify(fromLatex(embedded))},"x")`;
  const calculus = calculusNotation(input);
  if (calculus) return calculus;
  // MathLive nests upright identifiers inside operator names when exporting LaTeX.
  let normalized = normalizeGreek(input);
  while (/\\(?:operatorname|mathrm|text)\{([^{}]*)\}/.test(normalized)) {
    normalized = normalized.replace(
      /\\(?:operatorname|mathrm|text)\{([^{}]*)\}/g,
      "$1",
    );
  }
  let s = normalized
    .replace(/\\left\|/g, "abs(")
    .replace(/\\right\|/g, ")")
    .replace(/\\(?:left|right|displaystyle|textstyle)\b/g, "")
    .replace(/\\[,;! ]/g, " ")
    .replace(/_\{([a-zA-Z0-9]+)\}/g, "_$1")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi/g, " pi ")
    .replace(/\\%/g, "%")
    .replace(/\\(?:operatorname|mathrm|text)\{([^{}]*)\}/g, "$1")
    .replace(/\\(sin|cos|tan)\s*\^\s*(?:\{\s*-1\s*\}|-1(?!\d))/g, "a$1 ")
    .replace(
      /\\(sin|cos|tan|arcsin|arccos|arctan|ln|log|exp)(?![a-zA-Z])/g,
      "$1 ",
    )
    .replace(/\barcsin\b/g, "asin")
    .replace(/\barccos\b/g, "acos")
    .replace(/\barctan\b/g, "atan");
  let i = 0;
  function group(): string {
    while (s[i] === " ") i++;
    if (s[i] !== "{") throw new Error("Complete the expression");
    i++;
    const out = scan("}");
    if (s[i] !== "}") throw new Error("Complete the expression");
    i++;
    return out;
  }
  function argument(): string {
    while (s[i] === " ") i++;
    if (s[i] === "{") return group();
    const command = readCommand();
    if (command !== undefined) return command;
    if (s.startsWith("pi", i)) {
      i += 2;
      return "pi";
    }
    if (!s[i] || /[}()\[\]\\]/.test(s[i]))
      throw new Error("Complete the expression");
    return s[i++];
  }
  function readCommand(): string | undefined {
    if (
      s.startsWith("\\frac", i) ||
      s.startsWith("\\dfrac", i) ||
      s.startsWith("\\tfrac", i)
    ) {
      i += s.startsWith("\\frac", i) ? 5 : 6;
      const a = argument(),
        b = argument();
      return `((${a})/(${b}))`;
    }
    if (s.startsWith("\\sqrt", i)) {
      i += 5;
      let n = "2";
      if (s[i] === "[") {
        i++;
        n = scan("]");
        if (s[i++] !== "]") throw new Error("Complete the root");
      }
      return `nthRoot((${argument()}),(${n}))`;
    }
    return undefined;
  }
  function scan(end?: string): string {
    let out = "";
    while (i < s.length && s[i] !== end) {
      const command = readCommand();
      if (command !== undefined) out += command;
      else if (s[i] === "{") out += `(${group()})`;
      else if (s[i] === "%") {
        const start = operandStart(out, out.length);
        out = `${out.slice(0, start)}((${out.slice(start)})/100)`;
        i++;
      } else if (s[i] === "\\") throw new Error("Unsupported notation");
      else out += s[i++];
    }
    return out;
  }
  s = scan();
  // Mathematical bars are absolute values, including nested parenthesized inputs.
  let bar = false;
  s = s.replace(/\|/g, () => {
    bar = !bar;
    return bar ? "abs(" : ")";
  });
  if (bar) throw new Error("Complete the absolute value");
  s = s
    .replace(/\bln\b/g, "naturalLog")
    .replace(/\blog\b/g, "log10")
    .replace(/\bnaturalLog\b/g, "log");
  s = s.replace(
    /\b(sin|cos|tan|asin|acos|atan|log10|log|exp)\s+([\d.]+|pi|e|[\p{L}])/gu,
    "$1($2)",
  );
  if (!s.trim()) throw new Error("Complete the expression");
  return s;
}
function operandStart(s: string, end: number): number {
  let i = end - 1;
  while (s[i] === " ") i--;
  if (s[i] === "!") return operandStart(s, i);
  let start: number;
  if (s[i] === ")" || s[i] === "]") {
    const close = s[i],
      open = close === ")" ? "(" : "[";
    let depth = 1;
    while (i > 0 && depth) {
      i--;
      if (s[i] === close) depth++;
      else if (s[i] === open) depth--;
    }
    if (depth) throw new Error("Complete the expression");
    start = i;
    const name = s.slice(0, i).match(/[a-zA-Z][a-zA-Z0-9_]*\s*$/);
    if (name) start = name.index!;
  } else {
    const atom = s
      .slice(0, i + 1)
      .match(/(?:\d*\.?\d+(?:e[+-]?\d+)?|[a-zA-Z][a-zA-Z0-9_]*)$/);
    if (!atom) throw new Error("Enter a value before percent");
    start = atom.index!;
  }
  let before = start - 1;
  while (s[before] === " ") before--;
  return s[before] === "^" ? operandStart(s, before) : start;
}
const builtins = new Set([
  "pi",
  "e",
  "i",
  "ans",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sqrt",
  "nthRoot",
  "abs",
  "log",
  "log10",
  "exp",
  "round",
  "mean",
  "stdev",
  "stdevp",
  "nPr",
  "nCr",
  "factorial",
  ...calculusNames,
]);
function checkAst(node: MathNode) {
  node.traverse((n) => {
    if (
      ![
        "OperatorNode",
        "ConstantNode",
        "SymbolNode",
        "ParenthesisNode",
        "FunctionNode",
        "AssignmentNode",
        "FunctionAssignmentNode",
        "ArrayNode",
      ].includes(n.type)
    )
      throw new Error("Unsupported expression");
    if (n.type === "FunctionNode" && (n as any).fn.type !== "SymbolNode")
      throw new Error("Unsupported function");
  });
}
function hasComplex(v: any): boolean {
  if (math.isComplex(v)) return Math.abs(v.im) > 1e-12;
  if (Array.isArray(v)) return v.some(hasComplex);
  if (v && typeof v.toArray === "function") return hasComplex(v.toArray());
  return false;
}
function finite(v: any): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (math.isComplex(v)) return Number.isFinite(v.re) && Number.isFinite(v.im);
  if (Array.isArray(v)) return v.every(finite);
  if (v && typeof v.toArray === "function") return finite(v.toArray());
  return true;
}
export function evaluateWorksheet(
  rows: Row[],
  settings: Settings,
): Record<string, Result> {
  const scope = new Map<string, any>();
  const trig = ["sin", "cos", "tan"] as const;
  trig.forEach((name) =>
    scope.set(name, (x: any) => {
      const quarterTurns =
        typeof x === "number"
          ? x / (settings.angle === "deg" ? 90 : Math.PI / 2)
          : NaN;
      if (Number.isInteger(quarterTurns)) {
        const quadrant = ((quarterTurns % 4) + 4) % 4;
        if (name === "sin") return [0, 1, 0, -1][quadrant];
        if (name === "cos") return [1, 0, -1, 0][quadrant];
        if (quadrant % 2) throw new Error("Tangent is undefined at this angle");
        return 0;
      }
      return math[name](
        settings.angle === "deg" ? (math.multiply(x, Math.PI / 180) as any) : x,
      );
    }),
  );
  (["asin", "acos", "atan"] as const).forEach((name) =>
    scope.set(name, (x: any) => {
      const v = (math[name] as (x: any) => any)(x);
      return settings.angle === "deg" ? math.multiply(v, 180 / Math.PI) : v;
    }),
  );
  scope.set("nthRoot", (x: any, n: number) =>
    n === 2 ? math.sqrt(x) : math.nthRoot(x, n),
  );
  scope.set("stdev", (...xs: any[]) => {
    const data = xs.length === 1 && typeof xs[0] !== "number" ? xs[0] : xs;
    const dimensions = math.size(data).valueOf() as number[];
    if (dimensions.reduce((a, b) => a * b, 1) < 2)
      throw new Error("Sample standard deviation needs at least two values");
    return math.std(data, "unbiased");
  });
  scope.set("stdevp", (...xs: any[]) =>
    math.std(
      xs.length === 1 && typeof xs[0] !== "number" ? xs[0] : xs,
      "uncorrected",
    ),
  );
  scope.set("nPr", (n: number, r: number) => math.permutations(n, r));
  scope.set("nCr", (n: number, r: number) => math.combinations(n, r));
  function sampler(source: string, variable: string) {
    const node = math.parse(source);
    checkAst(node);
    const compiled = node.compile();
    return (x: number) => {
      const local = new Map(scope);
      local.set(variable, x);
      const value = compiled.evaluate(local);
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error("Calculus requires finite real values");
      return value;
    };
  }
  scope.set(
    "calcSum",
    (source: string, variable: string, a: number, b: number) => {
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b))
        throw new Error("Summation bounds must be integers");
      if (b - a > 100000)
        throw new Error("Summation is limited to 100,000 terms");
      const f = sampler(source, variable);
      let total = 0,
        correction = 0;
      for (let k = a; k <= b; k++) {
        const y = f(k) - correction;
        const next = total + y;
        correction = next - total - y;
        total = next;
      }
      return total;
    },
  );
  scope.set(
    "calcDerivative",
    (source: string, variable: string, point: number) => {
      if (!Number.isFinite(point))
        throw new Error("Use a finite evaluation point");
      const f = sampler(source, variable),
        h = Math.pow(Number.EPSILON, 1 / 5) * Math.max(1, Math.abs(point));
      return (
        (f(point - 2 * h) -
          8 * f(point - h) +
          8 * f(point + h) -
          f(point + 2 * h)) /
        (12 * h)
      );
    },
  );
  scope.set(
    "calcIntegral",
    (source: string, variable: string, a: number, b: number) => {
      if (!Number.isFinite(a) || !Number.isFinite(b))
        throw new Error("Use finite integral bounds");
      if (a === b) return 0;
      const f = sampler(source, variable);
      let count = 0;
      const sample = (x: number) => {
        if (++count > 20000) throw new Error("Integral did not converge");
        return f(x);
      };
      function integrate(
        lo: number,
        hi: number,
        fl: number,
        fm: number,
        fr: number,
        whole: number,
        tolerance: number,
        depth: number,
      ): number {
        const mid = (lo + hi) / 2,
          leftMid = sample((lo + mid) / 2),
          rightMid = sample((mid + hi) / 2);
        const left = ((mid - lo) * (fl + 4 * leftMid + fm)) / 6,
          right = ((hi - mid) * (fm + 4 * rightMid + fr)) / 6;
        const delta = left + right - whole;
        if (Math.abs(delta) <= 15 * tolerance) return left + right + delta / 15;
        if (depth === 0) throw new Error("Integral did not converge");
        return (
          integrate(lo, mid, fl, leftMid, fm, left, tolerance / 2, depth - 1) +
          integrate(mid, hi, fm, rightMid, fr, right, tolerance / 2, depth - 1)
        );
      }
      const fl = sample(a),
        fm = sample((a + b) / 2),
        fr = sample(b),
        whole = ((b - a) * (fl + 4 * fm + fr)) / 6;
      return integrate(
        a,
        b,
        fl,
        fm,
        fr,
        whole,
        1e-10 * Math.max(1, Math.abs(whole)),
        18,
      );
    },
  );
  const results: Record<string, Result> = {},
    nodes: (MathNode | undefined)[] = [],
    names = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (!row.latex.trim()) return;
    try {
      const node = math.parse(fromLatex(row.latex));
      checkAst(node);
      nodes[index] = node;
      if (
        node.type === "AssignmentNode" ||
        node.type === "FunctionAssignmentNode"
      ) {
        const name = (node as any).name;
        if (builtins.has(name)) throw new Error(`“${name}” is reserved`);
        names.set(name, [...(names.get(name) || []), index]);
      }
    } catch (e) {
      nodes[index] = undefined;
      results[row.id] = { error: message(e) };
    }
  });
  const state = new Map<number, "visiting" | "done">(),
    values = new Map<number, any>();
  function expandSymbolic(
    node: MathNode,
    substitutions: Map<string, MathNode>,
    visiting: Set<string>,
  ): MathNode {
    checkAst(node);
    return node.transform((child) => {
      const value = child as any;
      if (child.type === "SymbolNode") {
        if (substitutions.has(value.name))
          return substitutions.get(value.name)!;
        const indices = names.get(value.name);
        if (indices) {
          if (indices.length !== 1)
            throw new Error(`Duplicate definition: ${value.name}`);
          const definition = nodes[indices[0]] as any;
          if (definition.type === "AssignmentNode") {
            if (visiting.has(value.name))
              throw new Error("Circular dependency");
            return expandSymbolic(
              definition.value,
              substitutions,
              new Set([...visiting, value.name]),
            );
          }
        }
      }
      if (child.type === "FunctionNode") {
        if (value.fn.name === "primeDerivative") {
          const variable = value.args[1].name;
          const local = new Map(substitutions);
          local.set(variable, math.parse(variable));
          const body = expandSymbolic(value.args[0], local, visiting);
          return math.parse(nerdamer(`diff(${body.toString({ implicit: "show" })},${variable},${value.args[2].value})`).text());
        }
        const name = value.fn.name,
          args = value.args.map((arg: MathNode) =>
            expandSymbolic(arg, substitutions, visiting),
          );
        const indices = names.get(name);
        if (indices) {
          if (indices.length !== 1)
            throw new Error(`Duplicate definition: ${name}`);
          const definition = nodes[indices[0]] as any;
          if (definition.type !== "FunctionAssignmentNode")
            throw new Error(`${name} is not a function`);
          if (visiting.has(name)) throw new Error("Circular dependency");
          if (args.length !== definition.params.length)
            throw new Error(`Wrong number of arguments for ${name}`);
          const local = new Map(substitutions);
          definition.params.forEach((param: string, i: number) =>
            local.set(param, args[i]),
          );
          return expandSymbolic(
            definition.expr,
            local,
            new Set([...visiting, name]),
          );
        }
        if (!builtins.has(name)) throw new Error(`Undefined function: ${name}`);
        if (name === "nthRoot")
          return math.parse(
            `(${args[0].toString()})^(1/(${args[1].toString()}))`,
          );
        if (name === "log10")
          return math.parse(`log(${args[0].toString()})/log(10)`);
      }
      return child;
    });
  }
  function evaluate(index: number): any {
    if (state.get(index) === "visiting") throw new Error("Circular dependency");
    if (state.get(index) === "done") {
      if (results[rows[index].id]?.error)
        throw new Error(results[rows[index].id].error);
      return values.get(index);
    }
    if (!nodes[index]) return undefined;
    state.set(index, "visiting");
    try {
      const node = nodes[index]!;
      if (
        node.type === "FunctionNode" &&
        ["symbolicDerivative", "symbolicIntegral", "symbolicExpression"].includes(
          (node as any).fn.name,
        )
      ) {
        const [source, variable] = (node as any).args.map(
          (arg: any) => arg.value,
        );
        if (typeof source !== "string" || typeof variable !== "string")
          throw new Error("Invalid symbolic template");
        const symbolic = expandSymbolic(
          math.parse(source),
          new Map([[variable, math.parse(variable)]]),
          new Set(),
        );
        const operation =
          (node as any).fn.name === "symbolicExpression" ? "simplify" : (node as any).fn.name === "symbolicDerivative" ? "diff" : "integrate";
        const answer = nerdamer(
          operation === "simplify" ? `simplify(${symbolic.toString({ implicit: "show" })})` : `${operation}(${symbolic.toString({ implicit: "show" })},${variable}${operation === "diff" ? `,${(node as any).args[2]?.value || 1}` : ""})`,
        );
        if (/\b(?:integrate|diff)\(/.test(answer.text()))
          throw new Error(
            "A symbolic result could not be found for this expression",
          );
        const pointNode = (node as any).args[3];
        if (operation === "diff" && pointNode) {
          pointNode.traverse((n: any) => {
            if (n.type !== "SymbolNode") return;
            const dependency = names.get(n.name)?.[0];
            if (dependency !== undefined) evaluate(dependency);
          });
          const point = pointNode.compile().evaluate(scope);
          if (typeof point !== "number" || !Number.isFinite(point))
            throw new Error("Specify a finite derivative evaluation point");
          const local = new Map(scope);
          local.set(variable, point);
          for (const name of ["sin", "cos", "tan", "asin", "acos", "atan"])
            local.set(name, (math as any)[name]);
          const resultNode = math.parse(answer.text());
          checkAst(resultNode);
          const value = resultNode.compile().evaluate(local);
          results[rows[index].id] = { text: math.format(value, { precision: settings.significantFigures || 12 }) };
          values.set(index, value);
          state.set(index, "done");
          return value;
        }
        const constant = operation === "integrate";
        results[rows[index].id] = {
          text: answer.text() + (constant ? " + C" : ""),
          latex: answer.toTeX() + (constant ? " + C" : ""),
        };
        state.set(index, "done");
        return undefined;
      }
      const ownName = (node as any).name;
      if (ownName && (names.get(ownName)?.length || 0) > 1)
        throw new Error(`Duplicate definition: ${ownName}`);
      const params = new Set<string>((node as any).params || []),
        dependencies = new Set<string>();
      node.traverse((n, path) => {
        if (
          n.type === "SymbolNode" &&
          path !== "object" &&
          !params.has((n as any).name)
        )
          dependencies.add((n as any).name);
      });
      node.traverse((n) => {
        if (n.type !== "FunctionNode" || !calculusNames.has((n as any).fn.name))
          return;
        const [body, variable] = (n as any).args;
        if (
          typeof body?.value !== "string" ||
          typeof variable?.value !== "string"
        )
          throw new Error("Invalid calculus template");
        const inner = math.parse(body.value);
        checkAst(inner);
        inner.traverse((symbol) => {
          if (
            symbol.type === "SymbolNode" &&
            (symbol as any).name !== variable.value
          )
            dependencies.add((symbol as any).name);
        });
      });
      for (const dep of dependencies) {
        if (dep === "ans") {
          let value: any;
          for (let prev = index - 1; prev >= 0; prev--) {
            try {
              const v = evaluate(prev);
              if (typeof v === "number" || math.isComplex(v)) {
                value = v;
                break;
              }
            } catch {
              /* skip unsuccessful rows */
            }
          }
          if (value === undefined) throw new Error("No previous answer");
          scope.set("ans", value);
        } else if (names.has(dep)) {
          const indices = names.get(dep)!;
          if (indices.length > 1)
            throw new Error(`Duplicate definition: ${dep}`);
          evaluate(indices[0]);
        } else if (!builtins.has(dep))
          throw new Error(`Undefined name: ${dep}`);
      }
      const value = node.compile().evaluate(scope);
      if (!settings.complex && hasComplex(value))
        throw new Error("Enable complex mode for this result");
      if (!finite(value)) throw new Error("Result is undefined");
      const definition = node.type === "FunctionAssignmentNode";
      results[rows[index].id] = {
        text: definition
          ? "Defined"
          : math.format(value, { precision: settings.significantFigures || 12 }).replace(/\*/g, "·"),
        definition,
      };
      values.set(index, value);
      state.set(index, "done");
      return value;
    } catch (e) {
      results[rows[index].id] = { error: message(e) };
      state.set(index, "done");
      throw e;
    }
  }
  rows.forEach((_, i) => {
    try {
      evaluate(i);
    } catch {
      /* errors are attached to each row */
    }
  });
  return results;
}
function message(e: unknown) {
  const text = e instanceof Error ? e.message : "Unable to calculate";
  if (
    /Unexpected end|Value expected|Parenthesis.*expected|Unexpected operator/.test(
      text,
    )
  )
    return "Complete the expression";
  if (/Undefined symbol/.test(text))
    return text.replace("Undefined symbol", "Undefined name");
  return text;
}
