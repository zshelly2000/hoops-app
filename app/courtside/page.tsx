'use client'

import { useCallback, useEffect, useState } from 'react'
import { PlayerGrid } from '@/components/courtside/PlayerGrid'
import { TeamBuilder } from '@/components/courtside/TeamBuilder'
import { ScoreEntry } from '@/components/courtside/ScoreEntry'
import { AddPlayerModal } from '@/components/courtside/AddPlayerModal'
import { Toast } from '@/components/shared/Toast'
import type { Player, Session, TeamSlot } from '@/lib/types'

// Sort: most recently played first (by last_played from stats), then alpha
function sortPlayers(players: Player[], lastPlayed: Record<string, string>): Player[] {
  return [...players].sort((a, b) => {
    const la = lastPlayed[a.id]
    const lb = lastPlayed[b.id]
    if (la && lb) return lb.localeCompare(la)
    if (la) return -1
    if (lb) return 1
    return (a.nickname ?? a.name).localeCompare(b.nickname ?? b.name)
  })
}

type Toast = { message: string; type: 'success' | 'error'; key: number }

export default function CourtsidePage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [lastPlayed, setLastPlayed] = useState<Record<string, string>>({})
  const [session, setSession] = useState<Session | null>(null)
  const [gameCount, setGameCount] = useState(0)
  const [selections, setSelections] = useState<Map<string, TeamSlot>>(new Map())
  const [team1Score, setTeam1Score] = useState('')
  const [team2Score, setTeam2Score] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [startingSession, setStartingSession] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, key: Date.now() })
  }, [])

  // Load players and today's session on mount
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [playersRes, statsRes] = await Promise.all([
          fetch('/api/players'),
          fetch('/api/stats'),
        ])

        const playersData = await playersRes.json() as Player[]
        const active = playersData.filter((p) => p.is_active)

        let lp: Record<string, string> = {}
        if (statsRes.ok) {
          const stats = await statsRes.json() as { player_id: string; last_played: string | null }[]
          stats.forEach((s) => { if (s.last_played) lp[s.player_id] = s.last_played })
        }

        setLastPlayed(lp)
        setPlayers(sortPlayers(active, lp))

        // Check for today's session
        const today = new Date().toISOString().split('T')[0]
        const sessRes = await fetch(`/api/sessions?date=${today}`)
        if (sessRes.ok) {
          const sessions = await sessRes.json() as Session[]
          const todaySession = sessions.find((s) => s.session_date === today)
          if (todaySession) {
            setSession(todaySession)
            const gamesRes = await fetch(`/api/sessions/${todaySession.id}/games`)
            if (gamesRes.ok) {
              const games = await gamesRes.json() as { length: number }
              setGameCount(games.length)
            }
          }
        }
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [])

  function handleToggle(playerId: string) {
    setSelections((prev) => {
      const next = new Map(prev)
      const current = next.get(playerId)
      if (!current) {
        next.set(playerId, 1)
      } else if (current === 1) {
        next.set(playerId, 2)
      } else {
        next.delete(playerId)
      }
      return next
    })
  }

  function handleRemove(playerId: string) {
    setSelections((prev) => {
      const next = new Map(prev)
      next.delete(playerId)
      return next
    })
  }

  async function startSession() {
    setStartingSession(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: today }),
      })
      if (!res.ok) throw new Error('Failed to start session')
      const sess = await res.json() as Session
      setSession(sess)
      setGameCount(0)
    } catch {
      showToast('Failed to start session', 'error')
    } finally {
      setStartingSession(false)
    }
  }

  async function submitGame() {
    if (!session) return
    setSubmitting(true)

    const team1Players = players
      .filter((p) => selections.get(p.id) === 1)
      .map((p) => p.id)
    const team2Players = players
      .filter((p) => selections.get(p.id) === 2)
      .map((p) => p.id)

    const newCount = gameCount + 1

    // Optimistic update
    setGameCount(newCount)
    setSelections(new Map())
    setTeam1Score('')
    setTeam2Score('')

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          team1_score: parseInt(team1Score),
          team2_score: parseInt(team2Score),
          team1_players: team1Players,
          team2_players: team2Players,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }

      showToast(`Game ${newCount} saved!`)
    } catch (err) {
      setGameCount(newCount - 1)
      showToast(err instanceof Error ? err.message : 'Failed to save game', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function handlePlayerAdded(player: Player) {
    setShowAddPlayer(false)
    setPlayers((prev) => sortPlayers([...prev, player], lastPlayed))
    showToast(`${player.nickname ?? player.name} added!`)
  }

  const team1Players = players.filter((p) => selections.get(p.id) === 1)
  const team2Players = players.filter((p) => selections.get(p.id) === 2)
  const canSubmit =
    team1Players.length >= 2 &&
    team2Players.length >= 2 &&
    team1Score !== '' &&
    team2Score !== '' &&
    !submitting

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">Loading…</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">Courtside</h1>
            {session && (
              <p className="text-sm text-zinc-500">
                {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                })}
                {' · '}
                <span className="text-orange-400 font-semibold">Game {gameCount + 1}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddPlayer(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            + New Player
          </button>
        </div>

        {/* Start session prompt */}
        {!session ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
            <div className="text-5xl">🏀</div>
            <h2 className="text-xl font-bold text-white">No run today yet</h2>
            <p className="text-sm text-zinc-500">Start a session to begin logging games.</p>
            <button
              onClick={startSession}
              disabled={startingSession}
              className="rounded-xl bg-orange-500 px-8 py-4 text-lg font-black text-white shadow-lg disabled:opacity-50 hover:bg-orange-400 active:scale-95 transition-all"
            >
              {startingSession ? 'Starting…' : "Start Today's Run"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Team display */}
            <TeamBuilder
              players={players}
              selections={selections}
              onRemove={handleRemove}
            />

            {/* Score */}
            <ScoreEntry
              team1Score={team1Score}
              team2Score={team2Score}
              onTeam1Change={setTeam1Score}
              onTeam2Change={setTeam2Score}
            />

            {/* Submit */}
            <button
              onClick={submitGame}
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-orange-500 py-5 text-xl font-black text-white shadow-lg transition-all hover:bg-orange-400 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Submit Game'}
            </button>

            {/* Player grid */}
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                Players — tap to assign
              </h2>
              <PlayerGrid
                players={players}
                selections={selections}
                onToggle={handleToggle}
              />
            </div>
          </div>
        )}
      </div>

      {showAddPlayer && (
        <AddPlayerModal
          onClose={() => setShowAddPlayer(false)}
          onAdded={handlePlayerAdded}
        />
      )}

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </main>
  )
}
