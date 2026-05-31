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
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe">
      <div className="glass-nav mx-auto mb-3 max-w-lg overflow-hidden">
        <ul className="flex p-1.5">
          {links.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <li key={link.href} className="flex-1">
                <Link
                  href={link.href}
                  className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                    active ? 'nav-tab-active text-orange-400' : 'text-white/35 hover:text-white/60'
                  }`}
                >
                  <span className="text-lg leading-none">{link.icon}</span>
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
