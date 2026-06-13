'use client'

import { useEffect, useState } from 'react'

// The share target is the STATS portal permalink, not this score tracker.
const STATS_URL = (process.env.NEXT_PUBLIC_STATS_URL || 'https://hoopsta.run').replace(/\/+$/, '')

const POLL_MS = 3000
const MAX_MS = 42000 // stop polling after ~40s; the link stays shareable regardless

type Status = 'publishing' | 'ready' | 'timeout'

interface Props {
  sessionId: string
  onClose: () => void
}

export function ShareRundown({ sessionId, onClose }: Props) {
  const url = `${STATS_URL}/rundown/${sessionId}`
  const [status, setStatus] = useState<Status>('publishing')
  const [copied, setCopied] = useState(false)

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  // Poll the stats side until the Rundown's stories land, then flip to "ready".
  // The permalink is valid immediately (box score + ledger render pre-stories), so
  // a slow or failed generation degrades gracefully to a still-shareable link.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const start = Date.now()

    async function poll() {
      try {
        const res = await fetch(`/api/narratives/status?session_id=${sessionId}`, {
          cache: 'no-store',
        })
        const data = (await res.json()) as { ready?: boolean }
        if (cancelled) return
        if (data.ready) {
          setStatus('ready')
          return
        }
      } catch {
        // network hiccup — keep polling until the time budget is spent
      }
      if (cancelled) return
      if (Date.now() - start >= MAX_MS) {
        setStatus('timeout')
        return
      }
      timer = setTimeout(poll, POLL_MS)
    }

    // First check after one interval — generation needs a beat before stories exist.
    timer = setTimeout(poll, POLL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — the link is shown below for manual copy
    }
  }

  async function handleShare() {
    try {
      await navigator.share({ title: 'The Rundown', text: "Tonight's Rundown 🏀", url })
    } catch {
      // user dismissed the share sheet, or it's unsupported — no-op
    }
  }

  // "settled" = generation has resolved (stories landed, or we gave up waiting). Only
  // then do we surface the prominent share CTA — see the Actions block for why.
  const settled = status === 'ready' || status === 'timeout'

  const badge =
    status === 'ready'
      ? { label: 'Ready ✓', cls: 'bg-[#22c55e]/15 text-[#22c55e]' }
      : status === 'timeout'
        ? { label: 'Link ready', cls: 'bg-white/[.06] text-[#94a3b8]' }
        : { label: 'Publishing…', cls: 'bg-[#fb923c]/15 text-[#fb923c]' }

  const statusLine =
    status === 'ready'
      ? 'Stories are live — share the full edition.'
      : status === 'timeout'
        ? "Stories are still landing — the link works now; they'll appear on refresh."
        : 'Hang on — stories land in ~20s. The share button lights up the moment they do.'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl bg-[#111118] px-6 pb-[calc(28px+env(safe-area-inset-bottom))] pt-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Heading + live status badge */}
        <div className="mb-1 flex items-center justify-center gap-2">
          <span className="text-xl font-black text-[#f0f0f8]">The Rundown</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="mb-4 text-center text-sm text-[#94a3b8]">{statusLine}</p>

        {/* The permalink — copyable the whole time */}
        <div className="mb-4 truncate rounded-xl border border-white/[.06] bg-[#1a1a28] px-4 py-3 text-center font-mono text-xs text-[#94a3b8]">
          {url}
        </div>

        {/* Actions — the prominent share CTA is gated on the Rundown being settled.
            During the publishing window the share path is deliberately DE-EMPHASIZED
            (a muted "preparing" state + a small "copy anyway" link), so the obvious
            action is to wait the few seconds for stories. That protects the OG image:
            if a chat platform fetches + caches the unfurl before the lead story exists,
            that storyless image sticks. The big button lighting up on "ready" is the
            cue to share once the image is fully baked — the whole point of Approach 2. */}
        {settled ? (
          <div className="flex gap-3">
            {canShare && (
              <button
                onClick={() => void handleShare()}
                className="flex-1 rounded-2xl bg-[#fb923c] py-4 text-base font-bold text-white transition-all hover:bg-orange-300 active:scale-95"
              >
                Share
              </button>
            )}
            <button
              onClick={() => void handleCopy()}
              className={`flex-1 rounded-2xl py-4 text-base font-bold transition-all active:scale-95 ${
                canShare
                  ? 'border border-white/[.06] text-[#f0f0f8] hover:bg-[#1a1a28]'
                  : 'bg-[#fb923c] text-white hover:bg-orange-300'
              }`}
            >
              {copied ? 'Copied ✓' : 'Copy Link'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[.06] bg-[#1a1a28]/50 py-4 text-base font-bold text-[#555570]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#fb923c]" />
              Preparing the share…
            </div>
            <button
              onClick={() => void handleCopy()}
              className="text-xs font-semibold text-[#555570] underline underline-offset-2 transition-colors hover:text-[#94a3b8]"
            >
              {copied ? 'Copied ✓' : 'Copy link anyway'}
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-[#94a3b8] transition-colors hover:bg-[#1a1a28]"
        >
          Done
        </button>
      </div>
    </div>
  )
}
