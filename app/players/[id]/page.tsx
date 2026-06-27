'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatAvgPlusMinus, formatPlusMinus, formatWinPct } from '@/lib/stats'
import type { Player, PlayerStats } from '@/lib/types'

interface GameRow {
  id: string
  game_number: number
  session_date: string
  team: 1 | 2
  team1_score: number
  team2_score: number
  winning_team: 1 | 2 | null
  plus_minus: number
}

export default function PlayerProfilePage({ params }: { params: { id: string } }) {
  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [nicknameVal, setNicknameVal] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [playerRes, statsRes, gamesRes] = await Promise.all([
          fetch(`/api/players/${params.id}`, { cache: 'no-store' }),
          fetch('/api/stats', { cache: 'no-store' }),
          fetch(`/api/players/${params.id}/games`, { cache: 'no-store' }),
        ])

        if (!playerRes.ok) throw new Error('Player not found')
        const p = await playerRes.json() as Player
        setPlayer(p)
        setNameVal(p.name)
        setNicknameVal(p.nickname ?? '')

        if (statsRes.ok) {
          const allStats = await statsRes.json() as PlayerStats[]
          const s = allStats.find((x) => x.player_id === params.id)
          setStats(s ?? null)
        }

        if (gamesRes.ok) {
          const g = await gamesRes.json() as GameRow[]
          setGames(g)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading player')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.id])

  async function saveEdit() {
    const res = await fetch(`/api/players/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameVal.trim(), nickname: nicknameVal.trim() || null }),
    })
    if (res.ok) {
      const updated = await res.json() as Player
      setPlayer(updated)
      setEditName(false)
    }
  }

  async function toggleActive() {
    if (!player) return
    const res = await fetch(`/api/players/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !player.is_active }),
    })
    if (res.ok) {
      const updated = await res.json() as Player
      setPlayer(updated)
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-canvas text-slate-400">Loading…</div>
  if (error || !player) return <div className="flex min-h-screen items-center justify-center bg-canvas text-red-400">{error || 'Not found'}</div>

  const avgPm = stats?.avg_plus_minus ?? 0
  const pmColor = avgPm > 0 ? 'text-green-400' : avgPm < 0 ? 'text-red-400' : 'text-zinc-400'

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        <Link href="/players" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-300">
          ← Roster
        </Link>

        {/* Player header */}
        <div className="mb-6 rounded-2xl border border-white/[.06] bg-surface p-5">
          {editName ? (
            <div className="flex flex-col gap-2">
              <input
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder="Full name"
                className="rounded-lg border border-white/[.06] bg-surface-raised px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
              />
              <input
                value={nicknameVal}
                onChange={(e) => setNicknameVal(e.target.value)}
                placeholder="Nickname (optional)"
                className="rounded-lg border border-white/[.06] bg-surface-raised px-3 py-2 text-white focus:border-orange-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setEditName(false)} className="flex-1 rounded-lg border border-white/[.06] py-2 text-sm text-slate-400">Cancel</button>
                <button onClick={saveEdit} className="flex-1 rounded-lg bg-orange-400 py-2 text-sm font-semibold text-white">Save</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black text-white">
                  {player.nickname ?? player.name}
                </h1>
                {player.nickname && (
                  <p className="text-sm text-slate-400">{player.name}</p>
                )}
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${player.is_active ? 'bg-green-900/50 text-green-400' : 'bg-surface-raised text-slate-400'}`}>
                  {player.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <button onClick={() => setEditName(true)} className="rounded-lg border border-white/[.06] px-3 py-1.5 text-xs text-slate-400 hover:border-white/20">Edit</button>
                <button onClick={toggleActive} className="rounded-lg border border-white/[.06] px-3 py-1.5 text-xs text-slate-400 hover:border-white/20">
                  {player.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className="rounded-lg border border-white/[.06] px-2.5 py-1.5 text-xs leading-none text-slate-400 hover:border-white/20"
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setMenuOpen(false)}
                        className="fixed inset-0 z-10 cursor-default"
                      />
                      <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/[.08] bg-[#1a1a28] shadow-xl">
                        <Link
                          href={`/players/${params.id}/merge`}
                          className="block px-4 py-3 text-left text-sm text-[#f0f0f8] hover:bg-white/[.04]"
                        >
                          Merge into another player…
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Games" value={String(stats.games_played)} />
            <StatCard label="Win%" value={formatWinPct(stats.win_pct)} />
            <StatCard label="Avg +/-" value={formatAvgPlusMinus(stats.avg_plus_minus)} color={pmColor} />
            <StatCard label="Total +/-" value={formatPlusMinus(stats.total_plus_minus)} color={pmColor} />
          </div>
        )}

        {/* Game log */}
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Game Log</h2>

        {games.length === 0 ? (
          <p className="rounded-xl border border-white/[.06] p-6 text-center text-sm text-slate-400">No games logged yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[.06]">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-slate-400">Date</th>
                  <th className="px-3 py-2 text-left text-xs text-slate-400">Game</th>
                  <th className="px-3 py-2 text-center text-xs text-slate-400">Team</th>
                  <th className="px-3 py-2 text-center text-xs text-slate-400">Result</th>
                  <th className="px-3 py-2 text-center text-xs text-slate-400">Score</th>
                  <th className="px-3 py-2 text-right text-xs text-slate-400">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.06]">
                {games.map((g) => {
                  const won = g.winning_team === g.team
                  const lost = g.winning_team !== null && g.winning_team !== g.team
                  const resultLabel = won ? 'W' : lost ? 'L' : 'T'
                  const resultColor = won ? 'text-green-400' : lost ? 'text-red-400' : 'text-zinc-400'
                  const pmVal = g.plus_minus
                  const pmC = pmVal > 0 ? 'text-green-400' : pmVal < 0 ? 'text-red-400' : 'text-zinc-400'

                  return (
                    <tr key={g.id} className="hover:bg-surface/40">
                      <td className="px-3 py-2 text-slate-400">
                        {new Date(g.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 text-slate-400">#{g.game_number}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${g.team === 1 ? 'bg-blue-900/60 text-blue-300' : 'bg-orange-900/60 text-[#fb923c]'}`}>
                          T{g.team}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-center font-bold ${resultColor}`}>{resultLabel}</td>
                      <td className="px-3 py-2 text-center text-slate-300">
                        {g.team1_score}–{g.team2_score}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${pmC}`}>
                        {pmVal >= 0 ? `+${pmVal}` : pmVal}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[.06] bg-surface p-4 text-center">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  )
}
