// Floating "pop-out" player window via the Document Picture-in-Picture API
// (Chrome, Edge). Unlike video picture-in-picture it can hold any page
// content — here, Vault's own Twitch player — and stays on top of other apps.
// Firefox doesn't implement it; there, the browser's built-in
// picture-in-picture toggle on the video does the same job.

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
    }
  }
}

export function popOutSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

/** Opens the floating window, styled like the page so components render the same. */
export async function openPopOutWindow(): Promise<Window> {
  const api = window.documentPictureInPicture
  if (!api) throw new Error('Pop-out windows are not supported in this browser')
  const win = await api.requestWindow({ width: 640, height: 360 })

  // The new window starts as an empty document: copy the stylesheets and the
  // active theme over.
  for (const sheet of document.styleSheets) {
    try {
      const style = win.document.createElement('style')
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
      win.document.head.append(style)
    } catch {
      // Cross-origin sheets (e.g. web fonts) can't be read; link them instead.
      if (!sheet.href) continue
      const link = win.document.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      win.document.head.append(link)
    }
  }
  win.document.documentElement.className = document.documentElement.className
  const theme = document.documentElement.dataset.theme
  if (theme) win.document.documentElement.dataset.theme = theme
  win.document.body.style.margin = '0'
  win.document.body.style.background = '#000'
  return win
}
