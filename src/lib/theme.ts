// Named themes. 'light' is the only light-family theme; everything else keeps
// the `.dark` class (so Tailwind `dark:` utilities still apply) and sets a
// `data-theme` attribute that overrides the CSS variables in styles.css.
export type Theme = 'dark' | 'light' | 'dracula' | 'catppuccin' | 'rain'

export const THEMES: Array<{ value: Theme; label: string }> = [
  { value: 'dark', label: 'Noir' },
  { value: 'light', label: 'Cream' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'catppuccin', label: 'Catppuccin' },
  { value: 'rain', label: 'Rain' },
]

const THEME_VALUES = new Set(THEMES.map((t) => t.value))

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && THEME_VALUES.has(v as Theme)
}

// Apply a theme to <html>. Kept in sync with the no-flash inline script in
// __root.tsx — change both together.
export function applyTheme(theme: string) {
  const root = document.documentElement
  root.classList.toggle('dark', theme !== 'light')
  if (theme === 'dark' || theme === 'light') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
