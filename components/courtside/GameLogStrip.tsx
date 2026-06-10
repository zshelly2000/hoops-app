'use client'

export interface SavedGameEntry {
  id: string
  game_number: number
  team1_score: number
  team2_score: number
}

interface Props {
  games: SavedGameEntry[]
}

export function GameLogStrip({ games }: Props) {
  if (games.length === 0) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3.5 pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
      {games.map((g) => (
        <span
          key={g.id}
          className="flex-none rounded-lg border border-white/[.06] bg-[#111118] px-2 py-1 text-[10px] font-black text-[#94a3b8]"
        >
          G{g.game_number} <span className="text-[#f0f0f8]">{g.team1_score}–{g.team2_score}</span>
        </span>
      ))}
    </div>
  )
}
