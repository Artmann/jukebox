import { type ReactElement, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { PageHeader } from '../components/PageHeader'

interface SettingsLayoutProps {
  children: ReactNode
}

const sections = [
  { to: '/settings/profiles', label: 'Profiles' },
  { to: '/settings/auth', label: 'Auth' }
]

export function SettingsLayout({
  children
}: SettingsLayoutProps): ReactElement {
  return (
    <>
      <PageHeader />

      <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 md:grid-cols-[12rem_1fr]">
        <aside>
          <h1 className="mb-4 text-lg font-semibold">Settings</h1>

          <nav className="flex flex-col gap-1 text-sm">
            {sections.map((section) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )
                }
                key={section.to}
                to={section.to}
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </>
  )
}
