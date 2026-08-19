'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import type { Session } from '@/lib/types'

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  // Stranded = open (is_complete=false) sessions with ZERO games. These are
  // invisible to the main list (its query uses games!inner), so without this
  // separate surface they cannot be found or cleaned up through the UI.
  const [stranded, setStranded] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [listRes, strandedRes] = await Promise.all([
        fetch('/api/sessions', { cache: 'no-store' }),
        fetch('/api/sessions?stranded=1', { cache: 'no-store' }),
      ])
      if (!listRes.ok) throw new Error('Failed to load')
      const data = await listRes.json() as Session[]
      setSessions(data)
      if (strandedRes.ok) {
        setStranded(await strandedRes.json() as Session[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { isRefreshing } = usePullToRefresh(load)

  async function handleDeleteStranded(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setStranded((prev) => prev.filter((s) => s.id !== id))
      setConfirmId(null)
    } catch {
      setError('Failed to delete session')
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        {/* Pull-to-refresh indicator */}
        {isRefreshing && (
          <div className="flex justify-center pb-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
          </div>
        )}

        <h1 className="mb-5 text-xl font-black text-white">Sessions</h1>

        {loading && <p className="py-10 text-center text-slate-400">Loading…</p>}
        {error && <p className="mb-3 text-red-400">{error}</p>}

        {/* Recovery surface: stranded empty sessions (invisible to the main list). */}
        {!loading && stranded.length > 0 && (
          <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/[.06] p-3">
            <p className="mb-2 px-1 text-xs font-black uppercase tracking-wider text-amber-300">
              ⚠ Needs attention · {stranded.length} empty open session{stranded.length > 1 ? 's' : ''}
            </p>
            <p className="mb-3 px-1 text-[11px] text-slate-400">
              These were left open with no games logged. Delete them to tidy up.
            </p>
            <ul className="flex flex-col gap-2">
              {stranded.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[.06] bg-surface px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{formatDate(session.session_date)}</p>
                    <p className="truncate text-xs text-slate-400">📍 {session.location} · 0 games</p>
                  </div>
                  {confirmId === session.id ? (
                    <div className="flex flex-none items-center gap-1.5">
                      <button
                        onClick={() => void handleDeleteStranded(session.id)}
                        disabled={deletingId === session.id}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {deletingId === session.id ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === session.id}
                        className="rounded-lg border border-white/[.06] px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-surface-raised disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(session.id)}
                      className="flex-none rounded-lg border border-red-400/25 px-2.5 py-1.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-400/10"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && !error && (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/sessions/${session.id}`}
                  className="flex items-center justify-between rounded-xl border border-white/[.06] bg-surface px-4 py-4 hover:border-white/[.12] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white">
                      {formatDate(session.session_date)}
                    </p>
                    {!session.is_complete && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                        Open
                      </span>
                    )}
                  </div>
                  <span className="text-[#555570]">→</span>
                </Link>
              </li>
            ))}
            {sessions.length === 0 && stranded.length === 0 && (
              <p className="py-10 text-center text-slate-400">No sessions yet. Start a run on the Courtside screen!</p>
            )}
          </ul>
        )}
      </div>
    </main>
  )
}
