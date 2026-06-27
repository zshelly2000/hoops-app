export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { displayToken, normalize, pinnedBadgeFor } from '@/lib/identity'
import type { Player } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

interface GPRow {
  player_id: string
  team: number
  game_id: string
}

interface MergeBody {
  survivorId: string
  loserId: string
  displayName: string
  displayNickname: string | null
  confirmTwin?: boolean
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<MergeBody>
  const { survivorId, loserId, confirmTwin } = body
  const displayName = body.displayName
  const displayNickname = body.displayNickname ?? null

  // ── Guard 1: distinct ids, both exist, and a usable display name ──────────
  if (!survivorId || !loserId || survivorId === loserId) {
    return NextResponse.json(
      { error: 'survivorId and loserId must be two different players' },
      { status: 400, headers: NO_CACHE },
    )
  }
  if (!displayName?.trim()) {
    return NextResponse.json({ error: 'A display name is required' }, { status: 400, headers: NO_CACHE })
  }

  const { data: playersData, error: playersErr } = await supabase
    .from('players')
    .select('*')
    .in('id', [survivorId, loserId])

  if (playersErr) {
    return NextResponse.json({ error: playersErr.message }, { status: 500, headers: NO_CACHE })
  }

  const players = playersData as unknown as Player[]
  const survivor = players.find((p) => p.id === survivorId)
  const loser = players.find((p) => p.id === loserId)
  if (!survivor || !loser) {
    return NextResponse.json({ error: 'One or both players no longer exist' }, { status: 400, headers: NO_CACHE })
  }

  // ── Re-derive head-to-head + overlaps from fresh data (never trust client) ─
  const { data: gpData, error: gpErr } = await supabase
    .from('game_players')
    .select('player_id, team, game_id')
    .in('player_id', [survivorId, loserId])

  if (gpErr) {
    return NextResponse.json({ error: gpErr.message }, { status: 500, headers: NO_CACHE })
  }

  const rows = gpData as unknown as GPRow[]
  const byGame = new Map<string, { sTeam: number | null; lTeam: number | null }>()
  for (const r of rows) {
    const entry = byGame.get(r.game_id) ?? { sTeam: null, lTeam: null }
    if (r.player_id === survivorId) entry.sTeam = r.team
    else entry.lTeam = r.team
    byGame.set(r.game_id, entry)
  }

  let oppositeTeamGames = 0
  const sameTeamGameIds: string[] = []
  for (const [gameId, { sTeam, lTeam }] of Array.from(byGame.entries())) {
    if (sTeam === null || lTeam === null) continue
    if (sTeam === lTeam) sameTeamGameIds.push(gameId)
    else oppositeTeamGames += 1
  }

  // ── Guard 2: opposite-teams is a hard block (v1, no override) ─────────────
  if (oppositeTeamGames > 0) {
    return NextResponse.json(
      {
        error: `These players were opponents in ${oppositeTeamGames} game${oppositeTeamGames === 1 ? '' : 's'} — merging would put one person on both sides of a game. They look like two different people; merge is blocked.`,
      },
      { status: 409, headers: NO_CACHE },
    )
  }

  // ── Guard 3: a pinned-badge loser would orphan a name-keyed pin ───────────
  const loserBadge = pinnedBadgeFor(loser)
  if (loserBadge) {
    return NextResponse.json(
      { error: `${loser.name} holds a pinned badge (${loserBadge.badge}) — make them the survivor instead.` },
      { status: 409, headers: NO_CACHE },
    )
  }

  // ── Guard 4: identical on-screen twins need an explicit confirm ───────────
  const identicalTwin =
    normalize(survivor.name) === normalize(loser.name) &&
    normalize(displayToken(survivor.name, survivor.nickname)) ===
      normalize(displayToken(loser.name, loser.nickname))
  if (identicalTwin && confirmTwin !== true) {
    return NextResponse.json(
      {
        error:
          'These two records are identical on screen — confirm they are the same person before merging.',
        needsTwinConfirm: true,
      },
      { status: 409, headers: NO_CACHE },
    )
  }

  // ── Execution (all guards passed). Order matters; the sequence is monotonic:
  // if it dies mid-way, reassigned rows stay reassigned and the loser still
  // exists with its remaining rows, so a re-run completes the merge. ─────────

  // 1. Dedup same-team collisions: drop the LOSER's row in each shared-team game
  //    so the survivor never ends up on one team twice.
  const gamesDeduped = sameTeamGameIds.length
  if (gamesDeduped > 0) {
    const { error: dedupErr } = await supabaseAdmin
      .from('game_players')
      .delete()
      .eq('player_id', loserId)
      .in('game_id', sameTeamGameIds)
    if (dedupErr) {
      return NextResponse.json({ error: `Dedup step failed: ${dedupErr.message}` }, { status: 500, headers: NO_CACHE })
    }
  }

  // 2. Reassign every remaining loser row to the survivor. After step 1 there
  //    are no same-team collisions, and opposite-team games were hard-blocked,
  //    so the survivor cannot end up twice in any game.
  const { data: movedRows, error: reassignErr } = await supabaseAdmin
    .from('game_players')
    .update({ player_id: survivorId })
    .eq('player_id', loserId)
    .select('id')
  if (reassignErr) {
    return NextResponse.json({ error: `Reassign step failed: ${reassignErr.message}` }, { status: 500, headers: NO_CACHE })
  }
  const gamesMoved = (movedRows as { id: string }[] | null)?.length ?? 0

  // 3. Apply the chosen display identity to the survivor. The merged person is
  //    active if EITHER record was.
  const finalName = displayName.trim().replace(/\s+/g, ' ')
  const finalNickname = displayNickname?.trim() || null
  const { error: identityErr } = await supabaseAdmin
    .from('players')
    .update({
      name: finalName,
      nickname: finalNickname,
      is_active: survivor.is_active || loser.is_active,
    })
    .eq('id', survivorId)
  if (identityErr) {
    return NextResponse.json({ error: `Identity update failed: ${identityErr.message}` }, { status: 500, headers: NO_CACHE })
  }

  // 4. Delete the loser. By now nothing in game_players references it, so the
  //    ON DELETE RESTRICT FK on game_players.player_id is satisfied. If some
  //    other FK still blocks it, surface the error rather than forcing.
  const { error: deleteErr } = await supabaseAdmin.from('players').delete().eq('id', loserId)
  if (deleteErr) {
    return NextResponse.json(
      {
        error: `Games merged into ${finalName}, but ${loser.name}'s record could not be deleted: ${deleteErr.message}`,
      },
      { status: 500, headers: NO_CACHE },
    )
  }

  return NextResponse.json(
    { ok: true, survivorId, gamesMoved, gamesDeduped, finalName },
    { headers: NO_CACHE },
  )
}
