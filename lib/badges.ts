// ============================================================
// Badge display helpers.
// hoops-app has no badge system of its own — hoops-stats computes badges and
// maintains the nightly `badge_holders` table this app reads. That table
// carries badge_id slugs ('the_anchor'), not display names, so we prettify
// the slug here rather than duplicating hoops-stats' badge catalog. Cosmetic
// only: an unknown id falls back to the title-cased slug, never an error.
// ============================================================

/** Slugs whose display name isn't just the title-cased slug. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  goat: 'G.O.A.T.',
  ironman: 'Iron Man',
  upset_king_alltime: 'Upset King',
}

/** 'the_anchor' → 'The Anchor'; overrides for the irregulars above. */
export function badgeDisplayName(badgeId: string): string {
  const override = DISPLAY_OVERRIDES[badgeId]
  if (override) return override
  return badgeId
    .split('_')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}
