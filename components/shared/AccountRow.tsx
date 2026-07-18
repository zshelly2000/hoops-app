'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

// Signed-in indicator + Members entry + sign-out, styled for the courtside
// nav sheet's dark tile material.
export function AccountRow() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    void getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  async function handleSignOut() {
    await getSupabaseBrowser().auth.signOut()
    window.location.replace('/login')
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-white/[.06] bg-[#1a1a28] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#555570]">Signed in</p>
        <p className="truncate text-xs font-semibold text-[#94a3b8]">{email ?? '…'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/members"
          className="rounded-xl border border-white/[.06] px-3 py-2 text-xs font-semibold text-[#94a3b8] hover:text-white"
        >
          Members
        </Link>
        <button
          onClick={handleSignOut}
          className="rounded-xl border border-white/[.06] px-3 py-2 text-xs font-semibold text-[#94a3b8] hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
