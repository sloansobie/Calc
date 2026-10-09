import { expect, it } from "vitest";
import { numberedVariables } from "./subscripts";
it("upgrades saved numbered variables while preserving commands, powers, and numbers", () => {
  expect(numberedVariables("x1=5")).toBe("x_{1}=5");
  expect(numberedVariables("x12+y2")).toBe("x_{12}+y_{2}");
  expect(numberedVariables("α2")).toBe("α_{2}");
  expect(numberedVariables("10^{-16}+\\log10+\\sin30+x_{12}")).toBe(
    "10^{-16}+\\log10+\\sin30+x_{12}",
  );
});
