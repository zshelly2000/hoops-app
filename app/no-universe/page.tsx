import { redirect } from 'next/navigation'
import { getSupabaseServer } from '@/lib/supabase-server'
import { claimInvitesForUser } from '@/lib/invite-claim'
import { getUniverseContext } from '@/lib/universe'
import { SignOutButton } from '@/components/shared/SignOutButton'

export const dynamic = 'force-dynamic'

// Landing spot for signed-in users with zero memberships. Every load runs
// the invite-claim check, so an invitee's flow is: get texted "you're in",
// log in, land here for a moment — claim converts the invite — and bounce
// straight into the universe.
export default async function NoUniversePage() {
  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const claimed = await claimInvitesForUser(user)
  if (claimed > 0) redirect('/')

  const ctx = await getUniverseContext()
  if (ctx) redirect('/')

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-3 text-5xl">🏀</div>
        <h1 className="font-condensed text-4xl font-bold uppercase tracking-wide gradient-accent">
          No universe yet
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-dim">
          You&apos;re not part of a universe yet. An organizer needs to invite the
          email you&apos;re signed in as — once they have, sign in again (or reload
          this page) and you&apos;ll be in.
        </p>

        <div className="mt-6 rounded-xl border border-white/[.06] bg-surface-raised px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-dim">Signed in as</p>
          <p className="mt-1 break-all font-bold text-fg">{user.email}</p>
          {!user.email_confirmed_at && (
            <p className="mt-2 text-xs text-loss">
              This email isn&apos;t confirmed yet — invites only match confirmed
              emails. Check your inbox for the confirmation link.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
