export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

const COOKIE_NAME = 'hoops-auth'
const THIRTY_DAYS = 60 * 60 * 24 * 30

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(request: Request) {
  const body = await request.json() as { password: string }
  const appPassword = process.env.APP_PASSWORD

  if (!appPassword) {
    return NextResponse.json({ error: 'No password configured' }, { status: 500, headers: NO_CACHE })
  }

  if (!body.password || body.password !== appPassword) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401, headers: NO_CACHE })
  }

  const token = await hashPassword(appPassword)

  const response = NextResponse.json({ ok: true }, { headers: NO_CACHE })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: THIRTY_DAYS,
    path: '/',
  })

  return response
}
