export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { PlayerStats } from '@/lib/types'

export async function GET() {
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as unknown as PlayerStats[])
}

