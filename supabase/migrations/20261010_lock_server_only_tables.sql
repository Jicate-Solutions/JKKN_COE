-- Lock down tables that only the server uses.
--
-- Row Level Security is off on these tables, so the public (anon) API key can
-- read them. The application reaches them only through server routes with the
-- service-role key, which is not affected by RLS — so enabling RLS with no
-- policy closes them to the public key and changes nothing for the app.
--
-- Safe to run more than once. Run in the Supabase SQL Editor.
--
-- Run AFTER the release that contains hooks/auth/use-role-sync.ts without
-- Supabase Realtime is live. The previous release listened to `user_roles`
-- with the public key to refresh roles in the browser; the new one re-reads
-- them from the server (on tab focus and every five minutes), so it no longer
-- needs the table to be readable. Running this earlier only stops that live
-- refresh on the old release — nothing else.

alter table public.verification_codes enable row level security;
alter table public.user_favorites enable row level security;
alter table public.user_roles enable row level security;

-- NOT included — reference data, some of it needed by the public examiner
-- registration form. Review column by column before closing:
--   institutions, course_info, academic_years (+ its views), examiner_form_configs
--
-- Verify afterwards:  node -r dotenv/config tests/live-rls-anon-probe.mjs
-- (user_roles, verification_codes and user_favorites should no longer be listed)
