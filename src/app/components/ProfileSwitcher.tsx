import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CheckIcon, SettingsIcon } from 'lucide-react'
import { type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  useActivateProfile,
  useActiveProfile,
  useProfiles
} from '../hooks/useProfiles'

export function ProfileSwitcher(): ReactElement | null {
  const { data: active } = useActiveProfile()
  const { data: profiles } = useProfiles()
  const activate = useActivateProfile()

  if (!active) {
    return null
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Switch profile, current: ${active.name}`}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          type="button"
        >
          <span aria-hidden>{active.emoji}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          sideOffset={8}
        >
          {profiles?.map((profile) => {
            const isActive = profile.id === active.id

            return (
              <DropdownMenu.Item
                key={profile.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground',
                  isActive && 'font-medium'
                )}
                onSelect={(event) => {
                  if (isActive) return
                  event.preventDefault()
                  activate.mutate(profile.id, {
                    onError: (error) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : 'Failed to switch profile'
                      )
                    }
                  })
                }}
              >
                <span
                  aria-hidden
                  className="text-base"
                >
                  {profile.emoji}
                </span>
                <span className="flex-1 truncate">{profile.name}</span>
                {isActive ? (
                  <CheckIcon className="size-4 text-muted-foreground" />
                ) : null}
              </DropdownMenu.Item>
            )
          })}

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item asChild>
            <Link
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
              to="/settings/profiles"
            >
              <SettingsIcon className="size-4" />
              Manage profiles
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
