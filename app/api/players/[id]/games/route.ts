export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireUniverse } from '@/lib/universe'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

interface GamePlayerRow {
  id: string
  team: number
  games: {
    id: string
    game_number: number
    team1_score: number
    team2_score: number
    winning_team: number | null
    sessions: { session_date: string } | null
  } | null
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error

  const { data, error } = await supabase
    .from('game_players')
    .select(`
      id,
      team,
      games (
        id,
        game_number,
        team1_score,
        team2_score,
        winning_team,
        sessions ( session_date )
      )
    `)
    .eq('universe_id', gate.ctx.universeId)
    .eq('player_id', params.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  const rows = (data as unknown as GamePlayerRow[]).map((gp) => {
    const game = gp.games
    if (!game) return null

    const team = gp.team as 1 | 2
    const plus_minus = team === 1
      ? game.team1_score - game.team2_score
      : game.team2_score - game.team1_score

    return {
      id: game.id,
      game_number: game.game_number,
      session_date: game.sessions?.session_date ?? '',
      team,
      team1_score: game.team1_score,
      team2_score: game.team2_score,
      winning_team: game.winning_team,
      plus_minus,
    }
  }).filter(Boolean)

  return NextResponse.json(rows, { headers: NO_CACHE })
}
