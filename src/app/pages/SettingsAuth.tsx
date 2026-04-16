import { useState, type FormEvent, type ReactElement } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStatus, useChangePassword, useLogout } from '../hooks/useAuth'
import { SettingsLayout } from './Settings'

export function SettingsAuthPage(): ReactElement {
  const { data: status, isLoading } = useAuthStatus()
  const changePassword = useChangePassword()
  const logout = useLogout()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const enabled = status?.enabled ?? false

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')

      return
    }

    if (newPassword.length < 8) {
      setError('Choose a password of at least 8 characters.')

      return
    }

    try {
      const result = await changePassword.mutateAsync({
        currentPassword: enabled ? currentPassword : undefined,
        newPassword
      })

      toast.success(
        result.enabled
          ? 'Password updated.'
          : 'Password disabled.'
      )

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong. Please try again.'
      )
    }
  }

  async function handleDisable() {
    const confirmed = window.confirm(
      'Disable the shared password? Anyone on your network will be able to use Jukebox.'
    )

    if (!confirmed) return

    setError(null)

    try {
      await changePassword.mutateAsync({
        currentPassword,
        newPassword: ''
      })

      toast.success('Password disabled.')
      setCurrentPassword('')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong. Please try again.'
      )
    }
  }

  async function handleLogout() {
    try {
      await logout.mutateAsync()
      toast.success('Signed out.')
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to sign out.'
      )
    }
  }

  if (isLoading) {
    return (
      <SettingsLayout>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout>
      <div>
        <h2 className="text-xl font-semibold">Authentication</h2>
        <p className="text-sm text-muted-foreground">
          Protect Jukebox with a shared password. Everyone uses the same
          password to sign in.
        </p>
      </div>

      <div className="mt-6 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">
          {enabled ? 'Auth is on' : 'Auth is off'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {enabled
            ? 'Visitors must sign in with the shared password.'
            : 'Anyone who can reach this server can use it.'}
        </p>
      </div>

      <form
        className="mt-6 grid max-w-md gap-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {enabled ? (
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              autoComplete="current-password"
              id="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="new-password">
            {enabled ? 'New password' : 'Password'}
          </Label>
          <Input
            autoComplete="new-password"
            id="new-password"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
          <p className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            autoComplete="new-password"
            id="confirm-password"
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </div>

        {error ? (
          <p
            className="text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={changePassword.isPending}
            type="submit"
          >
            {enabled ? 'Change password' : 'Enable and set password'}
          </Button>

          {enabled ? (
            <>
              <Button
                disabled={changePassword.isPending || currentPassword.length === 0}
                onClick={() => void handleDisable()}
                type="button"
                variant="destructive"
              >
                Disable
              </Button>

              <Button
                disabled={logout.isPending}
                onClick={() => void handleLogout()}
                type="button"
                variant="outline"
              >
                Sign out
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </SettingsLayout>
  )
}
