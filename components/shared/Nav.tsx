'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/courtside', label: 'Courtside', icon: '🏀' },
  { href: '/dashboard', label: 'Stats', icon: '📊' },
  { href: '/sessions', label: 'Sessions', icon: '📅' },
  { href: '/players', label: 'Roster', icon: '👥' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950 pb-safe">
      <ul className="flex">
        {links.map((link) => {
          const active = pathname.startsWith(link.href)
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors ${
                  active ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span className="text-lg leading-none">{link.icon}</span>
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
