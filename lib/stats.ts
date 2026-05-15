import type { PlayerStats } from './types'

export function formatWinPct(winPct: number | null): string {
  if (winPct === null) return '—'
  return (winPct * 100).toFixed(1) + '%'
}

export function formatPlusMinus(value: number | null): string {
  if (value === null) return '—'
  const rounded = Math.round(value * 10) / 10
  return rounded >= 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1)
}

export function formatAvgPlusMinus(value: number | null): string {
  if (value === null) return '—'
  const rounded = Number(value)
  return rounded >= 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2)
}

export function rankPlayers(
  players: PlayerStats[],
  minGames: number = 10,
): PlayerStats[] {
  return players
    .filter((p) => p.games_played >= minGames)
    .sort((a, b) => {
      const aAvg = a.avg_plus_minus ?? -Infinity
      const bAvg = b.avg_plus_minus ?? -Infinity
      return bAvg - aAvg
    })
}

export function displayName(player: { name: string; nickname: string | null }): string {
  return player.nickname ?? player.name
}
