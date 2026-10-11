-- Profiles are maintained by trusted database functions. Client sessions only read them.
-- This prevents changes to legacy authorization fields through the Data API.
revoke insert, update, delete on table public.profiles from authenticated;
revoke insert, update, delete on table public.profiles from anon;
