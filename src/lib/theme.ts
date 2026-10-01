// Themes are CSS-variable sets in styles.css. "light" is the only light
// theme; all others keep the `dark` class (so Tailwind's `dark:` variants
// apply) and add a `data-theme` attribute that overrides the palette.

export const THEME_IDS = ['dark', 'light', 'dracula', 'catppuccin', 'rain'] as const
export type Theme = (typeof THEME_IDS)[number]
export const DEFAULT_THEME: Theme = 'dark'

export const THEMES: Array<{ id: Theme; label: string }> = [
  { id: 'dark', label: 'Noir' },
  { id: 'light', label: 'Cream' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'catppuccin', label: 'Catppuccin' },
  { id: 'rain', label: 'Rain' },
]

export function isTheme(value: unknown): value is Theme {
  return THEME_IDS.includes(value as Theme)
}

const STORAGE_KEY = 'theme'

/** Applies a theme to the page and remembers it for the next page load. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme !== 'light')
  if (theme === 'dark' || theme === 'light') delete root.dataset.theme
  else root.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
}

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Inlined into <head> so the remembered theme is applied before the first
 * paint — otherwise the page would flash the default theme on load. Mirrors
 * applyTheme(); keep them in sync.
 */
export const themeBootScript = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light')document.documentElement.classList.remove('dark');else if(t&&t!=='dark')document.documentElement.dataset.theme=t}catch(e){}`
