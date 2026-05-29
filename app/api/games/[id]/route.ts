export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { data, error } = await supabase
    .from('games')
    .delete()
    .eq('id', params.id)
    .select('id, session_id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  const rows = data as unknown as { id: string; session_id: string }[]
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404, headers: NO_CACHE })
  }

  // Auto-delete the session if it now has no remaining games.
  // Flow: game deleted → check remaining count → delete session if zero.
  // The game_players rows are cascade-deleted by the DB (ON DELETE CASCADE on game_id).
  const sessionId = rows[0].session_id
  const { data: remaining, error: remainErr } = await supabase
    .from('games')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1)

  // Only delete the session when the check query succeeded AND confirmed zero games remain.
  // If the check errors (remainErr != null), leave the session — the sessions list query
  // uses games!inner which already filters empty sessions out of the display.
  if (!remainErr && remaining !== null && (remaining as { id: string }[]).length === 0) {
    // Check if the session was complete before deleting it
    const { data: sess } = await supabase
      .from('sessions')
      .select('id, is_complete')
      .eq('id', sessionId)
      .single()

    // Best-effort — if this fails the game is still deleted; don't surface the error
    await supabase.from('sessions').delete().eq('id', sessionId)

    // If we deleted a complete session, regenerate narratives for the previous complete session
    if ((sess as unknown as { is_complete: boolean } | null)?.is_complete) {
      const { data: prevSession } = await supabase
        .from('sessions')
        .select('id')
        .eq('is_complete', true)
        .neq('id', sessionId)
        .order('session_date', { ascending: false })
        .limit(1)
        .single()

      if (prevSession) {
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/narratives/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: (prevSession as unknown as { id: string }).id }),
        }).catch(() => {})
      }
    }
  }

  return new NextResponse(null, { status: 204, headers: NO_CACHE })
}
