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
  created_at: string
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
