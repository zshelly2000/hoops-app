'use client'

import { useState } from 'react'
import type { Player, Session } from '@/lib/types'
import { LocationPill } from '@/components/courtside/LocationPill'
import { GameLogStrip } from '@/components/courtside/GameLogStrip'
import type { SavedGameEntry } from '@/components/courtside/GameLogStrip'

function shortName(p: Player): string {
  return p.nickname ?? p.name.split(' ')[0]
}

function teamAnchor(players: Player[]): string {
  if (players.length === 0) return '—'
  const names = players.slice(0, 2).map(shortName).join(', ')
  const extra = players.length - 2
  return extra > 0 ? `${names} +${extra}` : names
}

function haptic() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(6)
    }
  } catch {
    // iOS Safari — no-op
  }
}

interface Props {
  team1Players: Player[]
  team2Players: Player[]
  t1Score: string
  t2Score: string
  onScoreChange: (t1: string, t2: string) => void
  onSave: () => void
  onBack: () => void
  saving: boolean
  savedGames: SavedGameEntry[]
  gameCount: number
  location: string
  session: Session
  onLocationChange: (loc: string) => void
  onSquadChip: () => void
  onEndSession: () => void
  onOpenNav: () => void
  squadCount: number
}

export function ScoreKeypad({
  team1Players,
  team2Players,
  t1Score,
  t2Score,
  onScoreChange,
  onSave,
  onBack,
  saving,
  savedGames,
  gameCount,
  location,
  session,
  onLocationChange,
  onSquadChip,
  onEndSession,
  onOpenNav,
  squadCount,
}: Props) {
  const [focus, setFocus] = useState<1 | 2>(1)

  const t1Num = t1Score === '' ? null : parseInt(t1Score, 10)
  const t2Num = t2Score === '' ? null : parseInt(t2Score, 10)
  const bothPresent = t1Score !== '' && t2Score !== ''
  const isTie = bothPresent && t1Num === t2Num
  const t1Wins = bothPresent && !isTie && (t1Num ?? 0) > (t2Num ?? 0)
  const t2Wins = bothPresent && !isTie && (t2Num ?? 0) > (t1Num ?? 0)
  const canSave = bothPresent && !saving

  function pressKey(key: string) {
    haptic()
    const current = focus === 1 ? t1Score : t2Score
    let next: string

    if (key === '⌫') {
      next = current.slice(0, -1)
    } else if (key === '⇄') {
      setFocus(focus === 1 ? 2 : 1)
      return
    } else {
      if (current.length >= 3) return
      next = current + key
    }

    if (focus === 1) onScoreChange(next, t2Score)
    else onScoreChange(t1Score, next)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','⇄','0','⌫']

  return (
    <div className="flex flex-col h-[100dvh] max-w-[430px] mx-auto overflow-hidden">
      {/* Pinned header */}
      <div className="flex-none px-3.5 pt-2.5 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[17px] font-black text-[#f0f0f8]">Courtside</span>
            <span className="text-[11px] text-[#94a3b8]">· Game {gameCount + 1}</span>
            <LocationPill
              sessionId={session.id}
              location={location}
              onLocationChange={onLocationChange}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onSquadChip}
              className="flex items-center gap-1.5 rounded-full border border-white/[.08] bg-[#111118] px-2.5 py-1 text-[11px] font-bold text-[#94a3b8]"
            >
              Squad · <b className="text-[#fb923c]">{squadCount}</b>
            </button>
            <button
              onClick={onOpenNav}
              aria-label="App navigation"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/[.08] bg-[#111118] text-[13px] leading-none text-[#94a3b8]"
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

      {/* Score cards + keypad — must fit without scrolling */}
      <div className="flex-1 flex flex-col px-3.5 py-2 gap-3 min-h-0">
        {/* Score cards */}
        <div className="grid grid-cols-2 gap-2 flex-none">
          {/* Team 1 */}
          <button
            onClick={() => setFocus(1)}
            className={`rounded-2xl border-2 pt-2.5 pb-2 px-2 text-center transition-all ${
              focus === 1 ? 'border-[#3b82f6]' : 'border-white/[.06]'
            } bg-[#1a1a28]`}
          >
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-[#60a5fa] mb-0.5">Team 1</div>
            <div className={`text-[44px] font-black leading-[1.05] min-h-[48px] ${t1Wins ? 'text-[#22c55e]' : 'text-[#f0f0f8]'}`}>
              {t1Score || <span className="opacity-20">–</span>}
            </div>
            <div className="text-[11px] font-bold text-[#94a3b8] leading-snug min-h-[18px] mt-0.5">
              {teamAnchor(team1Players)}
            </div>
          </button>

          {/* Team 2 */}
          <button
            onClick={() => setFocus(2)}
            className={`rounded-2xl border-2 pt-2.5 pb-2 px-2 text-center transition-all ${
              focus === 2 ? 'border-[#fb923c]' : 'border-white/[.06]'
            } bg-[#1a1a28]`}
          >
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-[#fb923c] mb-0.5">Team 2</div>
            <div className={`text-[44px] font-black leading-[1.05] min-h-[48px] ${t2Wins ? 'text-[#22c55e]' : 'text-[#f0f0f8]'}`}>
              {t2Score || <span className="opacity-20">–</span>}
            </div>
            <div className="text-[11px] font-bold text-[#94a3b8] leading-snug min-h-[18px] mt-0.5">
              {teamAnchor(team2Players)}
            </div>
          </button>
        </div>

        {/* Custom keypad */}
        <div className="grid grid-cols-3 gap-[7px] flex-none">
          {keys.map((key) => (
            <button
              key={key}
              onClick={() => pressKey(key)}
              className={`rounded-xl border border-white/[.06] bg-[#111118] py-3 text-center transition-all active:scale-[.93] active:bg-[#1a1a28] select-none ${
                key === '⌫' || key === '⇄' ? 'text-[14px] font-bold text-[#94a3b8]' : 'text-[21px] font-black text-[#f0f0f8]'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Pinned bottom */}
      <div className="flex-none px-3.5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-1">
        <button
          onClick={() => { if (canSave) onSave() }}
          disabled={!canSave}
          className="w-full rounded-[15px] bg-[#fb923c] py-[15px] text-[17px] font-black text-white disabled:opacity-35 transition-all active:scale-[.97]"
        >
          {saving ? 'Saving…' : 'Save Game'}
        </button>
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={onBack}
            className="text-[13px] font-bold text-[#94a3b8] py-1 px-2"
          >
            ← Teams
          </button>
          {savedGames.length > 0 && (
            <button
              onClick={onEndSession}
              className="text-[13px] font-bold text-[#94a3b8] py-1 px-2"
            >
              End Session 📰
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
