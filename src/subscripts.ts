/** Upgrade existing single-letter numbered variables without touching commands. */
export function numberedVariables(latex: string): string {
  return latex.replace(/(?<![\\\p{L}])([\p{L}])(\d+)/gu, "$1_{$2}");
}
