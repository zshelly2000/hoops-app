import { useEffect, useRef, useState } from 'react'

/**
 * Pull-to-refresh hook. Attaches touch listeners to window and calls
 * onRefresh() when the user pulls down ≥80px from the top of the page.
 * Only activates when the page is already scrolled to the top.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Store the latest callback in a ref so the stable effect closure always
  // calls the current version without needing it as a dependency.
  const onRefreshRef = useRef(onRefresh)
  const touchStartY = useRef(0)
  const isPulling = useRef(false)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY
        isPulling.current = true
      } else {
        isPulling.current = false
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!isPulling.current) return
      isPulling.current = false
      const dy = e.changedTouches[0].clientY - touchStartY.current
      if (dy >= 80) {
        setIsRefreshing(true)
        void onRefreshRef.current().finally(() => setIsRefreshing(false))
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return { isRefreshing }
}
