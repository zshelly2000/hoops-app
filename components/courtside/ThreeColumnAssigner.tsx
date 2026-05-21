'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, TeamSlot } from '@/lib/types'

// Use nickname if set, otherwise first word of full name
function shortName(player: Player): string {
  return player.nickname ?? player.name.split(' ')[0]
}

// ─── SwipeableTile ────────────────────────────────────────────────────────────

interface TileProps {
  player: Player
  assignment: TeamSlot | null
  isGhost: boolean          // assigned player shown as ghost in bench column
  colContext: 'bench' | 'team1' | 'team2'
  showSubtitle: boolean     // show full name when short name is ambiguous
  onAssign: (playerId: string, target: TeamSlot | null) => void
}

function SwipeableTile({
  player,
  assignment,
  isGhost,
  colContext,
  showSubtitle,
  onAssign,
}: TileProps) {
  const tileRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const wasDragging = useRef(false)
  const suppressNextClick = useRef(false)

  // Non-passive touchmove listener so we can call preventDefault and stop
  // the page scrolling while a horizontal swipe is in progress.
  useEffect(() => {
    const el = tileRef.current
    if (!el) return

    function onMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - touchStartX.current
      const dy = e.touches[0].clientY - touchStartY.current
      // Only hijack clearly horizontal movements
      if (Math.abs(dx) > Math.abs(dy) + 3 && Math.abs(dx) > 8) {
        e.preventDefault()
        wasDragging.current = true
      }
      if (wasDragging.current) {
        // el is guaranteed non-null here (guard at top of useEffect)
        el!.style.transform = `translateX(${dx}px)`
      }
    }

    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [])

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    wasDragging.current = false
    const el = tileRef.current
    if (el) el.style.transition = 'none'
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const tileWidth = tileRef.current?.offsetWidth ?? 115
    const threshold = tileWidth * 0.3   // 30% of tile width

    const el = tileRef.current
    if (el) {
      el.style.transition = 'transform 0.2s ease-out'
      el.style.transform = 'translateX(0)'
    }

    // Prevent the synthetic click that fires after touchend
    suppressNextClick.current = true

    if (!wasDragging.current) {
      // Pure tap → cycle: bench→T1, T1→T2, T2→bench
      if (!assignment) onAssign(player.id, 1)
      else if (assignment === 1) onAssign(player.id, 2)
      else onAssign(player.id, null)
      return
    }

    if (Math.abs(dx) < threshold) return  // not far enough → snap back

    if (dx < 0) {
      // swipe left
      if (colContext === 'bench') onAssign(player.id, 1)        // bench → T1
      else if (colContext === 'team1') onAssign(player.id, 2)   // T1 → T2
      else onAssign(player.id, null)                             // T2 → bench
    } else {
      // swipe right
      if (colContext === 'bench') onAssign(player.id, 2)        // bench → T2
      else if (colContext === 'team2') onAssign(player.id, 1)   // T2 → T1
      else onAssign(player.id, null)                             // T1 → bench
    }
  }

  // Handles mouse clicks on desktop (touch fires touchend, not click, so
  // suppressNextClick prevents double-firing on touch devices).
  function handleClick() {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    if (!assignment) onAssign(player.id, 1)
    else if (assignment === 1) onAssign(player.id, 2)
    else onAssign(player.id, null)
  }

  const isTeam1Style = colContext === 'team1' || (isGhost && assignment === 1)
  const isTeam2Style = colContext === 'team2' || (isGhost && assignment === 2)

  const colorClass = isTeam1Style
    ? 'bg-blue-900/60 border-blue-700 text-blue-100'
    : isTeam2Style
    ? 'bg-orange-900/60 border-orange-700 text-orange-100'
    : 'bg-zinc-800 border-zinc-700 text-zinc-200'

  return (
    <button
      ref={tileRef}
      className={`w-full min-h-[56px] rounded-lg border flex flex-col items-center justify-center px-1 py-2 text-center select-none will-change-transform active:opacity-70 ${colorClass} ${isGhost ? 'opacity-40' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      <span className="w-full truncate text-center text-xs font-semibold leading-snug">
        {shortName(player)}
      </span>
      {showSubtitle && (
        <span className="w-full truncate text-center text-[9px] font-normal leading-snug opacity-50">
          {player.name}
        </span>
      )}
    </button>
  )
}

// ─── ThreeColumnAssigner ─────────────────────────────────────────────────────

interface Props {
  players: Player[]
  selections: Map<string, TeamSlot>
  lastPlayed: Record<string, string>
  onAssign: (playerId: string, target: TeamSlot | null) => void
}

export function ThreeColumnAssigner({
  players,
  selections,
  lastPlayed,
  onAssign,
}: Props) {
  const [search, setSearch] = useState('')

  // Detect short names shared by 2+ players so we can show a subtitle
  const sharedShortNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of players) {
      const sn = shortName(p)
      counts.set(sn, (counts.get(sn) ?? 0) + 1)
    }
    const shared = new Set<string>()
    for (const [sn, count] of Array.from(counts.entries())) {
      if (count > 1) shared.add(sn)
    }
    return shared
  }, [players])

  // Apply search across all three columns simultaneously
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter(
      (p) =>
        shortName(p).toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q),
    )
  }, [players, search])

  // T1 and T2: only their assigned players
  const team1Players = useMemo(
    () => filtered.filter((p) => selections.get(p.id) === 1),
    [filtered, selections],
  )
  const team2Players = useMemo(
    () => filtered.filter((p) => selections.get(p.id) === 2),
    [filtered, selections],
  )

  // Bench: all players in three tiers
  //   1. unassigned + has play history → last_played desc
  //   2. unassigned + never played     → alphabetical
  //   3. assigned (ghost)              → bottom, opacity-40
  const benchPlayers = useMemo(() => {
    const unassignedPlayed = filtered
      .filter((p) => !selections.get(p.id) && lastPlayed[p.id])
      .sort((a, b) => lastPlayed[b.id].localeCompare(lastPlayed[a.id]))
    const unassignedNeverPlayed = filtered
      .filter((p) => !selections.get(p.id) && !lastPlayed[p.id])
      .sort((a, b) => shortName(a).localeCompare(shortName(b)))
    const assigned = filtered.filter((p) => !!selections.get(p.id))
    return [...unassignedPlayed, ...unassignedNeverPlayed, ...assigned]
  }, [filtered, selections, lastPlayed])

  function renderTile(player: Player, colContext: 'bench' | 'team1' | 'team2') {
    const assignment = selections.get(player.id) ?? null
    const isGhost = colContext === 'bench' && !!assignment
    return (
      <SwipeableTile
        key={`${colContext}-${player.id}`}
        player={player}
        assignment={assignment}
        isGhost={isGhost}
        colContext={colContext}
        showSubtitle={sharedShortNames.has(shortName(player))}
        onAssign={onAssign}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search bar with clear button */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-4 pr-9 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Column headers with live counts */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="text-center text-xs font-black uppercase tracking-wider text-blue-400">
          T1 · {team1Players.length}
        </div>
        <div className="text-center text-xs font-bold uppercase tracking-wider text-zinc-500">
          Bench
        </div>
        <div className="text-center text-xs font-black uppercase tracking-wider text-orange-400">
          T2 · {team2Players.length}
        </div>
      </div>

      {/* Three independently-scrollable columns */}
      <div className="grid grid-cols-3 gap-1.5">

        {/* Team 1 — blue */}
        <div className="flex h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-blue-900 bg-zinc-900 p-1">
          {team1Players.map((p) => renderTile(p, 'team1'))}
          {team1Players.length === 0 && (
            <div className="flex h-full items-center justify-center px-1">
              <span className="text-center text-[10px] leading-relaxed text-blue-900">
                ← swipe<br />to add
              </span>
            </div>
          )}
        </div>

        {/* Bench — all players, assigned ones as ghosts at bottom */}
        <div className="flex h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          {benchPlayers.map((p) => renderTile(p, 'bench'))}
          {benchPlayers.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-zinc-700">no players</span>
            </div>
          )}
        </div>

        {/* Team 2 — orange */}
        <div className="flex h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-orange-900 bg-zinc-900 p-1">
          {team2Players.map((p) => renderTile(p, 'team2'))}
          {team2Players.length === 0 && (
            <div className="flex h-full items-center justify-center px-1">
              <span className="text-center text-[10px] leading-relaxed text-orange-900">
                swipe →<br />to add
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
