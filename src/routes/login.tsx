import { createFileRoute, redirect, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { fetchSession } from '#/lib/session'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  beforeLoad: async () => {
    const session = await fetchSession()
    if (session) throw redirect({ to: '/' })
  },
  component: Login,
})

function Login() {
  const { error } = useSearch({ from: '/login' })
  const [loading, setLoading] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Vault</CardTitle>
          <CardDescription>
            Your personal Twitch VOD dashboard. Single user only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <p className="text-sm text-destructive">
              That Twitch account isn’t allowed to use this Vault.
            </p>
          ) : null}
          <Button
            disabled={loading}
            onClick={() => {
              setLoading(true)
              void authClient.signIn.social({
                provider: 'twitch',
                callbackURL: '/',
                errorCallbackURL: '/login?error=forbidden',
              })
            }}
          >
            {loading ? 'Redirecting…' : 'Sign in with Twitch'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
