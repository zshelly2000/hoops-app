export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { UNIVERSE_ID } from '@/lib/universe'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await supabaseAdmin
    .from('sessions')
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq('universe_id', UNIVERSE_ID)
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE })
  }

  // Single responsibility: mark the session complete and return immediately.
  // The client awaits this response, then fires POST /api/narratives/generate
  // directly from the browser — the same approach used by the Regenerate button,
  // which is the only path confirmed to work reliably on Vercel.
  return NextResponse.json({ ok: true }, { status: 200, headers: NO_CACHE })
}
