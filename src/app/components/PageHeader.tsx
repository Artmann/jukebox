import { cn } from '@/lib/utils'
import { useEffect, useState, type ReactElement } from 'react'
import { Link, NavLink } from 'react-router-dom'

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
    <header
      className={cn(
        'sticky top-0 z-10 w-full transition-all duration-300',
        hasScrolledDown
          ? 'bg-background/80 backdrop-blur-md shadow-sm'
          : 'bg-transparent'
      )}
    >
      <nav className="flex items-center gap-6 px-4 py-3 sm:px-9 sm:py-4">
        <Link
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-primary"
          to="/"
        >
          <img
            alt=""
            className="size-7"
            src="/images/jukebox-icon-28.png"
          />
          Jukebox
        </Link>

        <div className="flex items-center gap-1 text-sm">
          <NavLink
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
            to="/movies"
          >
            Movies
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
            to="/shows"
          >
            TV Shows
          </NavLink>
        </div>
      </nav>
    </header>
  )
}
