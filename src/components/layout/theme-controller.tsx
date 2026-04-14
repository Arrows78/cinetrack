import { useEffect } from 'react'
import { usePreferences } from '@/hooks/use-local-media'

export function ThemeController() {
  const { data: preferences } = usePreferences()

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const theme = preferences?.theme ?? 'dark'
    const shouldUseLight = theme === 'light'

    root.classList.toggle('light', shouldUseLight)
    root.classList.toggle('dark', !shouldUseLight)
    body.classList.toggle('light', shouldUseLight)
    body.classList.toggle('dark', !shouldUseLight)
  }, [preferences?.theme])

  return null
}
