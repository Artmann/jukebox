import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton } from './skeleton'

describe('Skeleton', () => {
  it('renders with default classes', () => {
    const { container } = render(<Skeleton />)
    const element = container.firstChild as HTMLElement

    expect(element).toBeInTheDocument()
    expect(element.getAttribute('data-slot')).toEqual('skeleton')
    expect(element.className).toContain('animate-pulse')
    expect(element.className).toContain('rounded-md')
  })

  it('accepts additional class names', () => {
    const { container } = render(<Skeleton className="h-4 w-40" />)
    const element = container.firstChild as HTMLElement

    expect(element.className).toContain('h-4')
    expect(element.className).toContain('w-40')
  })
})
