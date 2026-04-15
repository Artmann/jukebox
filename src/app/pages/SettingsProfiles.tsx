import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  ProfileFormDialog,
  type ProfileFormValues
} from '../components/ProfileFormDialog'
import {
  useCreateProfile,
  useDeleteProfile,
  useProfiles,
  useUpdateProfile,
  type Profile
} from '../hooks/useProfiles'
import { SettingsLayout } from './Settings'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; profile: Profile }

export function SettingsProfilesPage(): ReactElement {
  const { data: profiles, isLoading } = useProfiles()
  const create = useCreateProfile()
  const update = useUpdateProfile()
  const remove = useDeleteProfile()

  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })

  function closeDialog() {
    setDialog({ kind: 'closed' })
  }

  async function handleSubmit(values: ProfileFormValues) {
    try {
      if (dialog.kind === 'create') {
        await create.mutateAsync(values)
        toast.success(`Created ${values.name}`)
      } else if (dialog.kind === 'edit') {
        await update.mutateAsync({ id: dialog.profile.id, ...values })
        toast.success(`Updated ${values.name}`)
      }
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    }
  }

  async function handleDelete(profile: Profile) {
    const confirmed = window.confirm(
      `Delete profile "${profile.name}"? Their watch progress and favorites will be removed.`
    )

    if (!confirmed) return

    try {
      await remove.mutateAsync(profile.id)
      toast.success(`Deleted ${profile.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete')
    }
  }

  const canDelete = (profiles?.length ?? 0) > 1

  return (
    <SettingsLayout>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Profiles</h2>
          <p className="text-sm text-muted-foreground">
            Each profile has its own watch progress and favorites.
          </p>
        </div>

        <Button
          onClick={() => setDialog({ kind: 'create' })}
          type="button"
        >
          <PlusIcon className="size-4" />
          Add profile
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          profiles?.map((profile) => (
            <div
              className="flex items-center gap-3 rounded-lg border bg-card p-4"
              key={profile.id}
            >
              <span
                aria-hidden
                className="flex size-12 items-center justify-center rounded-full bg-muted text-2xl"
              >
                {profile.emoji}
              </span>

              <div className="flex-1 truncate">
                <p className="truncate font-medium">{profile.name}</p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  aria-label={`Edit ${profile.name}`}
                  onClick={() => setDialog({ kind: 'edit', profile })}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <PencilIcon className="size-4" />
                </Button>

                <Button
                  aria-label={`Delete ${profile.name}`}
                  disabled={!canDelete}
                  onClick={() => void handleDelete(profile)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <ProfileFormDialog
        initialValues={
          dialog.kind === 'edit'
            ? { name: dialog.profile.name, emoji: dialog.profile.emoji }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
        onSubmit={handleSubmit}
        open={dialog.kind !== 'closed'}
        submitting={create.isPending || update.isPending}
        title={dialog.kind === 'edit' ? 'Edit profile' : 'New profile'}
      />
    </SettingsLayout>
  )
}
