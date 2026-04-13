import type { ReactElement } from 'react'

export function SkeletonRow(): ReactElement {
  const placeholders = Array.from({ length: 8 }, (_, index) => index)

  return (
    <div className="px-6 py-4">
      <div className="h-5 w-32 bg-muted rounded animate-pulse mb-3" />

      <div className="flex gap-2 overflow-hidden">
        {placeholders.map((index) => (
          <div
            className="flex-shrink-0 w-32 md:w-40"
            key={index}
          >
            <div className="w-full aspect-[2/3] bg-muted rounded-sm animate-pulse" />
            <div className="h-3 w-3/4 bg-muted rounded animate-pulse mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  )
}
