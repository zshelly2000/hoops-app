'use client'

import { useMemo, useState } from 'react'
import type { Player, Session, TeamSlot } from '@/lib/types'
import { LocationPill } from '@/components/courtside/LocationPill'
import { GameLogStrip } from '@/components/courtside/GameLogStrip'
import type { SavedGameEntry } from '@/components/courtside/GameLogStrip'

function shortName(p: Player): string {
  return p.nickname ?? p.name.split(' ')[0]
}

interface Props {
  squadPlayers: Player[]
  assignments: Map<string, TeamSlot>
  activeBrush: TeamSlot
  onActiveBrushChange: (team: TeamSlot) => void
  onAssign: (playerId: string, team: TeamSlot | null) => void
  onEnterScore: () => void
  onSquadChip: () => void
  onEndSession: () => void
  onOpenNav: () => void
  savedGames: SavedGameEntry[]
  gameCount: number
  location: string
  session: Session
  onLocationChange: (loc: string) => void
  squadCount: number
}

export function PaintMode({
  squadPlayers,
  assignments,
  activeBrush,
  onActiveBrushChange,
  onAssign,
  onEnterScore,
  onSquadChip,
  onEndSession,
  onOpenNav,
  savedGames,
  gameCount,
  location,
  session,
  onLocationChange,
  squadCount,
}: Props) {
  const t1Count = useMemo(
    () => squadPlayers.filter((p) => assignments.get(p.id) === 1).length,
    [squadPlayers, assignments],
  )
  const t2Count = useMemo(
    () => squadPlayers.filter((p) => assignments.get(p.id) === 2).length,
    [squadPlayers, assignments],
  )

  const canEnterScore = t1Count >= 2 && t2Count >= 2
  const showUnevenWarning = t1Count >= 2 && t2Count >= 2 && t1Count !== t2Count

  // 4 columns for squads > 16
  const cols = squadPlayers.length > 16 ? 4 : 3

  const sharedShortNames = useMemo(() => {
    const counts = new Map<string, number>()
    squadPlayers.forEach((p) => {
      const sn = shortName(p)
      counts.set(sn, (counts.get(sn) ?? 0) + 1)
    })
    const shared = new Set<string>()
    Array.from(counts.entries()).forEach(([sn, count]) => {
      if (count > 1) shared.add(sn)
    })
    return shared
  }, [squadPlayers])

  function handleTileTap(player: Player) {
    const current = assignments.get(player.id) ?? null
    if (current === activeBrush) {
      onAssign(player.id, null)
    } else {
      onAssign(player.id, activeBrush)
    }
  }

  const gridClass = cols === 4
    ? 'grid grid-cols-4 gap-[5px]'
    : 'grid grid-cols-3 gap-[6px]'

  const tileBase = cols === 4
    ? 'min-h-[44px] text-[12px] rounded-[10px]'
    : 'min-h-[48px] text-[13px] rounded-[11px]'

  return (
    <div className="flex flex-col h-[100dvh] max-w-[430px] mx-auto overflow-hidden">
      {/* Pinned header */}
      <div className="flex-none px-3.5 pt-2.5 pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-none whitespace-nowrap flex items-baseline gap-1.5">
              <span className="font-condensed text-[20px] font-bold uppercase tracking-wide gradient-accent leading-none">Courtside</span>
              <span className="text-[11px] text-fg-dim whitespace-nowrap">· Game {gameCount + 1}</span>
            </div>
            <LocationPill
              sessionId={session.id}
              location={location}
              onLocationChange={onLocationChange}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            <button
              onClick={onSquadChip}
              className="whitespace-nowrap flex-none flex items-center gap-1.5 rounded-full border border-white/[.08] bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg-dim"
            >
              Squad <b className="bg-accent text-canvas rounded-full px-1.5 font-bold">{squadCount}</b>
            </button>
            <button
              onClick={onOpenNav}
              aria-label="App navigation"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/[.08] bg-surface text-[13px] leading-none text-fg-dim"
            >
              ⊞
            </button>
          </div>
        </div>
      </div>

      {/* Game log strip */}
      <div className="flex-none pt-1.5 pb-0.5">
        <GameLogStrip games={savedGames} />
      </div>

      {/* Scrollable player grid */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-2">
        <div className={gridClass}>
          {squadPlayers.map((player) => {
            const team = assignments.get(player.id) ?? null
            const sn = shortName(player)
            const showSub = sharedShortNames.has(sn)
            const tileColor =
              team === 1
                ? 'bg-[rgba(129,140,248,0.24)] border-accent-cool text-[#e0e7ff]'
                : team === 2
                ? 'bg-[rgba(251,146,60,0.24)] border-accent text-[#ffedd5]'
                : 'bg-surface-raised border-white/[.06] text-fg'

            return (
              <button
                key={player.id}
                onClick={() => handleTileTap(player)}
                className={`${tileBase} border flex flex-col items-center justify-center px-1 py-1.5 text-center font-bold select-none transition-all active:scale-[.94] ${tileColor}`}
              >
                <span className="truncate w-full text-center leading-snug">{sn}</span>
                {showSub && (
                  <span className="text-[8px] font-normal opacity-50 truncate w-full text-center">
                    {player.name}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pinned bottom bar */}
      <div className="flex-none px-3.5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-canvas from-75% to-transparent">
        {/* Brush selectors */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => onActiveBrushChange(1)}
            className={`rounded-[13px] border-2 py-2 flex items-center justify-center gap-2 font-black text-[11px] tracking-wide uppercase transition-all ${
              activeBrush === 1
                ? 'border-accent-cool text-[#c7d2fe] bg-[rgba(129,140,248,0.13)]'
                : 'border-white/[.06] text-fg-faint bg-surface'
            }`}
          >
            <span className="text-[20px] leading-none">{t1Count}</span>
            Team 1
          </button>
          <button
            onClick={() => onActiveBrushChange(2)}
            className={`rounded-[13px] border-2 py-2 flex items-center justify-center gap-2 font-black text-[11px] tracking-wide uppercase transition-all ${
              activeBrush === 2
                ? 'border-accent text-[#fed7aa] bg-[rgba(251,146,60,0.13)]'
                : 'border-white/[.06] text-fg-faint bg-surface'
            }`}
          >
            <span className="text-[20px] leading-none">{t2Count}</span>
            Team 2
          </button>
        </div>

        {/* Warning */}
        <div className="min-h-[18px] mb-1.5 text-center">
          {showUnevenWarning && (
            <p className="text-[11px] text-amber-400">Uneven teams — tap a player to adjust</p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onEnterScore}
          disabled={!canEnterScore}
          className="w-full rounded-[15px] bg-accent py-[15px] text-[17px] font-black text-canvas disabled:opacity-35 transition-all active:scale-[.97]"
        >
          Enter score →
        </button>

        {/* End session */}
        {savedGames.length > 0 && (
          <button
            onClick={onEndSession}
            className="mt-2 w-full rounded-xl border border-white/[.06] py-2.5 text-[13px] font-bold text-fg-dim transition-colors hover:text-fg"
          >
            End Session 📰
          </button>
        )}
      </div>
    </div>
  )
}
