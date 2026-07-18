'use client'

import { getSupabaseBrowser } from '@/lib/supabase-browser'

export function SignOutButton({ className }: { className?: string }) {
  async function handleSignOut() {
    await getSupabaseBrowser().auth.signOut()
    window.location.replace('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      className={
        className ??
        'rounded-xl border border-white/[.1] px-4 py-2.5 text-sm font-bold text-fg-dim hover:text-fg hover:border-white/[.2] active:scale-95 transition-all'
      }
    >
      Sign out
    </button>
  )
}
