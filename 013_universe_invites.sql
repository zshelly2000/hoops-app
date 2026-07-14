-- ============================================================
-- 013_universe_invites.sql — Phase 4 WS-B: invite rows, not emails
-- ============================================================
-- Authored in hoops-app (021_courtside_auth workstream); run it here,
-- then move this file to hoops-stats/supabase/migrations/ where the
-- schema history lives.
--
-- Invites are rows, not emails: an owner records an email + role, and
-- when a user whose VERIFIED email matches logs in, the app's server
-- routes convert the invite into a universe_members row (delete invite,
-- insert membership — both service-role). No transactional email is
-- ever sent by this system; the owner texts the invitee.
--
-- Email is stored lowercased (the app lowercases on insert and on
-- match) and one pending invite per (universe, email) is the natural
-- key — re-inviting the same address is an upsert, not a duplicate.
--
-- RLS: same posture as universe_members writes, stricter on reads —
-- NO anon policies and NO authenticated policies at all. Pending
-- invites (other people's emails) are nobody's business but the
-- owner's, and every read/write happens in server routes with the
-- service role, which bypasses RLS.
-- ============================================================

BEGIN;

CREATE TABLE universe_invites (
  universe_id UUID NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,           -- store lowercased
  role        TEXT NOT NULL CHECK (role IN ('owner', 'organizer')),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (universe_id, email)
);

-- "does a just-logged-in user have a pending invite anywhere" lookup path
CREATE INDEX universe_invites_email_idx ON universe_invites (email);

ALTER TABLE universe_invites ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon and authenticated see nothing; all
-- access is service-role from server routes.

COMMIT;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- V1: table exists with RLS enabled and zero policies.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'universe_invites';           -- expect relrowsecurity = true

SELECT count(*) AS policy_count
FROM pg_policies
WHERE tablename = 'universe_invites';         -- expect 0

-- V2: anon and authenticated see nothing (impersonation check).
SET ROLE anon;
SELECT count(*) AS anon_visible FROM universe_invites;          -- expect 0 rows visible (and no error)
RESET ROLE;
SET ROLE authenticated;
SELECT count(*) AS authenticated_visible FROM universe_invites; -- expect 0
RESET ROLE;

-- V3: role check constraint holds. Expect ERROR (23514) — run separately.
-- INSERT INTO universe_invites (universe_id, email, role, invited_by)
-- VALUES ('5ac00000-0000-4000-8000-000000000001', 'reject@example.com', 'admin',
--         (SELECT id FROM auth.users ORDER BY created_at LIMIT 1));
