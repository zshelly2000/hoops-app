export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
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
  player1_id: string
  player2_id: string
  games_together: number
  wins_together: number
  win_pct_together: number
}

interface OpponentStatRow {
  player1_id: string
  player2_id: string
  games_played: number
  player1_wins: number
  player2_wins: number
}

interface GameStrengthRow {
  game_id: string
  team1_strength: number
  team2_strength: number
  stronger_team: 1 | 2 | null
  is_upset: boolean
  upset_margin: number
}

interface NarrativeAngleRow {
  id: string
  narrative_type: string
  last_angle: string | null
  last_tone: string | null
  last_used_at: string | null
}

interface PreviousNarrativeRow {
  narrative_type: string
  body: string
  angle_used: string
  tone_used: string
}

type PlayerName = { name: string; nickname: string | null }

// ---------------------------------------------------------------------------
// Enriched candidate (after angle/tone are determined)
// ---------------------------------------------------------------------------

type EnrichedCandidate = NarrativeCandidate & {
  angle_used: string
  tone_used: string
}

// ---------------------------------------------------------------------------
// Angle / tone rotation
// ---------------------------------------------------------------------------

const TONES = ['analytical', 'dramatic', 'understated', 'conversational'] as const

function nextAngle(angleOptions: string[], lastAngle: string | null): string {
  if (!lastAngle || angleOptions.length === 0) return angleOptions[0] ?? 'general'
  const idx = angleOptions.indexOf(lastAngle)
  if (idx === -1) return angleOptions[0]
  return angleOptions[(idx + 1) % angleOptions.length]
}

function displayName(p: PlayerName): string {
  return p.nickname ?? p.name
}

// ---------------------------------------------------------------------------
// Pattern detector: hot_duo
// ---------------------------------------------------------------------------

function detectHotDuo(
  sessionPlayerIds: Set<string>,
  teammateStats: TeammateStatRow[],
  playerMap: Map<string, PlayerName>,
): NarrativeCandidate | null {
  const qualifying = teammateStats.filter(
    (row) =>
      sessionPlayerIds.has(row.player1_id) &&
      sessionPlayerIds.has(row.player2_id) &&
      row.games_together >= 4 &&
      row.win_pct_together >= 0.7,
  )

  if (qualifying.length === 0) return null

  qualifying.sort((a, b) => b.win_pct_together - a.win_pct_together)
  const best = qualifying[0]

  const p1 = playerMap.get(best.player1_id)
  const p2 = playerMap.get(best.player2_id)
  if (!p1 || !p2) return null

  const wins = best.wins_together
  const losses = best.games_together - wins
  const winPctStr = Math.round(best.win_pct_together * 1000)
    .toString()
    .padStart(3, '0')

  return {
    narrative_type: 'hot_duo',
    headline_hint: `${displayName(p1)} & ${displayName(p2)}: ${wins}-${losses} together, .${winPctStr} win%`,
    body_data: {
      player1_id: best.player1_id,
      player2_id: best.player2_id,
      games_together: best.games_together,
      wins_together: wins,
      losses_together: losses,
      win_pct_together: best.win_pct_together,
    },
    player_ids: [best.player1_id, best.player2_id],
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
): NarrativeCandidate | null {
  // Group log by player (already sorted ascending by session_date)
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

  return {
    narrative_type: 'individual_streak',
    headline_hint: `${displayName(p)} has won ${best.streak} straight`,
    body_data: { player_id: best.playerId, streak: best.streak },
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

  return {
    narrative_type: 'cold_streak',
    headline_hint: `${displayName(p)} has dropped ${best.streak} in a row`,
    body_data: { player_id: best.playerId, streak: best.streak },
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
): NarrativeCandidate | null {
  const qualifying = opponentStats.filter(
    (row) =>
      sessionPlayerIds.has(row.player1_id) &&
      sessionPlayerIds.has(row.player2_id) &&
      row.games_played >= 6 &&
      Math.abs(row.player1_wins - row.player2_wins) <= 2,
  )

  if (qualifying.length === 0) return null

  const best = qualifying[0]

  const p1 = playerMap.get(best.player1_id)
  const p2 = playerMap.get(best.player2_id)
  if (!p1 || !p2) return null

  return {
    narrative_type: 'rivalry',
    headline_hint: `${displayName(p1)} vs ${displayName(p2)}: ${best.player1_wins}-${best.player2_wins} all-time, met again today`,
    body_data: {
      player1_id: best.player1_id,
      player2_id: best.player2_id,
      player1_wins: best.player1_wins,
      player2_wins: best.player2_wins,
      games_played: best.games_played,
    },
    player_ids: [best.player1_id, best.player2_id],
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

function detectUpset(
  gameStrength: GameStrengthRow[],
  games: RawGame[],
): NarrativeCandidate | null {
  const upsets = gameStrength.filter((gs) => gs.is_upset)
  if (upsets.length === 0) return null

  upsets.sort((a, b) => b.upset_margin - a.upset_margin)
  const best = upsets[0]

  const game = games.find((g) => g.id === best.game_id)
  if (!game) return null

  return {
    narrative_type: 'upset',
    headline_hint: `Upset: weaker team won by ${best.upset_margin.toFixed(1)} strength pts, score ${game.team1_score}-${game.team2_score}`,
    body_data: {
      game_id: best.game_id,
      upset_margin: best.upset_margin,
      team1_score: game.team1_score,
      team2_score: game.team2_score,
    },
    player_ids: [],
    priority: Math.round(best.upset_margin * 15),
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
  // Current rankings
  const withStats = playerStats.filter(
    (ps) => ps.games_played > 0 && ps.avg_plus_minus !== null,
  )
  const currentSorted = [...withStats].sort(
    (a, b) => (b.avg_plus_minus ?? 0) - (a.avg_plus_minus ?? 0),
  )
  const currentRankMap = new Map<string, number>()
  currentSorted.forEach((ps, idx) => currentRankMap.set(ps.player_id, idx + 1))

  // Today's games contribution per player
  const todayLog = gameLog.filter((row) => sessionGameIds.has(row.game_id))
  const todayByPlayer = new Map<string, { total_pm: number; game_count: number }>()
  for (const row of todayLog) {
    const existing = todayByPlayer.get(row.player_id) ?? { total_pm: 0, game_count: 0 }
    todayByPlayer.set(row.player_id, {
      total_pm: existing.total_pm + row.plus_minus,
      game_count: existing.game_count + 1,
    })
  }

  // Pre-session averages
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
    if (gained >= 3 && (!best || gained > best.gained)) {
      best = { playerId, gained }
    }
  }

  if (!best) return null

  const p = playerMap.get(best.playerId)
  if (!p) return null

  return {
    narrative_type: 'climber',
    headline_hint: `${displayName(p)} climbed ${best.gained} spots in the rankings today`,
    body_data: { player_id: best.playerId, spots_gained: best.gained },
    player_ids: [best.playerId],
    priority: 50,
    angle_options: ['rising', 'statement_game', 'moving_up', 'watch_out', 'arrival'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: veteran_milestone
// ---------------------------------------------------------------------------

const MILESTONE_PRIORITIES: Record<number, number> = {
  100: 60,
  75: 60,
  50: 60,
  25: 45,
  10: 35,
}

function detectVeteranMilestone(
  sessionPlayerIds: Set<string>,
  playerStats: PlayerStatsFull[],
  playerMap: Map<string, PlayerName>,
): NarrativeCandidate | null {
  const milestones = [100, 75, 50, 25, 10]

  let best: { playerId: string; milestone: number; priority: number } | null = null

  for (const ps of playerStats) {
    if (!sessionPlayerIds.has(ps.player_id)) continue
    for (const m of milestones) {
      if (ps.games_played === m) {
        const priority = MILESTONE_PRIORITIES[m] ?? 35
        if (!best || priority > best.priority) {
          best = { playerId: ps.player_id, milestone: m, priority }
        }
      }
    }
  }

  if (!best) return null

  const p = playerMap.get(best.playerId)
  if (!p) return null

  return {
    narrative_type: 'veteran_milestone',
    headline_hint: `${displayName(p)} played their ${best.milestone}th game today`,
    body_data: { player_id: best.playerId, milestone: best.milestone },
    player_ids: [best.playerId],
    priority: best.priority,
    angle_options: ['milestone', 'longevity', 'dedication', 'veteran', 'journey'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: session_recap (always generates)
// ---------------------------------------------------------------------------

function detectSessionRecap(
  games: RawGame[],
  gamePlayers: RawGamePlayer[],
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
    },
    player_ids: [],
    priority: 20,
    angle_options: ['by_the_numbers', 'what_happened', 'the_session', 'recap', 'from_the_run'],
  }
}

// ---------------------------------------------------------------------------
// Pattern detector: defensive_battle
// ---------------------------------------------------------------------------

function detectDefensiveBattle(games: RawGame[]): NarrativeCandidate | null {
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

  return {
    narrative_type: 'defensive_battle',
    headline_hint: `Lowest scoring game: ${targetGame.team1_score}-${targetGame.team2_score}, combined ${lowestCombined}`,
    body_data: {
      game_id: targetGame.id,
      team1_score: targetGame.team1_score,
      team2_score: targetGame.team2_score,
      combined: lowestCombined,
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

function detectShootout(games: RawGame[]): NarrativeCandidate | null {
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

  return {
    narrative_type: 'shootout',
    headline_hint: `Highest scoring game: ${targetGame.team1_score}-${targetGame.team2_score}, combined ${highestCombined}`,
    body_data: {
      game_id: targetGame.id,
      team1_score: targetGame.team1_score,
      team2_score: targetGame.team2_score,
      combined: highestCombined,
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

  return {
    narrative_type: 'perfect_session',
    headline_hint: `${displayName(p)} went ${best.games}-0 today`,
    body_data: { player_id: best.playerId, games: best.games, wins: best.games },
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
    // No non-today entries in 30-day log — check they have prior history
    const ps = statsMap.get(playerId)
    const todayCount = todayGameCount.get(playerId) ?? 0
    if (!ps || ps.games_played <= todayCount) continue
    firstReturner = playerId
    break
  }

  if (!firstReturner) return null

  const p = playerMap.get(firstReturner)
  if (!p) return null

  return {
    narrative_type: 'returner',
    headline_hint: `${displayName(p)} returned after 30+ days away`,
    body_data: { player_id: firstReturner, days_away: 30 },
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
// Per-type angle instruction
// ---------------------------------------------------------------------------

function getAngleInstruction(narrative_type: string): string {
  const instructions: Record<string, string> = {
    individual_streak:
      "Don't just report the streak — ask what it reveals about this player right now.",
    cold_streak:
      'Focus on what needs to change, not just that they\'re losing. Find the pattern in the losses.',
    hot_duo:
      "Don't just cite the record — explain why this pairing works. What do they give each other?",
    rivalry:
      "This isn't just a record — it's a relationship. What does the history between these two mean?",
    upset:
      'The math said one thing, the scoreboard said another. Make the reader feel the gap.',
    climber:
      'Rank changes are just math — find the human story in the climb.',
    veteran_milestone:
      "This isn't about the number — it's about what this person represents to the group.",
    session_recap:
      'Give the session an identity. Every run has a defining characteristic — find it.',
    defensive_battle:
      "Low scores aren't boring — they're a war. Make the reader feel the grind.",
    shootout:
      'Pure offense is chaos and joy. Let the energy of the scoring show in the writing.',
    perfect_session:
      "Going undefeated isn't luck at this level. What made them untouchable today?",
    returner:
      'Thirty days away is an eternity in pickup basketball. What did they come back to? What did they miss?',
  }
  return instructions[narrative_type] ?? ''
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function generateNarrative(
  candidate: EnrichedCandidate,
  session: RawSession,
  playerMap: Map<string, PlayerName>,
): Promise<{ headline: string; body: string } | null> {
  try {
    const playerNames = candidate.player_ids
      .map((id) => {
        const p = playerMap.get(id)
        return p ? displayName(p) : null
      })
      .filter((n): n is string => n !== null)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: `You are a sports columnist in the tradition of Zach Lowe and Wright Thompson — you find the human story inside the numbers. Your writing has three qualities:

1. CLARITY FIRST: Every sentence must be immediately understood by someone who wasn't at the run. No metaphors that require interpretation. If a sentence needs re-reading, rewrite it.

2. SPECIFICITY: Every sentence contains a concrete detail. Never write "playing well" — write "won 6 of his last 7 and the one loss wasn't close."

3. PUNCHY NOT POETIC: Write like Zach Lowe texting you about the game — sharp, confident, specific. Not like a literary essay. The insight should land immediately, not after reflection.

Rules: use first names only, always reference specific numbers, two sentences maximum for body copy — if you cannot say it clearly in two sentences, say less not more, headline maximum 8 words, no exclamation points, no clichés.

Banned phrases: "has been playing well," "continues to impress," "is having a great," "made his presence felt," "stepped up," "showed up," "put on a show," "mornings now look different," "borrowed quietly," "its own kind of," "that is its own," and any phrase that uses abstract nouns where concrete facts would work better.

When referencing the session, use the day and date — "Wednesday's run," "last Thursday," "on May 29th" — never a venue name.

Tone for this story: ${candidate.tone_used}
Angle for this story: ${candidate.angle_used}
Return ONLY valid JSON, no markdown, no backticks:
  {"headline": "...", "body": "..."}`,
        messages: [
          {
            role: 'user',
            content: `Write a ${candidate.angle_used} narrative.
${candidate.previous_text ? `Previous version (do not repeat phrases or structure): "${candidate.previous_text}"` : ''}
Key facts: ${candidate.headline_hint}
Stats: ${JSON.stringify(candidate.body_data)}
Players: ${playerNames.join(', ')}
Run: ${new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
${getAngleInstruction(candidate.narrative_type)}`,
          },
        ],
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text) as { headline?: unknown; body?: unknown }

    if (typeof parsed.headline !== 'string' || typeof parsed.body !== 'string') return null

    return { headline: parsed.headline, body: parsed.body }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }

export async function POST(request: Request) {
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
      supabase.from('sessions').select('*').eq('id', session_id).single(),
      supabase.from('games').select('*').eq('session_id', session_id),
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
    // Phase 2 — fetch everything else in parallel
    // -----------------------------------------------------------------------
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    const [
      gamePlayersRes,
      playerStatsRes,
      gameLogRes,
      teammateRes,
      opponentRes,
      gameStrengthRes,
      anglesRes,
      previousNarrativesRes,
    ] = await Promise.all([
      supabase
        .from('game_players')
        .select('*, players(id, name, nickname)')
        .in('game_id', gameIds),
      supabase.from('player_stats_full').select('*'),
      supabase
        .from('player_game_log')
        .select('player_id,game_id,session_date,player_team,winning_team,plus_minus,is_win')
        .gte('session_date', thirtyDaysAgo)
        .order('session_date', { ascending: true }),
      supabase.from('teammate_stats').select('*'),
      supabase.from('opponent_stats').select('*'),
      supabase.from('game_team_strength').select('*').in('game_id', gameIds),
      supabase.from('narrative_angles').select('*'),
      supabase
        .from('narratives')
        .select('narrative_type, body, angle_used, tone_used')
        .eq('session_id', session_id),
    ])

    const gamePlayers = (gamePlayersRes.data as unknown as RawGamePlayer[]) ?? []
    const playerStats = (playerStatsRes.data as unknown as PlayerStatsFull[]) ?? []
    const gameLog = (gameLogRes.data as unknown as GameLogRow[]) ?? []
    const teammateStats = (teammateRes.data as unknown as TeammateStatRow[]) ?? []
    const opponentStats = (opponentRes.data as unknown as OpponentStatRow[]) ?? []
    const gameStrength = (gameStrengthRes.data as unknown as GameStrengthRow[]) ?? []
    const angles = (anglesRes.data as unknown as NarrativeAngleRow[]) ?? []
    const previousNarratives = (previousNarrativesRes.data as unknown as PreviousNarrativeRow[]) ?? []

    // -----------------------------------------------------------------------
    // Build lookup maps
    // -----------------------------------------------------------------------
    const anglesMap = new Map(angles.map((a) => [a.narrative_type, a]))
    const prevMap = new Map(previousNarratives.map((n) => [n.narrative_type, n]))

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

    // -----------------------------------------------------------------------
    // Run all 12 pattern detectors (each wrapped in try/catch)
    // -----------------------------------------------------------------------
    const detectors: Array<() => NarrativeCandidate | null> = [
      () => detectHotDuo(sessionPlayerIds, teammateStats, playerMap),
      () => detectIndividualStreak(sessionPlayerIds, gameLog, playerMap),
      () => detectColdStreak(sessionPlayerIds, gameLog, playerMap),
      () => detectRivalry(sessionPlayerIds, opponentStats, playerMap),
      () => detectUpset(gameStrength, games),
      () => detectClimber(sessionPlayerIds, playerStats, gameLog, sessionGameIds, playerMap),
      () => detectVeteranMilestone(sessionPlayerIds, playerStats, playerMap),
      () => detectSessionRecap(games, gamePlayers),
      () => detectDefensiveBattle(games),
      () => detectShootout(games),
      () => detectPerfectSession(gameLog, sessionGameIds, playerMap),
      () => detectReturner(sessionPlayerIds, gameLog, sessionGameIds, playerStats, playerMap),
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

    // -----------------------------------------------------------------------
    // Sort by priority, deduplicate per player, select up to 8
    // -----------------------------------------------------------------------
    candidates.sort(
      (a, b) => b.priority - a.priority || a.narrative_type.localeCompare(b.narrative_type),
    )

    // Keep only the highest-priority candidate for each player. Candidates
    // with no player_ids (session_recap, upset, defensive_battle, shootout)
    // are never blocked and never contribute to the seen set.
    const seenPlayerIds = new Set<string>()
    const deduplicated: NarrativeCandidate[] = []
    for (const candidate of candidates) {
      if (candidate.player_ids.length === 0) {
        deduplicated.push(candidate)
        continue
      }
      const hasOverlap = candidate.player_ids.some((id) => seenPlayerIds.has(id))
      if (!hasOverlap) {
        deduplicated.push(candidate)
        candidate.player_ids.forEach((id) => seenPlayerIds.add(id))
      }
    }

    const selected = deduplicated.slice(0, 8)
    const hasRecap = selected.some((c) => c.narrative_type === 'session_recap')
    if (!hasRecap) {
      const recap = deduplicated.find((c) => c.narrative_type === 'session_recap')
      if (recap) {
        if (selected.length >= 8) {
          selected[7] = recap
        } else {
          selected.push(recap)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Determine angle and tone rotation for each selected candidate
    // -----------------------------------------------------------------------
    const enriched: EnrichedCandidate[] = selected.map((candidate) => {
      const angleRow = anglesMap.get(candidate.narrative_type)
      const prev = prevMap.get(candidate.narrative_type)
      return {
        ...candidate,
        previous_text: prev?.body,
        angle_used: nextAngle(candidate.angle_options, angleRow?.last_angle ?? null),
        tone_used: TONES[Math.floor(Math.random() * TONES.length)],
      }
    })

    // -----------------------------------------------------------------------
    // Generate prose in parallel via Claude API (partial failure OK)
    // -----------------------------------------------------------------------
    const results = await Promise.allSettled(
      enriched.map((candidate) => generateNarrative(candidate, session, playerMap)),
    )

    // -----------------------------------------------------------------------
    // Build narratives to insert
    // -----------------------------------------------------------------------
    interface NarrativeInsert {
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
    let isFirst = true

    for (let i = 0; i < enriched.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled' && result.value) {
        narrativesToInsert.push({
          session_id,
          narrative_type: enriched[i].narrative_type,
          angle_used: enriched[i].angle_used,
          tone_used: enriched[i].tone_used,
          headline: result.value.headline,
          body: result.value.body,
          is_lead: isFirst,
          priority: enriched[i].priority,
          player_ids: enriched[i].player_ids,
          raw_data: enriched[i].body_data,
        })
        isFirst = false
      }
    }

    // -----------------------------------------------------------------------
    // Write to Supabase
    // -----------------------------------------------------------------------
    await supabaseAdmin.from('narratives').delete().eq('session_id', session_id)

    if (narrativesToInsert.length > 0) {
      await supabaseAdmin.from('narratives').insert(narrativesToInsert)
    }

    // Update angle rotation tracking
    for (const narrative of enriched) {
      await supabaseAdmin
        .from('narrative_angles')
        .update({
          last_angle: narrative.angle_used,
          last_tone: narrative.tone_used,
          last_used_at: new Date().toISOString(),
        })
        .eq('narrative_type', narrative.narrative_type)
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
