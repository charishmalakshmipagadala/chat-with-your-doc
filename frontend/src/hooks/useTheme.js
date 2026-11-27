import { useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'
export const THEMES = ['system', 'light', 'dark']

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(saved) ? saved : 'system'
  } catch {
    return 'system' // storage can be blocked (private mode, strict settings)
  }
}

/**
 * The colour theme: 'system' (follow the operating system), 'light' or 'dark'.
 *
 * It works by putting a class on <html>: "light", "dark", or none for system.
 * index.css switches the colour palette based on that class.
 */
export function useTheme() {
  const [theme, setTheme] = useState(readSavedTheme)

  // Keeping <html> and localStorage in sync with React state is exactly what
  // effects are for: updating something OUTSIDE React.
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    if (theme !== 'system') root.classList.add(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // can't save: the choice still works until the page is reloaded
    }
  }, [theme])

  // Cycle: system → light → dark → system …
  const nextTheme = () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])

  return { theme, nextTheme }
}
