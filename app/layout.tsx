import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Barlow_Condensed, Inter } from 'next/font/google'
import { Nav } from '@/components/shared/Nav'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})

// Plasma Tangerine type system (additive — Geist stays the app default).
// Barlow Condensed for display headings, Inter for body in new Plasma surfaces.
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow-condensed',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Hoops Tracker',
  description: 'Track pickup basketball stats',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08080e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${barlowCondensed.variable} ${inter.variable} bg-canvas font-sans antialiased`}>
        {children}
        <Nav />
      </body>
    </html>
  )
}
