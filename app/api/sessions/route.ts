export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Session } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (date) {
    // Courtside uses ?date= to look up the active session for a specific day.
    // A session that was just started (0 games) must still be returned so the
    // courtside screen can continue logging into it — no !inner filter here.
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_date', date)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
    }

    return NextResponse.json(data as unknown as Session[], { headers: NO_CACHE })
  }

  // Sessions list (no date filter): only return sessions that have at least one
  // game. games!inner uses an INNER JOIN on the games table, which excludes any
  // sessions row with no matching games rows.  The extra `games` field in the
  // response JSON is ignored by the client.
  const { data, error } = await supabase
    .from('sessions')
    .select('*, games!inner(id)')
    .order('session_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Session[], { headers: NO_CACHE })
}

export async function POST(request: Request) {
  const body = await request.json() as { session_date: string; location?: string; notes?: string }

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      session_date: body.session_date,
      location: body.location ?? 'McKinley Park',
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    // Handle unique constraint: session already exists for date+location
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_date', body.session_date)
        .eq('location', body.location ?? 'McKinley Park')
        .single()
      return NextResponse.json(existing as unknown as Session, { headers: NO_CACHE })
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Session, { status: 201, headers: NO_CACHE })
}
