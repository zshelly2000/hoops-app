import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { UNIVERSE_COOKIE } from '@/lib/universe-cookie'

// Everything is behind login — reads and writes. The only public surfaces
// are the login screens (sign in / reset request) and the OAuth callback.
// The stats portal (separate app) remains the public face of the data.
function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/') || pathname.startsWith('/auth/')
}

// Screens a signed-in user without a (selected) universe may still visit.
function isMembershipExempt(pathname: string): boolean {
  return (
    isPublicPath(pathname) ||
    pathname === '/no-universe' ||
    pathname === '/pick-universe' ||
    pathname === '/update-password'
  )
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Refreshes the session if expired — must run before any routing decision.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user) {
    if (isPublicPath(pathname)) return response
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Signed-in users don't need the login screens.
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    const redirect = NextResponse.redirect(new URL('/', request.url))
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // Page navigations get membership-aware routing (zero → /no-universe,
  // several without a chosen one → /pick-universe). API routes skip this —
  // each handler resolves universe context itself and returns 401/403.
  if (!pathname.startsWith('/api/') && !isMembershipExempt(pathname)) {
    const { data: memberships } = await supabase
      .from('universe_members')
      .select('universe_id')
      .eq('user_id', user.id)

    const rows = memberships ?? []
    if (rows.length === 0) {
      const redirect = NextResponse.redirect(new URL('/no-universe', request.url))
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
      return redirect
    }
    if (rows.length > 1) {
      const chosen = request.cookies.get(UNIVERSE_COOKIE)?.value
      if (!chosen || !rows.some((r) => r.universe_id === chosen)) {
        const redirect = NextResponse.redirect(new URL('/pick-universe', request.url))
        response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
        return redirect
      }
    }
  }

  return response
}

export const config = {
  // Run on all routes except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json).*)'],
}
