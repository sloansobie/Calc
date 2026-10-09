import { describe, it, expect } from "vitest";
import { evaluateWorksheet, fromLatex, type Settings } from "./engine";
const defaults: Settings = {
  angle: "deg",
  large: false,
  contrast: false,
  complex: false,
};
const run = (inputs: string[], options: Partial<Settings> = {}) =>
  evaluateWorksheet(
    inputs.map((latex, i) => ({ id: String(i), latex })),
    { ...defaults, ...options },
  );
const value = (input: string, options: Partial<Settings> = {}) =>
  run([input], options)["0"];
describe("mathematical notation and scientific calculations", () => {
  it.each([
    ["2+3*4", "14"],
    ["-2^{2}", "-4"],
    ["2^{-3}", "0.125"],
    ["2(3+4)", "14"],
    ["2\\pi", "6.28318530718"],
    ["\\frac{1+2}{\\frac{3}{4}}", "4"],
    ["\\frac12", "0.5"],
    ["\\sqrt9", "3"],
    ["\\sqrt[3]8", "2"],
    ["\\frac1\\pi", "0.318309886184"],
    ["\\frac{\\sqrt9}3", "1"],
    ["\\left|\\left|-3\\right|\\right|", "3"],
    ["\\sqrt{9}", "3"],
    ["\\sqrt[3]{-8}", "-2"],
    ["200\\times10\\%", "20"],
    ["\\left|-5\\right|", "5"],
    ["5!", "120"],
    ["50\\%^{2}", "0.25"],
    ["1/50\\%", "2"],
    ["10\\%200", "20"],
    ["(2+3)\\%", "0.05"],
    ["\\sin(30)", "0.5"],
    ["\\sin30", "0.5"],
    ["\\cos(60)", "0.5"],
    ["\\tan(45)", "1"],
    ["\\sin^{-1}(0.5)", "30"],
    ["\\ln(e)", "1"],
    ["\\log(100)", "2"],
    ["\\ln(e)+\\log(100)", "3"],
    ["\\operatorname{nPr}(5,2)", "20"],
    ["\\operatorname{nCr}(5,2)", "10"],
    ["\\operatorname{mean}([2,4,6])", "4"],
    ["\\operatorname{stdev}([2,4,6])", "2"],
    ["\\operatorname{stdevp}([2,4,6])", "1.63299316186"],
    ["round(2.6)", "3"],
    ["[1,2]+[3,4]", "[4, 6]"],
  ])("%s → %s", (input, expected) =>
    expect(value(input)).toEqual({ text: expected, definition: false }),
  );
  it("uses radians for forward and inverse trig", () => {
    expect(value("\\sin(\\pi/2)", { angle: "rad" }).text).toBe("1");
    expect(value("\\sin^{-1}(1)", { angle: "rad" }).text).toBe("1.57079632679");
  });
  it("handles exact quarter turns and tangent singularities", () => {
    expect(value("sin(180)").text).toBe("0");
    expect(value("cos(90)").text).toBe("0");
    expect(value("tan(90)").error).toMatch(/undefined/);
  });
  it("normalizes MathLive nested operator names and subscripts", () => {
    expect(run(["5", "\\operatorname{\\mathrm{ans}}*4"])["1"].text).toBe("20");
    expect(run(["a_{1}=3", "a_{1}+2"])["1"].text).toBe("5");
    expect(value("\\sqrt{\\placeholder{}}").error).toBe(
      "Complete the expression",
    );
  });
  it("supports complex mode and rejects nonreal answers by default", () => {
    expect(value("\\sqrt{-1}").error).toMatch(/complex mode/);
    expect(value("\\sqrt{-1}", { complex: true }).text).toBe("i");
    expect(value("(2+3i)*(1-i)", { complex: true }).text).toBe("5 + i");
  });
  it("retains precision between expressions", () =>
    expect(run(["1/3", "ans*3"])["1"].text).toBe("1"));
  it("reports incomplete and invalid input", () => {
    expect(value("\\frac{1}{}").error).toMatch(/Complete/);
    expect(value("1/0").error).toBe("Result is undefined");
    expect(value("missing+1").error).toBe("Undefined name: missing");
    expect(value("stdev([1])").error).toBeTruthy();
  });
  it("allows only calculator expression types", () => {
    expect(value("import(1)").error).toMatch(/Undefined name/);
    expect(value("a[1]").error).toMatch(/Unsupported/);
  });
  it("handles plain keyboard function inputs", () =>
    expect(value("sin 30").text).toBe("0.5"));
  it("rejects unsupported notation", () =>
    expect(() => fromLatex("\\unsupported{1}")).toThrow());
});
describe("worksheet definitions and history", () => {
  it("resolves forward references and updates edited definitions", () => {
    expect(run(["a+1", "a=5"])["0"].text).toBe("6");
    expect(run(["a+1", "a=9"])["0"].text).toBe("10");
  });
  it("supports functions with variables and multiple parameters", () => {
    const result = run(["f(3)", "f(x)=x^{2}+a", "a=5", "g(x,y)=x+y", "g(2,3)"]);
    expect(result["0"].text).toBe("14");
    expect(result["1"].text).toBe("Defined");
    expect(result["4"].text).toBe("5");
  });
  it("uses the preceding successful numeric result for ans", () => {
    expect(run(["2+3", "unknown", "f(x)=x", "ans*2"])["3"].text).toBe("10");
    expect(value("ans+1").error).toBe("No previous answer");
  });
  it("reports duplicate definitions on definitions and dependents", () => {
    const results = run(["a=2", "a=3", "a+1"]);
    Object.values(results).forEach((r) =>
      expect(r.error).toBe("Duplicate definition: a"),
    );
  });
  it("rejects circular and recursive definitions", () => {
    expect(run(["a=b+1", "b=a+1"])["0"].error).toBe("Circular dependency");
    expect(run(["f(x)=f(x)+1", "f(2)"])["1"].error).toBe("Circular dependency");
  });
  it("keeps independent rows usable after errors", () =>
    expect(run(["a=b", "b=a", "2+2"])["2"].text).toBe("4"));
  it("protects built-in names", () =>
    expect(value("pi=3").error).toMatch(/reserved/));
});

describe("Greek symbols", () => {
  it("supports named Greek letter definitions and trigonometry", () => {
    const results = run(["\\alpha=2", "\\theta=30", "\\alpha*\\sin(\\theta)"]);
    expect(results["0"].text).toBe("2");
    expect(results["2"].text).toBe("1");
  });
  it("supports uppercase Greek letters, subscripts, and implicit products", () => {
    const results = run([
      "\\Omega=5",
      "\\alpha_{1}=2",
      "\\beta=3",
      "\\alpha_{1}\\beta+\\Omega",
    ]);
    expect(results["3"].text).toBe("11");
  });
  it("keeps pi a mathematical constant and accepts direct Greek typing", () => {
    expect(value("\\pi").text).toBe("3.14159265359");
    expect(value("π").text).toBe("3.14159265359");
    expect(run(["α=4", "α+1"])["1"].text).toBe("5");
  });
  it("supports Greek arguments in compact math notation", () => {
    expect(run(["\\theta=30", "\\sin\\theta"])["1"].text).toBe("0.5");
    expect(run(["\\alpha=4", "\\sqrt\\alpha"])["1"].text).toBe("2");
  });
});

describe("numerical calculus templates", () => {
  it("evaluates finite sums and binds the index locally", () => {
    expect(value("\\sum_{n=1}^{10}\\left(n^2\\right)").text).toBe("385");
    expect(run(["a=3", "\\sum_{n=1}^{4}\\left(a*n\\right)"])["1"].text).toBe(
      "30",
    );
  });
  it("evaluates definite integrals and reversed bounds", () => {
    expect(value("\\int_0^1\\left(x^2\\right)\\,dx").text).toBe(
      "0.333333333333",
    );
    expect(value("\\int_{1}^{0}\\left(x^2\\right)\\,dx").text).toBe(
      "-0.333333333333",
    );
  });
  it("evaluates derivatives at a point", () => {
    const result = value("\\frac{d}{dx}\\left(x^3\\right)\\big|_{x=2}");
    expect(result.error).toBeUndefined();
    expect(Number(result.text)).toBeCloseTo(12, 8);
  });
  it("rejects invalid bounds and undefined integrands", () => {
    expect(value("\\sum_{n=1.5}^{10}\\left(n\\right)").error).toMatch(
      /integers/,
    );
    expect(value("\\int_{0}^{1}\\left(1/x\\right)\\,dx").error).toMatch(
      /finite/,
    );
    expect(value("\\sum_{n=1}^{3}\\left(q*n\\right)").error).toMatch(
      /Undefined name: q/,
    );
  });
});

describe("symbolic calculus", () => {
  it("returns a general derivative without requiring an evaluation point", () => {
    const result = value("\\frac{d}{dx}\\left(x^3+2x\\right)");
    expect(result.error).toBeUndefined();
    expect(result.text).toContain("x^2");
    expect(result.latex).toBeTruthy();
  });
  it("returns an antiderivative with an integration constant", () => {
    const result = value("\\int\\left(x^2\\right)\\,dx");
    expect(result.error).toBeUndefined();
    expect(result.text).toContain("x^3");
    expect(result.text).toContain("+ C");
  });
  it("expands user-defined functions and worksheet constants", () => {
    const result = run([
      "a=3",
      "f(t)=a*t^2",
      "\\frac{d}{dx}\\left(f(x)\\right)",
    ])["2"];
    expect(result.error).toBeUndefined();
    expect(result.text).toBe("6*x");
  });
  it("allows free symbolic parameters and detects recursive functions", () => {
    expect(value("\\frac{d}{dx}\\left(a*x^2\\right)").text).toBe("2*a*x");
    expect(
      run(["f(t)=f(t)", "\\frac{d}{dx}\\left(f(x)\\right)"])["1"].error,
    ).toMatch(/Circular/);
  });
  it("uses the chain rule and integrates elementary functions", () => {
    expect(value("\\frac{d}{dx}\\left(\\sin(x^2)\\right)").text).toContain(
      "cos(x^2)",
    );
    expect(value("\\int\\left(\\cos(x)\\right)\\,dx").text).toBe("sin(x) + C");
  });
});

it("evaluates a defined function using prime derivative notation", () => {
  for (const notation of ["f'(x)", "f^{\\prime}(x)", "f\\prime(x)", "f′(x)"]) {
    expect(run(["f(x)=4x^2", notation])["1"].text).toBe("8*x");
  }
});

it("evaluates function primes at a number or an explicit evaluation point", () => {
  for (const notation of [
    "f'(5)",
    "f'(x=5)",
    "f^{\\prime}\\left(x=5\\right)",
  ]) {
    const result = run(["f(x)=4x^2", notation])["1"];
    expect(result.error).toBeUndefined();
    expect(Number(result.text)).toBeCloseTo(40, 8);
  }
});

it("evaluates second and higher function derivatives", () => {
  for (const notation of ["f''(x)", "f^{\\prime\\prime}(x)", "f′′(x)", "f^{\\prime}^{\\prime}(x)", "f''(x=5)"]) {
    const result = run(["f(x)=4x^2", notation])["1"];
    expect(result.error).toBeUndefined();
    expect(result.text).toBe("8");
  }
  expect(run(["f(x)=x^4", "f'''(x)"])["1"].text).toBe("24*x");
});

it('simplifies derivative fractions within expressions', () => {
  const result = run(['f(x)=5x^4', '\\frac{f\\left(x\\right)}{f^{\\prime}\\left(x\\right)}'])['1'];
  expect(result.error).toBeUndefined();
  expect(result.text).toBe('0.25*x');
});

it('rounds displayed results without rounding dependent calculations', () => {
  const rows = ['a=1/3', 'a*3'].map((latex, i) => ({ id: String(i), latex }));
  const results = evaluateWorksheet(rows, { angle: 'rad', large: false, contrast: true, complex: true, significantFigures: 3 });
  expect(results['0'].text).toBe('0.333');
  expect(results['1'].text).toBe('1');
});
