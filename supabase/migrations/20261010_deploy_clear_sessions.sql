-- Run ONCE, immediately after the session-verification release is live.
-- Not before: the previous release would simply recreate unverified rows.
--
-- Session rows written before that release were never checked with MyJKKN,
-- so none of them can be trusted. Clearing the table does not sign anyone
-- out: the next request from each browser is answered 401, the browser
-- refreshes its session from the refresh-token cookie, and a verified row is
-- written. A user whose refresh token has lapsed is sent to sign in.

delete from public.sessions;
delete from public.user_sessions;
