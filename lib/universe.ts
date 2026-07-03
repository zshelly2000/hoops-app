// The universe (tenant) this deployment writes into. Every Supabase write
// must name it explicitly — the DB column defaults are dropped at the end of
// multi-tenant Phase 2, after which an omitted universe_id fails loudly.
const universeId = process.env.NEXT_PUBLIC_UNIVERSE_ID

if (!universeId) {
  throw new Error(
    'NEXT_PUBLIC_UNIVERSE_ID is not set. Add it to .env.local (see .env.example) — every DB write must name its universe.'
  )
}

export const UNIVERSE_ID: string = universeId
