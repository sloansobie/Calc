// Symbol shortcuts and evaluation share the same Greek alphabet.
export const greekLetters: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};
export const greekShortcuts = Object.fromEntries([
  ...Object.entries(greekLetters).map(([name, symbol]) => [
    name,
    name === "omicron" ? symbol : `\\${name}`,
  ]),
  ...Object.entries(greekLetters)
    .filter(([name]) => name === name.toLowerCase())
    .map(([name, symbol]) => {
      const command = name[0].toUpperCase() + name.slice(1);
      return [
        name.toUpperCase(),
        greekLetters[command] ? `\\${command}` : symbol.toUpperCase(),
      ];
    }),
]);
export function normalizeGreek(input: string): string {
  return input
    .replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (command, name: string) =>
      greekLetters[name] ? ` ${greekLetters[name]} ` : command,
    )
    .replace(/ϵ/g, "ε")
    .replace(/ϑ/g, "θ")
    .replace(/ϕ/g, "φ")
    .replace(/([\p{Script=Greek}])\s+_/gu, "$1_")
    .replace(/π/g, " pi ");
}
