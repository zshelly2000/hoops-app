import { redirect } from 'next/navigation'
import { getSupabaseServer } from '@/lib/supabase-server'
import { listMemberships } from '@/lib/universe'
import { UniversePicker } from '@/components/shared/UniversePicker'
import { SignOutButton } from '@/components/shared/SignOutButton'

export const dynamic = 'force-dynamic'

// Minimal picker for users in more than one universe. Nobody will see this
// yet (everyone has at most one membership) — it exists so the multi-universe
// case is handled, not a dead end.
export default async function PickUniversePage() {
  const supabase = getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const memberships = await listMemberships()
  if (memberships.length === 0) redirect('/no-universe')
  if (memberships.length === 1) redirect('/')

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-condensed text-4xl font-bold uppercase tracking-wide gradient-accent">
            Pick a universe
          </h1>
          <p className="mt-1 text-sm text-fg-dim">You belong to more than one run</p>
        </div>

        <UniversePicker options={memberships} />

        <div className="mt-8 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
