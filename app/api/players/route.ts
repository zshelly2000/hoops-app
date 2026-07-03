export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { UNIVERSE_ID } from '@/lib/universe'
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

/** The friendly duplicate-identity 409, shared by the app-level backstop and the
 *  DB unique-index (23505) race path so both return an identical response. */
function duplicateIdentity409(name: string, nickname: string | null) {
  return NextResponse.json(
    {
      error: `There's already a ${name} who shows up as "${displayToken(name, nickname)}". Give this one something to set them apart (a last initial, Big/Little, a number).`,
    },
    { status: 409, headers: NO_CACHE },
  )
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
    .eq('universe_id', UNIVERSE_ID)

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
    return duplicateIdentity409(collision.name, collision.nickname)
  }

  const { data, error } = await supabaseAdmin
    .from('players')
    .insert({
      universe_id: UNIVERSE_ID,
      name,
      nickname,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    // Write race: two creates slipped past the app-level check and the DB index
    // rejected the second. Map this index's unique violation (23505) to the same
    // friendly 409. Match the index name in message/details (PostgrestError has no
    // `constraint` field). Any other 23505 falls through to the generic error.
    const isIdentityDup =
      error.code === '23505' &&
      (error.message.includes('players_identity_unique') ||
        error.details?.includes('players_identity_unique'))
    if (isIdentityDup) {
      return duplicateIdentity409(name, nickname)
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data as unknown as Player, { status: 201, headers: NO_CACHE })
}
