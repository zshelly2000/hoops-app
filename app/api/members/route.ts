export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export interface MemberEntry {
  user_id: string
  role: string
  email: string | null
  name: string | null
  is_root_owner: boolean
  is_you: boolean
}

export interface InviteEntry {
  email: string
  role: string
  created_at: string
}

export interface MembersPayload {
  universe: { id: string; name: string; slug: string }
  you: { user_id: string; email: string | null; role: string; membership_count: number }
  members: MemberEntry[]
  invites: InviteEntry[]
}

// Members + pending invites for the current universe. Any member may read
// (organizers see the list read-only); mutations live on /api/invites and
// /api/members/[userId] with owner-role checks.
export async function GET() {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const { universeId, userId, role, email, name, slug, membershipCount } = gate.ctx

  const [memberRes, universeRes, inviteRes] = await Promise.all([
    supabaseAdmin
      .from('universe_members')
      .select('user_id, role, created_at')
      .eq('universe_id', universeId)
      .order('created_at'),
    supabaseAdmin.from('universes').select('owner_id').eq('id', universeId).single(),
    supabaseAdmin
      .from('universe_invites')
      .select('email, role, created_at')
      .eq('universe_id', universeId)
      .order('created_at'),
  ])

  if (memberRes.error) {
    return NextResponse.json({ error: memberRes.error.message }, { status: 500, headers: NO_CACHE })
  }

  const rootOwnerId = (universeRes.data as { owner_id: string | null } | null)?.owner_id ?? null
  const memberRows = (memberRes.data ?? []) as Array<{ user_id: string; role: string }>

  // Emails/names live in auth.users — resolve via the admin API.
  const members: MemberEntry[] = await Promise.all(
    memberRows.map(async (m) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
      const authUser = data.user
      const fullName = authUser?.user_metadata?.full_name
      return {
        user_id: m.user_id,
        role: m.role,
        email: authUser?.email ?? null,
        name: typeof fullName === 'string' ? fullName : null,
        is_root_owner: m.user_id === rootOwnerId,
        is_you: m.user_id === userId,
      }
    }),
  )

  const payload: MembersPayload = {
    universe: { id: universeId, name, slug },
    you: { user_id: userId, email, role, membership_count: membershipCount },
    members,
    invites: (inviteRes.data ?? []) as InviteEntry[],
  }

  return NextResponse.json(payload, { headers: NO_CACHE })
}
