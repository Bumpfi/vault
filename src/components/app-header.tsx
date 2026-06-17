import { Link, useRouter } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'

export function AppHeader() {
  const router = useRouter()
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <Link to="/" className="text-xl font-bold">
        Vault
      </Link>
      <nav className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void authClient.signOut().then(() => {
              router.navigate({ to: '/login' })
            })
          }}
        >
          Sign out
        </Button>
      </nav>
    </header>
  )
}
