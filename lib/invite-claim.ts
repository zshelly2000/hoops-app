import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabase-admin'

// Invites are rows, not emails: convert any universe_invites rows matching
// this user's VERIFIED email into universe_members rows. Runs on every
// login (auth callback) and on the no-universe screen's load. Both the
// membership insert and the invite delete are service-role — RLS gives
// authenticated users no access to universe_invites at all.
export async function claimInvitesForUser(user: User): Promise<number> {
  const email = user.email?.toLowerCase()
  // Google identities arrive verified; password accounts must have
  // confirmed (email_confirmed_at). Unverified emails claim nothing —
  // otherwise anyone could sign up with someone else's address.
  if (!email || !user.email_confirmed_at) return 0

  const { data: invites, error } = await supabaseAdmin
    .from('universe_invites')
    .select('universe_id, role')
    .eq('email', email)

  if (error || !invites || invites.length === 0) return 0

  let claimed = 0
  for (const invite of invites as Array<{ universe_id: string; role: string }>) {
    const { error: memberErr } = await supabaseAdmin
      .from('universe_members')
      .upsert(
        { universe_id: invite.universe_id, user_id: user.id, role: invite.role },
        { onConflict: 'universe_id,user_id' },
      )
    if (memberErr) continue // leave the invite in place; next login retries

    await supabaseAdmin
      .from('universe_invites')
      .delete()
      .eq('universe_id', invite.universe_id)
      .eq('email', email)
    claimed++
  }
  return claimed
}
