export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { data, error } = await supabase
    .from('games')
    .delete()
    .eq('id', params.id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data as unknown as { id: string }[]
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
