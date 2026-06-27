import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        condensed: ['var(--font-barlow-condensed)', 'system-ui', 'sans-serif'],
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#08080e',
        surface: '#111118',
        'surface-raised': '#1a1a28',
        // Plasma Tangerine token layer (additive — portal's exact hex values)
        fg: '#f0f0f8', // primary text (replaces ad-hoc text-white)
        'fg-dim': '#94a3b8', // secondary text (replaces text-slate-400)
        'fg-faint': '#555570', // muted text (replaces text-zinc-500 etc.)
        win: '#22c55e', // replaces text-green-400 for wins
        loss: '#ef4444', // replaces text-red-400 for losses
        accent: '#fb923c', // warm accent (replaces bg-orange-400)
        'accent-cool': '#818cf8',
        'accent-mid': '#c084fc',
        'tier-gold': '#fb923c',
        'tier-silver': '#94a3b8',
        'tier-bronze': '#b45309',
      },
    },
  },
  plugins: [],
}

export default config
