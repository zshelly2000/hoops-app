'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { displayName } from '@/lib/stats'
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

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const [session, setSession] = useState<Session | null>(null)
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [sessRes, gamesRes] = await Promise.all([
          fetch(`/api/sessions/${params.id}`),
          fetch(`/api/sessions/${params.id}/games`),
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
    }
    void load()
  }, [params.id])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading…</div>
  if (error || !session) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-red-400">{error || 'Not found'}</div>

  const uniquePlayers = new Set(
    games.flatMap((g) => g.game_players.map((gp) => gp.player_id)),
  ).size

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
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
            {session.location} · {games.length} games · {uniquePlayers} players
          </p>
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
                  <span className={`text-2xl font-black ${winnerColor}`}>
                    {game.team1_score} – {game.team2_score}
                  </span>
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
    </main>
  )
}
