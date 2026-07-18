import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { claimInvitesForUser } from '@/lib/invite-claim'

// OAuth / PKCE code exchange (Google sign-in, email confirmation, password
// recovery links all land here). Public route — the only one besides /login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  // Only allow relative in-app targets.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (code) {
    const supabase = getSupabaseServer()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Every-login invite-claim check (Google emails arrive verified).
      if (data.user) await claimInvitesForUser(data.user)

      // Behind Vercel's proxy the request origin is the internal host —
      // prefer the forwarded host in production (official @supabase/ssr
      // callback pattern).
      const forwardedHost = request.headers.get('x-forwarded-host')
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.redirect(`${origin}${safeNext}`)
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${safeNext}`)
      }
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
