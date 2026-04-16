import { cn } from '@/lib/utils'
import { useEffect, useState, type ReactElement } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { ProfileSwitcher } from './ProfileSwitcher'

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
      <nav className="flex items-center gap-3 px-4 py-2 sm:gap-6 sm:px-6 sm:py-4">
        <Link
          className="flex min-h-11 items-center gap-2 text-lg font-bold tracking-tight text-primary sm:text-xl"
          to="/"
        >
          <img
            alt=""
            className="size-7"
            src="/images/jukebox-icon-28.png"
          />
          <span className="hidden xs:inline sm:inline">Jukebox</span>
        </Link>

        <div className="flex items-center gap-0.5 text-sm sm:gap-1">
          <NavLink
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center rounded-md px-3 transition-colors',
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
                'flex min-h-11 items-center rounded-md px-3 transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
            to="/shows"
          >
            <span className="hidden sm:inline">TV Shows</span>
            <span className="sm:hidden">Shows</span>
          </NavLink>
        </div>

        <div className="ml-auto flex items-center">
          <ProfileSwitcher />
        </div>
      </nav>
    </header>
  )
}
