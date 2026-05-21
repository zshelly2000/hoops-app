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

  // Auto-delete the session if it now has no remaining games
  const sessionId = rows[0].session_id
  const { data: remaining } = await supabase
    .from('games')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1)

  if (remaining && (remaining as { id: string }[]).length === 0) {
    // Best-effort — if this fails the game is still deleted; don't surface the error
    await supabase.from('sessions').delete().eq('id', sessionId)
  }

  return new NextResponse(null, { status: 204, headers: NO_CACHE })
}
