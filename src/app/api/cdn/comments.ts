/**
 * Removes ordinary block and line comments while preserving strings and regex-like content enough for CDN bundles.
 *
 * @remarks
 * esbuild also removes legal comments when minifying. This helper exists for `remove-comments=true` with `minify=false`.
 *
 * @param source JavaScript source.
 * @returns Source without ordinary comments.
 */
export function removeJavaScriptComments(source: string): string {
  let output = "";
  let index = 0;
  let quote: string | null = null;
  let escaped = false;

  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (quote) {
      output += current;

      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        quote = null;
      }

      index += 1;
      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      quote = current;
      output += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}
