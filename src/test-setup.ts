import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'

// Some component tests enable fake timers and can leave them active if a test
// fails mid-run. Node's full-suite workers then hang on real setTimeout polling.
afterEach(() => {
  vi.useRealTimers()
})
