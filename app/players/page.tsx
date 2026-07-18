'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AddPlayerModal } from '@/components/courtside/AddPlayerModal'
import { displayName } from '@/lib/stats'
import type { Player } from '@/lib/types'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/players', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json() as Player[]
      setPlayers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading players')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function toggleActive(player: Player) {
    const updated = { ...player, is_active: !player.is_active }
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? updated : p)))
    await fetch(`/api/players/${player.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !player.is_active }),
    })
  }

  const visible = players.filter((p) => showInactive || p.is_active)

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-black text-white">Roster</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/members"
              className="rounded-xl bg-surface-raised px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-[#222236]"
            >
              Members
            </Link>
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-xl bg-orange-400 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-300"
            >
              + Add Player
            </button>
          </div>
        </div>

        <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive players
        </label>

        {loading && <p className="py-10 text-center text-slate-400">Loading…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!loading && !error && (
          <ul className="flex flex-col gap-2">
            {visible.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between rounded-xl border border-white/[.06] bg-surface px-4 py-3"
              >
                <Link
                  href={`/players/${player.id}`}
                  className={`font-semibold hover:text-[#fb923c] ${
                    player.is_active ? 'text-[#f0f0f8]' : 'text-slate-400'
                  }`}
                >
                  {displayName(player)}
                  {player.nickname && (
                    <span className="ml-2 text-xs text-slate-400">({player.name})</span>
                  )}
                </Link>
                <button
                  onClick={() => toggleActive(player)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    player.is_active
                      ? 'bg-surface-raised text-slate-300 hover:bg-[#222236]'
                      : 'bg-green-900/50 text-green-400 hover:bg-green-900'
                  }`}
                >
                  {player.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <p className="py-10 text-center text-slate-400">No players yet.</p>
            )}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddPlayerModal
          allPlayers={players}
          onClose={() => setShowAdd(false)}
          onAdded={(p) => {
            setPlayers((prev) =>
              prev.some((existing) => existing.id === p.id)
                ? prev.map((existing) => (existing.id === p.id ? p : existing))
                : [...prev, p].sort((a, b) => a.name.localeCompare(b.name)),
            )
            setShowAdd(false)
          }}
        />
      )}
    </main>
  )
}
