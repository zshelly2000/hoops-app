export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  let query = supabase.from('sessions').select('*').order('session_date', { ascending: false })
  if (date) query = query.eq('session_date', date)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Session[], { headers: NO_CACHE })
}

export async function POST(request: Request) {
  const body = await request.json() as { session_date: string; location?: string; notes?: string }

  const { data, error } = await supabase
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
