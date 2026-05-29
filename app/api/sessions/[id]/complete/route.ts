export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await supabase
    .from('sessions')
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  // Fire-and-forget narrative generation — do NOT await
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/narratives/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: params.id }),
  }).catch(() => {
    // Silently ignore — narrative generation failure is non-blocking
  })

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_CACHE })
}
