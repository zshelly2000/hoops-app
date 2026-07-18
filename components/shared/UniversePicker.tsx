'use client'

import { UNIVERSE_COOKIE } from '@/lib/universe-cookie'
import type { UniverseMembership } from '@/lib/universe'

// Sets the universe-selection cookie client-side (it's a routing preference,
// not a credential — the server validates it against real memberships on
// every request) and hard-navigates so middleware re-routes.
export function UniversePicker({ options }: { options: UniverseMembership[] }) {
  function choose(universeId: string) {
    document.cookie = `${UNIVERSE_COOKIE}=${universeId}; path=/; max-age=31536000; samesite=lax`
    window.location.replace('/')
  }

  return (
    <ul className="flex flex-col gap-2">
      {options.map((option) => (
        <li key={option.universeId}>
          <button
            onClick={() => choose(option.universeId)}
            className="flex w-full items-center justify-between rounded-xl border border-white/[.06] bg-surface-raised px-4 py-4 text-left hover:border-accent active:scale-95 transition-all"
          >
            <span className="font-bold text-fg">{option.name}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-dim">{option.role}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
