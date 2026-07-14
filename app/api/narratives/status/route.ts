export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

// Lightweight readiness check for the post–End Session share prompt: has the
// Rundown finished generating for this session yet? Narratives are inserted as a
// single batch when generation completes, so count > 0 is a clean "ready" signal.
// Service-role count (head:true) — no row payload, just the number.
export async function GET(req: Request) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error

  const sessionId = new URL(req.url).searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400, headers: NO_CACHE })
  }

  const { count, error } = await supabaseAdmin
    .from('narratives')
    .select('id', { count: 'exact', head: true })
    .eq('universe_id', gate.ctx.universeId)
    .eq('session_id', sessionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(
    { ready: (count ?? 0) > 0, count: count ?? 0 },
    { status: 200, headers: NO_CACHE },
  )
}
