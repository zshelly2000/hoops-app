'use client'

// Persistent past-session indicator. Rendered as the first (flex-none) row of
// every in-session courtside screen so it stays visible on check-in, paint,
// score, and post-game — not just on entry. Amber/warning family, deliberately
// distinct from the tangerine accent, so "you are editing an OLD session" is
// unmistakable. Renders nothing when date is null (normal same-day mode).
export function PastSessionBanner({ date }: { date: string | null }) {
  if (!date) return null

  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="flex-none flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5">
      <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
        ⚠ Editing past session · {label}
      </span>
    </div>
  )
}
