import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Sheet({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return (
    <SheetPrimitive.Root
      data-slot="sheet"
      {...props}
    />
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return (
    <SheetPrimitive.Trigger
      data-slot="sheet-trigger"
      {...props}
    />
  )
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      {...props}
    />
  )
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return (
    <SheetPrimitive.Portal
      data-slot="sheet-portal"
      {...props}
    />
  )
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      data-slot="sheet-overlay"
      {...props}
    />
  )
}

type SheetSide = 'top' | 'right' | 'bottom' | 'left'

interface SheetContentProps
  extends React.ComponentProps<typeof SheetPrimitive.Content> {
  hideCloseButton?: boolean
  overlayClassName?: string
  side?: SheetSide
}

function SheetContent({
  children,
  className,
  hideCloseButton,
  overlayClassName,
  side = 'right',
  ...props
}: SheetContentProps) {
  const sideClasses: Record<SheetSide, string> = {
    bottom:
      'inset-x-0 bottom-0 h-auto max-h-[90vh] border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom rounded-t-xl',
    left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
    right:
      'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
    top: 'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top'
  }

  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} />
      <SheetPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
          sideClasses[side],
          className
        )}
        data-slot="sheet-content"
        {...props}
      >
        {children}

        {!hideCloseButton && (
          <SheetPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none min-h-11 min-w-11 flex items-center justify-center"
          >
            <XIcon className="size-5" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn('text-base font-semibold', className)}
      data-slot="sheet-title"
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      data-slot="sheet-description"
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger
}
