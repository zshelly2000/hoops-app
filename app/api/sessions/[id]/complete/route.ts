export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await supabase
    .from('sessions')
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  // Derive the absolute URL from the incoming request — always resolves to the
  // current deployment with no env var needed. Await the call directly: the
  // client resets optimistically and never waits for this response, so we can
  // safely take the time required for generation without blocking the user.
  try {
    const { origin } = new URL(request.url)
    await fetch(`${origin}/api/narratives/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: params.id }),
    })
  } catch {
    // Generation failure is non-blocking — session is already marked complete
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_CACHE })
}
