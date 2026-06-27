// ============================================================
// Shared player-identity helpers.
// The exact invariant from the duplicate-prevention work, lifted here so the
// merge UI and the merge APIs all compute on-screen identity the same way.
// (AddPlayerModal keeps its own local copies — same logic — and is untouched.)
// ============================================================

/**
 * The single definition of "same identity" for comparison. Lowercase, trim,
 * strip apostrophes (straight and curly) and periods so punctuation drift
 * doesn't split one person in two ("Mark A'Ala" === "Mark Aala", "T.J." === "TJ"),
 * then collapse internal whitespace. Hyphens are intentionally left alone.
 * Pins, twin detection, and the duplicate-prevention guards all inherit this.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['’.]/g, '')
    .replace(/\s+/g, ' ')
}

/** The on-screen short name / display token: nickname, else first word of full name. */
export function displayToken(name: string, nickname: string | null): string {
  const nick = nickname?.trim()
  if (nick) return nick
  return name.trim().split(/\s+/)[0] ?? ''
}

/**
 * Two records share an on-screen identity when they normalize to the same full
 * name AND the same display token — a human can't tell them apart on a tile.
 */
export function sameOnScreenIdentity(
  a: { name: string; nickname: string | null },
  b: { name: string; nickname: string | null },
): boolean {
  return (
    normalize(a.name) === normalize(b.name) &&
    normalize(displayToken(a.name, a.nickname)) === normalize(displayToken(b.name, b.nickname))
  )
}

/** Levenshtein distance, dependency-free — near-spelling detector for the dup hunt. */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

// ============================================================
// Pinned all-time badges.
// hoops-app has no badge system of its own (those live in the read-only
// hoops-stats portal), so the pinned holders are keyed here by normalized name,
// the only stable handle we have. Matching is name-based, via the shared `normalize`
// (so it's case-, space-, and punctuation-insensitive).
// ============================================================

export interface PinnedBadge {
  badge: string
  holderName: string
}

export const PINNED_BADGES: PinnedBadge[] = [
  { badge: 'Scorekeeper', holderName: 'Colin Montague' },
  { badge: 'The Anchor', holderName: "Mark A'Ala" },
  { badge: 'The Legend', holderName: 'Zach Knowlton' },
]

/**
 * Returns the pinned badge a player holds, matched by normalized name. Punctuation
 * folding (e.g. the canonical "Mark A'Ala" matching the stored "Mark Aala") comes
 * from `normalize` itself now — there is no pin-specific comparator.
 */
export function pinnedBadgeFor(player: { name: string }): PinnedBadge | null {
  const n = normalize(player.name)
  return PINNED_BADGES.find((b) => normalize(b.holderName) === n) ?? null
}
