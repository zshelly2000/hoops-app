-- ============================================================
-- Hoops Tracker — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PLAYERS
-- Core roster table. One row per person ever.
-- ============================================================
CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  nickname      TEXT,                        -- optional short name for UI display
  is_active     BOOLEAN NOT NULL DEFAULT TRUE, -- false = no longer shows up in courtside picker
  notes         TEXT,                        -- e.g. "moved away", "college kid home summers"
  imported_from TEXT,                        -- track if row came from historical import
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SESSIONS
-- A "run" — one day, one location, many games.
-- ============================================================
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_date DATE NOT NULL,
  location    TEXT NOT NULL DEFAULT 'McKinley Park',  -- update to your spot
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate sessions on same date+location
CREATE UNIQUE INDEX sessions_date_location_idx ON sessions (session_date, location);

-- ============================================================
-- GAMES
-- One game within a session. Belongs to a session.
-- ============================================================
CREATE TABLE games (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  game_number     INT NOT NULL,   -- 1st game of the day, 2nd, etc.
  team1_score     INT NOT NULL,
  team2_score     INT NOT NULL,
  winning_team    INT GENERATED ALWAYS AS (
                    CASE WHEN team1_score > team2_score THEN 1
                         WHEN team2_score > team1_score THEN 2
                         ELSE NULL END
                  ) STORED,       -- null = tie (rare but possible)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_scores CHECK (team1_score >= 0 AND team2_score >= 0),
  CONSTRAINT unique_game_in_session UNIQUE (session_id, game_number)
);

-- ============================================================
-- GAME_PLAYERS
-- Junction table — who played on which team in which game.
-- This is the heart of the data model.
-- ============================================================
CREATE TABLE game_players (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id    UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  team       INT NOT NULL CHECK (team IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_player_per_game UNIQUE (game_id, player_id)
);

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================
CREATE INDEX game_players_player_id_idx ON game_players (player_id);
CREATE INDEX game_players_game_id_idx   ON game_players (game_id);
CREATE INDEX games_session_id_idx       ON games (session_id);
CREATE INDEX sessions_date_idx          ON sessions (session_date);

-- ============================================================
-- UPDATED_AT trigger for players
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- STATS VIEW
-- Pre-computed per-player stats across all games.
-- Query this for leaderboards and player pages.
-- ============================================================
CREATE OR REPLACE VIEW player_stats AS
WITH player_games AS (
  SELECT
    gp.player_id,
    g.id           AS game_id,
    g.session_id,
    s.session_date,
    gp.team,
    g.winning_team,
    g.team1_score,
    g.team2_score,
    -- Plus/minus: points your team scored minus points opponent scored
    CASE WHEN gp.team = 1
      THEN g.team1_score - g.team2_score
      ELSE g.team2_score - g.team1_score
    END AS plus_minus,
    -- Win flag
    CASE WHEN gp.team = g.winning_team THEN 1 ELSE 0 END AS is_win,
    CASE WHEN g.winning_team IS NULL   THEN 1 ELSE 0 END AS is_tie
  FROM game_players gp
  JOIN games g        ON g.id = gp.game_id
  JOIN sessions s     ON s.id = g.session_id
)
SELECT
  p.id                                        AS player_id,
  p.name,
  p.nickname,
  p.is_active,
  COUNT(*)                                    AS games_played,
  SUM(pg.is_win)                              AS wins,
  COUNT(*) - SUM(pg.is_win) - SUM(pg.is_tie) AS losses,
  SUM(pg.is_tie)                              AS ties,
  ROUND(SUM(pg.is_win)::NUMERIC / NULLIF(COUNT(*) - SUM(pg.is_tie), 0), 3)
                                              AS win_pct,
  SUM(pg.plus_minus)                          AS total_plus_minus,
  ROUND(AVG(pg.plus_minus), 2)               AS avg_plus_minus,
  COUNT(DISTINCT pg.session_id)              AS sessions_played,
  MAX(pg.session_date)                        AS last_played
FROM players p
JOIN player_games pg ON pg.player_id = p.id
GROUP BY p.id, p.name, p.nickname, p.is_active
ORDER BY avg_plus_minus DESC;

-- ============================================================
-- RAPM NOTE (implement in app layer, not SQL)
-- Raw +/- above is a solid start. True RAPM requires a
-- ridge regression that controls for teammates/opponents.
-- Recommended: compute this in Python (scikit-learn) using
-- a sparse matrix of lineup combinations. See docs/RAPM.md
-- for implementation notes once you have enough data (~500 games).
-- ============================================================
