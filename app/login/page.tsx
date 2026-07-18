'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Multi-color Google "G" per brand guidelines.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.28A7.21 7.21 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  // Surface auth-callback failures (?error=auth_callback) without
  // useSearchParams, which would force a Suspense boundary here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) {
      setError('Sign-in link failed or expired. Try again.')
    }
  }, [])

  async function handleGoogle() {
    setError('')
    setNotice('')
    const supabase = getSupabaseBrowser()
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (err) setError(err.message)
    // On success the browser navigates to Google — no further state here.
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    const supabase = getSupabaseBrowser()

    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) {
          setError(err.message === 'Invalid login credentials' ? 'Wrong email or password' : err.message)
          return
        }
        // Full navigation so middleware sees the new session cookies.
        window.location.replace('/')
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        if (err) {
          setError(err.message)
          return
        }
        if (data.session) {
          window.location.replace('/')
        } else {
          setNotice('Check your email for a confirmation link, then sign in.')
          setMode('signin')
        }
      }
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
          <h1 className="font-condensed text-5xl font-bold uppercase tracking-wide gradient-accent">Hoopsta</h1>
          <p className="mt-1 text-sm text-fg-dim">Sign in to continue</p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-4 text-lg font-bold text-black hover:brightness-90 active:scale-95 transition-all"
        >
          <GoogleLogo />
          Sign in with Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[.08]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-dim">or</span>
          <div className="h-px flex-1 bg-white/[.08]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3.5 text-fg placeholder-fg-dim focus:border-accent focus:outline-none"
          />

          {error && <p className="text-center text-sm text-loss">{error}</p>}
          {notice && <p className="text-center text-sm text-fg-dim">{notice}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-xl border border-white/[.1] bg-surface-raised py-3.5 font-bold text-fg disabled:opacity-50 hover:border-accent active:scale-95 transition-all"
          >
            {loading ? 'Working…' : mode === 'signin' ? 'Sign in with email' : 'Create account'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError('')
              setNotice('')
            }}
            className="text-fg-dim hover:text-fg transition-colors"
          >
            {mode === 'signin' ? 'Create an account' : 'Have an account? Sign in'}
          </button>
          <Link href="/login/reset" className="text-fg-dim hover:text-fg transition-colors">
            Forgot password?
          </Link>
        </div>
      </div>
    </main>
  )
}
