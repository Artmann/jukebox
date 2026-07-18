import { recordConsoleError } from './telemetry'

// console.error/warn arguments can be strings, Errors, or arbitrary objects
// (as with console.log's usual usage) — flatten them into one readable line
// rather than dropping non-string arguments.
function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg
      }

      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`
      }

      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

// A scoped logger prefixes every message with [scope] and mirrors error/warn
// calls into the telemetry errors table, so failures surfaced through
// video.js and similar libraries end up in the otel database without
// requiring someone to paste devtools output by hand. Call sites opt in
// explicitly instead of every console.error/warn in the app (including
// third-party libraries) being intercepted globally.
export class Logger {
  private readonly scope: string

  constructor(scope: string) {
    this.scope = scope
  }

  error(...args: unknown[]): void {
    const prefixed = [`[${this.scope}]`, ...args]

    console.error(...prefixed)
    recordConsoleError('console.error', formatArgs(prefixed))
  }

  info(...args: unknown[]): void {
    console.info(`[${this.scope}]`, ...args)
  }

  warn(...args: unknown[]): void {
    const prefixed = [`[${this.scope}]`, ...args]

    console.warn(...prefixed)
    recordConsoleError('console.warn', formatArgs(prefixed))
  }
}
