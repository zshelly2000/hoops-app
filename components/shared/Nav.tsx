'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/courtside', label: 'Courtside', icon: '🏀' },
  { href: '/dashboard', label: 'Stats', icon: '📊' },
  { href: '/sessions', label: 'Sessions', icon: '📅' },
  { href: '/players', label: 'Roster', icon: '👥' },
]

export { links as navLinks }

// Inline SVG icons for the bottom bar (portal set). Keyed by href; the on-demand
// nav sheet keeps the emoji from `links` above.
function NavIcon({ href }: { href: string }) {
  switch (href) {
    case '/courtside':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6c3.5 2.6 3.5 10.2 0 12.8M18.4 5.6c-3.5 2.6-3.5 10.2 0 12.8" />
        </svg>
      )
    case '/dashboard':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M4 13h3v7H4v-7zm6.5-6h3v13h-3V7zM17 10h3v10h-3V10z" />
        </svg>
      )
    case '/sessions':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
        </svg>
      )
    case '/players':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      )
    default:
      return null
  }
}

// The rendered nav bar, no route guard — usable anywhere (e.g. the courtside
// start screen, which suppresses the global Nav but still needs navigation).
export function NavBar() {
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
                    active ? 'nav-tab-active text-accent' : 'text-white/35 hover:text-white/60'
                  }`}
                >
                  <span className="leading-none"><NavIcon href={link.href} /></span>
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

// Global nav rendered from the root layout. Courtside screens own the full
// viewport with their own pinned bottom bar, so the nav is suppressed there;
// the courtside start screen renders <NavBar /> directly instead, and the
// in-session screens expose nav links via an on-demand bottom sheet.
export function Nav() {
  const pathname = usePathname()
  if (pathname.startsWith('/courtside')) return null
  // Auth/system screens stand alone — no app chrome until you're in a universe.
  if (
    pathname.startsWith('/login') ||
    pathname === '/update-password' ||
    pathname === '/no-universe' ||
    pathname === '/pick-universe'
  ) {
    return null
  }
  return <NavBar />
}
