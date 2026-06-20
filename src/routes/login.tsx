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
      <Card className="w-full max-w-sm border-white/10 bg-[rgba(15,15,18,0.86)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl tracking-tight">
            <span className="size-3.5 rounded-[4px] bg-primary shadow-[0_0_14px_rgba(245,185,66,0.55)]" />
            Vault
          </CardTitle>
          <CardDescription>Your personal Twitch VOD library.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              That Twitch account isn’t allowed to use this Vault.
            </div>
          ) : null}
          <Button
            className="w-full"
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
