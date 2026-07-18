'use client'

import { useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Standard Supabase reset flow, step 2: the emailed recovery link exchanged
// a code at /auth/callback, so the visitor arrives here already holding a
// (recovery) session — middleware lets it through like any signed-in page.
export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match")
      return
    }
    setLoading(true)
    setError('')
    const supabase = getSupabaseBrowser()
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    window.location.replace('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-condensed text-4xl font-bold uppercase tracking-wide gradient-accent">New password</h1>
          <p className="mt-1 text-sm text-fg-dim">Choose a new password for your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
          />
          {error && <p className="text-center text-sm text-loss">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full rounded-xl bg-accent py-3.5 font-black text-canvas disabled:opacity-50 hover:brightness-110 active:scale-95 transition-all"
          >
            {loading ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </main>
  )
}
