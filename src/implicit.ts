/** Make juxtaposition explicit without changing power/unary precedence.
 * Declared names and built-ins stay whole; other letter runs are products.
 */
export function implicitProducts(
  source: string,
  names: ReadonlySet<string>,
  functions: ReadonlySet<string>,
): string {
  const tokens =
    source.match(
      /"(?:\\.|[^"\\])*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[\p{L}_][\p{L}\p{N}_]*|\S/gu,
    ) || [];
  const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;
  const number = /^(?:\d|\.\d)/;
  // Prefer the longest declared name at each position in a letter run.
  // Keep subscript/digit suffixes attached to their variable.
  const knownNames = [...new Set([...names, ...functions])]
    .filter((name) => identifier.test(name))
    .sort((a, b) => b.length - a.length);
  const expanded = tokens.flatMap((token) => {
    // Calculus templates carry their expression in a JSON string argument.
    if (token.startsWith('"')) return [token];
    if (!identifier.test(token) || names.has(token) || functions.has(token))
      return [token];
    const parts: string[] = [];
    let rest = token;
    while (rest) {
      const known = knownNames.find((name) =>
        rest.startsWith(name) && !/^[\p{N}_]/u.test(rest.slice(name.length)),
      );
      const part = known || rest.match(/^[\p{L}_](?:_[\p{L}\p{N}_]+|[\p{N}]+)?/u)?.[0];
      if (!part) return [token];
      parts.push(part);
      rest = rest.slice(part.length);
    }
    return parts;
  });
  let result = "";
  expanded.forEach((token, index) => {
    const previous = expanded[index - 1];
    if (previous && number.test(previous) && number.test(token))
      throw new Error("Separate numbers with an operator");
    const endsValue =
      previous &&
      (identifier.test(previous) ||
        number.test(previous) ||
        previous === ")" ||
        previous === "]" ||
        previous === "!");
    const startsValue =
      identifier.test(token) || number.test(token) || token === "(";
    const call = token === "(" && functions.has(previous);
    if (endsValue && startsValue && !call) result += "*";
    result += token;
  });
  return result;
}
