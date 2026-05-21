export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Player, { headers: NO_CACHE })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = await request.json() as Partial<{ name: string; nickname: string | null; is_active: boolean; notes: string }>

  const { data, error } = await supabase
    .from('players')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Player, { headers: NO_CACHE })
}
