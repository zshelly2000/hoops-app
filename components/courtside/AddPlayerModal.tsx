'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Player } from '@/lib/types'

interface Props {
  onClose: () => void
  onAdded: (player: Player) => void
  /** Full player list (active + inactive) for same-name dedup guard */
  allPlayers?: Player[]
}

function normalize(s: string) {
  return s.toLowerCase().trim()
}

export function AddPlayerModal({ onClose, onAdded, allPlayers = [] }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Live-match against all players as user types
  const matches = useMemo(() => {
    const q = normalize(name)
    if (!q) return []
    return allPlayers.filter((p) => {
      const fullMatch = normalize(p.name).startsWith(q) || normalize(p.name) === q
      const nickMatch = p.nickname ? normalize(p.nickname).startsWith(q) : false
      return fullMatch || nickMatch
    })
  }, [name, allPlayers])

  // Exact name collision (legitimate "same name, different person" case)
  const exactCollision = useMemo(() => {
    const q = normalize(name)
    if (!q) return false
    return allPlayers.some((p) => normalize(p.name) === q)
  }, [name, allPlayers])

  // Near-match (not exact) — soft warning only
  const nearMatch = matches.length > 0 && !exactCollision

  // Reset error when name changes
  useEffect(() => { setError('') }, [name])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (exactCollision && !nickname.trim()) {
      setError(`There's already a ${name.trim()}. Add a nickname so you can tell them apart.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), nickname: nickname.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }
      const player = await res.json() as Player
      onAdded(player)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player')
    } finally {
      setSaving(false)
    }
  }

  async function handleMatchTap(player: Player) {
    // Tapping a match: if active → check in directly (no create); if inactive → reactivate + check in
    // We signal this by calling onAdded with the existing player record.
    // The page handles reactivation if needed.
    if (!player.is_active) {
      // Optimistically treat as active so the page can add to squad
      onAdded({ ...player, is_active: true })
    } else {
      onAdded(player)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-[#111118] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-[#f0f0f8]">Add New Player</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Full name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            className="w-full rounded-lg border border-white/[.06] bg-[#1a1a28] px-4 py-3 text-[#f0f0f8] placeholder-[#555570] focus:border-[#fb923c] focus:outline-none"
          />

          {/* Live match suggestions */}
          {matches.length > 0 && (
            <div className="rounded-xl border border-white/[.06] bg-[#1a1a28] overflow-hidden">
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#555570]">
                Existing players — tap to add without creating a duplicate
              </p>
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleMatchTap(p)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[.04] active:bg-white/[.08]"
                >
                  <div>
                    <span className="text-sm font-semibold text-[#f0f0f8]">{p.name}</span>
                    {p.nickname && (
                      <span className="ml-1.5 text-xs text-[#94a3b8]">"{p.nickname}"</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${
                    p.is_active
                      ? 'bg-[#22c55e]/10 text-[#22c55e]'
                      : 'bg-white/[.06] text-[#555570]'
                  }`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder={exactCollision ? 'Nickname required *' : 'Nickname (optional)'}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required={exactCollision}
            className={`w-full rounded-lg border bg-[#1a1a28] px-4 py-3 text-[#f0f0f8] placeholder-[#555570] focus:outline-none ${
              exactCollision
                ? 'border-[#fb923c] focus:border-[#fb923c]'
                : 'border-white/[.06] focus:border-[#fb923c]'
            }`}
          />

          {nearMatch && !exactCollision && (
            <p className="text-xs text-amber-400">
              Similar name already exists — tap above to use the existing record, or continue to create a new one.
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/[.06] py-3 font-semibold text-[#94a3b8] hover:bg-[#1a1a28]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || (exactCollision && !nickname.trim())}
              className="flex-1 rounded-xl bg-[#fb923c] py-3 font-semibold text-white disabled:opacity-50 hover:bg-orange-300"
            >
              {saving ? 'Adding…' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
