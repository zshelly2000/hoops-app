# COURTSIDE_V2.md — Best-in-class between-games score logging

## Branch discipline (do this first)

1. Confirm you are in the **hoops-app** repo (score tracker), branch `main`. State the current branch before doing anything.
2. Create and switch to a new branch: `feature/courtside-v2`. All work happens there. Do not touch `main`.

## Read before writing

Read these files fully before proposing anything:

- `app/courtside/page.tsx`
- `components/courtside/ThreeColumnAssigner.tsx`
- `components/courtside/ScoreEntry.tsx`
- `components/courtside/AddPlayerModal.tsx`
- `components/courtside/LocationPill.tsx`
- `app/api/games/route.ts`, `app/api/games/[id]/route.ts`
- `app/api/sessions/[id]/complete/route.ts`
- `lib/types.ts`
- `COURTSIDE_V2_MOCK.html` in the repo root (the interactive design mock — open it and study the flow, palette usage, and copy; it is the visual source of truth)

## Context: how this app is actually used

The scorekeeper is a **player in the game**. He does not touch the phone during play. Everything happens in a 60–90 second window between games: he recalls the two teams from memory and enters a final score, often winded, one-handed, on gym wifi. Games are 10-minute fixed time; scores are small numbers. Roughly 20 of the ~280 players in the database show up to any given run, and the same ~20 stay for every game that day. Winners usually stay on. Occasionally two courts run concurrently, entered back-to-back.

The current flow makes him pay costs that don't match this reality: the three-column assigner shows the full active-player pool every game in tiny scrolling columns; tap-to-cycle assignment can silently put a player on the wrong team; score entry pops the OS keyboard; Keep Winners is a blocking bottom sheet. The goal of this rebuild is to make the recall-and-record loop as close to zero-friction as physically possible.

## The new flow (replaces the current courtside game-entry UX)

### 1. Session start → Check-In (new screen)

After "Start Today's Run" (keep the existing session-creation flow exactly as it is), the user lands on a Check-In screen.

**Location flow is preserved, not rebuilt.** The existing `LocationPill` and `InlineLocationPicker` components are kept and reused: the tappable location pill lives in the pinned header on every in-session screen, opens the existing picker (select a known venue or enter a new one), persists the change to the session via the existing PATCH, and saves the choice as the localStorage default for next time. Session creation uses the localStorage default location as it does today. The End Session confirmation sheet keeps its current location display + "Change" affordance as a final correctness check before the Rundown generates. If anything in the new layout conflicts with how LocationPill renders, adapt its container styling only — its behavior and API calls are untouched.

The Check-In screen:

- A grid of large tappable player tiles (3 columns), sorted by last-played desc, then never-played alphabetically — reuse the existing sort logic from `app/courtside/page.tsx`.
- Each tile shows short name (nickname ?? first name, with the existing ambiguous-name subtitle behavior) and a small "last played" relative label.
- Tap toggles checked-in state (accent ring + checkmark per the mock).
- Search input filters the grid. "+ New Player" opens the existing AddPlayerModal; a newly added player is auto-checked-in.
- **Reactivating inactive players — explicit mode switch, never mixed in.** The check-in grid AND its search show active players only; inactive players must never appear in the default view or in active-mode search results. Below the grid, a secondary affordance ("Can't find someone? Inactive players →") switches the grid into a visually distinct Inactive mode: alphabetical, searchable, muted tile styling, a clear "INACTIVE" header with a back affordance, last-played date on each tile. Tapping an inactive player reactivates them (`PATCH /api/players/[id]` with `{ is_active: true }` — the route already supports this, no API changes), checks them in, shows a toast ("Robbie reactivated & checked in ✓"), and returns to the active view with their tile checked. If the PATCH fails, keep them in today's squad anyway (squad is client-side) and queue the reactivation in the retry queue.
- **Same-name guard in AddPlayerModal (none exists today — `POST /api/players` will happily create a duplicate).** As the user types a name, live-match case-insensitively against ALL existing players (active and inactive), on both full name and nickname; exact and prefix matching required, fuzzy matching a bonus. Show matches inline in the modal with status (active/inactive) and last-played, each tappable: tapping an active match closes the modal and checks them in; tapping an inactive match reactivates and checks them in. Finding the existing record must always be one tap easier than creating a new one — a duplicate record silently splits a player's game history across two rows and corrupts every downstream stat (RAPM, streaks, BFF/Nemesis) with no visible error.
- **Exact-name collision → nickname required.** If the user proceeds to create a player whose name exactly matches an existing player (this is the legitimate "same name, different person" case), require a differentiating nickname before allowing creation, with copy like "There's already a Mike Johnson. Add a nickname so you can tell them apart." The nickname field already exists and already drives display names everywhere (short name = nickname ?? first name, with the existing ambiguous-name subtitle fallback), so this is purely a modal-level requirement — no schema or display changes. A near-match that isn't exact gets a soft warning but creation is allowed.
- **The checked-in set is "today's squad."** Persist it in localStorage keyed by session id so a refresh or revisit restores it. Every subsequent screen in the session shows ONLY the squad.
- **Squad chip is a toggle, not a destination.** A "Squad · N" chip in the header opens Check-In as a returnable overlay at any time; tapping the chip again (or a Done CTA) returns the user to exactly the screen they were on — teams or score — with the in-progress draft fully intact. Mid-session check-in must never destroy or reset draft state. Removal of a no-show must not be possible for a player already assigned to a team in the current draft, and never affects already-saved games.
- **Reactivating returning players (no API changes needed — verify this yourself).** The grid shows active players by default, but the search must match against the FULL player list from `GET /api/players` (which already returns inactive players; the current page filters them client-side). Inactive matches render in a dimmed "Inactive" section below active results, labeled so it's clear they're being brought back. Tapping an inactive player (a) checks them into today's squad and (b) fires `PATCH /api/players/[id]` with `{ is_active: true }` — both existing capabilities of that route. Optimistic, with a toast like "Colin reactivated & checked in"; on PATCH failure, keep them in the squad locally and surface a retryable error. No confirmation dialog — showing up to play IS the reactivation.

### 2. Team entry — paint mode (replaces ThreeColumnAssigner)

One grid of squad tiles plus two large "brush" headers: TEAM 1 (blue) and TEAM 2 (tangerine), each showing a live player count.

- One brush is always active (Team 1 by default). Tapping a tile assigns that player to the active brush's team. Tapping a tile already on the active team clears them. Tapping a tile on the *other* team reassigns them to the active brush.
- Unassigned tiles are neutral (those players sat out) — sitting out requires zero taps.
- Assigned tiles fill with their team color (see mock for exact treatment).
- Soft warning (non-blocking, amber) when both teams have ≥2 but counts are uneven. The "Enter score →" CTA enables only when both teams have ≥2 players (mirrors the API validation).
- No swipe gestures, no per-tile state cycling, no three columns. This is the whole interaction.

#### Layout contract (critical — large squads must not break this screen)

Runs can have 25+ checked-in players. The screen must be built as a fixed-viewport flex column (`100dvh`), not a scrolling page:

- **Pinned top:** compact header (Courtside · Game N · location · Squad chip) and the game-log strip.
- **Pinned bottom:** the two brush buttons with live counts, the uneven-teams warning line, and the "Enter score →" CTA — all in a fixed bottom bar in the thumb zone, with `env(safe-area-inset-bottom)` padding.
- **Middle:** the player grid is the ONLY scrollable region (`flex:1; overflow-y:auto`).
- **Density adapts so scrolling is rarely needed:** 3 columns for squads ≤16, 4 columns above that, with tile height and font stepping down at the denser setting (see mock). At 4 columns, 28 players is 7 rows and should fit a typical phone viewport without scrolling. If the squad is large enough that the grid does overflow, it scrolls gracefully — but the brushes, counts, and CTA never move, so the interaction stays intact.
- **Tile positions are stable** within a game entry — never reorder or remove tiles as they're assigned. Spatial memory is part of how the user recalls teams. (Order may follow check-in/last-played order; it just must not change mid-entry.)
- Apply the same fixed top/bottom structure to the Check-In and Score screens (Check-In: search + grid scroll in the middle, CTA pinned; Score: cards + keypad in the middle, Save pinned). The score screen content must fit without scrolling at all on a typical phone.

### 3. Score entry — custom keypad (replaces ScoreEntry)

- Two large score cards (Team 1 blue label, Team 2 tangerine label), each showing the entered score huge, with a **team identity anchor** directly under each score: the first two players' short names plus a "+N" count (e.g. "Zach, Paul +3"), in a readable size and weight — not fine print. This exists specifically to prevent entering scores against the wrong team; it must be legible at a glance while the user's eyes are on the keypad area.
- A fixed custom on-screen keypad: digits 1–9, 0, backspace, and a swap-focus key. **Never trigger the OS keyboard** — these are not `<input>` elements.
- Team 1's card is focused initially; tapping the other card (or the swap key) moves focus. Max 3 digits. When both scores are present and unequal, the winning card's number turns win-green.
- Light haptic tick via `navigator.vibrate` on keypress where supported (feature-detect, no errors on iOS Safari).
- "Save Game" CTA enables when both scores are non-empty. Ties are allowed (they exist in historical data) — no winner highlight, no winners-stay option after.
- A "← Teams" affordance returns to the paint screen with state intact.

### 4. Save → next-game chips (replaces the Keep Winners bottom sheet)

On save, POST to `/api/games` with the **exact same payload shape as today** (`session_id`, `team1_score`, `team2_score`, `team1_players`, `team2_players`). Optimistically advance the UI, then show a confirmation screen with three chips:

- **Runback** 🔁 — both teams pre-assigned exactly as the last game, landing on the paint screen (NOT score entry) so the user can verify or adjust before tapping "Enter score →". All three chips land on the paint screen; they differ only in what's pre-painted.
- **Winners Stay** 👑 — winning team's players pre-assigned as Team 1, everything else cleared, land on paint screen with Team 2 brush active. (Visually emphasized as the common path; hidden on ties.)
- **Fresh** ✨ — clear all assignments, land on paint screen.

Scores always clear. Also keep an "End Session 📰" entry point here in addition to wherever it currently lives.

### 5. Reliability layer

- **Undo:** the save toast includes an Undo action for ~8 seconds. **The toast must dock directly above the pinned bottom bar — never overlapping the CTA, chips, or any other control — and re-position if the user navigates to a screen with a different bar height while it's visible** (safe-area aware). It wired to the existing `DELETE /api/games/[id]` route. On undo, restore the just-saved game's teams and scores into the draft and decrement the game counter. Respect that route's existing behavior (deleting the last game auto-deletes the session and triggers regen) — diagnose how that interacts with undo of game 1 and propose handling before implementing.
- **Retry queue:** if the POST fails (offline, timeout), keep the game in a localStorage pending queue, show a persistent banner ("1 game pending — Retry"), and auto-retry on `online` events and on app focus. Pending games must survive a full page reload. Game numbering is server-derived already (the API computes `game_number`), so queued games submit in order, one at a time.
- **Draft persistence:** in-progress squad, team assignments, and scores persist to localStorage (keyed by session id) and restore on reload. Clear drafts when the session ends.
- **Game log strip:** a horizontally scrolling strip under the header showing today's saved games ("G1 9–7", "G2 11–8" …), sourced from the existing session games fetch.

## Hard constraints — do not violate

- **Zero database or API contract changes.** Same tables, same routes, same payloads. `winning_team` is a generated column — never insert it. `game_players.team` is integer 1 or 2.
- All writes continue through existing API routes using the service-role pattern; the client never writes to Supabase directly.
- The End Session flow is untouched: PATCH `/api/sessions/[id]/complete`, then the **browser** fires POST `/api/narratives/generate` (never the server — Vercel kills server-side fire-and-forget).
- Session resume logic (today's incomplete session on mount), local-date handling (`en-CA` format), and the location pill behavior stay exactly as implemented.
- Squad, drafts, and retry queue are client-side only (localStorage). No new tables, no session-notes hacks.
- Palette is Plasma Tangerine, exactly as used in the mock and the existing app: bg `#08080e`, card `#111118`, raised `#1a1a28`, accent `#fb923c`, Team 1 blue `#3b82f6` family, win `#22c55e`, loss `#ef4444`, text `#f0f0f8` / `#94a3b8` / `#555570`, borders `rgba(255,255,255,0.06)`.

## Process

1. Confirm branch. Read the listed files and the mock. 
2. Before writing code, give me: (a) your read of the current courtside state flow, (b) the component breakdown you propose (new components, what gets deleted vs kept), (c) your plan for the undo-of-game-1 edge case and the retry queue ordering, and (d) anything in the mock that conflicts with something real in the codebase.
3. Wait for my confirmation, then implement as one coherent unit on the branch.
4. After implementing, run the build (`npm run build`) and fix all type errors. Then walk me through a manual test script covering: fresh session → check-in → 3 games (one Winners Stay, one Runback, one Fresh) → late arrival via Squad chip mid-score-entry, confirming the chip returns to score entry with draft intact → reactivating an inactive player via the Inactive mode switch (and confirming inactive players never appear in active search) → attempting to add a new player whose name exactly matches an existing one (confirming the match suggestion appears and the nickname requirement blocks a bare duplicate) → a tie game → undo → simulated offline save → reload mid-draft → End Session → and a 25-player squad on a small viewport (e.g. iPhone SE size in devtools), confirming the brushes/counts/CTA never leave the screen and only the grid scrolls.

Old components (`ThreeColumnAssigner`, `ScoreEntry`) should be deleted, not left dead, once the new flow fully replaces them. `AddPlayerModal` and `LocationPill` are kept and reused.
