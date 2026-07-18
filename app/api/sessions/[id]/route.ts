export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'
import type { Session } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('universe_id', gate.ctx.universeId)
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Session, { headers: NO_CACHE })
}

// Discard an abandoned zero-game session (courtside's "Discard session").
// Sessions with games are never deleted here — removing the last game via
// DELETE /api/games/[id] is the existing (and only) path that deletes a
// non-empty session. The zero-game guard is enforced server-side so a stale
// client can't delete a session that picked up games elsewhere.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const universeId = gate.ctx.universeId

  const { data: games, error: gamesErr } = await supabase
    .from('games')
    .select('id')
    .eq('universe_id', universeId)
    .eq('session_id', params.id)
    .limit(1)

  if (gamesErr) {
    return NextResponse.json({ error: gamesErr.message }, { status: 500, headers: NO_CACHE })
  }
  if (games && (games as unknown[]).length > 0) {
    return NextResponse.json(
      { error: 'Session has games — delete its games instead' },
      { status: 409, headers: NO_CACHE },
    )
  }

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .delete()
    .eq('universe_id', universeId)
    .eq('id', params.id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }
  if (!data || (data as unknown[]).length === 0) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: NO_CACHE })
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_CACHE })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error

  const body = await request.json() as Record<string, unknown>

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .update(body)
    .eq('universe_id', gate.ctx.universeId)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Session, { headers: NO_CACHE })
}
