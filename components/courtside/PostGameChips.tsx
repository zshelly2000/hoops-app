'use client'

import type { Session } from '@/lib/types'
import { LocationPill } from '@/components/courtside/LocationPill'
import { GameLogStrip } from '@/components/courtside/GameLogStrip'
import type { SavedGameEntry } from '@/components/courtside/GameLogStrip'

interface Props {
  gameNumber: number
  winnerTeam: 1 | 2 | null
  onRunback: () => void
  onWinnersStay: () => void
  onFresh: () => void
  onEndSession: () => void
  onSquadChip: () => void
  savedGames: SavedGameEntry[]
  location: string
  session: Session
  onLocationChange: (loc: string) => void
  squadCount: number
}

export function PostGameChips({
  gameNumber,
  winnerTeam,
  onRunback,
  onWinnersStay,
  onFresh,
  onEndSession,
  onSquadChip,
  savedGames,
  location,
  session,
  onLocationChange,
  squadCount,
}: Props) {
  return (
    <div className="flex flex-col h-[100dvh] max-w-[430px] mx-auto overflow-hidden">
      {/* Pinned header */}
      <div className="flex-none px-3.5 pt-2.5 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[17px] font-black text-[#f0f0f8]">Courtside</span>
            <span className="text-[11px] text-[#94a3b8]">· Game {gameNumber} saved</span>
            <LocationPill
              sessionId={session.id}
              location={location}
              onLocationChange={onLocationChange}
            />
          </div>
          <button
            onClick={onSquadChip}
            className="flex items-center gap-1.5 rounded-full border border-white/[.08] bg-[#111118] px-2.5 py-1 text-[11px] font-bold text-[#94a3b8]"
          >
            Squad · <b className="text-[#fb923c]">{squadCount}</b>
          </button>
        </div>
      </div>

      {/* Game log strip */}
      <div className="flex-none pt-1.5 pb-0.5">
        <GameLogStrip games={savedGames} />
      </div>

      {/* Centered content */}
      <div className="flex-1 flex flex-col justify-center px-3.5 min-h-0">
        <div className="text-center mb-1">
          <span className="text-2xl font-black text-[#f0f0f8]">
            {winnerTeam ? '🏆' : '🤝'} Game {gameNumber}
            {winnerTeam ? ` — Team ${winnerTeam} wins` : ' — Tie'}
          </span>
        </div>
        <p className="text-center text-[13px] text-[#94a3b8] mb-6">What&apos;s next?</p>

        <div className="grid grid-cols-3 gap-2">
          {/* Runback */}
          <button
            onClick={onRunback}
            className="rounded-[13px] border border-white/[.06] bg-[#111118] px-2 py-3 text-center transition-all active:scale-[.95]"
          >
            <div className="text-[19px]">🔁</div>
            <div className="text-[11px] font-black mt-0.5 text-[#f0f0f8]">Runback</div>
            <div className="text-[8px] text-[#555570] mt-0.5">same teams</div>
          </button>

          {/* Winners Stay — visually emphasized, hidden on tie */}
          {winnerTeam ? (
            <button
              onClick={onWinnersStay}
              className="rounded-[13px] border border-[#fb923c] bg-[rgba(251,146,60,0.10)] px-2 py-3 text-center transition-all active:scale-[.95]"
            >
              <div className="text-[19px]">👑</div>
              <div className="text-[11px] font-black mt-0.5 text-[#fed7aa]">Winners Stay</div>
              <div className="text-[8px] text-[#fb923c]/70 mt-0.5">T1 on court</div>
            </button>
          ) : (
            /* Tie: show an empty slot or repeat fresh */
            <div className="rounded-[13px] border border-white/[.04] bg-transparent" />
          )}

          {/* Fresh */}
          <button
            onClick={onFresh}
            className="rounded-[13px] border border-white/[.06] bg-[#111118] px-2 py-3 text-center transition-all active:scale-[.95]"
          >
            <div className="text-[19px]">✨</div>
            <div className="text-[11px] font-black mt-0.5 text-[#f0f0f8]">Fresh</div>
            <div className="text-[8px] text-[#555570] mt-0.5">clear all</div>
          </button>
        </div>

        <button
          onClick={onEndSession}
          className="mt-4 w-full rounded-xl border border-white/[.06] py-3 text-[13px] font-bold text-[#94a3b8] transition-colors hover:text-[#f0f0f8]"
        >
          End Session 📰
        </button>
      </div>
    </div>
  )
}
