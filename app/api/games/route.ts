export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { UNIVERSE_ID } from '@/lib/universe'
import type { Game } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function POST(request: Request) {
  const body = await request.json() as {
    session_id: string
    team1_score: number
    team2_score: number
    team1_players: string[]
    team2_players: string[]
  }

  const { session_id, team1_score, team2_score, team1_players, team2_players } = body

  if (!session_id || team1_players.length < 2 || team2_players.length < 2) {
    return NextResponse.json({ error: 'Invalid game data' }, { status: 400, headers: NO_CACHE })
  }

  const allPlayers = [...team1_players, ...team2_players]
  if (new Set(allPlayers).size !== allPlayers.length) {
    return NextResponse.json({ error: 'A player cannot appear on both teams' }, { status: 400, headers: NO_CACHE })
  }

  // Get next game number
  const { data: existingGames } = await supabase
    .from('games')
    .select('game_number')
    .eq('universe_id', UNIVERSE_ID)
    .eq('session_id', session_id)
    .order('game_number', { ascending: false })
    .limit(1)

  const rows = existingGames as { game_number: number }[] | null
  const game_number = rows && rows.length > 0 ? rows[0].game_number + 1 : 1

  // Insert game
  const { data: gameData, error: gameError } = await supabaseAdmin
    .from('games')
    .insert({ universe_id: UNIVERSE_ID, session_id, game_number, team1_score, team2_score })
    .select()
    .single()

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500, headers: NO_CACHE })
  }

  const game = gameData as unknown as Game

  // Insert game_players
  const gamePlayers = [
    ...team1_players.map((player_id) => ({ universe_id: UNIVERSE_ID, game_id: game.id, player_id, team: 1 })),
    ...team2_players.map((player_id) => ({ universe_id: UNIVERSE_ID, game_id: game.id, player_id, team: 2 })),
  ]

  const { error: playersError } = await supabaseAdmin
    .from('game_players')
    .insert(gamePlayers)

  if (playersError) {
    await supabaseAdmin.from('games').delete().eq('universe_id', UNIVERSE_ID).eq('id', game.id)
    return NextResponse.json({ error: playersError.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(game, { status: 201, headers: NO_CACHE })
}
