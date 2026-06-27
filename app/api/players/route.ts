export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Player } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

/** lowercase, trim, collapse internal whitespace — comparison only. Mirrors the client. */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** On-screen short name / display token: nickname, else first word of full name. */
function displayToken(name: string, nickname: string | null): string {
  const nick = nickname?.trim()
  if (nick) return nick
  return name.trim().split(/\s+/)[0] ?? ''
}

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

  const name = body.name.trim().replace(/\s+/g, ' ')
  const nickname = body.nickname?.trim() || null

  // Backstop: enforce a globally-unique on-screen identity (active + inactive).
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('players')
    .select('id,name,nickname')

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500, headers: NO_CACHE })
  }

  const incomingNorm = normalize(name)
  const incomingToken = normalize(displayToken(name, nickname))
  const collision = (existing as { name: string; nickname: string | null }[] | null)?.find(
    (p) =>
      normalize(p.name) === incomingNorm &&
      normalize(displayToken(p.name, p.nickname)) === incomingToken,
  )

  if (collision) {
    return NextResponse.json(
      {
        error: `There's already a ${collision.name} who shows up as "${displayToken(collision.name, collision.nickname)}". Give this one something to set them apart (a last initial, Big/Little, a number).`,
      },
      { status: 409, headers: NO_CACHE },
    )
  }

  const { data, error } = await supabaseAdmin
    .from('players')
    .insert({
      name,
      nickname,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Player, { status: 201, headers: NO_CACHE })
}
