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
