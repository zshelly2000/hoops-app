'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Standard Supabase reset flow, step 1: request the email. The link in the
// email lands on /auth/callback?next=/update-password with a recovery code.
export default function ResetRequestPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = getSupabaseBrowser()
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-condensed text-4xl font-bold uppercase tracking-wide gradient-accent">Reset password</h1>
          <p className="mt-1 text-sm text-fg-dim">We&apos;ll email you a reset link</p>
        </div>

        {sent ? (
          <p className="text-center text-sm text-fg">
            If that email has an account, a reset link is on its way. Open it on this device.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              autoComplete="email"
              className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
            />
            {error && <p className="text-center text-sm text-loss">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full rounded-xl bg-accent py-3.5 font-black text-canvas disabled:opacity-50 hover:brightness-110 active:scale-95 transition-all"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-fg-dim hover:text-fg transition-colors">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
