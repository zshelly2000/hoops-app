'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SignOutButton } from '@/components/shared/SignOutButton'
import type { MembersPayload } from '@/app/api/members/route'

export default function MembersPage() {
  const [data, setData] = useState<MembersPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'organizer' | 'owner'>('organizer')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/members', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load members')
      setData(await res.json() as MembersPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const isOwner = data?.you.role === 'owner'

  async function addInvite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setActionError('')
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to add invite')
      }
      setInviteEmail('')
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add invite')
    } finally {
      setBusy(false)
    }
  }

  async function revokeInvite(email: string) {
    setBusy(true)
    setActionError('')
    try {
      const res = await fetch(`/api/invites?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to revoke invite')
      }
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(userId: string) {
    setBusy(true)
    setActionError('')
    try {
      const res = await fetch(`/api/members/${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to remove member')
      }
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-canvas pb-24 pt-4">
      <div className="mx-auto max-w-lg px-4">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-black text-white">
            Members
            {data && <span className="ml-2 text-sm font-semibold text-slate-400">{data.universe.name}</span>}
          </h1>
          <SignOutButton className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-[#222236]" />
        </div>

        {loading && <p className="py-10 text-center text-slate-400">Loading…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!loading && !error && data && (
          <>
            <div className="mb-5 rounded-xl border border-white/[.06] bg-surface px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Signed in as</p>
              <p className="mt-0.5 break-all font-semibold text-[#f0f0f8]">{data.you.email}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {data.you.role}
                {data.you.membership_count > 1 && (
                  <>
                    {' · '}
                    <Link href="/pick-universe" className="text-[#fb923c] hover:brightness-110">
                      switch universe
                    </Link>
                  </>
                )}
              </p>
            </div>

            {actionError && <p className="mb-3 text-sm text-red-400">{actionError}</p>}

            <ul className="flex flex-col gap-2">
              {data.members.map((member) => (
                <li
                  key={member.user_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#f0f0f8]">
                      {member.name ?? member.email ?? member.user_id}
                      {member.is_you && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </p>
                    {member.name && member.email && (
                      <p className="truncate text-xs text-slate-400">{member.email}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        member.role === 'owner'
                          ? 'bg-[rgba(251,146,60,0.12)] text-[#fb923c]'
                          : 'bg-surface-raised text-slate-300'
                      }`}
                    >
                      {member.role}
                    </span>
                    {isOwner && !member.is_root_owner && (
                      <button
                        onClick={() => removeMember(member.user_id)}
                        disabled={busy}
                        className="rounded-lg bg-red-900/40 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/70 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <h2 className="mb-2 mt-7 text-sm font-black uppercase tracking-wider text-slate-400">
              Pending invites
            </h2>
            <ul className="flex flex-col gap-2">
              {data.invites.map((invite) => (
                <li
                  key={invite.email}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/[.1] bg-surface px-4 py-3"
                >
                  <p className="min-w-0 truncate font-semibold text-slate-300">{invite.email}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-semibold text-slate-300">
                      {invite.role}
                    </span>
                    {isOwner && (
                      <button
                        onClick={() => revokeInvite(invite.email)}
                        disabled={busy}
                        className="rounded-lg bg-red-900/40 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/70 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {data.invites.length === 0 && (
                <p className="py-3 text-center text-sm text-slate-400">No pending invites.</p>
              )}
            </ul>

            {isOwner && (
              <form onSubmit={addInvite} className="mt-5 flex flex-col gap-2">
                <p className="text-xs text-slate-400">
                  Invite by email — no email is sent; text them once they&apos;re added. The invite
                  converts to membership when they sign in with that (verified) address.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="min-w-0 flex-1 rounded-xl border border-white/[.06] bg-surface-raised px-3 py-2.5 text-sm text-[#f0f0f8] placeholder-slate-500 focus:border-accent focus:outline-none"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'organizer' | 'owner')}
                    className="rounded-xl border border-white/[.06] bg-surface-raised px-2 py-2.5 text-sm text-[#f0f0f8] focus:border-accent focus:outline-none"
                  >
                    <option value="organizer">organizer</option>
                    <option value="owner">owner</option>
                  </select>
                  <button
                    type="submit"
                    disabled={busy || !inviteEmail}
                    className="rounded-xl bg-orange-400 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-300 disabled:opacity-50"
                  >
                    Invite
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  )
}
