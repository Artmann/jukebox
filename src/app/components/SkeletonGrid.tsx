import type { ReactElement } from 'react'

export function SkeletonGrid(): ReactElement {
  const placeholders = Array.from({ length: 18 }, (_, index) => index)

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2 p-3 md:p-6">
      {placeholders.map((index) => (
        <div key={index}>
          <div className="w-full aspect-[2/3] bg-muted rounded-sm animate-pulse" />
        </div>
      ))}
    </div>
  )
}
