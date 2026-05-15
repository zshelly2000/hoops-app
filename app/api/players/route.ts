export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/types'

export async function GET() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as unknown as Player[])
}

export async function POST(request: Request) {
  const body = await request.json() as { name: string; nickname?: string }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('players')
    .insert({
      name: body.name.trim(),
      nickname: body.nickname?.trim() || null,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as unknown as Player, { status: 201 })
}

