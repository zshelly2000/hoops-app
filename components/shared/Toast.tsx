'use client'

import { useEffect, useState } from 'react'

interface Props {
  message: string
  type?: 'success' | 'error'
  onDismiss: () => void
}

export function Toast({ message, type = 'success', onDismiss }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, 2500)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const bg = type === 'success' ? 'bg-green-600' : 'bg-red-600'

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-white font-semibold shadow-lg transition-all duration-300 ${bg} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {message}
    </div>
  )
}
