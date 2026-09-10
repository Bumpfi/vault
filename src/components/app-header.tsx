import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { saveSettings } from '#/server/settings'
import { applyTheme, isTheme, THEMES } from '#/lib/theme'
import type { Theme } from '#/lib/theme'
import { Button } from '#/components/ui/button'

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = localStorage.theme
    if (isTheme(stored)) setTheme(stored)
  }, [])

  // Close the menu on any outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const pick = (next: Theme) => {
    setTheme(next)
    setOpen(false)
    applyTheme(next)
    localStorage.theme = next
    void saveSettings({ data: { theme: next } })
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Palette className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-40 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.value}
              onClick={() => pick(t.value)}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              {t.label}
              {theme === t.value ? <Check className="size-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
