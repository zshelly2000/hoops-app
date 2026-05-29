'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { displayName } from '@/lib/stats'
import { Toast } from '@/components/shared/Toast'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import type { Player, Session } from '@/lib/types'

interface GamePlayerRow {
  id: string
  player_id: string
  team: 1 | 2
  players: Player
}

interface GameRow {
  id: string
  game_number: number
  team1_score: number
  team2_score: number
  winning_team: 1 | 2 | null
  game_players: GamePlayerRow[]
}

type ToastState = { message: string; type: 'success' | 'error'; key: number }

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<GameRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [reopening, setReopening] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, key: Date.now() })
  }, [])

  const load = useCallback(async () => {
    try {
      const [sessRes, gamesRes] = await Promise.all([
        fetch(`/api/sessions/${params.id}`, { cache: 'no-store' }),
        fetch(`/api/sessions/${params.id}/games`, { cache: 'no-store' }),
      ])

      if (!sessRes.ok) throw new Error('Session not found')
      const sess = await sessRes.json() as Session
      setSession(sess)

      if (gamesRes.ok) {
        const g = await gamesRes.json() as GameRow[]
        setGames(g)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const { isRefreshing } = usePullToRefresh(load)

  async function handleReopen() {
    if (!session) return
    setReopening(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: false, completed_at: null }),
      })
      if (!res.ok) throw new Error('Failed to reopen session')
      router.push('/courtside')
    } catch {
      showToast('Failed to reopen session', 'error')
    } finally {
      setReopening(false)
    }
  }

  async function handleRegenerateRundown() {
    if (!session) return
    setRegenerating(true)
    showToast('Regenerating…')
    try {
      await fetch('/api/narratives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      })
    } catch {
      // Non-blocking
    } finally {
      setRegenerating(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/games/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }

      const data = await res.json() as { prev_session_id?: string }

      // Remove deleted game from local state immediately (confirmed 2xx)
      setGames((prev) => prev.filter((g) => g.id !== confirmDelete.id))
      showToast(`Game ${confirmDelete.game_number} deleted`)
      // Bust router cache so sessions list reflects the auto-deleted session if applicable
      router.refresh()

      // If the server found a previous complete session that needs regeneration,
      // call generate directly from the browser — same reliable pattern as the
      // Regenerate button. Server-side fire-and-forget is killed on Vercel the
      // moment the response is sent, so the browser must own this call.
      if (data.prev_session_id) {
        fetch('/api/narratives/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: data.prev_session_id }),
        }).catch(() => {})
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete game', 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading…</div>
  if (error || !session) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-red-400">{error || 'Not found'}</div>

  const uniquePlayers = new Set(
    games.flatMap((g) => g.game_players.map((gp) => gp.player_id)),
  ).size

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        {/* Pull-to-refresh indicator */}
        {isRefreshing && (
          <div className="flex justify-center pb-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          </div>
        )}

        <Link href="/sessions" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
          ← Sessions
        </Link>

        <div className="mb-6">
          <h1 className="text-xl font-black text-white">
            {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </h1>
          <p className="text-sm text-zinc-500">
            {games.length} games · {uniquePlayers} players
            {session.is_complete && (
              <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                Complete
              </span>
            )}
          </p>
          {session.is_complete && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleReopen}
                disabled={reopening}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                {reopening ? 'Reopening…' : 'Add More Games'}
              </button>
              <button
                onClick={handleRegenerateRundown}
                disabled={regenerating}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                {regenerating ? 'Regenerating…' : 'Regenerate Rundown 🔄'}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {games.map((game) => {
            const team1 = game.game_players.filter((gp) => gp.team === 1)
            const team2 = game.game_players.filter((gp) => gp.team === 2)
            const winnerColor = game.winning_team === 1
              ? 'text-blue-400'
              : game.winning_team === 2
              ? 'text-orange-400'
              : 'text-zinc-400'

            return (
              <div key={game.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-500">Game {game.game_number}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl font-black ${winnerColor}`}>
                      {game.team1_score} – {game.team2_score}
                    </span>
                    <button
                      onClick={() => setConfirmDelete(game)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-red-950/50 hover:text-red-400"
                      aria-label={`Delete game ${game.game_number}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-blue-400">
                      Team 1 {game.winning_team === 1 && '🏆'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {team1.map((gp) => (
                        <Link
                          key={gp.id}
                          href={`/players/${gp.player_id}`}
                          className="rounded-full bg-blue-900/50 px-2.5 py-0.5 text-xs text-blue-200 hover:bg-blue-800/60"
                        >
                          {displayName(gp.players)}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-orange-400">
                      Team 2 {game.winning_team === 2 && '🏆'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {team2.map((gp) => (
                        <Link
                          key={gp.id}
                          href={`/players/${gp.player_id}`}
                          className="rounded-full bg-orange-900/50 px-2.5 py-0.5 text-xs text-orange-200 hover:bg-orange-800/60"
                        >
                          {displayName(gp.players)}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {games.length === 0 && (
            <p className="py-10 text-center text-zinc-500">No games logged for this session.</p>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-white">
              Delete Game {confirmDelete.game_number}?
            </h2>
            <p className="mb-6 text-sm text-zinc-400">
              This will remove all player records for this game and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-zinc-700 py-3 font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
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

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
