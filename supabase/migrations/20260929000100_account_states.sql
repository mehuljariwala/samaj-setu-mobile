-- ---------------------------------------------------------------------------
-- Two ways for an admin to switch an account off.
--
--   disabled — off for now: a family on a break, a number that changed hands.
--              A reason is welcome but not required.
--   blocked  — off because of misuse. A reason is required, so the next admin
--              knows why before turning it back on.
--
-- Either one stops sign-in and hides the account's candidates from the
-- directory; `active` undoes both. `suspended` and `closed` predate these and
-- stay as they were.
--
-- On its own because a new enum value cannot be used in the transaction that
-- adds it, and the next migration uses both.
-- ---------------------------------------------------------------------------

alter type public.account_status add value if not exists 'disabled';
alter type public.account_status add value if not exists 'blocked';
