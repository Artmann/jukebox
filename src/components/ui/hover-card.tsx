import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import * as React from 'react'

export { HoverCardContent } from './hover-card-content'
export { HoverCardTrigger } from './hover-card-trigger'

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return (
    <HoverCardPrimitive.Root
      data-slot="hover-card"
      {...props}
    />
  )
}

export { HoverCard }
