export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUniverse } from '@/lib/universe'
import type { NarrativeCandidate } from '@/lib/types'

// ---------------------------------------------------------------------------
// Internal data types (mirrors DB views added in migration 004)
// ---------------------------------------------------------------------------

interface RawSession {
  id: string
  session_date: string
  is_complete: boolean
  completed_at: string | null
}

interface RawGame {
  id: string
  session_id: string
  game_number: number
  team1_score: number
  team2_score: number
  winning_team: 1 | 2 | null
}

interface RawGamePlayer {
  id: string
  game_id: string
  player_id: string
  team: 1 | 2
  players: { id: string; name: string; nickname: string | null }
}

interface PlayerStatsFull {
  player_id: string
  name: string
  nickname: string | null
  games_played: number
  wins: number
  losses: number
  avg_plus_minus: number | null
  total_plus_minus: number
}

interface GameLogRow {
  player_id: string
  game_id: string
  session_date: string
  player_team: number
  winning_team: number | null
  plus_minus: number
  is_win: boolean
}

interface TeammateStatRow {
  player_id: string
  teammate_id: string
  games_together: number
  wins_together: number
  win_pct_together: number
}

interface OpponentStatRow {
  player_id: string
  opponent_id: string
  games_against: number
  wins_against: number
  losses_against: number
}

interface GameStrengthRow {
  game_id: string
  session_id: string
  session_date: string
  winning_team: 1 | 2 | null
  team1_rapm: number | null
  team2_rapm: number | null
  rapm_diff: number | null
  weaker_team: 1 | 2 | null
  universe_id: string
}

type PlayerName = { name: string; nickname: string | null }

function displayName(p: PlayerName): string {
  return p.nickname ?? p.name
}

// ---------------------------------------------------------------------------
// Helper: build a player_id → rank map from playerStats sorted by avg +/-
// ---------------------------------------------------------------------------

function buildRankMap(playerStats: PlayerStatsFull[]): Map<string, number> {
  const rankMap = new Map<string, number>()
  ;[...playerStats]
    .filter((ps) => ps.games_played > 0 && ps.avg_plus_minus !== null)
    .sort((a, b) => (b.avg_plus_minus ?? 0) - (a.avg_plus_minus ?? 0))
    .forEach((ps, i) => rankMap.set(ps.player_id, i + 1))
  return rankMap
}

// ---------------------------------------------------------------------------
// Helper: group RawGamePlayer rows by game_id
// ---------------------------------------------------------------------------

function groupByGame(gamePlayers: RawGamePlayer[]): Map<string, RawGamePlayer[]> {
  const map = new Map<string, RawGamePlayer[]>()
  for (const gp of gamePlayers) {
    const arr = map.get(gp.game_id) ?? []
    arr.push(gp)
    map.set(gp.game_id, arr)
  }
  return map
}

// ---------------------------------------------------------------------------
// Pattern detector: hot_duo
// ---------------------------------------------------------------------------

function detectHotDuo(
  sessionPlayerIds: Set<string>,
  teammateStats: TeammateStatRow[],
  playerMap: Map<string, PlayerName>,
  playerStats: PlayerStatsFull[],
  gamePlayers: RawGamePlayer[],
  games: RawGame[],
): NarrativeCandidate | null {
  const qualifying = teammateStats.filter(
    (row) =>
      sessionPlayerIds.has(row.player_id) &&
      sessionPlayerIds.has(row.teammate_id) &&
      row.games_together >= 4 &&
      row.win_pct_together >= 0.7,
  )

  if (qualifying.length === 0) return null

  qualifying.sort((a, b) => b.win_pct_together - a.win_pct_together)
  const best = qualifying[0]

  const p1 = playerMap.get(best.player_id)
  const p2 = playerMap.get(best.teammate_id)
  if (!p1 || !p2) return null

  const wins = best.wins_together
  const losses = best.games_together - wins
  const winPctStr = Math.round(best.win_pct_together * 1000)
    .toString()
    .padStart(3, '0')

  const p1Stats = playerStats.find((ps) => ps.player_id === best.player_id)
  const p2Stats = playerStats.find((ps) => ps.player_id === best.teammate_id)

  const withStats = playerStats.filter((ps) => ps.avg_plus_minus !== null && ps.games_played > 0)
  const groupAvgPM = withStats.length > 0
    ? Math.round((withStats.reduce((s, ps) => s + (ps.avg_plus_minus ?? 0), 0) / withStats.length) * 10) / 10
    : null

  // Today's games where both were on the same team
  const byGame = groupByGame(gamePlayers)
  const todayGamesTogether: { game_number: number; team1_score: number; team2_score: number; winning_team: 1 | 2 | null }[] = []
  for (const [gameId, gps] of Array.from(byGame.entries())) {
    const p1e = gps.find((gp) => gp.player_id === best.player_id)
    const p2e = gps.find((gp) => gp.player_id === best.teammate_id)
    if (p1e && p2e && p1e.team === p2e.team) {
      const g = games.find((game) => game.id === gameId)
      if (g) {
        todayGamesTogether.push({
          game_number: g.game_number,
          team1_score: g.team1_score,
          team2_score: g.team2_score,
          winning_team: g.winning_team,
        })
      }
    }
  }

  return {
    narrative_type: 'hot_duo',
    headline_hint: `${displayName(p1)} & ${displayName(p2)}: ${wins}-${losses} together, .${winPctStr} win%`,
    body_data: {
      player1_id: best.player_id,
      player2_id: best.teammate_id,
      games_together: best.games_together,
      wins_together: wins,
      losses_together: losses,
      win_pct_together: best.win_pct_together,
      player1_avg_plus_minus: p1Stats?.avg_plus_minus ?? null,
      player2_avg_plus_minus: p2Stats?.avg_plus_minus ?? null,
      group_avg_plus_minus: groupAvgPM,
      today_games_together: todayGamesTogether,
    },
    player_ids: [best.player_id, best.teammate_id],
    priority: Math.round(best.win_pct_together * 100),
    angle_options: ['dominance', 'chemistry', 'numbers', 'challenger', 'historical'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: individual_streak (win streak)
// ---------------------------------------------------------------------------

function detectIndividualStreak(
  sessionPlayerIds: Set<string>,
  gameLog: GameLogRow[],
  playerMap: Map<string, PlayerName>,
  playerStats: PlayerStatsFull[],
): NarrativeCandidate | null {
  const playerLogs = new Map<string, GameLogRow[]>()
  for (const row of gameLog) {
    if (!sessionPlayerIds.has(row.player_id)) continue
    const arr = playerLogs.get(row.player_id) ?? []
    arr.push(row)
    playerLogs.set(row.player_id, arr)
  }

  let best: { playerId: string; streak: number } | null = null

  for (const [playerId, logs] of Array.from(playerLogs.entries())) {
    let streak = 0
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].is_win) streak++
      else break
    }
    if (streak >= 3 && (!best || streak > best.streak)) {
      best = { playerId, streak }
    }
  }

  if (!best) return null

  const p = playerMap.get(best.playerId)
  if (!p) return null

  const psEntry = playerStats.find((ps) => ps.player_id === best!.playerId)
  const rankMap = buildRankMap(playerStats)
  const streakLogs = (playerLogs.get(best.playerId) ?? []).slice(-best.streak)

  return {
    narrative_type: 'individual_streak',
    headline_hint: `${displayName(p)} has won ${best.streak} straight`,
    body_data: {
      player_id: best.playerId,
      streak: best.streak,
      streak_margins: streakLogs.map((row) => row.plus_minus),
      avg_plus_minus: psEntry?.avg_plus_minus ?? null,
      rank: rankMap.get(best.playerId) ?? null,
      total_wins: psEntry?.wins ?? null,
      games_played: psEntry?.games_played ?? null,
    },
    player_ids: [best.playerId],
    priority: best.streak * 10,
    angle_options: ['momentum', 'confidence', 'unstoppable', 'hot_hand', 'quietly_dominant'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: cold_streak (loss streak)
// ---------------------------------------------------------------------------

function detectColdStreak(
  sessionPlayerIds: Set<string>,
  gameLog: GameLogRow[],
  playerMap: Map<string, PlayerName>,
  playerStats: PlayerStatsFull[],
): NarrativeCandidate | null {
  const playerLogs = new Map<string, GameLogRow[]>()
  for (const row of gameLog) {
    if (!sessionPlayerIds.has(row.player_id)) continue
    const arr = playerLogs.get(row.player_id) ?? []
    arr.push(row)
    playerLogs.set(row.player_id, arr)
  }

  let best: { playerId: string; streak: number } | null = null

  for (const [playerId, logs] of Array.from(playerLogs.entries())) {
    let streak = 0
    for (let i = logs.length - 1; i >= 0; i--) {
      if (!logs[i].is_win) streak++
      else break
    }
    if (streak >= 3 && (!best || streak > best.streak)) {
      best = { playerId, streak }
    }
  }

  if (!best) return null

  const p = playerMap.get(best.playerId)
  if (!p) return null

  const psEntry = playerStats.find((ps) => ps.player_id === best!.playerId)
  const rankMap = buildRankMap(playerStats)
  const streakLogs = (playerLogs.get(best.playerId) ?? []).slice(-best.streak)

  return {
    narrative_type: 'cold_streak',
    headline_hint: `${displayName(p)} has dropped ${best.streak} in a row`,
    body_data: {
      player_id: best.playerId,
      streak: best.streak,
      streak_margins: streakLogs.map((row) => row.plus_minus),
      avg_plus_minus: psEntry?.avg_plus_minus ?? null,
      rank: rankMap.get(best.playerId) ?? null,
      games_played: psEntry?.games_played ?? null,
    },
    player_ids: [best.playerId],
    priority: 30,
    angle_options: ['bounce_back', 'due_for_a_win', 'resilience', 'searching', 'turning_point'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: rivalry
// ---------------------------------------------------------------------------

function detectRivalry(
  sessionPlayerIds: Set<string>,
  opponentStats: OpponentStatRow[],
  playerMap: Map<string, PlayerName>,
  playerStats: PlayerStatsFull[],
  gamePlayers: RawGamePlayer[],
  games: RawGame[],
): NarrativeCandidate | null {
  const qualifying = opponentStats.filter(
    (row) =>
      sessionPlayerIds.has(row.player_id) &&
      sessionPlayerIds.has(row.opponent_id) &&
      row.games_against >= 6 &&
      Math.abs(row.wins_against - row.losses_against) <= 2,
  )

  // opponent_stats is directed — every rivalry appears as two mirror rows (A→B and
  // B→A) with identical games_against, and a near-even rivalry survives the filter
  // from both directions. Collapse to one canonical row per unordered pair
  // (player_id < opponent_id) so each rivalry appears exactly once before sorting.
  const canonical = qualifying.filter((row) => row.player_id < row.opponent_id)

  if (canonical.length === 0) return null

  // Pick the most-played qualifying rivalry, not an arbitrary arrival-order row.
  canonical.sort((a, b) => b.games_against - a.games_against)
  const best = canonical[0]

  const p1 = playerMap.get(best.player_id)
  const p2 = playerMap.get(best.opponent_id)
  if (!p1 || !p2) return null

  const rankMap = buildRankMap(playerStats)
  const p1Stats = playerStats.find((ps) => ps.player_id === best.player_id)
  const p2Stats = playerStats.find((ps) => ps.player_id === best.opponent_id)

  // Find today's matchup (p1 and p2 on opposite teams)
  // Resolve tonight's head-to-head game to an explicit WINNER-ATTRIBUTED result.
  // (A bare team1-team2 score forces the editor to infer who won, which inverted
  // a real edition — team1 isn't always the canonical player's side.)
  const byGame = groupByGame(gamePlayers)
  let todayMatchup:
    | { winner: string; loser: string; winner_score: number; loser_score: number }
    | { tie: true; players: [string, string]; score: string }
    | null = null
  // Count EVERY tonight game where the two were on opposite teams (not just the first).
  // Without this the editor invented the count ("one of two meetings" when they met 4
  // times); todayMatchup stays the first such game as the representative result.
  let todayMeetingCount = 0
  for (const [gameId, gps] of Array.from(byGame.entries())) {
    const p1e = gps.find((gp) => gp.player_id === best.player_id)
    const p2e = gps.find((gp) => gp.player_id === best.opponent_id)
    if (p1e && p2e && p1e.team !== p2e.team) {
      const g = games.find((game) => game.id === gameId)
      if (g) {
        todayMeetingCount++
        if (!todayMatchup) {
          const p1Score = p1e.team === 1 ? g.team1_score : g.team2_score
          const p2Score = p2e.team === 1 ? g.team1_score : g.team2_score
          if (g.winning_team === null) {
            todayMatchup = {
              tie: true,
              players: [displayName(p1), displayName(p2)],
              score: `${p1Score}-${p2Score}`,
            }
          } else {
            const p1Won = g.winning_team === p1e.team
            todayMatchup = {
              winner: displayName(p1Won ? p1 : p2),
              loser: displayName(p1Won ? p2 : p1),
              winner_score: p1Won ? p1Score : p2Score,
              loser_score: p1Won ? p2Score : p1Score,
            }
          }
        }
      }
    }
  }

  return {
    narrative_type: 'rivalry',
    headline_hint: `${displayName(p1)} vs ${displayName(p2)}: ${best.wins_against}-${best.losses_against} all-time, met again today`,
    body_data: {
      player1_id: best.player_id,
      player2_id: best.opponent_id,
      player1_wins: best.wins_against,
      player2_wins: best.losses_against,
      games_played: best.games_against,
      player1_rank: rankMap.get(best.player_id) ?? null,
      player2_rank: rankMap.get(best.opponent_id) ?? null,
      player1_avg_plus_minus: p1Stats?.avg_plus_minus ?? null,
      player2_avg_plus_minus: p2Stats?.avg_plus_minus ?? null,
      today_matchup: todayMatchup,
      today_meeting_count: todayMeetingCount,
    },
    player_ids: [best.player_id, best.opponent_id],
    priority: 40,
    angle_options: [
      'even_series',
      'next_chapter',
      'personal',
      'cant_separate_them',
      'score_to_settle',
    ],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: upset
// ---------------------------------------------------------------------------

// The platform-wide upset definition, mirroring the player_upset_wins view:
// the weaker team on paper wins AND the RAPM gap is at least this threshold.
const UPSET_RAPM_DIFF_MIN = 0.1

function detectUpset(
  gameStrength: GameStrengthRow[],
  games: RawGame[],
  gamePlayers: RawGamePlayer[],
): NarrativeCandidate | null {
  const upsets = gameStrength.filter(
    (gs) =>
      gs.rapm_diff !== null &&
      gs.rapm_diff >= UPSET_RAPM_DIFF_MIN &&
      gs.winning_team !== null &&
      gs.winning_team === gs.weaker_team,
  )
  if (upsets.length === 0) return null

  upsets.sort((a, b) => (b.rapm_diff ?? 0) - (a.rapm_diff ?? 0))
  const best = upsets[0]

  const game = games.find((g) => g.id === best.game_id)
  if (!game || best.winning_team === null || best.rapm_diff === null) return null

  const gamePlayersInGame = gamePlayers.filter((gp) => gp.game_id === game.id)
  const team1Players = gamePlayersInGame.filter((gp) => gp.team === 1).map((gp) => displayName(gp.players))
  const team2Players = gamePlayersInGame.filter((gp) => gp.team === 2).map((gp) => displayName(gp.players))

  // Winner attribution comes from the view's winning_team (which, for an upset,
  // IS the weaker team) — pre-computed here so the editor copies, never derives.
  const winnerPlayers = best.winning_team === 1 ? team1Players : team2Players
  const loserPlayers = best.winning_team === 1 ? team2Players : team1Players
  const winnerScore = best.winning_team === 1 ? game.team1_score : game.team2_score
  const loserScore = best.winning_team === 1 ? game.team2_score : game.team1_score

  return {
    narrative_type: 'upset',
    headline_hint: `Upset: weaker team on paper won ${winnerScore}-${loserScore}, RAPM gap ${best.rapm_diff.toFixed(2)}`,
    body_data: {
      game_id: best.game_id,
      game_number: game.game_number,
      total_games_in_session: games.length,
      team1_score: game.team1_score,
      team2_score: game.team2_score,
      team1_players: team1Players,
      team2_players: team2Players,
      winning_team: best.winning_team,
      weaker_team: best.weaker_team,
      rapm_diff: best.rapm_diff,
      winner_players: winnerPlayers,
      loser_players: loserPlayers,
      winner_score: winnerScore,
      loser_score: loserScore,
    },
    player_ids: [],
    priority: Math.round(best.rapm_diff * 100),
    angle_options: ['nobody_saw_it', 'David_and_Goliath', 'numbers_dont_lie', 'chaos', 'belief'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: climber
// ---------------------------------------------------------------------------

function detectClimber(
  sessionPlayerIds: Set<string>,
  playerStats: PlayerStatsFull[],
  gameLog: GameLogRow[],
  sessionGameIds: Set<string>,
  playerMap: Map<string, PlayerName>,
): NarrativeCandidate | null {
  // Current rankings — 5+ games filter matches the leaderboard default
  const withStats = playerStats.filter(
    (ps) => ps.games_played >= 5 && ps.avg_plus_minus !== null,
  )
  const currentSorted = [...withStats].sort(
    (a, b) => (b.avg_plus_minus ?? 0) - (a.avg_plus_minus ?? 0),
  )
  const currentRankMap = new Map<string, number>()
  currentSorted.forEach((ps, idx) => currentRankMap.set(ps.player_id, idx + 1))

  // Today's games contribution per player (used only for detection)
  const todayLog = gameLog.filter((row) => sessionGameIds.has(row.game_id))
  const todayByPlayer = new Map<string, { total_pm: number; game_count: number }>()
  for (const row of todayLog) {
    const existing = todayByPlayer.get(row.player_id) ?? { total_pm: 0, game_count: 0 }
    todayByPlayer.set(row.player_id, {
      total_pm: existing.total_pm + row.plus_minus,
      game_count: existing.game_count + 1,
    })
  }

  // Pre-session averages — used only to detect who improved significantly today
  const preStats = playerStats
    .map((ps) => {
      const today = todayByPlayer.get(ps.player_id)
      if (!today) {
        return { player_id: ps.player_id, pre_avg: ps.avg_plus_minus, pre_games: ps.games_played }
      }
      const preTotalPm = ps.total_plus_minus - today.total_pm
      const preGames = ps.games_played - today.game_count
      return {
        player_id: ps.player_id,
        pre_avg: preGames > 0 ? preTotalPm / preGames : null,
        pre_games: preGames,
      }
    })
    .filter((ps) => ps.pre_games > 0 && ps.pre_avg !== null)

  preStats.sort((a, b) => (b.pre_avg ?? 0) - (a.pre_avg ?? 0))
  const preRankMap = new Map<string, number>()
  preStats.forEach((ps, idx) => preRankMap.set(ps.player_id, idx + 1))

  let best: { playerId: string; gained: number } | null = null
  for (const playerId of Array.from(sessionPlayerIds)) {
    const currentRank = currentRankMap.get(playerId)
    const preRank = preRankMap.get(playerId)
    if (!currentRank || !preRank) continue
    const gained = preRank - currentRank
    // Must have a positive avg +/- — a climber from -4 to -2 is not a compelling story
    const psCheck = playerStats.find((ps) => ps.player_id === playerId)
    if (gained >= 3 && (psCheck?.avg_plus_minus ?? 0) > 0 && (!best || gained > best.gained)) {
      best = { playerId, gained }
    }
  }

  if (!best) return null

  const p = playerMap.get(best.playerId)
  if (!p) return null

  const bestCurrentRank = currentRankMap.get(best.playerId) ?? 0
  const psEntry = playerStats.find((ps) => ps.player_id === best!.playerId)

  // 3 players ranked immediately below in the 5+ games leaderboard
  const playersNearRank = currentSorted
    .slice(bestCurrentRank, bestCurrentRank + 3)
    .map((ps) => {
      const pName = playerMap.get(ps.player_id)
      return pName ? displayName(pName) : ps.player_id
    })

  // Session-specific performance: what they did today to earn this story
  const todayEntry = todayByPlayer.get(best.playerId)
  const sessionGames = todayEntry?.game_count ?? 0
  const sessionTotalPM = todayEntry?.total_pm ?? 0
  const sessionWins = todayLog.filter(
    (row) => row.player_id === best!.playerId && row.is_win,
  ).length
  const sessionLosses = sessionGames - sessionWins
  const sessionAvgPM = sessionGames > 0
    ? Math.round((sessionTotalPM / sessionGames) * 10) / 10
    : null

  return {
    narrative_type: 'climber',
    headline_hint: `${displayName(p)} is ranked #${bestCurrentRank} among players with 5+ games`,
    body_data: {
      player_id: best.playerId,
      current_rank: bestCurrentRank,
      avg_plus_minus: psEntry?.avg_plus_minus ?? null,
      win_pct: psEntry && psEntry.games_played > 0
        ? Math.round((psEntry.wins / psEntry.games_played) * 100) / 100
        : null,
      games_played: psEntry?.games_played ?? null,
      session_wins: sessionWins,
      session_losses: sessionLosses,
      session_avg_plus_minus: sessionAvgPM,
      players_near_rank: playersNearRank,
      rank_definition: 'Ranked among players with 5 or more games played, by avg plus-minus.',
    },
    player_ids: [best.playerId],
    priority: 50,
    angle_options: ['rising', 'statement_game', 'moving_up', 'watch_out', 'arrival'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: milestones (live crossings, session-date anchor, NO snapshot)
//
// Replaces the retired veteran_milestone detector, which fired on
// games_played === m — a CURRENT-TOTAL check that misfires when regenerating an
// older edition (it reads today's total, not the total as of that night). Every
// milestone here is a GENUINE tonight-crossing computed from the player's full game
// history: before = games STRICTLY before tonight (session_date < tonight), after =
// before + tonight's games (session_id === tonight). A milestone fires only when
// before < threshold && after >= threshold, so a player long past a threshold never
// re-fires it. One candidate per player; co-occurring milestones (e.g. 200th game
// AND 100th win) fold into that single candidate. Milestones key on player_id, never
// name (guards the duplicate-name records).
// ---------------------------------------------------------------------------

// Minimal per-game history row for milestone math (one row per player per game,
// the player's full career up to and including tonight, globally ordered).
interface MilestoneHistoryRow {
  player_id: string
  session_id: string
  session_date: string
  game_number: number
  is_win: boolean
  winning_team: number | null
}

const GAME_COUNT_TIERS = [150, 200, 250, 300, 500, 1000]
const WIN_COUNT_TIERS = [50, 100, 250, 500]
const ATTENDANCE_TIERS = [100, 200]
const PB_STREAK_MIN = 5            // a new personal-best win streak only fires at >= 5
const ANNIVERSARY_WINDOW_DAYS = 90 // first session within 90d on/after the N-year mark

type MilestoneTier = 'marquee' | 'notable' | 'minor'

interface MilestoneHit {
  kind: 'game_count' | 'win_count' | 'attendance' | 'personal_best_streak' | 'anniversary'
  tier: MilestoneTier
  label: string                    // editor-facing, e.g. "500th career game"
  before?: number                  // count coming into tonight
  after?: number                   // count after tonight
  threshold?: number
  detail?: string                  // extra context, e.g. "first played 2021-06-10"
}

function tierRank(t: MilestoneTier): number {
  return t === 'marquee' ? 3 : t === 'notable' ? 2 : 1
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// YYYY-MM-DD + n years, preserving month/day (UTC so no TZ drift). Feb-29 firsts roll
// to Mar-01 in non-leap years, which is fine for an anniversary window.
function addYears(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y + n, m - 1, d)).toISOString().slice(0, 10)
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.round(
    (new Date(aIso + 'T12:00:00Z').getTime() - new Date(bIso + 'T12:00:00Z').getTime()) / 86400000,
  )
}

function detectMilestones(
  sessionPlayerIds: Set<string>,
  history: MilestoneHistoryRow[], // ALL rows for session players, session_date <= tonight
  session: RawSession,
  playerStats: PlayerStatsFull[],
  playerMap: Map<string, PlayerName>,
  sessionOrderKey: Map<string, string>, // session_id → chronological sort key
): NarrativeCandidate[] {
  const tonightSession = session.id
  const tonightDate = session.session_date
  // Tonight's place in the session chronology. "before" = sessions strictly earlier
  // than this key (which correctly INCLUDES an earlier session on the same day);
  // tonight's own rows share this key and are excluded from before by the strict <.
  const tonightKey = sessionOrderKey.get(tonightSession) ?? `${session.session_date}#~`
  const keyOf = (r: MilestoneHistoryRow): string => sessionOrderKey.get(r.session_id) ?? r.session_date

  // Group history by player, then sort each player's rows by TRUE session chronology
  // (order key, then game_number) — game_number alone interleaves two same-day sessions.
  const byPlayer = new Map<string, MilestoneHistoryRow[]>()
  for (const r of history) {
    if (!sessionPlayerIds.has(r.player_id)) continue
    const arr = byPlayer.get(r.player_id) ?? []
    arr.push(r)
    byPlayer.set(r.player_id, arr)
  }
  for (const arr of Array.from(byPlayer.values())) {
    arr.sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b)
      return ka === kb ? a.game_number - b.game_number : ka < kb ? -1 : 1
    })
  }

  const statsById = new Map(playerStats.map((ps) => [ps.player_id, ps]))
  const out: NarrativeCandidate[] = []

  for (const [playerId, rows] of Array.from(byPlayer.entries())) {
    const before = rows.filter((r) => keyOf(r) < tonightKey)
    const tonight = rows.filter((r) => r.session_id === tonightSession)
    if (tonight.length === 0) continue // no games tonight (shouldn't happen for a session player)

    const hits: MilestoneHit[] = []

    // --- game-count ---
    const beforeGames = before.length
    const afterGames = beforeGames + tonight.length
    for (const T of GAME_COUNT_TIERS) {
      if (beforeGames < T && afterGames >= T) {
        hits.push({
          kind: 'game_count', threshold: T, before: beforeGames, after: afterGames,
          tier: T === 1000 ? 'marquee' : T === 500 ? 'notable' : 'minor',
          label: `${ordinal(T)} career game`,
        })
      }
    }

    // --- win-count (ties are not wins) ---
    const beforeWins = before.filter((r) => r.is_win === true).length
    const afterWins = beforeWins + tonight.filter((r) => r.is_win === true).length
    for (const T of WIN_COUNT_TIERS) {
      if (beforeWins < T && afterWins >= T) {
        hits.push({
          kind: 'win_count', threshold: T, before: beforeWins, after: afterWins,
          tier: T >= 250 ? 'notable' : 'minor',
          label: `${ordinal(T)} career win`,
        })
      }
    }

    // --- attendance (distinct sessions, not games) ---
    const beforeSessions = new Set(before.map((r) => r.session_id)).size
    const afterSessions = beforeSessions + 1 // tonight is one new, strictly-later session
    for (const T of ATTENDANCE_TIERS) {
      if (beforeSessions < T && afterSessions >= T) {
        hits.push({
          kind: 'attendance', threshold: T, before: beforeSessions, after: afterSessions,
          tier: 'notable',
          label: `${ordinal(T)} session with the group`,
        })
      }
    }

    // --- personal-best win streak (ties NEUTRAL, gate >= PB_STREAK_MIN) ---
    // Streaks span sessions. Tie (winning_team null) neither extends nor breaks the run.
    const streakStep = (running: number, r: MilestoneHistoryRow): number => {
      if (r.winning_team === null) return running          // tie → neutral
      return r.is_win === true ? running + 1 : 0            // win → +1, loss → reset
    }
    let priorMax = 0, runBefore = 0
    for (const r of before) { runBefore = streakStep(runBefore, r); if (runBefore > priorMax) priorMax = runBefore }
    let running = runBefore, newMax = priorMax, beatenTonight = false
    for (const r of tonight) {
      running = streakStep(running, r)
      if (running > newMax) newMax = running
      if (running > priorMax) beatenTonight = true
    }
    if (beatenTonight && newMax >= PB_STREAK_MIN) {
      hits.push({
        kind: 'personal_best_streak', before: priorMax, after: newMax,
        tier: 'minor',
        label: `personal-best ${newMax}-game win streak`,
        detail: priorMax > 0 ? `previous best ${priorMax}` : undefined,
      })
    }

    // --- anniversary (windowed; highest qualifying N only) ---
    // first game ever = earliest row (history reaches back to the first game). Fire the
    // first session at/after the N-year mark, within 90 days, where the player's prior
    // session was still before the mark (genuine crossing). Highest N only → no stacking.
    const firstDate = rows[0].session_date
    const prevSessionDate = before.length > 0 ? before[before.length - 1].session_date : null
    if (prevSessionDate) {
      for (let N = 7; N >= 1; N--) {
        const anniv = addYears(firstDate, N)
        if (tonightDate >= anniv && prevSessionDate < anniv && daysBetween(tonightDate, anniv) <= ANNIVERSARY_WINDOW_DAYS) {
          hits.push({
            kind: 'anniversary', threshold: N,
            tier: N >= 5 ? 'notable' : 'minor',
            label: `${N}-year anniversary with the group`,
            detail: `first played ${firstDate}`,
          })
          break
        }
      }
    }

    if (hits.length === 0) continue

    // One candidate per player; fold all hits, marquee-first; tier = highest hit.
    hits.sort((a, b) => tierRank(b.tier) - tierRank(a.tier))
    const topTier = hits[0].tier
    const p = playerMap.get(playerId)
    if (!p) continue
    const ps = statsById.get(playerId)
    const priority = topTier === 'marquee' ? 95 : topTier === 'notable' ? 65 : 40

    out.push({
      narrative_type: 'milestone',
      headline_hint: `${displayName(p)} reached ${hits.map((h) => h.label).join(' and ')}`,
      body_data: {
        player_id: playerId,
        tier: topTier,
        milestones: hits,
        career_wins: ps?.wins ?? null,
        career_losses: ps?.losses ?? null,
        win_pct: ps && ps.games_played > 0 ? Math.round((ps.wins / ps.games_played) * 100) / 100 : null,
        avg_plus_minus: ps?.avg_plus_minus ?? null,
      },
      player_ids: [playerId],
      priority,
      angle_options: ['milestone', 'longevity', 'dedication', 'veteran', 'journey'],
    })
  }

  return out
}

// ---------------------------------------------------------------------------
// Pattern detector: session_recap (always generates)
// ---------------------------------------------------------------------------

function detectSessionRecap(
  games: RawGame[],
  gamePlayers: RawGamePlayer[],
  gameLog: GameLogRow[],
  sessionGameIds: Set<string>,
  playerStats: PlayerStatsFull[],
  playerMap: Map<string, PlayerName>,
): NarrativeCandidate {
  const totalGames = games.length
  const uniquePlayers = new Set(gamePlayers.map((gp) => gp.player_id)).size

  let highestCombined = -Infinity
  let lowestCombined = Infinity
  let highestMargin = -Infinity
  let lowestMargin = Infinity
  let totalPoints = 0
  let highestScoreGame = games[0]
  let lowestScoreGame = games[0]
  let biggestBlowout = games[0]
  let closestGame = games[0]

  for (const game of games) {
    const combined = game.team1_score + game.team2_score
    const margin = Math.abs(game.team1_score - game.team2_score)
    totalPoints += combined
    if (combined > highestCombined) { highestCombined = combined; highestScoreGame = game }
    if (combined < lowestCombined) { lowestCombined = combined; lowestScoreGame = game }
    if (margin > highestMargin) { highestMargin = margin; biggestBlowout = game }
    if (margin < lowestMargin) { lowestMargin = margin; closestGame = game }
  }

  // Top performer and session leaders
  const todayLog = gameLog.filter((row) => sessionGameIds.has(row.game_id))
  const playerSessionStats = new Map<string, { total_pm: number; wins: number; total: number }>()
  for (const row of todayLog) {
    const existing = playerSessionStats.get(row.player_id) ?? { total_pm: 0, wins: 0, total: 0 }
    playerSessionStats.set(row.player_id, {
      total_pm: existing.total_pm + row.plus_minus,
      wins: existing.wins + (row.is_win ? 1 : 0),
      total: existing.total + 1,
    })
  }

  let topPerformerName: string | null = null
  let topPerformerAvgPM: number | null = null
  let mostWinsName: string | null = null
  let mostWinsCount = 0
  let undefeatedPlayer: string | null = null

  for (const [pid, stats] of Array.from(playerSessionStats.entries())) {
    const avgPM = stats.total > 0
      ? Math.round((stats.total_pm / stats.total) * 10) / 10
      : null
    if (avgPM !== null && (topPerformerAvgPM === null || avgPM > topPerformerAvgPM)) {
      topPerformerAvgPM = avgPM
      const pn = playerMap.get(pid)
      topPerformerName = pn ? displayName(pn) : null
    }
    if (stats.wins > mostWinsCount) {
      mostWinsCount = stats.wins
      const pn = playerMap.get(pid)
      mostWinsName = pn ? displayName(pn) : null
    }
    if (stats.wins === stats.total && stats.total >= 3) {
      const pn = playerMap.get(pid)
      undefeatedPlayer = pn ? displayName(pn) : null
    }
  }

  // Suppress unused warning — playerStats available for future enrichment
  void playerStats

  return {
    narrative_type: 'session_recap',
    headline_hint: `${totalGames} games, ${uniquePlayers} players, ${totalPoints} total points`,
    body_data: {
      total_games: totalGames,
      total_players: uniquePlayers,
      total_points: totalPoints,
      highest_score: highestScoreGame
        ? `${highestScoreGame.team1_score}-${highestScoreGame.team2_score}`
        : 'N/A',
      lowest_score: lowestScoreGame
        ? `${lowestScoreGame.team1_score}-${lowestScoreGame.team2_score}`
        : 'N/A',
      closest_game: closestGame
        ? `${closestGame.team1_score}-${closestGame.team2_score} (margin: ${lowestMargin})`
        : 'N/A',
      biggest_blowout: biggestBlowout
        ? `${biggestBlowout.team1_score}-${biggestBlowout.team2_score} (margin: ${highestMargin})`
        : 'N/A',
      top_performer: topPerformerName,
      top_performer_avg_pm: topPerformerAvgPM,
      most_wins_player: mostWinsName,
      most_wins_count: mostWinsCount,
      undefeated_player: undefeatedPlayer,
    },
    player_ids: [],
    priority: 20,
    angle_options: ['by_the_numbers', 'what_happened', 'the_session', 'recap', 'from_the_run'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: defensive_battle
// ---------------------------------------------------------------------------

function detectDefensiveBattle(
  games: RawGame[],
  gamePlayers: RawGamePlayer[],
): NarrativeCandidate | null {
  let lowestCombined = Infinity
  let targetGame: RawGame | null = null

  for (const game of games) {
    const combined = game.team1_score + game.team2_score
    if (combined < lowestCombined) {
      lowestCombined = combined
      targetGame = game
    }
  }

  if (!targetGame || lowestCombined > 14) return null

  const gamePlayersInGame = gamePlayers.filter((gp) => gp.game_id === targetGame!.id)
  const team1Players = gamePlayersInGame.filter((gp) => gp.team === 1).map((gp) => displayName(gp.players))
  const team2Players = gamePlayersInGame.filter((gp) => gp.team === 2).map((gp) => displayName(gp.players))

  return {
    narrative_type: 'defensive_battle',
    headline_hint: `Lowest scoring game: ${targetGame.team1_score}-${targetGame.team2_score}, combined ${lowestCombined}`,
    body_data: {
      game_id: targetGame.id,
      game_number: targetGame.game_number,
      total_games_in_session: games.length,
      team1_score: targetGame.team1_score,
      team2_score: targetGame.team2_score,
      combined: lowestCombined,
      team1_players: team1Players,
      team2_players: team2Players,
    },
    player_ids: [],
    priority: 25,
    angle_options: [
      'grind',
      'defense_wins',
      'low_scoring',
      'ugly_beautiful',
      'stop_everything',
    ],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: shootout
// ---------------------------------------------------------------------------

function detectShootout(
  games: RawGame[],
  gamePlayers: RawGamePlayer[],
): NarrativeCandidate | null {
  let highestCombined = -Infinity
  let targetGame: RawGame | null = null

  for (const game of games) {
    const combined = game.team1_score + game.team2_score
    if (combined > highestCombined) {
      highestCombined = combined
      targetGame = game
    }
  }

  if (!targetGame || highestCombined < 28) return null

  const gamePlayersInGame = gamePlayers.filter((gp) => gp.game_id === targetGame!.id)
  const team1Players = gamePlayersInGame.filter((gp) => gp.team === 1).map((gp) => displayName(gp.players))
  const team2Players = gamePlayersInGame.filter((gp) => gp.team === 2).map((gp) => displayName(gp.players))

  return {
    narrative_type: 'shootout',
    headline_hint: `Highest scoring game: ${targetGame.team1_score}-${targetGame.team2_score}, combined ${highestCombined}`,
    body_data: {
      game_id: targetGame.id,
      game_number: targetGame.game_number,
      total_games_in_session: games.length,
      team1_score: targetGame.team1_score,
      team2_score: targetGame.team2_score,
      combined: highestCombined,
      team1_players: team1Players,
      team2_players: team2Players,
    },
    player_ids: [],
    priority: 25,
    angle_options: [
      'fireworks',
      'nobody_playing_d',
      'offense_on_display',
      'track_meet',
      'historic_scoring',
    ],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: perfect_session
// ---------------------------------------------------------------------------

function detectPerfectSession(
  gameLog: GameLogRow[],
  sessionGameIds: Set<string>,
  playerMap: Map<string, PlayerName>,
  playerStats: PlayerStatsFull[],
): NarrativeCandidate | null {
  const todayLog = gameLog.filter((row) => sessionGameIds.has(row.game_id))

  const playerTodayGames = new Map<string, { wins: number; total: number }>()
  for (const row of todayLog) {
    const existing = playerTodayGames.get(row.player_id) ?? { wins: 0, total: 0 }
    playerTodayGames.set(row.player_id, {
      wins: existing.wins + (row.is_win ? 1 : 0),
      total: existing.total + 1,
    })
  }

  let best: { playerId: string; games: number } | null = null
  for (const [playerId, stats] of Array.from(playerTodayGames.entries())) {
    if (stats.wins === stats.total && stats.total >= 3) {
      if (!best || stats.total > best.games) {
        best = { playerId, games: stats.total }
      }
    }
  }

  if (!best) return null

  const p = playerMap.get(best.playerId)
  if (!p) return null

  const psEntry = playerStats.find((ps) => ps.player_id === best!.playerId)
  const rankMap = buildRankMap(playerStats)
  const wonGameMargins = todayLog
    .filter((row) => row.player_id === best!.playerId && row.is_win)
    .map((row) => row.plus_minus)

  return {
    narrative_type: 'perfect_session',
    headline_hint: `${displayName(p)} went ${best.games}-0 today`,
    body_data: {
      player_id: best.playerId,
      games: best.games,
      wins: best.games,
      won_game_margins: wonGameMargins,
      avg_plus_minus: psEntry?.avg_plus_minus ?? null,
      rank: rankMap.get(best.playerId) ?? null,
    },
    player_ids: [best.playerId],
    priority: 55,
    angle_options: ['untouchable', 'perfect', 'dominant', 'undefeated', 'immovable'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: returner
// ---------------------------------------------------------------------------

function detectReturner(
  sessionPlayerIds: Set<string>,
  gameLog: GameLogRow[],
  sessionGameIds: Set<string>,
  playerStats: PlayerStatsFull[],
  playerMap: Map<string, PlayerName>,
  sessionDate: string,
): NarrativeCandidate | null {
  // Count how many games each player played today
  const todayGameCount = new Map<string, number>()
  for (const row of gameLog) {
    if (!sessionGameIds.has(row.game_id)) continue
    todayGameCount.set(row.player_id, (todayGameCount.get(row.player_id) ?? 0) + 1)
  }

  // Players who have non-today entries in the 30-day log (played recently)
  const playedRecentlyIds = new Set<string>()
  for (const row of gameLog) {
    if (!sessionGameIds.has(row.game_id)) {
      playedRecentlyIds.add(row.player_id)
    }
  }

  const statsMap = new Map(playerStats.map((ps) => [ps.player_id, ps]))

  let firstReturner: string | null = null
  for (const playerId of Array.from(sessionPlayerIds)) {
    if (playedRecentlyIds.has(playerId)) continue
    const ps = statsMap.get(playerId)
    const todayCount = todayGameCount.get(playerId) ?? 0
    if (!ps || ps.games_played <= todayCount) continue
    firstReturner = playerId
    break
  }

  if (!firstReturner) return null

  const p = playerMap.get(firstReturner)
  if (!p) return null

  // How many days away — last non-today game entry from gameLog (sorted ascending)
  const nonTodayLogs = gameLog.filter(
    (row) => !sessionGameIds.has(row.game_id) && row.player_id === firstReturner,
  )
  const lastGameDate = nonTodayLogs.length > 0
    ? nonTodayLogs[nonTodayLogs.length - 1].session_date
    : null
  let daysAway = 30 // minimum by definition (not in the lookback window)
  if (lastGameDate) {
    const last = new Date(lastGameDate + 'T12:00:00')
    // Anchor to the SESSION's date, not Date.now(), so the gap is measured as of
    // the run being written about (correct in production — session is current —
    // and correct when regenerating an older edition).
    const asOf = new Date(sessionDate + 'T12:00:00')
    daysAway = Math.round((asOf.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  }

  // W-L before leaving = total minus today's contribution
  const psEntry = statsMap.get(firstReturner)
  const todayCount = todayGameCount.get(firstReturner) ?? 0
  const todayLogs = gameLog.filter(
    (row) => sessionGameIds.has(row.game_id) && row.player_id === firstReturner,
  )
  const todayWins = todayLogs.filter((row) => row.is_win).length
  const preWins = psEntry != null ? psEntry.wins - todayWins : null
  const preLosses = psEntry != null
    ? (psEntry.games_played - todayCount) - (psEntry.wins - todayWins)
    : null
  const returnLosses = todayCount - todayWins

  return {
    narrative_type: 'returner',
    headline_hint: `${displayName(p)} returned after 30+ days away`,
    body_data: {
      player_id: firstReturner,
      days_away: daysAway,
      pre_wins: preWins,
      pre_losses: preLosses,
      return_result: `${todayWins}W-${returnLosses}L`,
      return_margins: todayLogs.map((row) => row.plus_minus),
    },
    player_ids: [firstReturner],
    priority: 35,
    angle_options: [
      'theyre_back',
      'return',
      'welcome_back',
      'absence_makes',
      'back_in_the_gym',
    ],
  }
}

// ---------------------------------------------------------------------------
// Slate builder — turn the raw candidate list into editor-facing facts.
//
// Governing principle: the editor receives ONLY facts clearly tagged as either
// "tonight" (happened this run) or "standing" (all-time / context), and must
// never blur the two. Names are always resolved (never raw UUIDs), and the only
// rank presented is the 5+-games leaderboard rank (it must match the portal).
// ---------------------------------------------------------------------------

interface SlateEntry {
  type: string
  players: string[]
  tonight: Record<string, unknown>
  standing: Record<string, unknown>
}

interface EditionStory {
  type: string
  headline: string
  body: string
}

// Editorial guidance (NOT printable facts): how substantive the night genuinely
// was, so the editor can size the edition honestly instead of treating 3 stories as
// a floor and padding with standing context. game count + a count of ELEVATING
// tonight events (milestone / perfect sweep / upset) — routine rivalries, returns,
// recaps, and ranks are night content, not elevating events.
interface Substance {
  games_tonight: number
  notable_tonight_event_count: number
  notable_tonight_events: string[]
  // Present only when a marquee milestone (e.g. a 1000th career game) was crossed
  // tonight — an explicit, NON-printable signal that this is lead-worthy news.
  marquee_milestone?: string
}

function pct(p: number): string {
  return '.' + Math.round(p * 1000).toString().padStart(3, '0')
}

// Whole-percent string so the editor never has to multiply a 0.xx win rate by 100.
function pctWhole(p: number | null | undefined): string | null {
  return p === null || p === undefined ? null : `${Math.round(p * 100)}%`
}

// Strip absent fields so the editor only ever sees PRESENT, true facts. A field
// that isn't in the slate cannot be narrated as an absence ("nobody went
// undefeated" was undefeated_player:null read as a positive claim). Removes
// null/undefined, empty strings, the 'N/A' sentinel, and empty arrays — but KEEPS
// 0 and false, which are real facts (a +/- of 0; teamed_up_tonight:false, the
// banned-inference guard that must survive).
function prune(facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(facts)) {
    if (v === null || v === undefined || v === '' || v === 'N/A') continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out
}

// Substance-scaled ceiling on how many candidate stories the editor may RECEIVE.
// A prompt ceiling alone proved unreliable across four rounds — the model tells every
// true story it is handed — so we enforce length structurally, the same way prune
// enforces grounding: the editor physically cannot write a story for a candidate it
// was never given. Base scales with games played; each genuine tonight event
// (milestone / perfect sweep / upset) lifts the cap by one, so a low-game but eventful
// night still reads full.
function candidateCap(gamesTonight: number, notableEventCount: number): number {
  const base = gamesTonight <= 3 ? 2 : gamesTonight <= 6 ? 3 : 4
  return base + notableEventCount
}

function buildSlate(
  candidates: NarrativeCandidate[],
  playerMap: Map<string, PlayerName>,
): SlateEntry[] {
  const name = (id: string) => {
    const p = playerMap.get(id)
    return p ? displayName(p) : id
  }

  const entries: SlateEntry[] = []
  for (const c of candidates) {
    const b = c.body_data as Record<string, unknown>
    const players = c.player_ids.map(name)
    let tonight: Record<string, unknown> = {}
    let standing: Record<string, unknown> = {}

    switch (c.narrative_type) {
      case 'hot_duo': {
        const today = (b.today_games_together as unknown[]) ?? []
        standing = {
          record_together: `${b.wins_together}-${b.losses_together} as teammates across ${b.games_together} games (${pct(b.win_pct_together as number)} win rate)`,
        }
        // FIX 1: explicit "did NOT play together tonight" flag — banned-inference guard.
        tonight = { teamed_up_tonight: today.length > 0 }
        break
      }
      case 'rivalry': {
        // FIX 4: drop the all-players rank fields entirely; the rivalry carries no
        // canonical rank (the climber's 5+-games rank is the only one we present).
        // Pre-compute the series leader + margin so the editor copies the spread
        // rather than subtracting two records itself (it once said "by one" for 81-79).
        const w1 = b.player1_wins as number
        const w2 = b.player2_wins as number
        const margin = Math.abs(w1 - w2)
        const series_summary =
          w1 === w2
            ? `The series is tied ${w1}-${w2} across ${b.games_played} games`
            : `${w1 > w2 ? players[0] : players[1]} leads the series ${Math.max(w1, w2)}-${Math.min(w1, w2)}, by ${margin} game${margin === 1 ? '' : 's'}, across ${b.games_played} games`
        standing = {
          series_summary,
          series_leader: w1 === w2 ? null : w1 > w2 ? players[0] : players[1],
          series_lead_margin: margin,
        }
        // WINNER-ATTRIBUTED tonight result — a pre-formatted string the editor copies,
        // never a bare score it must assign a direction to.
        const m = b.today_matchup as
          | { winner: string; loser: string; winner_score: number; loser_score: number }
          | { tie: true; players: [string, string]; score: string }
          | null
        // meetings_tonight is the GROUND-TRUTH count of times they were on opposite
        // teams tonight; `result` is just ONE of those meetings (the representative).
        const meetings = b.today_meeting_count as number
        if (m && 'tie' in m) {
          tonight = { met_tonight: true, meetings_tonight: meetings, result: `${m.players[0]} and ${m.players[1]} tied ${m.score}` }
        } else if (m) {
          tonight = { met_tonight: true, meetings_tonight: meetings, result: `${m.winner} beat ${m.loser} ${m.winner_score}-${m.loser_score}` }
        } else {
          tonight = { met_tonight: false }
        }
        break
      }
      case 'climber': {
        // Canonical 5+-games leaderboard rank (matches the portal).
        standing = {
          rank: `#${b.current_rank} among players with 5+ games, by average plus-minus`,
          avg_plus_minus: b.avg_plus_minus,
          win_pct: pctWhole(b.win_pct as number | null),
          games_played: b.games_played,
          players_just_below: b.players_near_rank,
        }
        tonight = { record: `${b.session_wins}-${b.session_losses}` }
        break
      }
      case 'returner': {
        standing = {
          days_away: b.days_away,
          record_before_return: `${b.pre_wins}-${b.pre_losses}`,
        }
        // FIX 2: the REAL return_result from the detector (never a mock value).
        tonight = { result: b.return_result, margins: b.return_margins }
        break
      }
      case 'session_recap':
        // NOTE: most_wins_player/count is deliberately OMITTED. It's a bare win count
        // with no games-played denominator, and the editor repeatedly inflated it into
        // a record it doesn't support ("3-for-3", "the only player to win", "night-high
        // 3 wins"). top_performer (by avg +/-) carries the "who led" hook safely.
        // undefeated_player is pruned when null (it only fires on a 3+ game sweep).
        tonight = {
          games: b.total_games,
          players: b.total_players,
          total_points: b.total_points,
          closest_game: b.closest_game,
          biggest_blowout: b.biggest_blowout,
          top_performer: b.top_performer,
          top_performer_avg_plus_minus: b.top_performer_avg_pm,
          undefeated_player: b.undefeated_player,
        }
        break
      case 'defensive_battle':
      case 'shootout': {
        // Attribute the winning side so the editor never assigns direction to a bare
        // team1-team2 score. Higher score wins; equal is a tie.
        const t1 = b.team1_score as number
        const t2 = b.team2_score as number
        const t1p = (b.team1_players as string[]) ?? []
        const t2p = (b.team2_players as string[]) ?? []
        let result: string
        if (t1 === t2) {
          result = `${t1p.join('/')} tied ${t2p.join('/')} ${t1}-${t2}`
        } else {
          const [winP, loseP, winS, loseS] = t1 > t2 ? [t1p, t2p, t1, t2] : [t2p, t1p, t2, t1]
          result = `${winP.join('/')} beat ${loseP.join('/')} ${winS}-${loseS}`
        }
        tonight = { game_number: b.game_number, result, combined: b.combined }
        break
      }
      case 'upset': {
        // Winner-attributed result plus a pre-formatted strength-gap fact — the
        // winners ARE the weaker team on paper, so both strings are copy-only.
        const winP = (b.winner_players as string[]) ?? []
        const loseP = (b.loser_players as string[]) ?? []
        const diff = b.rapm_diff as number
        tonight = {
          game_number: b.game_number,
          result: `${winP.join('/')} beat ${loseP.join('/')} ${b.winner_score}-${b.loser_score}`,
          upset: `the winners were the weaker team on paper — the losing side was stronger by ${diff.toFixed(2)} RAPM`,
        }
        break
      }
      case 'individual_streak':
      case 'cold_streak':
        // No rank: streak detectors carry an all-players rank, not the 5+-games
        // leaderboard figure, so we omit it rather than print a non-portal number.
        standing = { avg_plus_minus: b.avg_plus_minus }
        tonight = { streak: b.streak, streak_margins: b.streak_margins }
        break
      case 'perfect_session':
        standing = { avg_plus_minus: b.avg_plus_minus }
        tonight = { result: `${b.games}-0`, win_margins: b.won_game_margins }
        break
      case 'milestone': {
        // Every milestone fact is PRE-FORMATTED and COPY-ONLY — the editor must copy the
        // numbers verbatim, never derive or embellish them (a streak headline once read
        // "12 straight" off an 8-game streak). Counted milestones state before→after;
        // the streak states its exact length; anniversary copies its own phrasing.
        const hits = (b.milestones as MilestoneHit[]) ?? []
        const reached = hits.map((h) => {
          if (h.kind === 'game_count' || h.kind === 'win_count' || h.kind === 'attendance') {
            return `${h.label} — ${h.before} coming into tonight, ${h.after} after`
          }
          if (h.kind === 'personal_best_streak') {
            // Copy verbatim: exactly `${h.after}` straight wins, prior best `${h.before}`.
            return `new personal best — won ${h.after} games in a row tonight (previous best ${h.before}); use exactly ${h.after}`
          }
          return h.detail ? `${h.label} (${h.detail})` : h.label
        })
        tonight = { milestones_reached_tonight: reached }
        standing = {
          career_record:
            b.career_wins !== null && b.career_losses !== null
              ? `${b.career_wins}-${b.career_losses}`
              : null,
          win_pct: pctWhole(b.win_pct as number | null),
          avg_plus_minus: b.avg_plus_minus,
        }
        break
      }
      default:
        standing = { facts: c.headline_hint }
    }

    entries.push({ type: c.narrative_type, players, tonight: prune(tonight), standing: prune(standing) })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Consolidated editorial call — one forced-tool-use request to Opus 4.8.
// ---------------------------------------------------------------------------

const EMIT_EDITION_TOOL = {
  name: 'emit_edition',
  description:
    'Emit the finished Rundown edition as structured data: an optional one-line standfirst, exactly one lead story, and zero or more secondary stories. This is the only way to return the edition.',
  input_schema: {
    type: 'object',
    properties: {
      standfirst: {
        type: 'string',
        description: 'Optional one-line deck for the whole edition. Omit if nothing earns it.',
      },
      lead: {
        type: 'object',
        description: 'The single front-page story, chosen by newsworthiness.',
        properties: {
          type: {
            type: 'string',
            description: 'The candidate type this story is built from (e.g. hot_duo, rivalry, climber).',
          },
          headline: { type: 'string', description: 'Headline, 8 words max, no exclamation points.' },
          body: { type: 'string', description: 'Lead body: 4-5 sentences. Let it breathe.' },
        },
        required: ['type', 'headline', 'body'],
      },
      secondaries: {
        type: 'array',
        description: 'Tighter supporting stories. Each covers a DIFFERENT player/storyline than the lead and each other.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            headline: { type: 'string', description: 'Headline, 8 words max.' },
            body: { type: 'string', description: 'Secondary body: 2 sentences max.' },
          },
          required: ['type', 'headline', 'body'],
        },
      },
    },
    required: ['lead', 'secondaries'],
  },
}

const EDITORIAL_SYSTEM = `This is pickup basketball — informal, self-organized, no coaches, no refs. Teams are picked fresh every game; there are no permanent rosters. Someone built a real stats system for this group, so every number means more than it would casually.

You are the EDITOR of "The Rundown," a post-run column in the tradition of Zach Lowe — sharp, specific, human, never purple. You are handed the full slate of candidate storylines from ONE night's run and you build ONE edition: pick the lead, write it, and add tight secondaries.

CLARITY, SPECIFICITY, PUNCH: every sentence is immediately understood by someone who wasn't there; every sentence carries a concrete number or fact; write like Lowe texting about the game, not a literary essay.

EDITORIAL JUDGMENT:
- Pick the LEAD by newsworthiness and human interest, NOT by any ordering in the slate. A long near-even rivalry or an elite duo usually outranks a routine recap.
- Lead body: 4-5 sentences, let it breathe. Secondary bodies: 2 sentences maximum.

MILESTONES: some slate entries (type "milestone") are milestones CROSSED this run — a career-game or career-win count, a session-attendance count, a years-since-first-game anniversary, or a personal-best win streak. Always give a milestone story the type "milestone". Each is a genuine tonight crossing: state it using the "coming into tonight" count ("his 500th game, with 496 in the bank before tip-off"), NEVER as a current total and NEVER as something reached on an earlier night. If "Tonight's substance" flags a marquee milestone (e.g. a 1000th career game), that is rare, lead-worthy news and should usually TAKE THE LEAD over a standing rivalry or duo — it is exactly the fresh event that outranks the evergreen. Lesser milestones are strong secondaries, or the lead on a quiet night. When one player reached more than one milestone tonight, tell them as ONE story ("his 200th game and 100th win on the same night").

DEDUP (hard rule): the player who anchors the LEAD must NOT also anchor a secondary. If a secondary candidate centers on a lead player, fold its angle into the lead or drop it. Each player is the subject of at most ONE story (being named in a game's lineup doesn't count). This holds ACROSS story types: if a player both crossed a milestone and is half of a rivalry (or any two storylines), they still get ONE story — fold the milestone into it or pick the stronger angle, never two stories for the same person.

LENGTH DISCIPLINE (hard rule): the number and length of stories must reflect how much GENUINELY happened tonight. Do NOT pad toward a story count by leaning on standing context (rivalry history, career records, ranks) — manufacturing volume is the same dishonesty as manufacturing drama. Let "Tonight's substance" set a CEILING on how many stories you may emit, then write FEWER than the ceiling whenever the genuine material runs out:
  • games_tonight 3 or fewer → ceiling of 2 stories (often the lead alone is the honest edition).
  • games_tonight 4 to 6 → ceiling of 3 stories.
  • games_tonight 7 or more → ceiling of 4 stories.
  • notable_tonight_event_count raises the ceiling by one (a milestone / perfect sweep / real upset makes even a low-game night read full).
The ceiling is a maximum, never a target — a rivalry's career history, a returner's old record, and a numbers recap are NOT three nights' worth of news on a two-game night. A quieter night must therefore read VISIBLY shorter than a busier one, never the same length. This is judgment within the ceiling: weigh substance the way you weigh newsworthiness.

HARD FACT RULES (violating these breaks the feature):
- Each slate entry splits "tonight" facts from "standing" (all-time / context) facts. NEVER blur the two. A standing record is not a tonight event.
- BANNED INFERENCE — duos: if a duo entry has tonight.teamed_up_tonight = false, you MUST NOT imply they played together, "reunited," "reconnected," or did anything "tonight." Their record together is STANDING context only — a season-long fact, never a tonight reunion.
- BANNED INFERENCE — rankings: any rank in the slate is a STALE nightly snapshot. NEVER say tonight changed someone's rank or that they "climbed" tonight. State a current rank only as a standing fact.
- BANNED INFERENCE — standing deltas: a standing total (series record, series margin, career W-L, games count) ALREADY reflects everything including tonight. Tonight's result does NOT move it. NEVER say a margin "is now down to," "narrows to," "cut to," "trims to one," or a record "improves to," "climbs to" because of tonight. Copy the margin/record from the slate field verbatim ("series_lead_margin": 2 means by two, full stop) — do not add or subtract tonight's game from it.
- BANNED INFERENCE — tonight meeting count: state how many times a pair met/played tonight ONLY from the "meetings_tonight" field; never infer it. The "result" shown is ONE representative meeting, NOT the whole tonight head-to-head — never imply that single result covers all of tonight's meetings, and never claim a count ("met twice," "their two games") unless meetings_tonight says so.
- Use ONLY the numbers in the slate. Never invent, round, or extrapolate a stat.
- ABSENCE IS NOT A FACT: state only what the slate contains. NEVER narrate the absence of something — no "nobody went undefeated," "no one swept," "nobody hit a milestone," "no ties tonight," "no blowouts," "the lone blowout." If a fact is not in an entry, it did not happen for you; say nothing about it.
- NO ALL-TIME OR CROSS-FIELD SUPERLATIVES: a superlative ("closest," "biggest," "tightest," "highest," "lowest," "most," "longest-running") is allowed ONLY for tonight and ONLY when a slate field states it (a recap's biggest_blowout / closest_game, a defensive battle's lowest-scoring game). NEVER assert a career or all-time superlative — "their closest meeting ever," "tightest of 160 games," "first time in months," "lowest-scoring all year." And NEVER rank one slate entry against others that aren't there — "the longest-running feud in the group," "the group's best duo": you see ONE rivalry / ONE duo, not the field, so you cannot know it leads the group. The slate carries aggregate standing totals (e.g. a 79-81 series count) but NO per-game history and NO cross-pair comparison. Do not extrapolate a superlative from an aggregate.

STYLE:
- First names only. Always cite specific numbers. Headlines: 8 words max, no exclamation points. No clichés. No gendered language — use "players," "the group," or names; never "guys," "men," or "brothers."
- Reference the run by day/date ("Wednesday's run," "on June 10th"), never a venue name.
- Banned phrases: "has been playing well," "continues to impress," "is having a great," "made his presence felt," "stepped up," "showed up," "put on a show," "not just," "not only," "but also," "it is not X it is Y," and any abstract noun used where a concrete fact would be sharper.
- Banned word family — "edge" in ALL forms, verb AND noun: never write "edge," "edges," "edged," "edging," "the edge," or "had the edge." For a close win use instead: "took it," "held off," "outlasted," "nipped," "slipped past," "survived." For a decisive win use: "beat," "downed," "rolled past," "handled."
- NEVER use the internal words "slate," "candidate," "entry," or "standing" in the prose — those are your working terms, not the reader's. Write naturally ("the night's biggest gap," not "the slate's lone blowout").

Return the edition ONLY via the emit_edition tool.`

type ContentBlock = { type?: string; name?: string; input?: unknown }

const KNOWN_TYPES = [
  'hot_duo', 'individual_streak', 'cold_streak', 'rivalry', 'upset', 'climber',
  'milestone', 'session_recap', 'defensive_battle', 'shootout',
  'perfect_session', 'returner',
]

function isStory(x: unknown): x is EditionStory {
  return (
    !!x && typeof x === 'object' &&
    typeof (x as EditionStory).type === 'string' &&
    typeof (x as EditionStory).headline === 'string' &&
    typeof (x as EditionStory).body === 'string'
  )
}

// Recover the story type even when the model emits it malformed (the observed
// failure put `type` inside a broken string like '\n<parameter name="type">rivalry').
// The type only drives raw_data/player_id mapping; default to session_recap (no
// player_ids) when unrecoverable so a salvaged story still writes a valid row.
function coerceType(raw: unknown): string {
  if (typeof raw === 'string') {
    const hit = KNOWN_TYPES.find((t) => raw.includes(t))
    if (hit) return hit
  }
  return 'session_recap'
}

/**
 * Robustly assemble a {lead, secondaries} edition from the model's tool_use output.
 * Forced tool-use is supposed to return one emit_edition block with a nested lead, but
 * Opus intermittently malforms it. Observed modes, all handled here:
 *  - WELL-FORMED: one block, nested {lead:{type,headline,body}, secondaries}.
 *  - FLATTENED: lead emitted as a broken string with headline/body hoisted to the top
 *    level of the input — reconstruct the lead from those and recover the type.
 *  - SPLIT: the call spread across multiple tool_use blocks (e.g. one with the lead,
 *    another with secondaries) — merge across all blocks.
 * Returns null only when no usable lead can be recovered (→ caller retries, then falls
 * back to a slate-built recap; never an empty edition).
 */
function parseEditionFromContent(
  content: ContentBlock[] | undefined,
): { lead: EditionStory; secondaries: EditionStory[] } | null {
  const inputs = (content ?? [])
    .filter((b) => b?.type === 'tool_use' && b?.name === 'emit_edition')
    .map((b) => b.input)
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
  if (inputs.length === 0) return null

  let lead: EditionStory | null = null
  const secondaries: EditionStory[] = []

  for (const obj of inputs) {
    if (!lead && isStory(obj.lead)) {
      lead = obj.lead as EditionStory
    } else if (!lead && typeof obj.headline === 'string' && typeof obj.body === 'string') {
      // Flattened/broken-lead salvage: headline+body live at the top level.
      lead = { type: coerceType(obj.type ?? obj.lead), headline: obj.headline, body: obj.body }
    }
    if (Array.isArray(obj.secondaries)) {
      for (const s of obj.secondaries) if (isStory(s)) secondaries.push(s)
    }
  }

  return lead ? { lead, secondaries } : null
}

// One forced-tool-use request to Opus 4.8. Returns the raw content blocks (so the
// caller can parse + retry), or null on a non-OK / thrown request.
async function callEditorialModel(
  slate: SlateEntry[],
  substance: Substance,
  session: RawSession,
): Promise<ContentBlock[] | null> {
  try {
    const runLabel = new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2500,
        tool_choice: { type: 'tool', name: 'emit_edition' },
        tools: [EMIT_EDITION_TOOL],
        system: EDITORIAL_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Build the edition for ${runLabel}'s run.

Tonight's substance (editorial guidance for SIZING the edition — NOT facts to print):
${JSON.stringify(substance, null, 2)}

Candidate slate (JSON). Each entry separates "tonight" facts from "standing"/all-time context — never blur the two. Every field here is a present, true fact; if something is not in an entry, it did not happen — do not narrate its absence:
${JSON.stringify(slate, null, 2)}`,
          },
        ],
      }),
    })

    if (!response.ok) return null
    const data = (await response.json()) as { content?: ContentBlock[] }
    return data.content ?? null
  } catch {
    return null
  }
}

// Generate the edition with a reliability guard: up to 3 attempts, each parsed by the
// salvage-aware parser, with a brief backoff between tries. Malformed output is
// stochastic, so a single retry can also land malformed — three attempts make a clean
// parse overwhelmingly likely. Returns null only if ALL attempts fail to parse; the
// handler then writes a slate-based fallback recap so the edition is never empty.
async function generateEdition(
  slate: SlateEntry[],
  substance: Substance,
  session: RawSession,
): Promise<{ lead: EditionStory; secondaries: EditionStory[] } | null> {
  const MAX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const content = await callEditorialModel(slate, substance, session)
    const parsed = parseEditionFromContent(content ?? undefined)
    if (parsed) {
      if (attempt > 1) console.warn(`[rundown] editorial parsed OK on attempt ${attempt}/${MAX_ATTEMPTS}`)
      return parsed
    }
    console.warn(
      `[rundown] editorial attempt ${attempt}/${MAX_ATTEMPTS} ${content ? 'malformed (unparseable tool output)' : 'request failed'}`,
    )
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 300))
  }
  return null
}

// Last-resort edition built WITHOUT the model, from the session_recap candidate's
// already-slate-grounded facts (scores, counts, top performer). Plain, but factual and
// guaranteed — a bare recap beats an empty Rundown when every model attempt malforms.
function buildFallbackEdition(
  candidates: NarrativeCandidate[],
  playerMap: Map<string, PlayerName>,
): { lead: EditionStory; secondaries: EditionStory[] } | null {
  const recap = candidates.find((c) => c.narrative_type === 'session_recap')
  if (!recap) return null
  void playerMap

  const b = recap.body_data as Record<string, unknown>
  const games = Number(b.total_games ?? 0)
  const players = Number(b.total_players ?? 0)
  const points = Number(b.total_points ?? 0)

  let body = `${players} player${players === 1 ? '' : 's'} ran ${games} game${games === 1 ? '' : 's'} for ${points} total points.`
  if (typeof b.top_performer === 'string' && b.top_performer_avg_pm != null) {
    const pm = Number(b.top_performer_avg_pm)
    body += ` ${b.top_performer} led the night at ${pm >= 0 ? '+' : ''}${pm} average plus-minus.`
  }
  if (typeof b.closest_game === 'string' && b.closest_game !== 'N/A') {
    body += ` The closest game finished ${b.closest_game}.`
  }

  return {
    lead: { type: 'session_recap', headline: `${games}-game run recap`, body },
    secondaries: [],
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function POST(request: Request) {
  const gate = await requireUniverse()
  if (!gate.ctx) return gate.error
  const universeId = gate.ctx.universeId

  try {
    const body = (await request.json()) as { session_id: string }
    const { session_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400, headers: NO_CACHE })
    }

    // -----------------------------------------------------------------------
    // Phase 1 — fetch session and games (game IDs needed for phase 2)
    // -----------------------------------------------------------------------
    const [sessionRes, gamesRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('universe_id', universeId).eq('id', session_id).single(),
      supabase.from('games').select('*').eq('universe_id', universeId).eq('session_id', session_id),
    ])

    if (sessionRes.error || !sessionRes.data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: NO_CACHE })
    }

    const session = sessionRes.data as unknown as RawSession
    const games = (gamesRes.data as unknown as RawGame[]) ?? []
    const gameIds = games.map((g) => g.id)

    if (gameIds.length === 0) {
      return NextResponse.json(
        { success: true, narratives_generated: 0 },
        { status: 200, headers: NO_CACHE },
      )
    }

    // -----------------------------------------------------------------------
    // Phase 2 — fetch everything else in parallel.
    // The rolling-form window is anchored to THIS session's date (not Date.now()):
    // [session_date - 30d, session_date]. In production the session is current, so
    // this matches the old "last 30 days" behavior; for regenerating an older
    // edition it keeps streaks/returner/recap faithful to that run's era instead of
    // bleeding in the group's current form.
    const windowStart = new Date(new Date(session.session_date + 'T12:00:00').getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const [
      gamePlayersRes,
      playerStatsRes,
      gameLogRes,
      teammateRes,
      opponentRes,
      gameStrengthRes,
      sessionsOrderRes,
    ] = await Promise.all([
      supabase
        .from('game_players')
        .select('*, players(id, name, nickname)')
        .in('game_id', gameIds),
      supabase.from('player_stats_full').select('*'),
      supabase
        .from('player_game_log')
        .select('player_id,game_id,session_date,player_team,winning_team,plus_minus,is_win')
        .gte('session_date', windowStart)
        .lte('session_date', session.session_date)
        .order('session_date', { ascending: true }),
      supabase.from('teammate_stats').select('*'),
      supabase.from('opponent_stats').select('*'),
      supabase.from('game_team_strength').select('*').in('game_id', gameIds),
      // Session chronology for milestone before/after. session_date alone can't order
      // two sessions on the SAME day (a double-header), so we order by (date, created_at)
      // — this puts an earlier same-day session correctly into a later one's "before".
      supabase.from('sessions').select('id,session_date,created_at'),
    ])

    const gamePlayers = (gamePlayersRes.data as unknown as RawGamePlayer[]) ?? []
    const playerStats = (playerStatsRes.data as unknown as PlayerStatsFull[]) ?? []
    const gameLog = (gameLogRes.data as unknown as GameLogRow[]) ?? []
    const teammateStats = (teammateRes.data as unknown as TeammateStatRow[]) ?? []
    const opponentStats = (opponentRes.data as unknown as OpponentStatRow[]) ?? []
    const gameStrength = (gameStrengthRes.data as unknown as GameStrengthRow[]) ?? []

    // session_id → chronological sort key (date, then created_at, then id for total
    // determinism). Lets milestones order "before" by true session chronology.
    const sessionsOrderRows = (sessionsOrderRes.data as unknown as { id: string; session_date: string; created_at: string }[]) ?? []
    const sessionOrderKey = new Map<string, string>(
      sessionsOrderRows.map((s) => [s.id, `${s.session_date}#${s.created_at}#${s.id}`]),
    )

    // -----------------------------------------------------------------------
    // Build lookup maps
    // -----------------------------------------------------------------------
    const sessionPlayerIds = new Set(gamePlayers.map((gp) => gp.player_id))
    const sessionGameIds = new Set(gameIds)

    const playerMap = new Map<string, PlayerName>()
    gamePlayers.forEach((gp) => {
      if (!playerMap.has(gp.player_id)) {
        playerMap.set(gp.player_id, gp.players)
      }
    })
    playerStats.forEach((ps) => {
      if (!playerMap.has(ps.player_id)) {
        playerMap.set(ps.player_id, { name: ps.name, nickname: ps.nickname })
      }
    })

    // Resolve the last 1-2 prior leads into editor-facing context (type + subject
    // NAMES, never UUIDs). Sort by the embedded session_date desc (the fetch was only
    // bounded, not ordered, by recency) and keep the two most recent. playerStats
    // covers every historical player, so playerMap resolves subjects from past editions.
    // -----------------------------------------------------------------------
    // Milestone history — the FULL career game log for tonight's players up to and
    // including this session's date (NOT the 30-day form window). Needed for genuine
    // before/after milestone crossings (game/win counts, attendance, streaks,
    // first-game anniversary). Paged: PostgREST caps at 1000 rows and a single veteran
    // (Colin ~1650 games) exceeds that. Ordered deterministically so paging is stable.
    // -----------------------------------------------------------------------
    const sessionPlayerIdList = Array.from(sessionPlayerIds)
    const milestoneHistory: MilestoneHistoryRow[] = []
    for (let from = 0; sessionPlayerIdList.length > 0; from += 1000) {
      const { data, error } = await supabase
        .from('player_game_log')
        .select('player_id,session_id,session_date,game_number,is_win,winning_team,game_id')
        .in('player_id', sessionPlayerIdList)
        .lte('session_date', session.session_date)
        .order('player_id', { ascending: true })
        .order('session_date', { ascending: true })
        .order('game_number', { ascending: true })
        .order('game_id', { ascending: true })
        .range(from, from + 999)
      if (error || !data) break
      milestoneHistory.push(...(data as unknown as MilestoneHistoryRow[]))
      if (data.length < 1000) break
    }

    // -----------------------------------------------------------------------
    // Run all pattern detectors (each wrapped in try/catch)
    // -----------------------------------------------------------------------
    const detectors: Array<() => NarrativeCandidate | null> = [
      () => detectHotDuo(sessionPlayerIds, teammateStats, playerMap, playerStats, gamePlayers, games),
      () => detectIndividualStreak(sessionPlayerIds, gameLog, playerMap, playerStats),
      () => detectColdStreak(sessionPlayerIds, gameLog, playerMap, playerStats),
      () => detectRivalry(sessionPlayerIds, opponentStats, playerMap, playerStats, gamePlayers, games),
      () => detectUpset(gameStrength, games, gamePlayers),
      () => detectClimber(sessionPlayerIds, playerStats, gameLog, sessionGameIds, playerMap),
      () => detectSessionRecap(games, gamePlayers, gameLog, sessionGameIds, playerStats, playerMap),
      () => detectDefensiveBattle(games, gamePlayers),
      () => detectShootout(games, gamePlayers),
      () => detectPerfectSession(gameLog, sessionGameIds, playerMap, playerStats),
      () => detectReturner(sessionPlayerIds, gameLog, sessionGameIds, playerStats, playerMap, session.session_date),
    ]

    const candidates: NarrativeCandidate[] = []
    for (const detector of detectors) {
      try {
        const result = detector()
        if (result) candidates.push(result)
      } catch {
        // Non-blocking — continue with other detectors
      }
    }

    // Milestones run separately — the only detector that can emit MULTIPLE candidates
    // (one per player who crossed a threshold tonight).
    try {
      candidates.push(
        ...detectMilestones(sessionPlayerIds, milestoneHistory, session, playerStats, playerMap, sessionOrderKey),
      )
    } catch {
      // Non-blocking
    }

    // A personal-best-streak milestone and the plain individual_streak are the SAME hot
    // streak — handing the editor both (two streak stories, two streak numbers + a
    // margins array for one player) invites it to blend/embellish the count. The
    // milestone is the richer, pre-formatted version, so drop the redundant
    // individual_streak for any player who has a personal-best-streak milestone.
    const pbStreakPlayers = new Set(
      candidates
        .filter((c) => c.narrative_type === 'milestone'
          && ((c.body_data as { milestones?: MilestoneHit[] }).milestones ?? []).some((h) => h.kind === 'personal_best_streak'))
        .map((c) => c.player_ids[0]),
    )
    if (pbStreakPlayers.size > 0) {
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (candidates[i].narrative_type === 'individual_streak' && pbStreakPlayers.has(candidates[i].player_ids[0])) {
          candidates.splice(i, 1)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Consolidated editorial pass. Hand a substance-capped candidate slate to ONE
    // Opus 4.8 emit_edition call (forced tool-use). The editor picks the lead by
    // newsworthiness, dedups overlapping players, and writes the full edition in
    // one structured response — no priority sort for ORDER, no per-player dedup, no
    // per-story fan-out, no angle/tone rotation.
    // -----------------------------------------------------------------------

    // Substance signal — how much GENUINELY happened tonight. Only elevating events
    // (a milestone, a perfect sweep, a real upset) make a low-game night read full;
    // routine rivalries / returns / recaps / ranks are content, not events.
    const ELEVATING_EVENT_TYPES = new Set(['perfect_session', 'milestone', 'upset'])
    const notableTonightEvents = candidates
      .filter((c) => ELEVATING_EVENT_TYPES.has(c.narrative_type))
      .map((c) => c.narrative_type)

    // Explicit, non-printable lead signal for a marquee milestone (e.g. a 1000th game).
    const marqueeCand = candidates.find(
      (c) => c.narrative_type === 'milestone' && (c.body_data as { tier?: string }).tier === 'marquee',
    )
    let marqueeMilestone: string | undefined
    if (marqueeCand) {
      const bd = marqueeCand.body_data as { player_id?: string; milestones?: MilestoneHit[] }
      const p = bd.player_id ? playerMap.get(bd.player_id) : undefined
      const label = bd.milestones?.[0]?.label
      if (p && label) marqueeMilestone = `${displayName(p)} reached their ${label} tonight`
    }

    const substance: Substance = {
      games_tonight: games.length,
      notable_tonight_event_count: notableTonightEvents.length,
      notable_tonight_events: notableTonightEvents,
      ...(marqueeMilestone ? { marquee_milestone: marqueeMilestone } : {}),
    }

    // Structural length control (applied to the editor's OUTPUT, below — NOT to its
    // input). The editor sees the FULL slate so its dedup, fact-folding, and lead choice
    // stay intact; input-capping was tried and rejected because pre-filtering by priority
    // concentrated the slate on one player (two Tyler candidates) and the editor then
    // double-featured him, and the sparse slate also tripped malformed tool output.
    const cap = candidateCap(substance.games_tonight, substance.notable_tonight_event_count)

    const slate = buildSlate(candidates, playerMap)

    interface NarrativeInsert {
      universe_id: string
      session_id: string
      narrative_type: string
      angle_used: string
      tone_used: string
      headline: string
      body: string
      is_lead: boolean
      priority: number
      player_ids: string[]
      raw_data: Record<string, unknown>
    }

    const narrativesToInsert: NarrativeInsert[] = []

    if (slate.length > 0) {
      // Reliability guard: if all editorial attempts malform, fall back to a plain
      // slate-built recap rather than writing nothing — an empty Rundown is the worst
      // failure mode for a "read it right after the run" feature.
      let edition = await generateEdition(slate, substance, session)
      if (!edition) {
        edition = buildFallbackEdition(candidates, playerMap)
        if (edition) {
          console.error('[rundown] all editorial attempts failed — wrote slate-based recap fallback')
        }
      }
      if (edition) {
        // Map each story's type back to the candidate that produced it, so the
        // box score / OG avatars / leaderboard links keep their player_ids and
        // raw facts. Every type appears at most once EXCEPT 'milestone', which can
        // have one candidate per player — for those, disambiguate by which milestone
        // candidate's player is named in the story text.
        const byType = new Map(candidates.map((c) => [c.narrative_type, c]))
        const milestoneCands = candidates.filter((c) => c.narrative_type === 'milestone')
        // First name the editor would use for a player (it writes first-names only).
        const firstNameOf = (pid: string | undefined): string => {
          const nm = pid ? playerMap.get(pid) : undefined
          return nm ? displayName(nm).split(' ')[0] : ''
        }
        // Map an editor story back to its source candidate (for player_ids + raw_data).
        // Milestones can have several candidates in one edition, so disambiguate by which
        // candidate's first name LEADS THE HEADLINE — bodies list game lineups and would
        // false-match a teammate (a lead about James names Zach in the lineup too).
        const resolveSrc = (type: string, headline: string): NarrativeCandidate | undefined => {
          if (type === 'milestone' && milestoneCands.length > 1) {
            const hit = milestoneCands.find((c) => {
              const fn = firstNameOf(c.player_ids[0])
              return fn !== '' && new RegExp(`\\b${fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(headline)
            })
            return hit ?? milestoneCands[0]
          }
          return byType.get(type)
        }
        // Apply the substance cap to the editor's OUTPUT: keep the lead plus its top
        // (cap - 1) secondaries IN THE EDITOR'S OWN ORDER, dropping its lowest-ranked
        // ones. Because the editor already ranks secondaries by its own newsworthiness
        // judgment, this trims the WEAKEST stories it chose, never the lead. On a thin
        // night this can drop a real, true story — a deliberate trade of edition SHAPE
        // (a tight, lean read) for completeness.
        const keptSecondaries = edition.secondaries.slice(0, Math.max(0, cap - 1))
        const stories = [
          { ...edition.lead, is_lead: true },
          ...keptSecondaries.map((s) => ({ ...s, is_lead: false })),
        ]
        stories.forEach((story, idx) => {
          if (typeof story.headline !== 'string' || typeof story.body !== 'string') return
          // Snap the editor's type to a known type. It occasionally echoes a substance
          // hint as the type ("marquee_milestone"); coerceType lands that on "milestone".
          const type = coerceType(story.type)
          const src = resolveSrc(type, story.headline)
          narrativesToInsert.push({
            universe_id: universeId,
            session_id,
            narrative_type: type,
            angle_used: 'editorial',
            tone_used: 'editorial',
            headline: story.headline,
            body: story.body,
            is_lead: story.is_lead,
            priority: 100 - idx, // preserve the editor's chosen order (lead first)
            player_ids: src?.player_ids ?? [],
            raw_data: src?.body_data ?? {},
          })
        })
      }
    }

    // -----------------------------------------------------------------------
    // Write to Supabase. Only replace the edition when we actually have stories
    // — a failed/empty editorial call writes nothing and leaves any existing
    // narratives untouched (never wipe a good edition on a transient failure).
    // -----------------------------------------------------------------------
    if (narrativesToInsert.length > 0) {
      await supabaseAdmin.from('narratives').delete().eq('universe_id', universeId).eq('session_id', session_id)
      await supabaseAdmin.from('narratives').insert(narrativesToInsert)
    }

    return NextResponse.json(
      { success: true, narratives_generated: narrativesToInsert.length },
      { status: 200, headers: NO_CACHE },
    )
  } catch {
    // Narrative generation must never crash anything
    return NextResponse.json(
      { success: true, narratives_generated: 0 },
      { status: 200, headers: NO_CACHE },
    )
  }
}
