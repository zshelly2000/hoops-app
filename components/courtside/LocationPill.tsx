'use client'

import { useEffect, useRef, useState } from 'react'

const KNOWN_LOCATIONS = [
  'Natomas',
  'Stockton Kings Practice Facility',
  'Golden1 Center',
]

const STORAGE_KEY = 'hoops_default_location'
const DEFAULT_LOCATION = 'Natomas'

export function getDefaultLocation(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCATION
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LOCATION
}

export function saveDefaultLocation(loc: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, loc)
  }
}

interface Props {
  sessionId: string | null
  location: string
  onLocationChange: (loc: string) => void
  /** When false (past-session mode) the chosen venue still PATCHes the session
   *  as a correction, but is NOT written to the courtside default. Default true. */
  persistDefault?: boolean
}

interface InlinePickerProps {
  sessionId: string | null
  location: string
  onLocationChange: (loc: string) => void
  onClose: () => void
  persistDefault?: boolean
}

export function InlineLocationPicker({ sessionId, location, onLocationChange, onClose, persistDefault = true }: InlinePickerProps) {
  const [otherMode, setOtherMode] = useState(false)
  const [otherValue, setOtherValue] = useState('')

  async function applyLocation(loc: string) {
    if (!loc.trim()) return
    onLocationChange(loc)
    if (persistDefault) saveDefaultLocation(loc)
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc }),
      }).catch(() => {})
    }
    onClose()
  }

  return (
    <div className="mt-3 rounded-xl border border-white/[.08] bg-white/[.04] p-1">
      {KNOWN_LOCATIONS.map((loc) => (
        <button
          key={loc}
          onClick={() => void applyLocation(loc)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
            loc === location
              ? 'bg-orange-400/20 text-[#fb923c] font-semibold'
              : 'text-slate-300 hover:bg-white/[.06]'
          }`}
        >
          {loc === location && <span className="text-xs">✓</span>}
          <span className={loc === location ? '' : 'ml-4'}>{loc}</span>
        </button>
      ))}
      {!otherMode ? (
        <button
          onClick={() => setOtherMode(true)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-white/[.06] transition-colors"
        >
          <span className="ml-4">Other…</span>
        </button>
      ) : (
        <div className="px-3 pb-2 pt-1">
          <input
            autoFocus
            type="text"
            value={otherValue}
            onChange={(e) => setOtherValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void applyLocation(otherValue) }}
            placeholder="Type location…"
            className="w-full rounded-lg border border-white/[.12] bg-white/[.06] px-3 py-2 text-sm text-[#f0f0f8] placeholder-slate-500 outline-none focus:border-[#fb923c]/50"
          />
          <button
            onClick={() => void applyLocation(otherValue)}
            disabled={!otherValue.trim()}
            className="mt-2 w-full rounded-lg bg-orange-400 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-orange-300 transition-colors"
          >
            Set Location
          </button>
        </div>
      )}
    </div>
  )
}

export function LocationPill({ sessionId, location, onLocationChange, persistDefault = true }: Props) {
  const [open, setOpen] = useState(false)
  const [otherMode, setOtherMode] = useState(false)
  const [otherValue, setOtherValue] = useState('')
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setOtherMode(false)
        setOtherValue('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function applyLocation(loc: string) {
    if (!loc.trim()) return
    setSaving(true)
    onLocationChange(loc)
    if (persistDefault) saveDefaultLocation(loc)
    setOpen(false)
    setOtherMode(false)
    setOtherValue('')
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc }),
      }).catch(() => {})
    }
    setSaving(false)
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        onClick={() => { setOpen((o) => !o); setOtherMode(false); setOtherValue('') }}
        className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-white/[.06] bg-surface px-2.5 py-1 text-xs text-fg-dim transition-colors hover:border-white/20"
        aria-label="Change location"
      >
        <span className="flex-none">📍</span>
        <span className="min-w-0 truncate">{saving ? '…' : location}</span>
        <span className="flex-none opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[220px] rounded-xl border border-white/[.08] bg-[#1a1a2e] shadow-2xl">
          <div className="p-1">
            {KNOWN_LOCATIONS.map((loc) => (
              <button
                key={loc}
                onClick={() => applyLocation(loc)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  loc === location
                    ? 'bg-orange-400/20 text-[#fb923c] font-semibold'
                    : 'text-slate-300 hover:bg-white/[.06]'
                }`}
              >
                {loc === location && <span className="text-xs">✓</span>}
                <span className={loc === location ? '' : 'ml-4'}>{loc}</span>
              </button>
            ))}

            {!otherMode ? (
              <button
                onClick={() => setOtherMode(true)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-white/[.06] transition-colors"
              >
                <span className="ml-4">Other…</span>
              </button>
            ) : (
              <div className="px-3 pb-2 pt-1">
                <input
                  autoFocus
                  type="text"
                  value={otherValue}
                  onChange={(e) => setOtherValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void applyLocation(otherValue) }}
                  placeholder="Type location…"
                  className="w-full rounded-lg border border-white/[.12] bg-white/[.06] px-3 py-2 text-sm text-[#f0f0f8] placeholder-slate-500 outline-none focus:border-[#fb923c]/50"
                />
                <button
                  onClick={() => void applyLocation(otherValue)}
                  disabled={!otherValue.trim()}
                  className="mt-2 w-full rounded-lg bg-orange-400 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-orange-300 transition-colors"
                >
                  Set Location
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
