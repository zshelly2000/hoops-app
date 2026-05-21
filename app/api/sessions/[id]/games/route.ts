export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { data, error } = await supabase
    .from('games')
    .select(`
      id,
      game_number,
      team1_score,
      team2_score,
      winning_team,
      game_players (
        id,
        player_id,
        team,
        players ( id, name, nickname )
      )
    `)
    .eq('session_id', params.id)
    .order('game_number')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data, { headers: NO_CACHE })
}
