'use client'

import { useEffect, useState } from 'react'
import { UNIVERSE_COOKIE } from '@/lib/universe-cookie'

// Client-side hint only — the DB CHECK constraint is the real rule, and
// submit surfaces its violations via the route's mapped messages.
const SLUG_HINT_RE = /^[a-z0-9](-?[a-z0-9])*$/

type SlugCheck = 'idle' | 'checking' | 'available' | 'taken'

export default function CreateUniversePage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [code, setCode] = useState('')
  const [slugCheck, setSlugCheck] = useState<SlugCheck>('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const slugFormatOk = slug.length >= 2 && slug.length <= 32 && SLUG_HINT_RE.test(slug)

  // Debounced existence-only availability check. Reserved words and format
  // problems are the DB's call, reported at submit.
  useEffect(() => {
    if (!slugFormatOk) {
      setSlugCheck('idle')
      return
    }
    setSlugCheck('checking')
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/universes?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('check failed')
        const body = (await res.json()) as { available: boolean }
        if (!cancelled) setSlugCheck(body.available ? 'available' : 'taken')
      } catch {
        if (!cancelled) setSlugCheck('idle')
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, slugFormatOk])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/universes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, code }),
      })
      const body = (await res.json()) as { universeId?: string; error?: string }
      if (!res.ok || !body.universeId) {
        setError(body.error ?? 'Something went wrong. Try again.')
        return
      }
      // Select the new universe (same mechanism as the picker) so middleware
      // and getUniverseContext() land the user inside it, then hard-navigate
      // so the server sees the cookie.
      document.cookie = `${UNIVERSE_COOKIE}=${body.universeId}; path=/; max-age=31536000; samesite=lax`
      window.location.replace('/courtside')
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-condensed text-4xl font-bold uppercase tracking-wide gradient-accent">
            New universe
          </h1>
          <p className="mt-1 text-sm text-fg-dim">Name your run — you&apos;ll be its owner</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Universe name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
          />

          <div>
            <input
              type="text"
              placeholder="slug (short URL name)"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
            />
            <p className={`mt-1.5 px-1 text-xs ${slug && !slugFormatOk ? 'text-loss' : 'text-fg-dim'}`}>
              {slugCheck === 'taken'
                ? 'That slug is taken.'
                : slugCheck === 'available'
                  ? `${slug} is available`
                  : slugCheck === 'checking'
                    ? 'Checking…'
                    : 'Lowercase letters, numbers, and hyphens · 2–32 characters'}
            </p>
          </div>

          <input
            type="text"
            placeholder="Invite code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
          />

          {error && <p className="text-center text-sm text-loss">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name || !slug || !code || slugCheck === 'taken'}
            className="w-full rounded-xl border border-white/[.1] bg-surface-raised py-3.5 font-bold text-fg disabled:opacity-50 hover:border-accent active:scale-95 transition-all"
          >
            {loading ? 'Creating…' : 'Create universe'}
          </button>
        </form>
      </div>
    </main>
  )
}
