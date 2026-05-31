'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatAvgPlusMinus, formatPlusMinus, formatWinPct } from '@/lib/stats'
import type { PlayerStats } from '@/lib/types'

type SortKey = 'rank' | 'games_played' | 'wins' | 'losses' | 'win_pct' | 'avg_plus_minus' | 'total_plus_minus'

interface Props {
  players: PlayerStats[]
}

export function LeaderboardTable({ players }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('avg_plus_minus')
  const [sortAsc, setSortAsc] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((a) => !a)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...players].sort((a, b) => {
    let va: number
    let vb: number

    switch (sortKey) {
      case 'games_played': va = a.games_played; vb = b.games_played; break
      case 'wins': va = a.wins; vb = b.wins; break
      case 'losses': va = a.losses; vb = b.losses; break
      case 'win_pct': va = a.win_pct ?? 0; vb = b.win_pct ?? 0; break
      case 'total_plus_minus': va = a.total_plus_minus; vb = b.total_plus_minus; break
      default: va = a.avg_plus_minus ?? -Infinity; vb = b.avg_plus_minus ?? -Infinity
    }

    return sortAsc ? va - vb : vb - va
  })

  function ColHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-right text-xs font-bold uppercase tracking-wider ${
          active ? 'text-[#fb923c]' : 'text-slate-400 hover:text-slate-300'
        }`}
        onClick={() => handleSort(col)}
      >
        {label}
        {active && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>}
      </th>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[.06]">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-surface">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400">#</th>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Player</th>
            <ColHeader label="GP" col="games_played" />
            <ColHeader label="W" col="wins" />
            <ColHeader label="L" col="losses" />
            <ColHeader label="Win%" col="win_pct" />
            <ColHeader label="Avg +/-" col="avg_plus_minus" />
            <ColHeader label="Tot +/-" col="total_plus_minus" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[.06]">
          {sorted.map((p, i) => {
            const avgPm = p.avg_plus_minus ?? 0
            const pmColor = avgPm > 0 ? 'text-green-400' : avgPm < 0 ? 'text-red-400' : 'text-zinc-400'

            return (
              <tr key={p.player_id} className="hover:bg-surface/60">
                <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                <td className="px-3 py-3">
                  <Link
                    href={`/players/${p.player_id}`}
                    className="font-semibold text-[#f0f0f8] hover:text-[#fb923c]"
                  >
                    {p.nickname ?? p.name}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right text-slate-300">{p.games_played}</td>
                <td className="px-3 py-3 text-right text-slate-300">{p.wins}</td>
                <td className="px-3 py-3 text-right text-slate-300">{p.losses}</td>
                <td className="px-3 py-3 text-right text-slate-300">{formatWinPct(p.win_pct)}</td>
                <td className={`px-3 py-3 text-right font-semibold ${pmColor}`}>
                  {formatAvgPlusMinus(p.avg_plus_minus)}
                </td>
                <td className={`px-3 py-3 text-right ${pmColor}`}>
                  {formatPlusMinus(p.total_plus_minus)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
