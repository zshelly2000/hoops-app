import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Nav } from '@/components/shared/Nav'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
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
      <body className={`${geistSans.variable} bg-canvas font-sans antialiased`}>
        {children}
        <Nav />
      </body>
    </html>
  )
}
