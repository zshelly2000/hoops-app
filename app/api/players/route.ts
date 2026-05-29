export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Player } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Player[], { headers: NO_CACHE })
}

export async function POST(request: Request) {
  const body = await request.json() as { name: string; nickname?: string }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: NO_CACHE })
  }

  const { data, error } = await supabaseAdmin
    .from('players')
    .insert({
      name: body.name.trim(),
      nickname: body.nickname?.trim() || null,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Player, { status: 201, headers: NO_CACHE })
}
