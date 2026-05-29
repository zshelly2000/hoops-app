// ============================================================
// Database types matching the Supabase schema
// ============================================================

export interface Player {
  id: string
  name: string
  nickname: string | null
  is_active: boolean
  notes: string | null
  imported_from: string | null
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  session_date: string
  location: string
  notes: string | null
  is_complete: boolean
  completed_at: string | null
  created_at: string
}

export interface Narrative {
  id: string
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
  created_at: string
}

export interface NarrativeAngle {
  id: string
  narrative_type: string
  last_angle: string | null
  last_tone: string | null
  last_used_at: string | null
}

// Internal type for generation engine
export interface NarrativeCandidate {
  narrative_type: string
  headline_hint: string
  body_data: Record<string, unknown>
  player_ids: string[]
  priority: number
  angle_options: string[]
  previous_text?: string
}

export interface Game {
  id: string
  session_id: string
  game_number: number
  team1_score: number
  team2_score: number
  winning_team: 1 | 2 | null
  created_at: string
}

export interface GamePlayer {
  id: string
  game_id: string
  player_id: string
  team: 1 | 2
  created_at: string
}

export interface PlayerStats {
  player_id: string
  name: string
  nickname: string | null
  is_active: boolean
  games_played: number
  wins: number
  losses: number
  ties: number
  win_pct: number | null
  total_plus_minus: number
  avg_plus_minus: number | null
  sessions_played: number
  last_played: string | null
}

// ============================================================
// App-level derived types
// ============================================================

export type TeamSlot = 1 | 2

export interface PlayerWithTeam extends Player {
  team: TeamSlot | null
}

export interface GameWithPlayers extends Game {
  game_players: (GamePlayer & { player: Player })[]
}

export interface SessionWithGames extends Session {
  games: Game[]
}

export interface SessionSummary {
  session: Session
  game_count: number
  player_count: number
}
