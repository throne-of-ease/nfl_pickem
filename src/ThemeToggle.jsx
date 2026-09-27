import React, { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b1118')
    try { localStorage.setItem('nfl-pickem-theme', theme) } catch { /* Theme still works when storage is unavailable. */ }
  }, [theme])
  const next = theme === 'dark' ? 'light' : 'dark'
  return <button className="theme-toggle" type="button" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={() => setTheme(next)}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {theme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z" />}
    </svg>
  </button>
}
