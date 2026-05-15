import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'hoops-auth'

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let the login page and auth API through unconditionally
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const appPassword = process.env.APP_PASSWORD
  // No password configured → open (useful for local dev without .env.local set)
  if (!appPassword) return NextResponse.next()

  const expectedToken = await hashPassword(appPassword)
  const cookie = request.cookies.get(COOKIE_NAME)

  if (cookie?.value === expectedToken) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Run on all routes except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
