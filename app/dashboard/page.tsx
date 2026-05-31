'use client'

import { useCallback, useEffect, useState } from 'react'
import { LeaderboardTable } from '@/components/dashboard/LeaderboardTable'
import { rankPlayers } from '@/lib/stats'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import type { PlayerStats } from '@/lib/types'

export default function DashboardPage() {
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [totalGames, setTotalGames] = useState(0)
  const [minGames, setMinGames] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // load() does NOT call setLoading(true) so pull-to-refresh can call it
  // without triggering the full-page loading state.
  const load = useCallback(async () => {
    setError('')
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        fetch('/api/stats', { cache: 'no-store' }),
        fetch('/api/sessions', { cache: 'no-store' }),
      ])

      if (!statsRes.ok) throw new Error('Failed to load stats')
      const allStats = await statsRes.json() as PlayerStats[]
      setStats(allStats)

      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json() as { id: string }[]
        setTotalSessions(sessions.length)

        // Count total games across all sessions
        let gamesTotal = 0
        allStats.forEach((s) => {
          // games_played counts unique game appearances; total unique games = max games_played (rough)
          // Better: use the max game_number from sessions via API
        })
        // Simple approach: sum wins+losses+ties for one player is their GP, but we need unique games
        // We'll fetch a count from a separate endpoint or just use sessions count
        setTotalGames(gamesTotal)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const { isRefreshing } = usePullToRefresh(load)

  const filtered = rankPlayers(stats, minGames)

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-4">
      <div className="mx-auto max-w-4xl px-4">
        {/* Pull-to-refresh indicator */}
        {isRefreshing && (
          <div className="flex justify-center pb-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Stats Dashboard</h1>
          <p className="text-sm text-slate-400">
            {totalSessions} sessions · all-time leaderboard
          </p>
        </div>

        {/* Min games filter */}
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm text-slate-400">Min games:</label>
          {[5, 10, 20, 50].map((n) => (
            <button
              key={n}
              onClick={() => setMinGames(n)}
              className={`rounded-lg px-3 py-1 text-sm font-semibold transition-colors ${
                minGames === n
                  ? 'bg-orange-400 text-white'
                  : 'bg-surface-raised text-slate-400 hover:bg-[#222236]'
              }`}
            >
              {n}+
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-slate-400">Loading stats…</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-white/[.06] bg-surface p-8 text-center text-slate-400">
                No players with {minGames}+ games yet. Lower the minimum or log more games!
              </div>
            ) : (
              <LeaderboardTable players={filtered} />
            )}

            <p className="mt-3 text-right text-xs text-[#555570]">
              {stats.length} total players · sorted by avg +/-
            </p>
          </>
        )}
      </div>
    </main>
  )
}
