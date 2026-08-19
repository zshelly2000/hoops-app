'use client'

import { useState } from 'react'
import type { Player, Session } from '@/lib/types'
import { LocationPill } from '@/components/courtside/LocationPill'
import { GameLogStrip } from '@/components/courtside/GameLogStrip'
import type { SavedGameEntry } from '@/components/courtside/GameLogStrip'
import { PastSessionBanner } from '@/components/courtside/PastSessionBanner'

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
  pastSessionDate?: string | null
  persistDefaultLocation?: boolean
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
  pastSessionDate,
  persistDefaultLocation = true,
}: Props) {
  const [focus, setFocus] = useState<1 | 2>(1)
  // Increments per entry on each card; used as a React key to re-trigger the pop animation
  const [pops, setPops] = useState<{ 1: number; 2: number }>({ 1: 0, 2: 0 })

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

    setPops((p) => ({ ...p, [focus]: p[focus] + 1 }))
    if (focus === 1) onScoreChange(next, t2Score)
    else onScoreChange(t1Score, next)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','⇄','0','⌫']

  return (
    <div className="flex flex-col h-[100dvh] max-w-[430px] mx-auto overflow-hidden">
      <PastSessionBanner date={pastSessionDate ?? null} />
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

      {/* Score cards + keypad — must fit without scrolling */}
      <div className="flex-1 flex flex-col px-3.5 py-2 gap-3 min-h-0">
        {/* Score cards */}
        <div className="grid grid-cols-2 gap-2 flex-none">
          {/* Team 1 */}
          <button
            onClick={() => setFocus(1)}
            className={`rounded-2xl border-2 pt-2.5 pb-2 px-2 text-center transition-all ${
              focus === 1 ? 'border-accent-cool' : 'border-white/[.06]'
            } bg-surface-raised`}
          >
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-accent-cool mb-0.5">Team 1</div>
            <div
              key={`n1-${pops[1]}`}
              className={`text-[44px] font-black leading-[1.05] min-h-[48px] [font-variant-numeric:tabular-nums] ${
                t1Wins ? 'keypad-num-winner' : 'text-fg'
              } ${pops[1] > 0 ? 'keypad-num-pop' : ''}`}
            >
              {t1Score || <span className="opacity-20">–</span>}
            </div>
            <div className="text-[11px] font-bold text-fg-dim leading-snug min-h-[18px] mt-0.5">
              {teamAnchor(team1Players)}
            </div>
          </button>

          {/* Team 2 */}
          <button
            onClick={() => setFocus(2)}
            className={`rounded-2xl border-2 pt-2.5 pb-2 px-2 text-center transition-all ${
              focus === 2 ? 'border-accent' : 'border-white/[.06]'
            } bg-surface-raised`}
          >
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-accent mb-0.5">Team 2</div>
            <div
              key={`n2-${pops[2]}`}
              className={`text-[44px] font-black leading-[1.05] min-h-[48px] [font-variant-numeric:tabular-nums] ${
                t2Wins ? 'keypad-num-winner' : 'text-fg'
              } ${pops[2] > 0 ? 'keypad-num-pop' : ''}`}
            >
              {t2Score || <span className="opacity-20">–</span>}
            </div>
            <div className="text-[11px] font-bold text-fg-dim leading-snug min-h-[18px] mt-0.5">
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
              className={`keypad-glass-key py-3 text-center select-none ${
                key === '⌫' || key === '⇄' ? 'text-[14px] font-bold text-fg-dim' : 'text-[21px] font-black text-fg'
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
          className="w-full rounded-[15px] bg-accent py-[15px] text-[17px] font-black text-canvas disabled:opacity-35 transition-all active:scale-[.97]"
        >
          {saving ? 'Saving…' : 'Save Game'}
        </button>
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={onBack}
            className="text-[13px] font-bold text-fg-dim py-1 px-2"
          >
            ← Teams
          </button>
          {savedGames.length > 0 && (
            <button
              onClick={onEndSession}
              className="text-[13px] font-bold text-fg-dim py-1 px-2"
            >
              End Session 📰
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
