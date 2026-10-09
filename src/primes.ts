/** Keep repeated derivative marks in one superscript. */
export function flattenPrimes(latex: string): string {
  return latex.replace(/(?:\^\{(?:\\prime\s*)+\}){2,}/g, (marks) =>
    `^{${(marks.match(/\\prime/g) || []).join('')}}`,
  );
}
