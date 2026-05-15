export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
