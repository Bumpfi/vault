import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { authClient } from '#/features/auth/auth-client'
import { getCurrentUser } from '#/features/auth/functions'
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
    if (await getCurrentUser()) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Sign in — Vault' }] }),
  component: Login,
})

function Login() {
  const { error } = Route.useSearch()
  const [redirecting, setRedirecting] = useState(false)

  const signIn = () => {
    setRedirecting(true)
    void authClient.signIn.social({
      provider: 'twitch',
      callbackURL: '/',
      errorCallbackURL: '/login?error=rejected',
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl tracking-tight">
            <span className="size-3.5 rounded-[4px] bg-primary" />
            Vault
          </CardTitle>
          <CardDescription>Your personal Twitch VOD library.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Sign-in was rejected. Registration may be closed, or this account isn’t
              allowed on this Vault — ask its admin for access.
            </div>
          ) : null}
          <Button className="w-full" disabled={redirecting} onClick={signIn}>
            {redirecting ? 'Redirecting…' : 'Sign in with Twitch'}
          </Button>
          <SetupGuide />
        </CardContent>
      </Card>
    </div>
  )
}

/** Shown for whoever is setting up a fresh instance. */
function SetupGuide() {
  // The callback URL depends on where this instance is hosted.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground/80 select-none hover:text-foreground">
        First time? Self-hosting setup
      </summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          Create an application at{' '}
          <a
            href="https://dev.twitch.tv/console/apps"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            dev.twitch.tv/console/apps
          </a>{' '}
          (category: Website Integration).
        </li>
        <li>
          Set its <b>OAuth Redirect URL</b> to exactly:
          <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-xs break-all">
            {origin}/api/auth/callback/twitch
          </code>
        </li>
        <li>
          Put the app’s <b>Client ID</b> and <b>Client Secret</b> into{' '}
          <code>TWITCH_CLIENT_ID</code> and <code>TWITCH_CLIENT_SECRET</code>, then
          restart Vault.
        </li>
        <li>
          Sign in. The <b>first account becomes the admin</b> and can open or close
          registration for others under Settings.
        </li>
      </ol>
    </details>
  )
}
