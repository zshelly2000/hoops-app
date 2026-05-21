'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Session } from '@/lib/types'

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/sessions', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json() as Session[]
        setSessions(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        <h1 className="mb-5 text-xl font-black text-white">Sessions</h1>

        {loading && <p className="py-10 text-center text-zinc-500">Loading…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!loading && !error && (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/sessions/${session.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 hover:border-zinc-600 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className="text-zinc-600">→</span>
                </Link>
              </li>
            ))}
            {sessions.length === 0 && (
              <p className="py-10 text-center text-zinc-500">No sessions yet. Start a run on the Courtside screen!</p>
            )}
          </ul>
        )}
      </div>
    </main>
  )
}
