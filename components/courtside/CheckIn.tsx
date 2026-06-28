'use client'

import { useMemo, useState } from 'react'
import type { Player, Session, TeamSlot } from '@/lib/types'
import { LocationPill } from '@/components/courtside/LocationPill'

function shortName(p: Player): string {
  return p.nickname ?? p.name.split(' ')[0]
}

function relativeDate(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Props {
  allPlayers: Player[]
  lastPlayed: Record<string, string>
  squad: Set<string>
  /** Current game's assignments — prevents removing an assigned player */
  assignments: Map<string, TeamSlot>
  onToggle: (playerId: string) => void
  onNewPlayer: () => void
  onDone: () => void
  onClearAll: () => void
  onOpenNav: () => void
  isOverlay: boolean
  gameCount: number
  location: string
  session: Session
  onLocationChange: (loc: string) => void
}

export function CheckIn({
  allPlayers,
  lastPlayed,
  squad,
  assignments,
  onToggle,
  onNewPlayer,
  onDone,
  onClearAll,
  onOpenNav,
  isOverlay,
  gameCount,
  location,
  session,
  onLocationChange,
}: Props) {
  const [search, setSearch] = useState('')
  const [inactiveMode, setInactiveMode] = useState(false)

  const activePlayers = useMemo(
    () => allPlayers.filter((p) => p.is_active),
    [allPlayers],
  )
  const inactivePlayers = useMemo(
    () => allPlayers.filter((p) => !p.is_active),
    [allPlayers],
  )

  // Shared short names for subtitle display
  const sharedShortNames = useMemo(() => {
    const counts = new Map<string, number>()
    activePlayers.forEach((p) => {
      const sn = shortName(p)
      counts.set(sn, (counts.get(sn) ?? 0) + 1)
    })
    const shared = new Set<string>()
    Array.from(counts.entries()).forEach(([sn, count]) => {
      if (count > 1) shared.add(sn)
    })
    return shared
  }, [activePlayers])

  // Sort active: last-played desc, then never-played alpha
  const sortedActive = useMemo(() => {
    const q = search.trim().toLowerCase()
    let pool = activePlayers
    if (q) {
      pool = pool.filter(
        (p) =>
          shortName(p).toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
    }
    const played = pool.filter((p) => lastPlayed[p.id]).sort((a, b) =>
      lastPlayed[b.id].localeCompare(lastPlayed[a.id]),
    )
    const never = pool
      .filter((p) => !lastPlayed[p.id])
      .sort((a, b) => shortName(a).localeCompare(shortName(b)))
    return [...played, ...never]
  }, [activePlayers, lastPlayed, search])

  const sortedInactive = useMemo(() => {
    const q = search.trim().toLowerCase()
    let pool = inactivePlayers
    if (q) {
      pool = pool.filter(
        (p) =>
          shortName(p).toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
    }
    return [...pool].sort((a, b) => shortName(a).localeCompare(shortName(b)))
  }, [inactivePlayers, search])

  const displayPlayers = inactiveMode ? sortedInactive : sortedActive
  const squadCount = squad.size

  function handleTileTap(player: Player) {
    if (inactiveMode) {
      // Reactivating: page handles PATCH + squad add
      onToggle(player.id)
      setInactiveMode(false)
      setSearch('')
    } else {
      // Check if removal is blocked (player is in current game's assignments)
      if (squad.has(player.id) && assignments.has(player.id)) return
      onToggle(player.id)
    }
  }

  const containerClass = isOverlay
    ? 'h-full flex flex-col bg-canvas max-w-[430px] mx-auto'
    : 'flex flex-col h-[100dvh] max-w-[430px] mx-auto'

  return (
    <div className={containerClass}>
      {/* Pinned header */}
      <div className="flex-none px-3.5 pt-2.5 pb-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-none whitespace-nowrap flex items-baseline gap-1.5">
              <span className="font-condensed text-[20px] font-bold uppercase tracking-wide gradient-accent leading-none">Courtside</span>
              <span className="text-[11px] text-fg-dim whitespace-nowrap">
                {gameCount > 0 ? `· Game ${gameCount + 1}` : '· Check-In'}
              </span>
            </div>
            <LocationPill
              sessionId={session.id}
              location={location}
              onLocationChange={onLocationChange}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            {isOverlay ? (
              <button
                onClick={onDone}
                className="whitespace-nowrap rounded-full border border-white/[.08] bg-white/[.04] px-3 py-1 text-xs font-bold text-accent"
              >
                Done
              </button>
            ) : (
              <button
                onClick={onOpenNav}
                aria-label="App navigation"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/[.08] bg-surface text-[13px] leading-none text-fg-dim"
              >
                ⊞
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inactive mode banner */}
      {inactiveMode && (
        <div className="flex-none flex items-center gap-2 px-3.5 py-2 bg-surface-raised border-b border-white/[.06]">
          <span className="text-xs font-black uppercase tracking-wider text-fg-faint">Inactive Players</span>
          <span className="flex-1" />
          <button
            onClick={() => { setInactiveMode(false); setSearch('') }}
            className="text-xs font-bold text-accent"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Search + new player */}
      <div className="flex-none flex gap-2 px-3.5 pt-2 pb-1">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={inactiveMode ? 'Search inactive…' : 'Search players…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/[.06] bg-surface-raised py-2 pl-3 pr-8 text-base text-fg placeholder-fg-faint focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg-dim text-xs leading-none"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {!inactiveMode && (
          <button
            onClick={onNewPlayer}
            className="flex-none rounded-xl border border-white/[.06] bg-surface-raised px-3 py-2 text-xs font-bold text-fg-dim whitespace-nowrap hover:border-white/20"
          >
            + New
          </button>
        )}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-1">
        <div className="grid grid-cols-3 gap-2">
          {displayPlayers.map((player) => {
            const checked = squad.has(player.id)
            const blocked = checked && assignments.has(player.id) && !inactiveMode
            const sn = shortName(player)
            const showSub = sharedShortNames.has(sn)
            return (
              <button
                key={player.id}
                onClick={() => handleTileTap(player)}
                disabled={blocked}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-[11px] border py-2.5 px-1 text-center transition-all active:scale-95 min-h-[60px] ${
                  inactiveMode
                    ? 'border-white/[.04] bg-surface opacity-60'
                    : checked
                    ? 'border-accent bg-[rgba(251,146,60,0.12)]'
                    : 'border-white/[.06] bg-surface-raised'
                } ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {checked && !inactiveMode && (
                  <span className="absolute top-1.5 right-2 text-[9px] text-accent">✓</span>
                )}
                <span className="text-[13px] font-bold leading-snug text-fg truncate w-full text-center px-1">
                  {sn}
                </span>
                {showSub && (
                  <span className="text-[9px] text-fg-faint truncate w-full text-center px-1 leading-snug">
                    {player.name}
                  </span>
                )}
                {inactiveMode && lastPlayed[player.id] ? (
                  <span className="text-[8px] text-fg-faint">{relativeDate(lastPlayed[player.id])}</span>
                ) : !inactiveMode && lastPlayed[player.id] ? (
                  <span className="text-[8px] text-fg-faint">{relativeDate(lastPlayed[player.id])}</span>
                ) : null}
              </button>
            )
          })}
        </div>

        {/* Inactive mode affordance — only show in active mode */}
        {!inactiveMode && (
          <button
            onClick={() => { setInactiveMode(true); setSearch('') }}
            className="mt-4 w-full rounded-xl border border-white/[.04] py-3 text-xs text-fg-faint hover:text-fg-dim transition-colors"
          >
            Can&apos;t find someone? Inactive players →
          </button>
        )}

        {displayPlayers.length === 0 && (
          <p className="py-8 text-center text-sm text-fg-faint">
            {search ? 'No matches' : inactiveMode ? 'No inactive players' : 'No players'}
          </p>
        )}
      </div>

      {/* Pinned bottom CTA */}
      <div className="flex-none px-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-canvas via-canvas/90 to-transparent">
        {squadCount > 0 && !inactiveMode && (
          <div className="mb-1.5 text-center">
            <button
              onClick={onClearAll}
              className="text-[11px] font-semibold text-fg-faint underline underline-offset-2 hover:text-fg-dim"
            >
              Clear all ({squadCount})
            </button>
          </div>
        )}
        <button
          onClick={onDone}
          disabled={squadCount < 2}
          className="w-full rounded-2xl bg-accent py-4 text-lg font-black text-canvas shadow-lg disabled:opacity-35 transition-all active:scale-[.98]"
        >
          {squadCount < 2
            ? 'Check in players to start'
            : `Squad · ${squadCount} · Done →`}
        </button>
      </div>
    </div>
  )
}
