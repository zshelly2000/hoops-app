export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

// The DB is the single source of truth for slug rules — the format CHECK,
// the reserved-word CHECK, and the unique constraint. This maps each
// violation shape to a human message instead of re-implementing the rules.
function mapSlugError(error: { code: string; message: string }): NextResponse | null {
  if (error.code === '23505') {
    return NextResponse.json({ error: 'That slug is taken.' }, { status: 409, headers: NO_CACHE })
  }
  if (error.code === '23514') {
    if (error.message.includes('universes_slug_reserved')) {
      return NextResponse.json({ error: 'That word is reserved — pick another slug.' }, { status: 422, headers: NO_CACHE })
    }
    if (error.message.includes('universes_slug_format')) {
      return NextResponse.json(
        { error: 'Slugs are 2–32 lowercase letters, numbers, and hyphens.' },
        { status: 422, headers: NO_CACHE },
      )
    }
  }
  return null
}

// Existence-only availability check for the create form's debounced hint.
// Format and reserved-word violations are NOT checked here — they surface
// at submit via the mapped DB errors above.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')?.trim().toLowerCase() ?? ''
  if (!slug) {
    return NextResponse.json({ error: 'slug query param required' }, { status: 400, headers: NO_CACHE })
  }

  const { data, error } = await supabaseAdmin.from('universes').select('id').eq('slug', slug).maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }
  return NextResponse.json({ available: data === null }, { headers: NO_CACHE })
}

// Creates a universe + its owner membership. Gated by the platform-level
// invite code (UNIVERSE_CREATION_CODE, server-side only) — designed to be
// removed later by deleting the single check below.
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_CACHE })
  }

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; slug?: unknown; code?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code : ''

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name and slug are required.' }, { status: 400, headers: NO_CACHE })
  }

  // Fail closed: an unset env var must never open the gate.
  const expected = process.env.UNIVERSE_CREATION_CODE
  if (!expected || code !== expected) {
    return NextResponse.json({ error: 'Invalid invite code.' }, { status: 403, headers: NO_CACHE })
  }

  const { data: universe, error: universeError } = await supabaseAdmin
    .from('universes')
    .insert({ slug, name, owner_id: user.id, settings: {} })
    .select('id, slug')
    .single()

  if (universeError || !universe) {
    const mapped = universeError ? mapSlugError(universeError) : null
    if (mapped) return mapped
    return NextResponse.json(
      { error: universeError?.message ?? 'Failed to create universe.' },
      { status: 500, headers: NO_CACHE },
    )
  }

  const created = universe as { id: string; slug: string }

  // PostgREST has no cross-call transaction: if the owner-membership insert
  // fails, delete the just-created universe so no orphan squats on the slug.
  const { error: memberError } = await supabaseAdmin
    .from('universe_members')
    .insert({ universe_id: created.id, user_id: user.id, role: 'owner' })

  if (memberError) {
    await supabaseAdmin.from('universes').delete().eq('id', created.id)
    return NextResponse.json(
      { error: 'Could not finish creating the universe — nothing was saved. Try again.' },
      { status: 500, headers: NO_CACHE },
    )
  }

  return NextResponse.json({ universeId: created.id, slug: created.slug }, { status: 201, headers: NO_CACHE })
}
