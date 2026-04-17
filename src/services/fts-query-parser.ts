/**
 * Convert raw user input into a safe SQLite FTS5 MATCH expression.
 *
 * FTS5 has a query syntax with operators (AND, OR, NEAR, NOT), prefix
 * wildcards (*), column filters (title:foo), and quoted phrases. We don't
 * want users to accidentally trigger any of that — and we don't want
 * adversarial input to crash the parser. So we:
 *
 *   1. Split the input on whitespace.
 *   2. Strip every character except letters, digits, and the underscore
 *      from each token. This drops quotes, asterisks, parens, colons,
 *      and operator-like punctuation.
 *   3. Wrap each surviving token in double quotes (so reserved words like
 *      `OR` or `NEAR` are treated as literal terms) and append `*` for
 *      prefix matching.
 *   4. Join the tokens with spaces. FTS5 implicitly ANDs them.
 *
 * Returns null when there is nothing searchable (empty input, only
 * whitespace, or only stripped characters).
 */
export function buildFtsMatchQuery(rawInput: string): string | null {
  const tokens = rawInput
    .split(/\s+/)
    .map((token) => sanitizeToken(token))
    .filter((token) => token.length > 0)

  if (tokens.length === 0) {
    return null
  }

  return tokens.map((token) => `"${token}"*`).join(' ')
}

function sanitizeToken(token: string): string {
  // Keep only characters that are safe inside a quoted FTS5 token. We use a
  // Unicode-aware character class so accented characters and non-Latin
  // alphabets still work, but punctuation, quotes, and operator glyphs are
  // dropped.
  return token.replace(/[^\p{L}\p{N}_]+/gu, '')
}
