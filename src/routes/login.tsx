import { createFileRoute, redirect, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
              Sign-in rejected — registration is disabled or this account
              isn’t on the allowlist. Ask the Vault admin for access.
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

          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground/80 hover:text-foreground">
              First time? Self-hosting setup
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                Create an app at{' '}
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
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  <CallbackUrl />
                </code>
              </li>
              <li>
                Copy the app’s <b>Client ID</b> and <b>Client Secret</b> into
                your <code>.env</code> as <code>TWITCH_CLIENT_ID</code> and{' '}
                <code>TWITCH_CLIENT_SECRET</code>, then restart Vault.
              </li>
              <li>
                Sign in — the <b>first account becomes admin</b> and can turn
                registration for further users on or off in Settings.
              </li>
            </ol>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}

// Rendered client-side only (window). SSR fallback shows the path.
function CallbackUrl() {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  return <>{origin}/api/auth/callback/twitch</>
}
