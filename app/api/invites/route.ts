export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

// Add (or refresh) an invite row. Owner-only. No email is sent — the owner
// texts the invitee; the row converts to membership on their next login.
export async function POST(request: Request) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const { universeId, userId, role } = gate.ctx

  if (role !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403, headers: NO_CACHE })
  }

  const body = (await request.json()) as { email?: string; role?: string }
  const email = body.email?.trim().toLowerCase()
  const inviteRole = body.role

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400, headers: NO_CACHE })
  }
  if (inviteRole !== 'owner' && inviteRole !== 'organizer') {
    return NextResponse.json({ error: "Role must be 'owner' or 'organizer'" }, { status: 400, headers: NO_CACHE })
  }

  // Re-inviting the same email updates the role/inviter — PK (universe, email).
  const { data, error } = await supabaseAdmin
    .from('universe_invites')
    .upsert(
      { universe_id: universeId, email, role: inviteRole, invited_by: userId },
      { onConflict: 'universe_id,email' },
    )
    .select('email, role, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  return NextResponse.json(data, { status: 201, headers: NO_CACHE })
}

// Revoke a pending invite. Owner-only.
export async function DELETE(request: Request) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const { universeId, role } = gate.ctx

  if (role !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403, headers: NO_CACHE })
  }

  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400, headers: NO_CACHE })
  }

  const { data, error } = await supabaseAdmin
    .from('universe_invites')
    .delete()
    .eq('universe_id', universeId)
    .eq('email', email)
    .select('email')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }
  if (!data || (data as unknown[]).length === 0) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404, headers: NO_CACHE })
  }

  return NextResponse.json({ ok: true }, { headers: NO_CACHE })
}
