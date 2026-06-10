'use client'

import { useCallback, useState } from 'react'

export interface GameQueueItem {
  type: 'game'
  localId: string
  sessionId: string
  team1_score: number
  team2_score: number
  team1_players: string[]
  team2_players: string[]
  localGameNumber: number
}

export interface ReactivateQueueItem {
  type: 'reactivate'
  playerId: string
  playerName: string
}

export type QueueItem = GameQueueItem | ReactivateQueueItem

const STORAGE_KEY = 'hoops_retry_queue'

function loadQueue(): QueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as QueueItem[]
  } catch {
    return []
  }
}

function persist(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

export function useRetryQueue() {
  const [queue, setQueue] = useState<QueueItem[]>(() => loadQueue())

  const enqueue = useCallback((item: QueueItem) => {
    setQueue((prev) => {
      const next = [...prev, item]
      persist(next)
      return next
    })
  }, [])

  const dequeueFirst = useCallback(() => {
    setQueue((prev) => {
      const next = prev.slice(1)
      persist(next)
      return next
    })
  }, [])

  const removeGame = useCallback((localId: string) => {
    setQueue((prev) => {
      const next = prev.filter((i) => !(i.type === 'game' && i.localId === localId))
      persist(next)
      return next
    })
  }, [])

  const removeReactivate = useCallback((playerId: string) => {
    setQueue((prev) => {
      const next = prev.filter((i) => !(i.type === 'reactivate' && i.playerId === playerId))
      persist(next)
      return next
    })
  }, [])

  return { queue, enqueue, dequeueFirst, removeGame, removeReactivate }
}
