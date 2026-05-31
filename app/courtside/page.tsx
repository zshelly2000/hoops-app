'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ThreeColumnAssigner } from '@/components/courtside/ThreeColumnAssigner'
import { ScoreEntry } from '@/components/courtside/ScoreEntry'
import { AddPlayerModal } from '@/components/courtside/AddPlayerModal'
import { Toast } from '@/components/shared/Toast'
import type { Player, Session, TeamSlot } from '@/lib/types'

// Initial load sort: most recently played first, then alpha
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

type ToastState = { message: string; type: 'success' | 'error'; key: number }
type KeepWinnersSheet = { winnerIds: string[]; gameNumber: number }

export default function CourtsidePage() {
  const router = useRouter()
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
  const [toast, setToast] = useState<ToastState | null>(null)
  const [startingSession, setStartingSession] = useState(false)
  const [keepWinnersSheet, setKeepWinnersSheet] = useState<KeepWinnersSheet | null>(null)
  const [showEndSession, setShowEndSession] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, key: Date.now() })
  }, [])

  // Load players and today's session on mount
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [playersRes, statsRes] = await Promise.all([
          fetch('/api/players', { cache: 'no-store' }),
          fetch('/api/stats', { cache: 'no-store' }),
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

        // Use local date (en-CA gives YYYY-MM-DD) to avoid UTC day boundary mismatch
        const today = new Date().toLocaleDateString('en-CA')
        const sessRes = await fetch(`/api/sessions?date=${today}`, { cache: 'no-store' })
        if (sessRes.ok) {
          const sessions = await sessRes.json() as Session[]
          // Only resume sessions that haven't been ended yet
          const todaySession = sessions.find((s) => s.session_date === today && !s.is_complete)
          if (todaySession) {
            setSession(todaySession)
            const gamesRes = await fetch(`/api/sessions/${todaySession.id}/games`, { cache: 'no-store' })
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

  function handleAssign(playerId: string, target: TeamSlot | null) {
    setSelections((prev) => {
      const next = new Map(prev)
      if (target === null) {
        next.delete(playerId)
      } else {
        next.set(playerId, target)
      }
      return next
    })
  }

  async function startSession() {
    setStartingSession(true)
    try {
      // Use local date (en-CA gives YYYY-MM-DD) to avoid UTC day boundary mismatch
      const today = new Date().toLocaleDateString('en-CA')
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: today }),
      })
      if (!res.ok) throw new Error('Failed to start session')
      const sess = await res.json() as Session
      setSession(sess)
      setGameCount(0)
      router.refresh()
    } catch {
      showToast('Failed to start session', 'error')
    } finally {
      setStartingSession(false)
    }
  }

  async function submitGame() {
    if (!session) return
    setSubmitting(true)

    // Capture before reset
    const team1PlayerIds = players
      .filter((p) => selections.get(p.id) === 1)
      .map((p) => p.id)
    const team2PlayerIds = players
      .filter((p) => selections.get(p.id) === 2)
      .map((p) => p.id)
    const t1Score = parseInt(team1Score)
    const t2Score = parseInt(team2Score)
    const isTie = t1Score === t2Score
    const winnerIds = t1Score > t2Score ? team1PlayerIds : team2PlayerIds

    const newCount = gameCount + 1

    // Optimistic reset — always clear the form immediately
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
          team1_score: t1Score,
          team2_score: t2Score,
          team1_players: team1PlayerIds,
          team2_players: team2PlayerIds,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }

      // Bust router cache so sessions/dashboard pages reflect this game immediately
      router.refresh()

      if (isTie) {
        showToast(`Game ${newCount} saved!`)
      } else {
        setKeepWinnersSheet({ winnerIds, gameNumber: newCount })
      }
    } catch (err) {
      setGameCount(newCount - 1)
      showToast(err instanceof Error ? err.message : 'Failed to save game', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeepWinners() {
    if (!keepWinnersSheet) return
    const next = new Map<string, TeamSlot>()
    for (const id of keepWinnersSheet.winnerIds) {
      next.set(id, 1)
    }
    setSelections(next)
    showToast(`Game ${keepWinnersSheet.gameNumber} saved! Winners on Team 1.`)
    setKeepWinnersSheet(null)
  }

  function handleNewGame() {
    if (!keepWinnersSheet) return
    showToast(`Game ${keepWinnersSheet.gameNumber} saved!`)
    setKeepWinnersSheet(null)
  }

  async function handleEndSession() {
    if (!session) return
    const sessionId = session.id

    // Step 1: confirm the session is marked complete before doing anything else.
    // /complete is fast (single Supabase update) so the user waits < 1 s.
    try {
      const res = await fetch(`/api/sessions/${sessionId}/complete`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Failed to end session')
    } catch {
      showToast('Failed to end session', 'error')
      return
    }

    // Step 2: reset UI state and show toast immediately.
    setShowEndSession(false)
    showToast('Rundown generating... 📰')
    setSession(null)
    setGameCount(0)
    setSelections(new Map())
    setTeam1Score('')
    setTeam2Score('')

    // Step 3: call generate directly from the browser — the same approach the
    // Regenerate button uses. The browser owns the connection and keeps it alive
    // for the full duration; no server-to-server hop, no GC risk. We don't
    // await it because the user has already seen the confirmation toast.
    fetch('/api/narratives/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})
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
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">Courtside</h1>
            {session && (
              <p className="text-sm text-slate-400">
                {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                })}
                {' · '}
                <span className="text-[#fb923c] font-semibold">Game {gameCount + 1}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddPlayer(true)}
            className="rounded-lg border border-white/[.06] px-3 py-1.5 text-xs font-semibold text-slate-400 hover:border-white/20 hover:text-[#f0f0f8]"
          >
            + New Player
          </button>
        </div>

        {/* Start session prompt */}
        {!session ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[.06] bg-surface px-6 py-12 text-center">
            <div className="text-5xl">🏀</div>
            <h2 className="text-xl font-bold text-white">No run today yet</h2>
            <p className="text-sm text-slate-400">Start a session to begin logging games.</p>
            <button
              onClick={startSession}
              disabled={startingSession}
              className="rounded-xl bg-orange-400 px-8 py-4 text-lg font-black text-white shadow-lg disabled:opacity-50 hover:bg-orange-300 active:scale-95 transition-all"
            >
              {startingSession ? 'Starting…' : "Start Today's Run"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Three-column player assigner */}
            <ThreeColumnAssigner
              players={players}
              selections={selections}
              lastPlayed={lastPlayed}
              onAssign={handleAssign}
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
              className="w-full rounded-2xl bg-orange-400 py-5 text-xl font-black text-white shadow-lg transition-all hover:bg-orange-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Submit Game'}
            </button>

            {/* End Session — only shown once at least one game has been logged */}
            {gameCount > 0 && (
              <div className="mt-2 flex justify-center">
                <button
                  onClick={() => setShowEndSession(true)}
                  className="rounded-xl border border-white/[.06] px-6 py-3 text-sm font-semibold text-slate-400 transition-all hover:border-white/20 hover:text-[#f0f0f8]"
                >
                  End Session 📰
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddPlayer && (
        <AddPlayerModal
          onClose={() => setShowAddPlayer(false)}
          onAdded={handlePlayerAdded}
        />
      )}

      {/* Keep Winners bottom sheet */}
      {keepWinnersSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-t-3xl bg-surface px-6 pb-12 pt-6 shadow-2xl">
            <div className="mb-1 text-center text-2xl font-black text-[#f0f0f8]">
              Game {keepWinnersSheet.gameNumber} saved! 🏆
            </div>
            <p className="mb-8 text-center text-sm text-slate-400">
              What happens next?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleNewGame}
                className="rounded-2xl border border-white/[.06] py-5 text-lg font-bold text-[#f0f0f8] transition-all hover:bg-surface-raised active:scale-95"
              >
                New Game
              </button>
              <button
                onClick={handleKeepWinners}
                className="rounded-2xl bg-orange-400 py-5 text-lg font-bold text-white transition-all hover:bg-orange-300 active:scale-95"
              >
                Keep Winners
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Session confirmation bottom sheet */}
      {showEndSession && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-t-3xl bg-surface px-6 pb-12 pt-6 shadow-2xl">
            <div className="mb-1 text-center text-xl font-black text-[#f0f0f8]">
              End today&apos;s run?
            </div>
            <p className="mb-8 text-center text-sm text-slate-400">
              This will generate your Rundown story.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setShowEndSession(false)}
                className="rounded-2xl border border-white/[.06] py-4 text-base font-bold text-[#f0f0f8] transition-all hover:bg-surface-raised active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleEndSession}
                className="rounded-2xl border border-white/[.06] py-4 text-base font-bold text-slate-300 transition-all hover:bg-surface-raised active:scale-95"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
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
