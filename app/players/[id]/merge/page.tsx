'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { displayToken, levenshtein, normalize } from '@/lib/identity'
import type { Player, PlayerStats } from '@/lib/types'

// ── Preview API response shape (mirrors /api/players/merge-preview) ──────────
interface RecordSummary {
  id: string
  name: string
  nickname: string | null
  isActive: boolean
  firstYear: number | null
  totalGames: number
  lastPlayed: string | null
}
interface TimelineBucket {
  record: 'a' | 'b'
  date: string
  games: number
  wins: number
  losses: number
  ties: number
}
interface MergePreview {
  a: RecordSummary
  b: RecordSummary
  oppositeTeamGames: number
  sameTeamGames: number
  sharedSessions: { sessionDate: string; aGames: number; bGames: number }[]
  timeline: TimelineBucket[]
  identicalTwin: boolean
  pinnedBadge: { id: string; badge: string; holderName: string } | null
  combinedGames: number
  combinedFirstYear: number | null
}

const INDIGO = '#818cf8'
const ACCENT = '#fb923c'

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function MergePlayerPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const entryId = params.id

  const [players, setPlayers] = useState<Player[]>([])
  const [statsById, setStatsById] = useState<Map<string, PlayerStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [counterpartId, setCounterpartId] = useState<string | null>(null)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const [search, setSearch] = useState('')

  // Review-screen choices
  const [survivorId, setSurvivorId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [displayNickname, setDisplayNickname] = useState('') // '' === None
  const [confirmText, setConfirmText] = useState('')
  const [twinConfirmed, setTwinConfirmed] = useState(false)
  const [tlOpen, setTlOpen] = useState(true)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [toast, setToast] = useState('')

  // ── Load roster + stats for the picker ────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [pRes, sRes] = await Promise.all([
          fetch('/api/players', { cache: 'no-store' }),
          fetch('/api/stats', { cache: 'no-store' }),
        ])
        if (!pRes.ok) throw new Error('Failed to load players')
        const allPlayers = (await pRes.json()) as Player[]
        setPlayers(allPlayers)
        if (sRes.ok) {
          const stats = (await sRes.json()) as PlayerStats[]
          setStatsById(new Map(stats.map((s) => [s.player_id, s])))
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Error loading')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const entryPlayer = players.find((p) => p.id === entryId) ?? null

  // ── Phase 1: candidate ordering — dup-likely first ────────────────────────
  const orderedCandidates = useMemo(() => {
    if (!entryPlayer) return []
    const entryNorm = normalize(entryPlayer.name)
    const others = players.filter((p) => p.id !== entryId)
    const scored = others.map((p) => {
      const pn = normalize(p.name)
      const dist = levenshtein(pn, entryNorm)
      // 0 = exact name, 1 = near (Levenshtein ≤2), 2 = the rest
      const tier = pn === entryNorm ? 0 : dist <= 2 ? 1 : 2
      return { p, tier, dist }
    })
    return scored.sort((x, y) => {
      if (x.tier !== y.tier) return x.tier - y.tier
      if (x.tier !== 2 && x.dist !== y.dist) return x.dist - y.dist
      return x.p.name.localeCompare(y.p.name)
    })
  }, [players, entryPlayer, entryId])

  const filteredCandidates = useMemo(() => {
    const q = normalize(search)
    if (!q) return orderedCandidates
    return orderedCandidates.filter(
      ({ p }) =>
        normalize(p.name).includes(q) || (p.nickname ? normalize(p.nickname).includes(q) : false),
    )
  }, [orderedCandidates, search])

  // ── Selecting a counterpart loads the preview ─────────────────────────────
  async function pickCounterpart(id: string) {
    setCounterpartId(id)
    setPreviewLoading(true)
    setPreviewError('')
    setPreview(null)
    try {
      const res = await fetch(`/api/players/merge-preview?a=${entryId}&b=${id}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error: string }).error)
      const pv = data as MergePreview
      setPreview(pv)
      // Default survivor: higher game count, tie-break to earlier first year.
      const aWins =
        pv.a.totalGames > pv.b.totalGames ||
        (pv.a.totalGames === pv.b.totalGames && (pv.a.firstYear ?? 9999) <= (pv.b.firstYear ?? 9999))
      const surv = aWins ? pv.a : pv.b
      setSurvivorId(surv.id)
      setDisplayName(surv.name)
      setDisplayNickname(surv.nickname ?? '')
      setConfirmText('')
      setTwinConfirmed(false)
      setMergeError('')
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to build preview')
      setCounterpartId(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function chooseSurvivor(rec: RecordSummary) {
    setSurvivorId(rec.id)
    setDisplayName(rec.name)
    setDisplayNickname(rec.nickname ?? '')
    setConfirmText('')
    setMergeError('')
  }

  function backToPick() {
    setCounterpartId(null)
    setPreview(null)
    setPreviewError('')
  }

  // ── Derived review values ─────────────────────────────────────────────────
  const survivor = preview ? (preview.a.id === survivorId ? preview.a : preview.b) : null
  const loser = preview ? (preview.a.id === survivorId ? preview.b : preview.a) : null
  const gamesMoved = preview && loser ? loser.totalGames - preview.sameTeamGames : 0
  const combinedGames = preview?.combinedGames ?? 0

  const nameOptions = useMemo(() => {
    if (!preview) return []
    return Array.from(new Set([preview.a.name, preview.b.name]))
  }, [preview])
  const nickOptions = useMemo(() => {
    if (!preview) return []
    const nicks = [preview.a.nickname, preview.b.nickname].filter(
      (n): n is string => !!n && n.trim().length > 0,
    )
    return Array.from(new Set(nicks))
  }, [preview])

  const previewShort = displayNickname.trim() || displayName.trim().split(/\s+/)[0] || '?'
  const confirmReady =
    !!survivor && normalize(confirmText) === normalize(survivor.name) && !!displayName.trim()
  const needsTwinConfirm = !!preview?.identicalTwin
  const oppositeBlocked = (preview?.oppositeTeamGames ?? 0) > 0
  const loserHoldsPin = !!preview?.pinnedBadge && preview.pinnedBadge.id === loser?.id
  // Hard blocks with no in-screen override — the merge cannot run as configured.
  const mergeBlocked = oppositeBlocked || loserHoldsPin

  async function runMerge() {
    if (!survivor || !loser || !confirmReady || mergeBlocked) return
    if (needsTwinConfirm && !twinConfirmed) return
    setMerging(true)
    setMergeError('')
    try {
      const res = await fetch('/api/players/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survivorId: survivor.id,
          loserId: loser.id,
          displayName: displayName.trim(),
          displayNickname: displayNickname.trim() || null,
          confirmTwin: needsTwinConfirm ? twinConfirmed : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error: string }).error)
      const result = data as { gamesMoved: number; finalName: string; survivorId: string }
      setToast(`Merged ${result.gamesMoved} games into ${result.finalName} · ${loser.name} removed`)
      // Land on the survivor's detail page; the loser id no longer exists.
      setTimeout(() => router.push(`/players/${result.survivorId}`), 900)
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed')
      setMerging(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <Centered>Loading…</Centered>
  }
  if (loadError || !entryPlayer) {
    return <Centered tone="error">{loadError || 'Player not found'}</Centered>
  }

  return (
    <main className="min-h-screen bg-[#08080e] pb-24 pt-5 font-inter text-[#f0f0f8]">
      <div className="mx-auto max-w-[460px] px-4">
        {/* Masthead */}
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#555570]">
          Player Admin
        </p>
        <h1 className="gradient-accent m-0 font-condensed text-[40px] font-bold uppercase leading-[0.95] tracking-[0.02em]">
          Merge Players
        </h1>
        <p className="mb-1 mt-3 text-[13.5px] leading-[1.5] text-[#94a3b8]">
          You&apos;re combining two records into one.{' '}
          <strong className="font-semibold text-[#f0f0f8]">This can&apos;t be undone</strong> — once
          their games are joined under a single player, there&apos;s nothing left to tell them apart.
          Take your time.
        </p>
        <hr className="my-[18px] h-0.5 border-0 opacity-60 [background:linear-gradient(135deg,#818cf8,#c084fc,#fb923c)]" />

        {!preview && (
          <>
            <SectionLabel>Pick the other record</SectionLabel>
            <p className="mb-3 text-[12.5px] leading-[1.5] text-[#94a3b8]">
              Merging into{' '}
              <strong className="font-semibold text-[#f0f0f8]">{entryPlayer.name}</strong>. Likely
              duplicates float to the top.
            </p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="mb-3 w-full rounded-xl border border-white/[.06] bg-[#1a1a28] px-4 py-3 text-base text-[#f0f0f8] placeholder-[#555570] focus:border-[#fb923c] focus:outline-none"
            />
            {previewError && <p className="mb-3 text-sm text-[#ef4444]">{previewError}</p>}
            {previewLoading && <p className="py-4 text-center text-sm text-[#94a3b8]">Building preview…</p>}
            <div className="flex flex-col gap-2">
              {filteredCandidates.map(({ p, tier }) => {
                const st = statsById.get(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void pickCounterpart(p.id)}
                    disabled={previewLoading}
                    className="flex items-center justify-between rounded-xl border border-white/[.06] bg-[#111118] px-4 py-3 text-left transition-colors hover:border-white/20 disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-condensed text-[17px] font-bold">{p.name}</span>
                        {tier === 0 && (
                          <span className="rounded-full bg-[#ef4444]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#fca5a5]">
                            Same name
                          </span>
                        )}
                        {tier === 1 && (
                          <span className="rounded-full bg-[#fb923c]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#fdba74]">
                            Similar
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#94a3b8]">
                        {p.nickname ? `“${p.nickname}” · ` : ''}
                        {st?.games_played ?? 0} games · last {fmtDate(st?.last_played ?? null)}
                      </div>
                    </div>
                    <span
                      className={`ml-3 flex-none rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        p.is_active ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-white/[.06] text-[#555570]'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                )
              })}
              {filteredCandidates.length === 0 && (
                <p className="py-6 text-center text-sm text-[#555570]">No matching players.</p>
              )}
            </div>
            <div className="mt-6">
              <Link href={`/players/${entryId}`} className="text-sm text-[#94a3b8] hover:text-[#f0f0f8]">
                ← Cancel
              </Link>
            </div>
          </>
        )}

        {preview && survivor && loser && (
          <>
            {/* 1 — The two records */}
            <SectionLabel>The two records</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              <RecordCard rec={preview.a} />
              <RecordCard rec={preview.b} />
            </div>

            {/* 2 — Which record survives */}
            <SectionLabel>Which record survives</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              {[preview.a, preview.b].map((rec) => {
                const sel = rec.id === survivorId
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => chooseSurvivor(rec)}
                    className={`rounded-[14px] border bg-[#1a1a28] p-[13px] text-left transition-colors ${
                      sel ? 'border-[#fb923c] bg-[#fb923c]/[.06]' : 'border-white/[.06] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`relative h-4 w-4 flex-none rounded-full border-2 ${
                          sel ? 'border-[#fb923c]' : 'border-[#555570]'
                        }`}
                      >
                        {sel && (
                          <span className="absolute inset-[3px] rounded-full bg-[#fb923c]" />
                        )}
                      </span>
                      <span className="text-sm font-semibold">{rec.name}</span>
                    </div>
                    <div className="mt-2 text-[11.5px] leading-[1.4] text-[#94a3b8]">
                      Keeps this row and its history as the anchor. {rec.totalGames} games.
                    </div>
                    {sel && (
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#fb923c]">
                        Survivor
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 3 — How they'll show up */}
            <SectionLabel>How they&apos;ll show up</SectionLabel>
            <div className="rounded-2xl border border-white/[.06] bg-[#111118] p-4">
              <p className="mb-1.5 px-0.5 text-[11.5px] text-[#94a3b8]">Full name</p>
              <div className="flex gap-1.5">
                {nameOptions.map((nm) => (
                  <Chip key={nm} selected={displayName === nm} onClick={() => setDisplayName(nm)}>
                    {nm}
                  </Chip>
                ))}
              </div>

              <p className="mb-1.5 mt-[13px] px-0.5 text-[11.5px] text-[#94a3b8]">Nickname</p>
              <div className="flex gap-1.5">
                {nickOptions.map((nk) => (
                  <Chip key={nk} selected={displayNickname === nk} onClick={() => setDisplayNickname(nk)}>
                    {nk}
                  </Chip>
                ))}
                <Chip selected={displayNickname === ''} onClick={() => setDisplayNickname('')}>
                  None
                  <small className="mt-0.5 block text-[10px] text-[#555570]">shows first name</small>
                </Chip>
              </div>

              {/* live tile preview */}
              <div className="mt-3.5 flex items-center gap-[11px] rounded-xl border border-dashed border-white/[.06] bg-[#0d0d15] px-[13px] py-[11px]">
                <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] font-condensed text-[17px] font-bold text-[#0b0b12] [background:linear-gradient(135deg,#818cf8,#c084fc,#fb923c)]">
                  {(previewShort[0] || '?').toUpperCase()}
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wide text-[#555570]">
                    On a tile, they&apos;ll read
                  </div>
                  <div className="text-[15px] font-semibold">{previewShort}</div>
                  <div className="text-[11.5px] text-[#94a3b8]">{displayName || '—'}</div>
                </div>
              </div>
            </div>

            {/* 4 — What happens */}
            <SectionLabel>What happens</SectionLabel>
            <div className="flex items-start gap-[11px] rounded-[14px] border border-white/[.06] px-[15px] py-3.5 [background:linear-gradient(180deg,rgba(129,140,248,0.05),rgba(251,146,60,0.04))]">
              <span className="text-lg leading-none">🔀</span>
              <p className="text-[13.5px] leading-[1.5]">
                <span className="font-bold text-[#fb923c]">{gamesMoved} games</span> move from{' '}
                <b className="text-[#f0f0f8]">{loser.name}</b> into{' '}
                <b className="text-[#f0f0f8]">{survivor.name}</b>. Combined:{' '}
                <b className="text-[#f0f0f8]">{combinedGames} games</b>
                {preview.combinedFirstYear ? (
                  <>
                    {' '}
                    since <b className="text-[#f0f0f8]">{preview.combinedFirstYear}</b>
                  </>
                ) : null}
                . {loser.name}&apos;s record is then deleted.
              </p>
            </div>

            {/* 5 — Conflicts to review */}
            <SectionLabel>Conflicts to review</SectionLabel>

            <TierTag>🔴 Stop and think</TierTag>
            {oppositeBlocked ? (
              <Flag tone="red" title={`⛔ Played each other — opposite teams ×${preview.oppositeTeamGames}`}>
                These records faced off in {preview.oppositeTeamGames} game
                {preview.oppositeTeamGames === 1 ? '' : 's'}. Merging would put one person on both sides
                of a game — the strongest sign they&apos;re two different people. Merge is blocked.
              </Flag>
            ) : preview.identicalTwin ? (
              <Flag tone="red" title="⛔ Identical on screen">
                Same name and same on-screen nickname — nothing distinguishes them. Confirm explicitly
                that they&apos;re the same person below, or cancel and give one a differentiator.
              </Flag>
            ) : (
              <Flag tone="clear" title="✓ No blocking conflicts">
                These two never played in the same game on opposite teams, and they don&apos;t read as
                identical twins. Nothing here says “two different people.”
              </Flag>
            )}

            <TierTag>🟠 Worth a look</TierTag>
            {preview.sharedSessions.length > 0 ? (
              preview.sharedSessions.map((s) => (
                <Flag key={s.sessionDate} tone="amber" title="Shared a session">
                  Both records appear on <b className="text-[#f0f0f8]">{fmtDate(s.sessionDate)}</b> —{' '}
                  <span className="font-bold text-[#f0f0f8]">
                    {preview.a.name}: {s.aGames} game{s.aGames === 1 ? '' : 's'}
                  </span>
                  ,{' '}
                  <span className="font-bold text-[#f0f0f8]">
                    {preview.b.name}: {s.bGames} game{s.bGames === 1 ? '' : 's'}
                  </span>
                  . That&apos;s the kind of day a duplicate gets created mid-run.
                </Flag>
              ))
            ) : (
              <Flag tone="amber" title="No shared sessions">
                The two records never appear in the same session — less typical for a duplicate, but
                fine if one simply replaced the other over time.
              </Flag>
            )}
            {preview.sameTeamGames > 0 && (
              <Flag tone="amber" title={`Same team, same game ×${preview.sameTeamGames}`}>
                In {preview.sameTeamGames} game{preview.sameTeamGames === 1 ? '' : 's'} they were on the{' '}
                <b className="text-[#f0f0f8]">same team</b>. Each keeps one copy of the player — the
                duplicate slot is dropped automatically so no one shows up twice.
              </Flag>
            )}
            {preview.pinnedBadge && (
              <Flag tone="amber" title="Holds a pinned badge">
                {preview.pinnedBadge.holderName} holds the pinned{' '}
                <b className="text-[#f0f0f8]">{preview.pinnedBadge.badge}</b> badge.{' '}
                {loserHoldsPin
                  ? 'They must be the survivor — flip the toggle above, or the merge will be blocked.'
                  : 'They are the survivor, so the pin stays intact.'}
              </Flag>
            )}

            <TierTag>⚪ For the record</TierTag>
            <Flag tone="plain" title="Summary">
              {gamesMoved} games move · combined {combinedGames}
              {preview.combinedFirstYear ? ` · earliest game ${preview.combinedFirstYear} becomes the “since.”` : '.'}{' '}
              {preview.pinnedBadge ? `${preview.pinnedBadge.holderName} holds a pinned badge.` : 'Neither record holds a pinned all-time badge.'}
            </Flag>

            {/* 6 — The eyeball test */}
            <SectionLabel>The eyeball test</SectionLabel>
            <div className="rounded-2xl border border-white/[.06] bg-[#111118] p-4">
              <button
                type="button"
                onClick={() => setTlOpen((o) => !o)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[13.5px] font-semibold">Combined timeline</span>
                <span className={`text-[#555570] transition-transform ${tlOpen ? 'rotate-90' : ''}`}>▸</span>
              </button>
              {tlOpen && (
                <Timeline preview={preview} survivorId={survivorId} />
              )}
            </div>

            {/* 7 — Confirm */}
            <SectionLabel>Confirm</SectionLabel>
            {needsTwinConfirm && (
              <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-[14px] border border-[#ef4444]/30 bg-[#ef4444]/[.06] px-3.5 py-3 text-[13px] leading-[1.5] text-[#f0f0f8]">
                <input
                  type="checkbox"
                  checked={twinConfirmed}
                  onChange={(e) => setTwinConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm <b>{preview.a.name}</b> and <b>{preview.b.name}</b> are the{' '}
                  <b>same person</b>. They are identical on screen, so the tool can&apos;t verify this for me.
                </span>
              </label>
            )}
            {mergeBlocked ? (
              <p className="mb-2.5 rounded-[13px] border border-[#ef4444]/30 bg-[#ef4444]/[.08] px-3.5 py-3 text-[13px] leading-[1.55] text-[#fca5a5]">
                {oppositeBlocked
                  ? `These records were opponents in ${preview.oppositeTeamGames} game${preview.oppositeTeamGames === 1 ? '' : 's'} — merging is blocked. If they really are one person, this isn't the tool for it.`
                  : `${loser.name} holds the pinned ${preview.pinnedBadge?.badge} badge. Flip the survivor toggle above to keep them, then you can merge.`}
              </p>
            ) : (
              <p className="mb-2.5 px-0.5 text-[13px] leading-[1.55] text-[#94a3b8]">
                To merge, type the survivor&apos;s full name —{' '}
                <b className="text-[#f0f0f8]">{survivor.name}</b>. This joins{' '}
                <b className="text-[#f0f0f8]">{combinedGames} games</b> under one record and deletes{' '}
                <b className="text-[#f0f0f8]">{loser.name}</b>.
              </p>
            )}
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type the survivor’s name"
              autoComplete="off"
              spellCheck={false}
              disabled={mergeBlocked}
              className={`w-full rounded-xl border bg-[#1a1a28] px-3.5 py-3 text-base text-[#f0f0f8] placeholder-[#555570] focus:outline-none disabled:opacity-50 ${
                confirmReady ? 'border-[#22c55e]' : 'border-white/[.06] focus:border-[#fb923c]'
              }`}
            />
            {mergeError && <p className="mt-2.5 text-sm text-[#ef4444]">{mergeError}</p>}
            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                onClick={backToPick}
                className="flex-1 rounded-[13px] border border-white/[.06] py-3.5 text-sm font-bold text-[#94a3b8]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!confirmReady || merging || mergeBlocked || (needsTwinConfirm && !twinConfirmed)}
                onClick={() => void runMerge()}
                className="flex-1 rounded-[13px] bg-[#dc2626] py-3.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {merging ? 'Merging…' : `Merge ${combinedGames} games`}
              </button>
            </div>
            <p className="mt-2.5 text-center text-[11px] text-[#555570]">
              Survivor <b className="text-[#94a3b8]">{survivor.name}</b> · removes{' '}
              <b className="text-[#94a3b8]">{loser.name}</b> · {gamesMoved} games move
            </p>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="rounded-xl border border-white/[.08] bg-[#111118] px-4 py-3 text-sm font-semibold text-[#f0f0f8] shadow-xl">
            {toast}
          </div>
        </div>
      )}
    </main>
  )
}

// ── Small presentational helpers ────────────────────────────────────────────

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div
      className={`flex min-h-screen items-center justify-center bg-[#08080e] ${
        tone === 'error' ? 'text-[#ef4444]' : 'text-[#94a3b8]'
      }`}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-[22px] px-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#555570]">
      {children}
    </div>
  )
}

function TierTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-3.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#555570]">
      {children}
    </div>
  )
}

function RecordCard({ rec }: { rec: RecordSummary }) {
  return (
    <div className="rounded-[14px] border border-white/[.06] bg-[#1a1a28] p-[13px]">
      <div className="font-condensed text-[21px] font-bold leading-[1.05]">{rec.name}</div>
      <div className="mt-px min-h-[15px] text-xs text-[#94a3b8]">
        {rec.nickname ? `“${rec.nickname}”` : 'no nickname'}
      </div>
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          rec.isActive ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-white/[.06] text-[#555570]'
        }`}
      >
        {rec.isActive ? 'Active' : 'Inactive'}
      </span>
      <div className="mt-[11px] flex flex-col gap-[5px]">
        <MetaRow k="Since" v={rec.firstYear ? String(rec.firstYear) : '—'} />
        <MetaRow k="Games" v={String(rec.totalGames)} big />
        <MetaRow k="Last played" v={fmtDate(rec.lastPlayed)} />
      </div>
    </div>
  )
}

function MetaRow({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#555570]">{k}</span>
      <span className={`tabular-nums text-[#f0f0f8] ${big ? 'text-[13px] font-bold' : 'font-medium'}`}>
        {v}
      </span>
    </div>
  )
}

function Chip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[10px] border px-2 py-2.5 text-center text-[13px] transition-colors ${
        selected
          ? 'border-[#fb923c] bg-[#fb923c]/[.06] font-semibold text-[#f0f0f8]'
          : 'border-white/[.06] bg-[#1a1a28] text-[#94a3b8]'
      }`}
    >
      {children}
    </button>
  )
}

const FLAG_TONES = {
  red: 'border-[#ef4444]/30 bg-[#ef4444]/[.08] text-[#fca5a5]',
  amber: 'border-[#fb923c]/30 bg-[#fb923c]/[.08] text-[#fdba74]',
  clear: 'border-white/[.06] bg-[#1a1a28] text-[#22c55e]',
  plain: 'border-white/[.06] bg-[#1a1a28] text-[#f0f0f8]',
} as const

function Flag({
  tone,
  title,
  children,
}: {
  tone: keyof typeof FLAG_TONES
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={`mb-2.5 rounded-[13px] border px-[13px] py-3 ${FLAG_TONES[tone]}`}>
      <div className="flex items-center gap-2 text-[13px] font-bold">{title}</div>
      <div className="mt-[5px] text-[12.5px] leading-[1.5] text-[#94a3b8]">{children}</div>
    </div>
  )
}

function Timeline({ preview, survivorId }: { preview: MergePreview; survivorId: string | null }) {
  const idForRecord = (r: 'a' | 'b') => (r === 'a' ? preview.a.id : preview.b.id)
  // Dates where both records appear → overlap bands.
  const datesA = new Set(preview.timeline.filter((t) => t.record === 'a').map((t) => t.date))
  const datesB = new Set(preview.timeline.filter((t) => t.record === 'b').map((t) => t.date))
  const overlapDates = new Set(Array.from(datesA).filter((d) => datesB.has(d)))
  let bandShown = false

  return (
    <div>
      <div className="my-2.5 flex gap-3.5 text-[11px] text-[#94a3b8]">
        <span>
          <i
            className="mr-1.5 inline-block h-[9px] w-[9px] rounded-[3px] align-middle"
            style={{ backgroundColor: INDIGO }}
          />
          {preview.a.id === survivorId ? preview.b.name : preview.a.name} (other)
        </span>
        <span>
          <i
            className="mr-1.5 inline-block h-[9px] w-[9px] rounded-[3px] align-middle"
            style={{ backgroundColor: ACCENT }}
          />
          {preview.a.id === survivorId ? preview.a.name : preview.b.name} (survivor)
        </span>
      </div>
      <div className="ml-1.5 border-l border-white/[.06] pl-4">
        {preview.timeline.map((t, i) => {
          const isSurvivor = idForRecord(t.record) === survivorId
          const color = isSurvivor ? ACCENT : INDIGO
          const overlap = overlapDates.has(t.date)
          const showBand = overlap && !bandShown
          if (showBand) bandShown = true
          return (
            <div key={`${t.record}-${t.date}-${i}`}>
              {showBand && (
                <div className="my-1 ml-1 text-[10.5px] font-bold uppercase tracking-wide text-[#fdba74]">
                  — both records here —
                </div>
              )}
              <div
                className={`relative flex items-center justify-between py-1.5 pl-1 text-[12.5px] ${
                  overlap ? '-mx-1.5 rounded-lg bg-[#fb923c]/[.08] px-2.5' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <i
                    className="inline-block h-[9px] w-[9px] flex-none rounded-[3px]"
                    style={{ backgroundColor: color }}
                  />
                  <span className="tabular-nums text-[#94a3b8]">{fmtDate(t.date)}</span>
                </span>
                <span className="font-semibold">
                  {t.games} game{t.games === 1 ? '' : 's'} ·{' '}
                  <span className="text-[#22c55e]">{t.wins}</span>–
                  <span className="text-[#ef4444]">{t.losses}</span>
                  {t.ties > 0 ? <span className="text-[#94a3b8]">–{t.ties}T</span> : null}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mx-1 mb-0.5 mt-2.5 text-[11.5px] leading-[1.5] text-[#555570]">
        A clean handoff — one record going quiet as the other picks up, with brief overlap — reads
        like one person. Long stretches where both are clearly active read like two.
      </p>
    </div>
  )
}
