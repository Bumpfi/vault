import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { saveSettings } from '#/server/settings'
import { Button } from '#/components/ui/button'

function ThemeToggle() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.theme = next ? 'dark' : 'light'
    void saveSettings({ data: { theme: next ? 'dark' : 'light' } })
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

export function AppHeader() {
  const router = useRouter()
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
      <Link
        to="/"
        className="flex items-center gap-2 text-xl font-bold tracking-tight"
      >
        <span className="size-3 rounded-[3px] bg-primary shadow-[0_0_12px_rgba(245,185,66,0.5)]" />
        Vault
      </Link>
      <nav className="flex items-center gap-2">
        <ThemeToggle />
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
