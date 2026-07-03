import * as Dialog from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { profileEmojis } from '../lib/profileEmojis'

export interface ProfileFormValues {
  name: string
  emoji: string
}

interface ProfileFormDialogProps {
  initialValues?: ProfileFormValues
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ProfileFormValues) => Promise<void> | void
  open: boolean
  submitting?: boolean
  title: string
}

export function ProfileFormDialog({
  initialValues,
  onOpenChange,
  onSubmit,
  open,
  submitting,
  title
}: ProfileFormDialogProps): ReactElement {
  return (
    <Dialog.Root
      onOpenChange={onOpenChange}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg">
          <div className="flex items-start justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
            >
              <XIcon className="size-4" />
            </Dialog.Close>
          </div>

          <ProfileForm
            initialValues={initialValues}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ProfileFormProps {
  initialValues?: ProfileFormValues
  onCancel: () => void
  onSubmit: (values: ProfileFormValues) => Promise<void> | void
  submitting?: boolean
}

// Radix unmounts the dialog content while closed, so this form mounts fresh
// from initialValues on every open — no reset effect needed.
function ProfileForm({
  initialValues,
  onCancel,
  onSubmit,
  submitting
}: ProfileFormProps): ReactElement {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [emoji, setEmoji] = useState<string>(
    initialValues?.emoji ?? profileEmojis[0]
  )

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = name.trim()

    if (!trimmed) return

    void Promise.resolve(onSubmit({ name: trimmed, emoji }))
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={handleSubmit}
    >
      <div className="grid gap-2">
        <label
          className="text-sm font-medium"
          htmlFor="profile-name"
        >
          Name
        </label>
        <Input
          autoFocus
          id="profile-name"
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Ada"
          value={name}
        />
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Emoji</span>
        <div className="grid grid-cols-6 gap-2">
          {profileEmojis.map((option) => {
            const isSelected = option === emoji

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  'flex size-10 items-center justify-center rounded-md border text-xl transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                )}
                key={option}
                onClick={() => setEmoji(option)}
                type="button"
              >
                <span aria-hidden>{option}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={(submitting ?? false) || !name.trim()}
          type="submit"
        >
          Save
        </Button>
      </div>
    </form>
  )
}
