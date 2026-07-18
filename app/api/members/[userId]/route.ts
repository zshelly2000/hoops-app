export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

// Remove a member. Owner-only. The universes.owner_id root owner is
// unremovable, and you cannot remove yourself if you are the last owner.
export async function DELETE(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const { universeId, userId, role } = gate.ctx

  if (role !== 'owner') {
    return NextResponse.json({ error: 'Owner role required' }, { status: 403, headers: NO_CACHE })
  }

  const target = params.userId

  const { data: universe } = await supabaseAdmin
    .from('universes')
    .select('owner_id')
    .eq('id', universeId)
    .single()

  if ((universe as { owner_id: string | null } | null)?.owner_id === target) {
    return NextResponse.json(
      { error: 'The root owner cannot be removed' },
      { status: 400, headers: NO_CACHE },
    )
  }

  if (target === userId) {
    const { count } = await supabaseAdmin
      .from('universe_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('universe_id', universeId)
      .eq('role', 'owner')
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You're the last owner — hand off ownership first" },
        { status: 400, headers: NO_CACHE },
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('universe_members')
    .delete()
    .eq('universe_id', universeId)
    .eq('user_id', target)
    .select('user_id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }
  if (!data || (data as unknown[]).length === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404, headers: NO_CACHE })
  }

  return NextResponse.json({ ok: true }, { headers: NO_CACHE })
}
