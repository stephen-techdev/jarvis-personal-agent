/**
 * Keyless relay configuration.
 *
 * The hosted build uses a Supabase Edge Function (`jarvis-chat`) that holds
 * the OpenRouter key server-side. The browser only ever talks to the relay,
 * so visitors need no key at all.
 *
 * Set VITE_PROXY_URL at build time, e.g.
 *   VITE_PROXY_URL="https://<project-ref>.supabase.co/functions/v1/jarvis-chat" npm run build
 *
 * To self-host without a relay, build with VITE_PROXY_URL="" and each user
 * supplies their own free OpenRouter key in Settings.
 */
const configured = (import.meta.env.VITE_PROXY_URL as string | undefined)?.trim()

export const PROXY_URL = configured ?? ''

export const PROXY_ENABLED = PROXY_URL.length > 0

/** True when the build expects each user to paste their own key. */
export const DIRECT_KEY_MODE = !PROXY_ENABLED
