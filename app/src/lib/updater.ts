/**
 * Auto-update watcher.
 *
 * The build injects a unique `__BUILD_ID__`; `dist/version.json` carries the
 * same id. Every few minutes (and whenever the tab becomes visible) we fetch
 * the deployed version and tell the app when a newer build exists, so an open
 * PWA can refresh itself instead of staying on stale code.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000
const FIRST_CHECK_MS = 15 * 1000

export async function deployedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { id?: unknown }
    return typeof json.id === 'string' ? json.id : null
  } catch {
    return null
  }
}

export function startAutoUpdate(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  let disposed = false
  let notified = false

  const check = async () => {
    if (disposed || notified) return
    const id = await deployedVersion()
    if (disposed || !id || id === __BUILD_ID__) return
    notified = true
    onUpdate()
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }

  const firstTimer = window.setTimeout(() => void check(), FIRST_CHECK_MS)
  const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)

  // Also ask the service worker to look for a new shell.
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {
        /* offline is fine */
      })
  }

  return () => {
    disposed = true
    window.clearTimeout(firstTimer)
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
