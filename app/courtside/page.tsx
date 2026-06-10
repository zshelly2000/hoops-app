'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIn } from '@/components/courtside/CheckIn'
import { PaintMode } from '@/components/courtside/PaintMode'
import { ScoreKeypad } from '@/components/courtside/ScoreKeypad'
import { PostGameChips } from '@/components/courtside/PostGameChips'
import { AddPlayerModal } from '@/components/courtside/AddPlayerModal'
import { LocationPill, InlineLocationPicker, getDefaultLocation, saveDefaultLocation } from '@/components/courtside/LocationPill'
import type { SavedGameEntry } from '@/components/courtside/GameLogStrip'
import { useRetryQueue } from '@/hooks/useRetryQueue'
import type { QueueItem } from '@/hooks/useRetryQueue'
import type { Player, Session, TeamSlot } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'start' | 'checkin' | 'paint' | 'score' | 'postgame'

interface UndoTarget {
  gameId: string | null  // null = still pending in queue
  localId: string
  gameNumber: number
  team1Players: string[]
  team2Players: string[]
  t1Score: number
  t2Score: number
  wasGame1: boolean
  sessionId: string
}

interface StashedSquad {
  squad: string[]
  squadOrder: string[]
  assignments: [string, TeamSlot][]
  t1Score: string
  t2Score: string
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STASH_KEY = 'hoops_stashed_squad'
const squadKey = (id: string) => `hoops_squad_${id}`
const draftKey = (id: string) => `hoops_draft_${id}`

function loadJSON<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T } catch { return null }
}

function saveJSON(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val))
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function sortPlayers(players: Player[], lastPlayed: Record<string, string>): Player[] {
  const sn = (p: Player) => p.nickname ?? p.name.split(' ')[0]
  const played = players.filter((p) => lastPlayed[p.id]).sort((a, b) =>
    lastPlayed[b.id].localeCompare(lastPlayed[a.id]),
  )
  const never = players
    .filter((p) => !lastPlayed[p.id])
    .sort((a, b) => sn(a).localeCompare(sn(b)))
  return [...played, ...never]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CourtsidePage() {
  const router = useRouter()

  // Navigation
  const [screen, setScreen] = useState<Screen>('start')
  const [squadOverlayOpen, setSquadOverlayOpen] = useState(false)

  // Data
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [lastPlayed, setLastPlayed] = useState<Record<string, string>>({})
  const [session, setSession] = useState<Session | null>(null)
  const [savedGames, setSavedGames] = useState<SavedGameEntry[]>([])
  const [location, setLocation] = useState('Natomas')
  const [loading, setLoading] = useState(true)

  // Squad — stable ordered array for paint grid; set for quick membership checks
  const [squadIds, setSquadIds] = useState<Set<string>>(new Set())
  const [squadOrder, setSquadOrder] = useState<string[]>([])

  // Game draft
  const [activeBrush, setActiveBrush] = useState<TeamSlot>(1)
  const [assignments, setAssignments] = useState<Map<string, TeamSlot>>(new Map())
  const [t1Score, setT1Score] = useState('')
  const [t2Score, setT2Score] = useState('')

  // Post-game
  const [lastGameInfo, setLastGameInfo] = useState<{ number: number; winnerTeam: 1 | 2 | null } | null>(null)

  // Undo
  const [undoTarget, setUndoTarget] = useState<UndoTarget | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // UI
  const [submitting, setSubmitting] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [pendingBanner, setPendingBanner] = useState(false)
  const [showEndSession, setShowEndSession] = useState(false)
  const [showLocationChange, setShowLocationChange] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error'; key: number } | null>(null)
  const [gameCount, setGameCount] = useState(0)

  // Retry queue
  const { queue, enqueue, dequeueFirst, removeGame, removeReactivate } = useRetryQueue()
  const processingRef = useRef(false)

  // ─── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setLocation(getDefaultLocation())
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [playersRes, statsRes] = await Promise.all([
          fetch('/api/players', { cache: 'no-store' }),
          fetch('/api/stats', { cache: 'no-store' }),
        ])

        const playersData = await playersRes.json() as Player[]
        setAllPlayers(playersData)

        let lp: Record<string, string> = {}
        if (statsRes.ok) {
          const stats = await statsRes.json() as { player_id: string; last_played: string | null }[]
          stats.forEach((s) => { if (s.last_played) lp[s.player_id] = s.last_played })
        }
        setLastPlayed(lp)

        const today = new Date().toLocaleDateString('en-CA')
        const sessRes = await fetch(`/api/sessions?date=${today}`, { cache: 'no-store' })
        if (sessRes.ok) {
          const sessions = await sessRes.json() as Session[]
          const todaySession = sessions.find((s) => s.session_date === today && !s.is_complete)
          if (todaySession) {
            setSession(todaySession)
            if (todaySession.location) setLocation(todaySession.location)

            const gamesRes = await fetch(`/api/sessions/${todaySession.id}/games`, { cache: 'no-store' })
            if (gamesRes.ok) {
              const games = await gamesRes.json() as SavedGameEntry[]
              setSavedGames(games)
              setGameCount(games.length)
            }

            // Restore squad
            const savedSquad = loadJSON<string[]>(squadKey(todaySession.id))
            if (savedSquad) {
              setSquadIds(new Set(savedSquad))
              setSquadOrder(savedSquad)
            }

            // Restore draft
            const draft = loadJSON<{ assignments: [string, TeamSlot][]; t1: string; t2: string; screen: Screen }>(draftKey(todaySession.id))
            if (draft) {
              setAssignments(new Map(draft.assignments))
              setT1Score(draft.t1)
              setT2Score(draft.t2)
              const validScreen = draft.screen === 'paint' || draft.screen === 'score' ? draft.screen : 'checkin'
              const hasSquad = savedSquad && savedSquad.length >= 2
              setScreen(hasSquad ? validScreen : 'checkin')
            } else {
              setScreen(savedSquad && savedSquad.length >= 2 ? 'paint' : 'checkin')
            }
          }
        }
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [])

  // ─── Draft persistence ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return
    if (squadOrder.length > 0) {
      saveJSON(squadKey(session.id), squadOrder)
    }
  }, [session, squadOrder])

  useEffect(() => {
    if (!session) return
    if (screen === 'paint' || screen === 'score') {
      saveJSON(draftKey(session.id), {
        assignments: Array.from(assignments.entries()),
        t1: t1Score,
        t2: t2Score,
        screen,
      })
    }
  }, [session, assignments, t1Score, t2Score, screen])

  // ─── Retry queue processing ───────────────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (processingRef.current || queue.length === 0) return
    processingRef.current = true
    const item = queue[0]
    try {
      if (item.type === 'game') {
        const res = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: item.sessionId,
            team1_score: item.team1_score,
            team2_score: item.team2_score,
            team1_players: item.team1_players,
            team2_players: item.team2_players,
          }),
        })
        if (!res.ok) throw new Error('game post failed')
        const game = await res.json() as SavedGameEntry
        // Replace the local entry with the real one
        setSavedGames((prev) =>
          prev.map((g) => g.id === item.localId ? { ...game } : g),
        )
        // Update any undo target that was pointing at the local id
        setUndoTarget((prev) =>
          prev?.localId === item.localId ? { ...prev, gameId: game.id } : prev,
        )
        dequeueFirst()
      } else if (item.type === 'reactivate') {
        const res = await fetch(`/api/players/${item.playerId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true }),
        })
        if (!res.ok) throw new Error('reactivate failed')
        setAllPlayers((prev) =>
          prev.map((p) => p.id === item.playerId ? { ...p, is_active: true } : p),
        )
        dequeueFirst()
      }
    } catch {
      // Leave at front of queue — retry on next trigger
    } finally {
      processingRef.current = false
    }
  }, [queue, dequeueFirst])

  // Trigger on queue changes, online, and visibility
  useEffect(() => {
    void processQueue()
  }, [processQueue])

  useEffect(() => {
    function onOnline() { void processQueue() }
    function onVisibility() { if (document.visibilityState === 'visible') void processQueue() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [processQueue])

  // Pending banner
  useEffect(() => {
    setPendingBanner(queue.some((i) => i.type === 'game'))
  }, [queue])

  // ─── Toast ────────────────────────────────────────────────────────────────────

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type, key: Date.now() })
  }

  // ─── Undo ─────────────────────────────────────────────────────────────────────

  function startUndoTimer(target: UndoTarget) {
    setUndoTarget(target)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => {
      setUndoTarget(null)
    }, 8000)
  }

  async function handleUndo() {
    if (!undoTarget) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTarget(null)

    const { gameId, localId, wasGame1, sessionId, team1Players, team2Players, t1Score: prevT1, t2Score: prevT2, gameNumber } = undoTarget

    if (gameId === null) {
      // Game is still in the retry queue — remove it, no DELETE needed
      removeGame(localId)
      // Restore draft
      setAssignments(buildAssignmentsFromSavedTeams(team1Players, team2Players))
      setT1Score(String(prevT1))
      setT2Score(String(prevT2))
      setGameCount((c) => c - 1)
      setSavedGames((prev) => prev.filter((g) => g.id !== localId))
      setScreen('paint')
      showToast('Undone — game removed from queue')
      return
    }

    try {
      const res = await fetch(`/api/games/${gameId}`, { method: 'DELETE' })
      if (!res.ok) {
        showToast('Undo failed', 'error')
        return
      }
      const body = await res.json() as { prev_session_id?: string }

      setSavedGames((prev) => prev.filter((g) => g.id !== gameId))
      setGameCount((c) => c - 1)

      if (wasGame1) {
        // Session was auto-deleted. Stash squad + teams so the next session can restore them.
        const stash: StashedSquad = {
          squad: Array.from(squadIds),
          squadOrder,
          assignments: team1Players.map((id): [string, TeamSlot] => [id, 1]).concat(team2Players.map((id): [string, TeamSlot] => [id, 2])),
          t1Score: String(prevT1),
          t2Score: String(prevT2),
        }
        saveJSON(STASH_KEY, stash)
        // Clear session-scoped localStorage
        if (session) {
          localStorage.removeItem(squadKey(session.id))
          localStorage.removeItem(draftKey(session.id))
        }
        setSession(null)
        setSquadIds(new Set())
        setSquadOrder([])
        setAssignments(new Map())
        setT1Score('')
        setT2Score('')
        setSavedGames([])
        setGameCount(0)
        setScreen('start')
        showToast('Game 1 undone. Session reset — squad kept.')

        // If the deleted session was complete and we got a prev_session_id, regen narrative
        if (body.prev_session_id) {
          fetch('/api/narratives/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: body.prev_session_id }),
          }).catch(() => {})
        }
      } else {
        // Normal undo: restore teams and go back to paint
        setAssignments(buildAssignmentsFromSavedTeams(team1Players, team2Players))
        setT1Score(String(prevT1))
        setT2Score(String(prevT2))
        setScreen('paint')
        showToast(`Game ${gameNumber} undone`)
      }
    } catch {
      showToast('Undo failed', 'error')
    }
  }

  function buildAssignmentsFromSavedTeams(t1: string[], t2: string[]): Map<string, TeamSlot> {
    const map = new Map<string, TeamSlot>()
    t1.forEach((id) => map.set(id, 1))
    t2.forEach((id) => map.set(id, 2))
    return map
  }

  // ─── Session management ───────────────────────────────────────────────────────

  const [startingSession, setStartingSession] = useState(false)

  async function startSession() {
    setStartingSession(true)
    try {
      const today = new Date().toLocaleDateString('en-CA')
      const currentLocation = getDefaultLocation()
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: today, location: currentLocation }),
      })
      if (!res.ok) throw new Error('Failed to start session')
      const sess = await res.json() as Session
      setSession(sess)
      setLocation(sess.location ?? currentLocation)
      setGameCount(0)
      setSavedGames([])
      setAssignments(new Map())
      setT1Score('')
      setT2Score('')

      // Check for stashed squad from a game-1 undo
      const stash = loadJSON<StashedSquad>(STASH_KEY)
      if (stash) {
        localStorage.removeItem(STASH_KEY)
        const ids = new Set(stash.squad)
        setSquadIds(ids)
        setSquadOrder(stash.squadOrder)
        setAssignments(new Map(stash.assignments))
        setT1Score(stash.t1Score)
        setT2Score(stash.t2Score)
        saveJSON(squadKey(sess.id), stash.squadOrder)
        setScreen('paint')
        showToast('Squad kept from last session')
      } else {
        // Fresh start: build squad from sorted active players (use all active as starting suggestion)
        const active = allPlayers.filter((p) => p.is_active)
        const sorted = sortPlayers(active, lastPlayed)
        const order = sorted.map((p) => p.id)
        setSquadIds(new Set())
        setSquadOrder(order)
        setScreen('checkin')
      }

      router.refresh()
    } catch {
      showToast('Failed to start session', 'error')
    } finally {
      setStartingSession(false)
    }
  }

  // ─── Squad management ─────────────────────────────────────────────────────────

  function toggleSquad(playerId: string) {
    setSquadIds((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
        setSquadOrder((o) => o.filter((id) => id !== playerId))
      } else {
        next.add(playerId)
        setSquadOrder((o) => {
          // Only add if not already in order
          if (o.includes(playerId)) return o
          return [...o, playerId]
        })
      }
      return next
    })
  }

  function handleReactivate(player: Player) {
    // Optimistically add to squad
    const alreadyInSquad = squadIds.has(player.id)
    if (!alreadyInSquad) {
      setSquadIds((prev) => new Set(Array.from(prev).concat(player.id)))
      setSquadOrder((o) => (o.includes(player.id) ? o : [...o, player.id]))
    }
    // Update allPlayers optimistically
    setAllPlayers((prev) =>
      prev.map((p) => p.id === player.id ? { ...p, is_active: true } : p),
    )
    showToast(`${player.nickname ?? player.name} reactivated & checked in ✓`)

    // Queue the PATCH
    const item: QueueItem = {
      type: 'reactivate',
      playerId: player.id,
      playerName: player.nickname ?? player.name,
    }
    // Remove any existing reactivate for this player before adding
    removeReactivate(player.id)
    enqueue(item)
  }

  function handlePlayerAdded(player: Player) {
    setShowAddPlayer(false)
    const alreadyExists = allPlayers.some((p) => p.id === player.id)

    if (alreadyExists) {
      // Match was tapped — this is an existing player (active or reactivated)
      const existing = allPlayers.find((p) => p.id === player.id)
      if (existing && !existing.is_active) {
        handleReactivate(existing)
      } else {
        // Already active — just check in
        if (!squadIds.has(player.id)) toggleSquad(player.id)
        showToast(`${player.nickname ?? player.name} checked in ✓`)
      }
    } else {
      // Newly created player
      setAllPlayers((prev) => sortPlayers([...prev, player], lastPlayed))
      setSquadIds((prev) => new Set(Array.from(prev).concat(player.id)))
      setSquadOrder((o) => [...o, player.id])
      showToast(`${player.nickname ?? player.name} added & checked in ✓`)
    }
  }

  // ─── Game assignment ──────────────────────────────────────────────────────────

  function handleAssign(playerId: string, team: TeamSlot | null) {
    setAssignments((prev) => {
      const next = new Map(prev)
      if (team === null) next.delete(playerId)
      else next.set(playerId, team)
      return next
    })
  }

  // ─── Submit game ──────────────────────────────────────────────────────────────

  async function submitGame() {
    if (!session) return
    setSubmitting(true)

    const team1PlayerIds = squadOrder.filter((id) => assignments.get(id) === 1)
    const team2PlayerIds = squadOrder.filter((id) => assignments.get(id) === 2)
    const t1Num = parseInt(t1Score, 10)
    const t2Num = parseInt(t2Score, 10)
    const isTie = t1Num === t2Num
    const winnerTeam: 1 | 2 | null = isTie ? null : t1Num > t2Num ? 1 : 2
    const newCount = gameCount + 1
    const localId = `local-${Date.now()}`

    // Optimistic update
    const optimisticEntry: SavedGameEntry = {
      id: localId,
      game_number: newCount,
      team1_score: t1Num,
      team2_score: t2Num,
    }
    setSavedGames((prev) => [...prev, optimisticEntry])
    setGameCount(newCount)

    // Clear draft for next game
    setAssignments(new Map())
    setT1Score('')
    setT2Score('')

    setLastGameInfo({ number: newCount, winnerTeam })
    setScreen('postgame')

    // Start undo timer — initially points at localId (no server id yet)
    startUndoTimer({
      gameId: null,
      localId,
      gameNumber: newCount,
      team1Players: team1PlayerIds,
      team2Players: team2PlayerIds,
      t1Score: t1Num,
      t2Score: t2Num,
      wasGame1: newCount === 1,
      sessionId: session.id,
    })

    // Try to POST
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          team1_score: t1Num,
          team2_score: t2Num,
          team1_players: team1PlayerIds,
          team2_players: team2PlayerIds,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      const game = await res.json() as SavedGameEntry
      // Replace optimistic entry
      setSavedGames((prev) => prev.map((g) => g.id === localId ? game : g))
      // Update undo target with real id
      setUndoTarget((prev) =>
        prev?.localId === localId ? { ...prev, gameId: game.id } : prev,
      )
      router.refresh()
    } catch {
      // Go offline — put in retry queue
      enqueue({
        type: 'game',
        localId,
        sessionId: session.id,
        team1_score: t1Num,
        team2_score: t2Num,
        team1_players: team1PlayerIds,
        team2_players: team2PlayerIds,
        localGameNumber: newCount,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Post-game navigation ─────────────────────────────────────────────────────

  function handleRunback() {
    if (!lastGameInfo) return
    // Re-apply the same assignments that were just saved
    // (they were cleared — need to restore from undo target if available)
    if (undoTarget) {
      setAssignments(buildAssignmentsFromSavedTeams(undoTarget.team1Players, undoTarget.team2Players))
    }
    setScreen('paint')
    setActiveBrush(1)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTarget(null)
  }

  function handleWinnersStay() {
    if (!lastGameInfo || !undoTarget) return
    const winnerIds = lastGameInfo.winnerTeam === 1 ? undoTarget.team1Players : undoTarget.team2Players
    const next = new Map<string, TeamSlot>()
    winnerIds.forEach((id) => next.set(id, 1))
    setAssignments(next)
    setActiveBrush(2)
    setScreen('paint')
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTarget(null)
  }

  function handleFresh() {
    setAssignments(new Map())
    setActiveBrush(1)
    setScreen('paint')
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTarget(null)
  }

  // ─── End session ──────────────────────────────────────────────────────────────

  async function handleEndSession() {
    if (!session) return
    const sessionId = session.id
    try {
      const res = await fetch(`/api/sessions/${sessionId}/complete`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Failed to end session')
    } catch {
      showToast('Failed to end session', 'error')
      return
    }

    setShowEndSession(false)
    setShowLocationChange(false)
    showToast('Rundown generating… 📰')
    setSession(null)
    setGameCount(0)
    setAssignments(new Map())
    setT1Score('')
    setT2Score('')
    setSavedGames([])
    setSquadIds(new Set())
    setSquadOrder([])
    setScreen('start')
    localStorage.removeItem(squadKey(sessionId))
    localStorage.removeItem(draftKey(sessionId))

    fetch('/api/narratives/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {})
  }

  // ─── Location change ──────────────────────────────────────────────────────────

  function handleLocationChange(loc: string) {
    setLocation(loc)
    saveDefaultLocation(loc)
  }

  // ─── Squad overlay ────────────────────────────────────────────────────────────

  function openSquadOverlay() { setSquadOverlayOpen(true) }
  function closeSquadOverlay() { setSquadOverlayOpen(false) }

  // ─── Derived squad players ────────────────────────────────────────────────────

  const playerMap = new Map(allPlayers.map((p) => [p.id, p]))
  const squadPlayers = squadOrder
    .filter((id) => squadIds.has(id) && playerMap.has(id))
    .map((id) => playerMap.get(id)!)

  const team1Players = squadPlayers.filter((p) => assignments.get(p.id) === 1)
  const team2Players = squadPlayers.filter((p) => assignments.get(p.id) === 2)

  // ─── Bottom offset for undo toast (above pinned bar) ─────────────────────────

  const undoToastBottom =
    screen === 'paint' ? 'calc(env(safe-area-inset-bottom) + 170px)' :
    screen === 'score' ? 'calc(env(safe-area-inset-bottom) + 90px)' :
    'calc(env(safe-area-inset-bottom) + 24px)'

  // ─── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#08080e]">
        <p className="text-[#94a3b8]">Loading…</p>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Start screen ── */}
      {screen === 'start' && (
        <main className="flex h-[100dvh] flex-col items-center justify-center bg-[#08080e] px-6">
          <div className="w-full max-w-sm text-center">
            <div className="mb-4 text-5xl">🏀</div>
            <h1 className="mb-2 text-2xl font-black text-[#f0f0f8]">Courtside</h1>
            <p className="mb-8 text-sm text-[#94a3b8]">Start a session to begin logging games.</p>
            <button
              onClick={() => void startSession()}
              disabled={startingSession}
              className="w-full rounded-2xl bg-[#fb923c] px-8 py-5 text-xl font-black text-white shadow-lg disabled:opacity-50 hover:bg-orange-300 active:scale-95 transition-all"
            >
              {startingSession ? 'Starting…' : "Start Today's Run"}
            </button>
          </div>
        </main>
      )}

      {/* ── Check-In (full screen, not overlay) ── */}
      {screen === 'checkin' && !squadOverlayOpen && session && (
        <CheckIn
          allPlayers={allPlayers}
          lastPlayed={lastPlayed}
          squad={squadIds}
          assignments={assignments}
          onToggle={(id) => {
            const player = playerMap.get(id)
            if (!player) return
            if (!player.is_active && !squadIds.has(id)) {
              handleReactivate(player)
            } else {
              toggleSquad(id)
            }
          }}
          onNewPlayer={() => setShowAddPlayer(true)}
          onDone={() => {
            // Finalize squad order (sorted by last-played then alpha)
            const active = allPlayers.filter((p) => p.is_active && squadIds.has(p.id))
            const sorted = sortPlayers(active, lastPlayed)
            const newOrder = sorted.map((p) => p.id)
            setSquadOrder(newOrder)
            setScreen('paint')
          }}
          isOverlay={false}
          gameCount={gameCount}
          location={location}
          session={session}
          onLocationChange={handleLocationChange}
        />
      )}

      {/* ── Paint mode ── */}
      {screen === 'paint' && session && (
        <PaintMode
          squadPlayers={squadPlayers}
          assignments={assignments}
          activeBrush={activeBrush}
          onActiveBrushChange={setActiveBrush}
          onAssign={handleAssign}
          onEnterScore={() => setScreen('score')}
          onSquadChip={openSquadOverlay}
          onEndSession={() => setShowEndSession(true)}
          savedGames={savedGames}
          gameCount={gameCount}
          location={location}
          session={session}
          onLocationChange={handleLocationChange}
          squadCount={squadIds.size}
        />
      )}

      {/* ── Score entry ── */}
      {screen === 'score' && session && (
        <ScoreKeypad
          team1Players={team1Players}
          team2Players={team2Players}
          t1Score={t1Score}
          t2Score={t2Score}
          onScoreChange={(t1, t2) => { setT1Score(t1); setT2Score(t2) }}
          onSave={() => void submitGame()}
          onBack={() => setScreen('paint')}
          saving={submitting}
          savedGames={savedGames}
          gameCount={gameCount}
          location={location}
          session={session}
          onLocationChange={handleLocationChange}
          onSquadChip={openSquadOverlay}
          onEndSession={() => setShowEndSession(true)}
          squadCount={squadIds.size}
        />
      )}

      {/* ── Post-game chips ── */}
      {screen === 'postgame' && session && lastGameInfo && (
        <PostGameChips
          gameNumber={lastGameInfo.number}
          winnerTeam={lastGameInfo.winnerTeam}
          onRunback={handleRunback}
          onWinnersStay={handleWinnersStay}
          onFresh={handleFresh}
          onEndSession={() => setShowEndSession(true)}
          onSquadChip={openSquadOverlay}
          savedGames={savedGames}
          location={location}
          session={session}
          onLocationChange={handleLocationChange}
          squadCount={squadIds.size}
        />
      )}

      {/* ── Squad overlay (mid-session check-in) ── */}
      {squadOverlayOpen && session && (
        <div className="fixed inset-0 z-40">
          <CheckIn
            allPlayers={allPlayers}
            lastPlayed={lastPlayed}
            squad={squadIds}
            assignments={assignments}
            onToggle={(id) => {
              const player = playerMap.get(id)
              if (!player) return
              if (!player.is_active && !squadIds.has(id)) {
                handleReactivate(player)
              } else {
                toggleSquad(id)
              }
            }}
            onNewPlayer={() => setShowAddPlayer(true)}
            onDone={closeSquadOverlay}
            isOverlay={true}
            gameCount={gameCount}
            location={location}
            session={session}
            onLocationChange={handleLocationChange}
          />
        </div>
      )}

      {/* ── Add player modal ── */}
      {showAddPlayer && (
        <AddPlayerModal
          onClose={() => setShowAddPlayer(false)}
          onAdded={handlePlayerAdded}
          allPlayers={allPlayers}
        />
      )}

      {/* ── End session sheet ── */}
      {showEndSession && session && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-t-3xl bg-[#111118] px-6 pb-12 pt-6 shadow-2xl">
            <div className="mb-1 text-center text-xl font-black text-[#f0f0f8]">
              End today&apos;s run?
            </div>
            <p className="mb-1 text-center text-sm text-[#94a3b8]">
              This will generate your Rundown story.
            </p>
            <div className="mb-4 flex items-center justify-center gap-2">
              <span className="text-sm text-[#94a3b8]">📍 {location}</span>
              <button
                onClick={() => setShowLocationChange((v) => !v)}
                className="text-xs text-[#fb923c] underline underline-offset-2 hover:text-orange-300 transition-colors"
              >
                {showLocationChange ? 'Cancel' : 'Change'}
              </button>
            </div>
            {showLocationChange && (
              <InlineLocationPicker
                sessionId={session.id}
                location={location}
                onLocationChange={(loc) => { setLocation(loc); saveDefaultLocation(loc) }}
                onClose={() => setShowLocationChange(false)}
              />
            )}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <button
                onClick={() => { setShowEndSession(false); setShowLocationChange(false) }}
                className="rounded-2xl border border-white/[.06] py-4 text-base font-bold text-[#f0f0f8] transition-all hover:bg-[#1a1a28] active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleEndSession()}
                className="rounded-2xl border border-white/[.06] py-4 text-base font-bold text-[#94a3b8] transition-all hover:bg-[#1a1a28] active:scale-95"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending games banner ── */}
      {pendingBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500/20 border-b border-amber-500/30 px-4 py-2">
          <span className="text-xs font-bold text-amber-300">
            {queue.filter((i) => i.type === 'game').length} game{queue.filter((i) => i.type === 'game').length > 1 ? 's' : ''} pending
          </span>
          <button
            onClick={() => void processQueue()}
            className="text-xs font-black text-amber-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Undo toast ── */}
      {undoTarget && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 w-[calc(100%-28px)] max-w-[400px] rounded-2xl border border-white/[.06] bg-[#1a1a28] px-4 py-3 flex items-center justify-between gap-3 text-[13px] font-bold shadow-2xl transition-all"
          style={{ bottom: undoToastBottom }}
        >
          <span className="text-[#f0f0f8]">Game {undoTarget.gameNumber} saved!</span>
          <button
            onClick={() => void handleUndo()}
            className="text-[#fb923c] font-black text-[13px] border-none bg-none"
          >
            Undo
          </button>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <ToastBubble
          key={toast.key}
          msg={toast.msg}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  )
}

// ─── Simple toast bubble ──────────────────────────────────────────────────────

function ToastBubble({
  msg,
  type,
  onDismiss,
}: {
  msg: string
  type: 'success' | 'error'
  onDismiss: () => void
}) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300) }, 2500)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-5 py-3 text-white text-[13px] font-semibold shadow-lg transition-all duration-300 ${
        type === 'error' ? 'bg-red-600' : 'bg-[#22c55e]'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {msg}
    </div>
  )
}
