'use client'

import { displayName } from '@/lib/stats'
import type { Player } from '@/lib/types'

interface Props {
  player: Player
  team?: 1 | 2 | null
  onRemove?: () => void
}

const teamColors = {
  1: 'bg-blue-600 text-white',
  2: 'bg-orange-400 text-white',
}

export function PlayerBadge({ player, team, onRemove }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${
        team ? teamColors[team] : 'bg-[#2a2a3a] text-[#f0f0f8]'
      }`}
    >
      {displayName(player)}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 rounded-full hover:opacity-75 focus:outline-none"
          aria-label={`Remove ${displayName(player)}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
