'use client'

import type { Session } from '@/lib/types'
import { LocationPill } from '@/components/courtside/LocationPill'
import { GameLogStrip } from '@/components/courtside/GameLogStrip'
import type { SavedGameEntry } from '@/components/courtside/GameLogStrip'
import { PastSessionBanner } from '@/components/courtside/PastSessionBanner'

interface Props {
  gameNumber: number
  winnerTeam: 1 | 2 | null
  onRunback: () => void
  onWinnersStay: () => void
  onFresh: () => void
  onEndSession: () => void
  onSquadChip: () => void
  onOpenNav: () => void
  savedGames: SavedGameEntry[]
  location: string
  session: Session
  onLocationChange: (loc: string) => void
  squadCount: number
  pastSessionDate?: string | null
  persistDefaultLocation?: boolean
}

export function PostGameChips({
  gameNumber,
  winnerTeam,
  onRunback,
  onWinnersStay,
  onFresh,
  onEndSession,
  onSquadChip,
  onOpenNav,
  savedGames,
  location,
  session,
  onLocationChange,
  squadCount,
  pastSessionDate,
  persistDefaultLocation = true,
}: Props) {
  return (
    <div className="flex flex-col h-[100dvh] max-w-[430px] mx-auto overflow-hidden">
      <PastSessionBanner date={pastSessionDate ?? null} />
      {/* Pinned header */}
      <div className="flex-none px-3.5 pt-2.5 pb-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-none whitespace-nowrap flex items-baseline gap-1.5">
              <span className="font-condensed text-[20px] font-bold uppercase tracking-wide gradient-accent leading-none">Courtside</span>
              <span className="text-[11px] text-fg-dim whitespace-nowrap">· Game {gameNumber} saved</span>
            </div>
            <LocationPill
              sessionId={session.id}
              location={location}
              onLocationChange={onLocationChange}
              persistDefault={persistDefaultLocation}
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

      {/* Centered content */}
      <div className="flex-1 flex flex-col justify-center px-3.5 min-h-0">
        <div className="text-center mb-1">
          <span className="text-2xl font-black text-fg">
            {winnerTeam ? '🏆' : '🤝'} Game {gameNumber}
            {winnerTeam ? ` — Team ${winnerTeam} wins` : ' — Tie'}
          </span>
        </div>
        <p className="text-center text-[13px] text-fg-dim mb-6">What&apos;s next?</p>

        <div className="grid grid-cols-3 gap-2">
          {/* Runback */}
          <button
            onClick={onRunback}
            className="rounded-[13px] border border-white/[.06] bg-surface px-2 py-3 text-center transition-all active:scale-[.95]"
          >
            <div className="text-[19px]">🔁</div>
            <div className="text-[11px] font-black mt-0.5 text-fg">Runback</div>
            <div className="text-[8px] text-fg-faint mt-0.5">same teams</div>
          </button>

          {/* Winners Stay — visually emphasized, hidden on tie */}
          {winnerTeam ? (
            <button
              onClick={onWinnersStay}
              className="rounded-[13px] border border-accent bg-[rgba(251,146,60,0.10)] px-2 py-3 text-center transition-all active:scale-[.95]"
            >
              <div className="text-[19px]">👑</div>
              <div className="text-[11px] font-black mt-0.5 text-[#fed7aa]">Winners Stay</div>
              <div className="text-[8px] text-accent/70 mt-0.5">T1 on court</div>
            </button>
          ) : (
            /* Tie: show an empty slot or repeat fresh */
            <div className="rounded-[13px] border border-white/[.04] bg-transparent" />
          )}

          {/* Fresh */}
          <button
            onClick={onFresh}
            className="rounded-[13px] border border-white/[.06] bg-surface px-2 py-3 text-center transition-all active:scale-[.95]"
          >
            <div className="text-[19px]">✨</div>
            <div className="text-[11px] font-black mt-0.5 text-fg">Fresh</div>
            <div className="text-[8px] text-fg-faint mt-0.5">clear all</div>
          </button>
        </div>

        <button
          onClick={onEndSession}
          className="mt-4 w-full rounded-xl border border-white/[.06] py-3 text-[13px] font-bold text-fg-dim transition-colors hover:text-fg"
        >
          End Session 📰
        </button>
      </div>
    </div>
  )
}
