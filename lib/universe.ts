import { cache } from 'react'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSupabaseServer } from './supabase-server'
import { UNIVERSE_COOKIE } from './universe-cookie'

// The universe (tenant) is derived from the signed-in user's membership —
// session user → universe_members → universes. NEXT_PUBLIC_UNIVERSE_ID is
// retired; every write names the universe resolved here.

export type UniverseRole = 'owner' | 'organizer'

export interface UniverseContext {
  universeId: string
  role: UniverseRole
  slug: string
  name: string
  userId: string
  email: string | null
  /** Total universes this user belongs to (drives the switcher UI). */
  membershipCount: number
}

interface MemberRow {
  universe_id: string
  role: UniverseRole
  universes: { slug: string; name: string } | { slug: string; name: string }[] | null
}

function universeOf(row: MemberRow): { slug: string; name: string } | null {
  return Array.isArray(row.universes) ? row.universes[0] ?? null : row.universes
}

// Per-request memoized (React cache): pages, layouts, and route handlers in
// the same request share one resolution. Null means "no usable universe" —
// unauthenticated, memberless, or multiple memberships with no valid
// selection cookie; requireUniverse() below distinguishes those for APIs.
export const getUniverseContext = cache(async (): Promise<UniverseContext | null> => {
  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // RLS: authenticated users read their own membership rows; universes is
  // public-read — so the session client resolves both without service role.
  const { data, error } = await supabase
    .from('universe_members')
    .select('universe_id, role, universes ( slug, name )')
    .eq('user_id', user.id)

  if (error || !data || data.length === 0) return null
  const rows = data as unknown as MemberRow[]

  let row = rows[0]
  if (rows.length > 1) {
    const chosen = cookies().get(UNIVERSE_COOKIE)?.value
    const match = rows.find((r) => r.universe_id === chosen)
    if (!match) return null // picker required — middleware routes there
    row = match
  }

  const universe = universeOf(row)
  if (!universe) return null

  return {
    universeId: row.universe_id,
    role: row.role,
    slug: universe.slug,
    name: universe.name,
    userId: user.id,
    email: user.email ?? null,
    membershipCount: rows.length,
  }
})

export interface UniverseMembership {
  universeId: string
  role: UniverseRole
  slug: string
  name: string
}

// All universes the signed-in user belongs to (picker + members screens).
export async function listMemberships(): Promise<UniverseMembership[]> {
  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('universe_members')
    .select('universe_id, role, universes ( slug, name )')
    .eq('user_id', user.id)

  const rows = (data ?? []) as unknown as MemberRow[]
  return rows.flatMap((row) => {
    const universe = universeOf(row)
    if (!universe) return []
    return [{ universeId: row.universe_id, role: row.role, slug: universe.slug, name: universe.name }]
  })
}

export type UniverseGate =
  | { ctx: UniverseContext; error: null }
  | { ctx: null; error: NextResponse }

// Route-handler gate: 401 when there's no session user, 403 when the user
// holds no (selected) membership. Middleware already 401s unauthenticated
// /api requests; this keeps each handler safe on its own.
export async function requireUniverse(): Promise<UniverseGate> {
  const ctx = await getUniverseContext()
  if (ctx) return { ctx, error: null }

  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ctx: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ctx: null, error: NextResponse.json({ error: 'Not a member of this universe' }, { status: 403 }) }
}
