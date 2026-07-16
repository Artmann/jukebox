import path from 'path'

/**
 * Build the LIKE pattern that matches any file path under the given library
 * root. Escapes SQL LIKE wildcards so a path containing `%` or `_` doesn't
 * accidentally match siblings.
 */
export function libraryPathPrefixPattern(libraryPath: string): string {
  const resolved = path.resolve(libraryPath)
  const withSeparator = resolved.endsWith(path.sep)
    ? resolved
    : `${resolved}${path.sep}`

  // Escape LIKE meta-characters (`%`, `_`) and the escape character itself.
  const escaped = withSeparator
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')

  return `${escaped}%`
}
