'use client'

import { displayName } from '@/lib/stats'
import type { Player, TeamSlot } from '@/lib/types'

interface Props {
  players: Player[]
  selections: Map<string, TeamSlot>
  onRemove: (playerId: string) => void
}

export function TeamBuilder({ players, selections, onRemove }: Props) {
  const team1 = players.filter((p) => selections.get(p.id) === 1)
  const team2 = players.filter((p) => selections.get(p.id) === 2)

  return (
    <div className="grid grid-cols-2 gap-3">
      <TeamColumn label="Team 1" team={1} players={team1} onRemove={onRemove} />
      <TeamColumn label="Team 2" team={2} players={team2} onRemove={onRemove} />
    </div>
  )
}

function TeamColumn({
  label,
  team,
  players,
  onRemove,
}: {
  label: string
  team: TeamSlot
  players: Player[]
  onRemove: (id: string) => void
}) {
  const headerColor = team === 1 ? 'text-blue-400' : 'text-orange-400'
  const borderColor = team === 1 ? 'border-blue-800' : 'border-orange-800'
  const chipColor =
    team === 1
      ? 'bg-blue-900/60 text-blue-100 border border-blue-700'
      : 'bg-orange-900/60 text-orange-100 border border-orange-700'

  return (
    <div className={`rounded-xl border ${borderColor} bg-surface p-3`}>
      <div className={`mb-2 flex items-center justify-between ${headerColor}`}>
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        <span className="text-sm font-semibold">{players.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => onRemove(p.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${chipColor} hover:opacity-75 active:scale-95`}
            title="Tap to remove"
          >
            {displayName(p)} ×
          </button>
        ))}
        {players.length === 0 && (
          <p className="text-xs text-[#555570]">Tap players below</p>
        )}
      </div>
    </div>
  )
}
