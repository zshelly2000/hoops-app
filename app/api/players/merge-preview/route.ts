export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { UNIVERSE_ID } from '@/lib/universe'
import { displayToken, normalize } from '@/lib/identity'
import { badgeDisplayName } from '@/lib/badges'
import type { Player } from '@/lib/types'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

// Row shape from game_players -> games -> sessions (to-one relations come back as objects).
interface GPRow {
  player_id: string
  team: number
  games: {
    id: string
    team1_score: number
    team2_score: number
    winning_team: number | null
    session_id: string
    sessions: { session_date: string } | null
  } | null
}

interface RecordSummary {
  id: string
  name: string
  nickname: string | null
  isActive: boolean
  firstYear: number | null
  totalGames: number
  lastPlayed: string | null
}

interface TimelineBucket {
  record: 'a' | 'b'
  date: string
  games: number
  wins: number
  losses: number
  ties: number
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

function summarize(player: Player, rows: GPRow[]): RecordSummary {
  const dates = rows
    .map((r) => r.games?.sessions?.session_date)
    .filter((d): d is string => !!d)
    .sort()
  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    isActive: player.is_active,
    firstYear: dates.length ? yearOf(dates[0]) : null,
    totalGames: rows.length,
    lastPlayed: dates.length ? dates[dates.length - 1] : null,
  }
}

// Per-record, per-day buckets, chronological. The screen interleaves the two
// records and bands days where both appear (the "eyeball test").
function timelineFor(record: 'a' | 'b', rows: GPRow[]): TimelineBucket[] {
  const byDate = new Map<string, TimelineBucket>()
  for (const r of rows) {
    const g = r.games
    const date = g?.sessions?.session_date
    if (!g || !date) continue
    const bucket = byDate.get(date) ?? { record, date, games: 0, wins: 0, losses: 0, ties: 0 }
    bucket.games += 1
    if (g.winning_team === null) bucket.ties += 1
    else if (g.winning_team === r.team) bucket.wins += 1
    else bucket.losses += 1
    byDate.set(date, bucket)
  }
  return Array.from(byDate.values()).sort((x, y) => x.date.localeCompare(y.date))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const a = searchParams.get('a')
  const b = searchParams.get('b')

  if (!a || !b) {
    return NextResponse.json({ error: 'Two player ids (a, b) are required' }, { status: 400, headers: NO_CACHE })
  }
  if (a === b) {
    return NextResponse.json({ error: 'a and b must be different players' }, { status: 400, headers: NO_CACHE })
  }

  // Fetch both player records.
  const { data: playersData, error: playersErr } = await supabase
    .from('players')
    .select('*')
    .eq('universe_id', UNIVERSE_ID)
    .in('id', [a, b])

  if (playersErr) {
    return NextResponse.json({ error: playersErr.message }, { status: 500, headers: NO_CACHE })
  }

  const players = playersData as unknown as Player[]
  const playerA = players.find((p) => p.id === a)
  const playerB = players.find((p) => p.id === b)
  if (!playerA || !playerB) {
    return NextResponse.json({ error: 'One or both players not found' }, { status: 404, headers: NO_CACHE })
  }

  // Fetch every game_players row for either player, joined to its game + session.
  const { data: gpData, error: gpErr } = await supabase
    .from('game_players')
    .select(`
      player_id,
      team,
      games (
        id,
        team1_score,
        team2_score,
        winning_team,
        session_id,
        sessions ( session_date )
      )
    `)
    .eq('universe_id', UNIVERSE_ID)
    .in('player_id', [a, b])

  if (gpErr) {
    return NextResponse.json({ error: gpErr.message }, { status: 500, headers: NO_CACHE })
  }

  const rows = (gpData as unknown as GPRow[]).filter((r) => r.games)
  const rowsA = rows.filter((r) => r.player_id === a)
  const rowsB = rows.filter((r) => r.player_id === b)

  // Group by game to find head-to-head and same-team overlaps.
  const byGame = new Map<string, { aTeam: number | null; bTeam: number | null }>()
  for (const r of rows) {
    const gid = r.games!.id
    const entry = byGame.get(gid) ?? { aTeam: null, bTeam: null }
    if (r.player_id === a) entry.aTeam = r.team
    else entry.bTeam = r.team
    byGame.set(gid, entry)
  }

  let oppositeTeamGames = 0
  let sameTeamGames = 0
  for (const { aTeam, bTeam } of Array.from(byGame.values())) {
    if (aTeam === null || bTeam === null) continue
    if (aTeam === bTeam) sameTeamGames += 1
    else oppositeTeamGames += 1
  }

  // Shared sessions: both records appear; report each one's game count in it.
  const sessCount = new Map<string, { date: string; aGames: number; bGames: number }>()
  for (const r of rows) {
    const sid = r.games!.session_id
    const date = r.games!.sessions?.session_date ?? ''
    const entry = sessCount.get(sid) ?? { date, aGames: 0, bGames: 0 }
    if (r.player_id === a) entry.aGames += 1
    else entry.bGames += 1
    sessCount.set(sid, entry)
  }
  const sharedSessions = Array.from(sessCount.values())
    .filter((s) => s.aGames > 0 && s.bGames > 0)
    .sort((x, y) => x.date.localeCompare(y.date))
    .map((s) => ({ sessionDate: s.date, aGames: s.aGames, bGames: s.bGames }))

  const summaryA = summarize(playerA, rowsA)
  const summaryB = summarize(playerB, rowsB)

  // Combined count if merged: same-team shared games collapse to a single row.
  const combinedGames = summaryA.totalGames + summaryB.totalGames - sameTeamGames
  const firstYears = [summaryA.firstYear, summaryB.firstYear].filter((y): y is number => y !== null)
  const combinedFirstYear = firstYears.length ? Math.min(...firstYears) : null

  // Identical on-screen identity (the exact invariant from duplicate-prevention).
  const identicalTwin =
    normalize(playerA.name) === normalize(playerB.name) &&
    normalize(displayToken(playerA.name, playerA.nickname)) ===
      normalize(displayToken(playerB.name, playerB.nickname))

  // Current all-time badge holders among the two records, from the live
  // badge_holders table (nightly, hoops-stats). Monthly badges are ignored —
  // they don't block merges. Same guard the merge route enforces.
  const { data: badgeData, error: badgeErr } = await supabaseAdmin
    .from('badge_holders')
    .select('player_id, badge_id')
    .eq('universe_id', UNIVERSE_ID)
    .in('player_id', [a, b])
    .eq('badge_type', 'all_time')

  if (badgeErr) {
    return NextResponse.json({ error: badgeErr.message }, { status: 500, headers: NO_CACHE })
  }

  const badgeRows = (badgeData as { player_id: string; badge_id: string }[] | null) ?? []
  const badgeHolders = [playerA, playerB]
    .map((p) => ({
      id: p.id,
      name: p.name,
      badges: badgeRows.filter((r) => r.player_id === p.id).map((r) => badgeDisplayName(r.badge_id)),
    }))
    .filter((h) => h.badges.length > 0)

  const timeline = [...timelineFor('a', rowsA), ...timelineFor('b', rowsB)].sort((x, y) =>
    x.date.localeCompare(y.date),
  )

  return NextResponse.json(
    {
      a: summaryA,
      b: summaryB,
      oppositeTeamGames,
      sameTeamGames,
      sharedSessions,
      timeline,
      identicalTwin,
      badgeHolders,
      combinedGames,
      combinedFirstYear,
    },
    { headers: NO_CACHE },
  )
}
