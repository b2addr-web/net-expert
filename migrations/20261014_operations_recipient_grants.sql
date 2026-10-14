begin;
-- Backend jobs need to resolve each organization's active administrators.
-- These grants do not expose member or profile data to browser roles.
grant select on public.organization_members,public.profiles to service_role;
commit;
