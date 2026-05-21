export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { PlayerStats } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function GET() {
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as PlayerStats[], { headers: NO_CACHE })
}
