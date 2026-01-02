import { cn } from '@/lib/utils'
import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'

export function PageHeader(): ReactElement {
  const [scrollY, setScrollY] = useState(0)

  useEffect(function updateScrollPosition() {
    function onScroll() {
      setScrollY(window.scrollY)
    }

    onScroll()

    window.addEventListener('scroll', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const hasScrolledDown = scrollY >= 16

  return (
    <div
      className={cn(
        'sticky top-0 z-10 w-full h-auto transition-all',
        hasScrolledDown ? 'bg-zinc-900 text-white' : 'bg-transparent'
      )}
    >
      <div className="px-9 py-3 flex justify-between items-center ">
        <div className="flex items-center gap-2">
          <Link
            className="font-semibold"
            to="/"
          >
            Jukebox
          </Link>

          <div className="flex items-center gap-2 text-sm pt-1">
            <Link
              className="block px-2 hover:underline"
              to="/movies"
            >
              Movies
            </Link>
          </div>
        </div>
        <div></div>
      </div>
    </div>
  )
}
