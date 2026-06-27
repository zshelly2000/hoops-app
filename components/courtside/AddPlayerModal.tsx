'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalize } from '@/lib/identity'
import type { Player } from '@/lib/types'

interface Props {
  onClose: () => void
  onAdded: (player: Player) => void
  /** Full player list (active + inactive) for same-name dedup guard */
  allPlayers: Player[]
}

/** The on-screen short name / display token: nickname, else first word of full name. */
function displayToken(name: string, nickname: string | null): string {
  const nick = nickname?.trim()
  if (nick) return nick
  return name.trim().split(/\s+/)[0] ?? ''
}

/** Levenshtein distance, capped — dependency-free near-spelling detector. */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

export function AddPlayerModal({ onClose, onAdded, allPlayers }: Props) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDifferent, setConfirmingDifferent] = useState(false)

  // Live-match against all players as user types (prefix on name or nickname)
  const matches = useMemo(() => {
    const q = normalize(name)
    if (!q) return []
    return allPlayers.filter((p) => {
      const fullMatch = normalize(p.name).startsWith(q)
      const nickMatch = p.nickname ? normalize(p.nickname).startsWith(q) : false
      return fullMatch || nickMatch
    })
  }, [name, allPlayers])

  // The on-screen identity pair the typed values would produce.
  const incomingNorm = useMemo(() => normalize(name), [name])
  const incomingToken = useMemo(
    () => normalize(displayToken(name, nickname || null)),
    [name, nickname],
  )

  // Hard block: an existing player produces the same (normalized name, normalized token) pair.
  const pairCollision = useMemo(() => {
    if (!incomingNorm) return null
    return (
      allPlayers.find(
        (p) =>
          normalize(p.name) === incomingNorm &&
          normalize(displayToken(p.name, p.nickname)) === incomingToken,
      ) ?? null
    )
  }, [allPlayers, incomingNorm, incomingToken])

  // Same full name exists but the pair differs — legitimate different-person case (gated by confirm).
  const nameCollision = useMemo(() => {
    if (!incomingNorm || pairCollision) return null
    return allPlayers.find((p) => normalize(p.name) === incomingNorm) ?? null
  }, [allPlayers, incomingNorm, pairCollision])

  // Fuzzy near-spelling suggestions (distance ≤ 2 on full name). Soft, never blocks.
  const fuzzyMatches = useMemo(() => {
    if (!incomingNorm || incomingNorm.length < 3) return []
    const seen = new Set(matches.map((p) => p.id))
    return allPlayers.filter((p) => {
      if (seen.has(p.id)) return false
      const pn = normalize(p.name)
      if (pn === incomingNorm) return false
      return levenshtein(pn, incomingNorm) <= 2
    })
  }, [allPlayers, matches, incomingNorm])

  // Suggestions surfaced above the form: exact-name records first, then fuzzy.
  const suggestions = useMemo(() => {
    const exactSeen = new Set(matches.map((p) => p.id))
    return [...matches, ...fuzzyMatches.filter((p) => !exactSeen.has(p.id))]
  }, [matches, fuzzyMatches])

  // Reset error + confirm step whenever the inputs change.
  useEffect(() => {
    setError('')
    setConfirmingDifferent(false)
  }, [name, nickname])

  const collisionCopy = pairCollision
    ? `There's already a ${pairCollision.name} who shows up as "${displayToken(pairCollision.name, pairCollision.nickname)}". Two players who look identical can't be told apart on the court — give this one something to set them apart (a last initial, Big/Little, a number).`
    : ''

  async function createPlayer() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    // Hard block — identical on-screen identity. Creation impossible.
    if (pairCollision) {
      setError(collisionCopy)
      return
    }
    // Legitimate same-name-different-person — require an explicit confirm step.
    if (nameCollision && !confirmingDifferent) {
      setConfirmingDifferent(true)
      return
    }
    await createPlayer()
  }

  async function handleMatchTap(player: Player) {
    // Tapping a match: if active → check in directly (no create); if inactive → reactivate + check in.
    // We signal this by calling onAdded with the existing player record; the page handles reactivation.
    if (!player.is_active) {
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
            className="w-full rounded-lg border border-white/[.06] bg-[#1a1a28] px-4 py-3 text-base text-[#f0f0f8] placeholder-[#555570] focus:border-[#fb923c] focus:outline-none"
          />

          {/* Live match + fuzzy suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded-xl border border-white/[.06] bg-[#1a1a28] overflow-hidden">
              <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#555570]">
                Existing players — tap to add without creating a duplicate
              </p>
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleMatchTap(p)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[.04] active:bg-white/[.08]"
                >
                  <div>
                    <span className="text-sm font-semibold text-[#f0f0f8]">{p.name}</span>
                    {p.nickname && (
                      <span className="ml-1.5 text-xs text-[#94a3b8]">&quot;{p.nickname}&quot;</span>
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
            placeholder={pairCollision || nameCollision ? 'Set-apart name (last initial, number…)' : 'Nickname (optional)'}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className={`w-full rounded-lg border bg-[#1a1a28] px-4 py-3 text-base text-[#f0f0f8] placeholder-[#555570] focus:outline-none ${
              pairCollision
                ? 'border-[#fb923c] focus:border-[#fb923c]'
                : 'border-white/[.06] focus:border-[#fb923c]'
            }`}
          />

          {/* Hard block — identical on-screen identity */}
          {pairCollision && (
            <p className="text-sm text-red-400">{collisionCopy}</p>
          )}

          {/* Confirm step — same name, distinct identity */}
          {confirmingDifferent && nameCollision && (
            <div className="rounded-xl border border-[#fb923c]/40 bg-[#fb923c]/[.06] p-3">
              <p className="text-sm text-[#f0f0f8]">
                This creates a <span className="font-bold">SECOND {nameCollision.name}</span>. Are
                they a different person? If this is the existing {nameCollision.name}, tap their card
                above instead.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDifferent(false)}
                  className="flex-1 rounded-lg border border-white/[.06] py-2 text-sm font-semibold text-[#94a3b8] hover:bg-[#1a1a28]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void createPlayer()}
                  className="flex-1 rounded-lg bg-[#fb923c] py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-orange-300"
                >
                  {saving ? 'Adding…' : 'Yes, different person — create'}
                </button>
              </div>
            </div>
          )}

          {error && !pairCollision && <p className="text-sm text-red-400">{error}</p>}

          {!confirmingDifferent && (
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
                disabled={saving || !name.trim() || !!pairCollision}
                className="flex-1 rounded-xl bg-[#fb923c] py-3 font-semibold text-white disabled:opacity-50 hover:bg-orange-300"
              >
                {saving ? 'Adding…' : 'Add Player'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
