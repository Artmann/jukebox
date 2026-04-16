import { useState, type FormEvent, type ReactElement } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStatus, useLogin } from '../hooks/useAuth'

export function LoginPage(): ReactElement {
  const navigate = useNavigate()
  const { data: status, isLoading } = useAuthStatus()
  const login = useLogin()

  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (status && (!status.enabled || status.authenticated)) {
    return (
      <Navigate
        to="/"
        replace
      />
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    try {
      await login.mutateAsync(password)
      void navigate('/', { replace: true })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong. Please try again.'
      )
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form
        className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <h1 className="text-xl font-semibold">Sign in to Jukebox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the shared password to continue.
        </p>

        <div className="mt-6 grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="current-password"
            autoFocus
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        {error ? (
          <p
            className="mt-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <Button
          className="mt-6 w-full"
          disabled={login.isPending || password.length === 0}
          type="submit"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
