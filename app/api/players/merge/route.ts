export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'
import { displayToken, normalize } from '@/lib/identity'
import { badgeDisplayName } from '@/lib/badges'
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
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const universeId = gate.ctx.universeId

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
    .eq('universe_id', universeId)
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
    .eq('universe_id', universeId)
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

  // ── Guard 3: a loser who currently holds an all-time badge must survive ───
  // Live check against badge_holders (recomputed nightly by hoops-stats).
  // all_time only: monthly badges (rookie alone has ~105 holders, including
  // every recent one-game player — exactly the population dedup merges target)
  // must not block merges. An empty result passes: the player holds nothing,
  // or the universe has no badges yet.
  const { data: badgeData, error: badgeErr } = await supabaseAdmin
    .from('badge_holders')
    .select('badge_id')
    .eq('universe_id', universeId)
    .eq('player_id', loserId)
    .eq('badge_type', 'all_time')

  // FAIL CLOSED: a guard that silently passes on failure is not a guard.
  if (badgeErr) {
    console.error('badge_holders lookup failed during merge:', badgeErr)
    return NextResponse.json(
      { error: 'Could not verify badge holders — merge blocked. Try again shortly.' },
      { status: 503, headers: NO_CACHE },
    )
  }

  const heldBadges = ((badgeData as { badge_id: string }[] | null) ?? []).map((r) =>
    badgeDisplayName(r.badge_id),
  )
  if (heldBadges.length > 0) {
    return NextResponse.json(
      { error: `Cannot merge away ${loser.name} — current holder of: ${heldBadges.join(', ')}` },
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
      .eq('universe_id', universeId)
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
    .eq('universe_id', universeId)
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
    .eq('universe_id', universeId)
    .eq('id', survivorId)
  if (identityErr) {
    return NextResponse.json({ error: `Identity update failed: ${identityErr.message}` }, { status: 500, headers: NO_CACHE })
  }

  // 4. Clear the loser from the derived stat tables whose FK to players.id is
  //    RESTRICT, so the final delete isn't blocked. Empirically (see
  //    MERGE_FINISH), the restricting tables are trio_stats and
  //    lineup_five_stats — the loser can sit in ANY of their player columns.
  //    The other player-referencing derived tables (player_rapm, player_bff,
  //    player_nemesis, …) are cascade/set-null and don't block. All of these are
  //    nightly-recomputed, so deleting the loser's rows is safe — they
  //    regenerate on the next run. Done in the same guarded, monotonic sequence,
  //    before the player delete.
  const restrictingDerived: { table: string; cols: string[] }[] = [
    { table: 'trio_stats', cols: ['player1_id', 'player2_id', 'player3_id'] },
    { table: 'lineup_five_stats', cols: ['player1_id', 'player2_id', 'player3_id', 'player4_id', 'player5_id'] },
  ]
  for (const { table, cols } of restrictingDerived) {
    const orFilter = cols.map((c) => `${c}.eq.${loserId}`).join(',')
    const { error: derivedErr } = await supabaseAdmin.from(table).delete().eq('universe_id', universeId).or(orFilter)
    if (derivedErr) {
      return NextResponse.json(
        { error: `Clearing ${table} for the merge failed: ${derivedErr.message}` },
        { status: 500, headers: NO_CACHE },
      )
    }
  }

  // 5. Delete the loser. By now game_players and the restricting derived tables
  //    no longer reference it, so the ON DELETE RESTRICT FKs are satisfied. If
  //    some other FK still blocks it, surface the error rather than forcing.
  const { error: deleteErr } = await supabaseAdmin.from('players').delete().eq('universe_id', universeId).eq('id', loserId)
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
