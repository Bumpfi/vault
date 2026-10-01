import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { signOut } from '#/features/auth/auth-client'
import { saveSettings } from '#/features/settings/functions'
import { Button } from '#/components/ui/button'
import { DEFAULT_THEME, THEMES, applyTheme, storedTheme } from '#/lib/theme'
import type { Theme } from '#/lib/theme'

function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // localStorage only exists in the browser, so read it after mounting.
  useEffect(() => setTheme(storedTheme()), [])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  const pick = (next: Theme) => {
    setTheme(next)
    setOpen(false)
    applyTheme(next)
    void saveSettings({ data: { theme: next } })
  }

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.id}
              onClick={() => pick(t.id)}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              {t.label}
              {theme === t.id ? <Check className="size-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
      <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <span className="size-3 rounded-[3px] bg-primary" />
        Vault
      </Link>
      <nav className="flex items-center gap-2">
        <ThemePicker />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </nav>
    </header>
  )
}
