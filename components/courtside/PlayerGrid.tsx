'use client'

import { useMemo, useState } from 'react'
import { displayName } from '@/lib/stats'
import type { Player, TeamSlot } from '@/lib/types'

interface Props {
  players: Player[]
  selections: Map<string, TeamSlot>
  onToggle: (playerId: string) => void
}

const teamStyles: Record<TeamSlot, string> = {
  1: 'border-blue-500 bg-blue-900/50 text-blue-100',
  2: 'border-orange-500 bg-orange-900/50 text-orange-100',
}

const teamLabels: Record<TeamSlot, string> = {
  1: 'T1',
  2: 'T2',
}

export function PlayerGrid({ players, selections, onToggle }: Props) {
  const [search, setSearch] = useState('')

  // Compute once when player list changes: set of display names that are shared
  const sharedDisplayNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of players) {
      const dn = displayName(p)
      counts.set(dn, (counts.get(dn) ?? 0) + 1)
    }
    const shared = new Set<string>()
    for (const [dn, count] of Array.from(counts.entries())) {
      if (count > 1) shared.add(dn)
    }
    return shared
  }, [players])

  const filtered = search.trim()
    ? players.filter((p) =>
        displayName(p).toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : players

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Search players..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {filtered.map((player) => {
          const team = selections.get(player.id) ?? null
          const dn = displayName(player)
          const subtitle = sharedDisplayNames.has(dn) ? player.name : null

          const baseStyle =
            'flex min-h-[64px] flex-col items-center justify-center rounded-xl border-2 px-2 py-3 text-center text-sm font-semibold transition-all active:scale-95 cursor-pointer select-none'
          const style = team
            ? `${baseStyle} ${teamStyles[team]}`
            : `${baseStyle} border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-500`

          return (
            <button key={player.id} className={style} onClick={() => onToggle(player.id)}>
              <span className="leading-tight">{dn}</span>
              {subtitle && (
                <span className="mt-0.5 text-[10px] font-normal opacity-60 leading-tight">
                  {subtitle}
                </span>
              )}
              {team && (
                <span className="mt-1 text-xs font-bold opacity-80">{teamLabels[team]}</span>
              )}
            </button>
          )
        })}

        {filtered.length === 0 && (
          <p className="col-span-3 py-6 text-center text-sm text-zinc-500 sm:col-span-4">
            No players found
          </p>
        )}
      </div>
    </div>
  )
}
