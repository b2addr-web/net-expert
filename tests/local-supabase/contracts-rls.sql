-- Run only in the isolated local Supabase database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f4000000-0000-4000-8000-000000000001','phase4f-admin-a@example.test','{"organization_name":"Phase 4F Auto A"}'),
 ('f4000000-0000-4000-8000-000000000002','phase4f-operator-a@example.test','{"organization_name":"Phase 4F Auto Operator"}'),
 ('f4000000-0000-4000-8000-000000000003','phase4f-viewer-a@example.test','{"organization_name":"Phase 4F Auto Viewer"}'),
 ('f4000000-0000-4000-8000-000000000004','phase4f-admin-b@example.test','{"organization_name":"Phase 4F Auto B"}'),
 ('f4000000-0000-4000-8000-000000000005','phase4f-manager-a@example.test','{"organization_name":"Phase 4F Auto Manager"}');
insert into public.organizations(id,name,slug) values
 ('f4000000-0000-4000-8000-000000000011','Phase 4F Test A','phase4f-test-a'),
 ('f4000000-0000-4000-8000-000000000012','Phase 4F Test B','phase4f-test-b');
insert into public.organization_members(organization_id,user_id,role,status) values
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000001','company_admin','active'),
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000002','operator','active'),
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000003','viewer','active'),
 ('f4000000-0000-4000-8000-000000000012','f4000000-0000-4000-8000-000000000004','company_admin','active'),
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000005','manager','active');
insert into public.user_workspace_preferences(user_id,organization_id) values
 ('f4000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000011'),
 ('f4000000-0000-4000-8000-000000000002','f4000000-0000-4000-8000-000000000011'),
 ('f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000011'),
 ('f4000000-0000-4000-8000-000000000004','f4000000-0000-4000-8000-000000000012'),
 ('f4000000-0000-4000-8000-000000000005','f4000000-0000-4000-8000-000000000011')
 on conflict(user_id) do update set organization_id=excluded.organization_id;
insert into public.contracts(organization_id,title) values
 ('f4000000-0000-4000-8000-000000000011','Phase 4F Test Contract');
insert into public.member_permissions(organization_id,user_id,section,allowed) values
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000002','contracts',true),
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000003','contracts',true);

select set_config('request.jwt.claim.sub','f4000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.contracts where title='Phase 4F Test Contract';
  if n<>1 then raise exception 'viewer read failed: %', n; end if;
  update public.contracts set title='Viewer changed' where title='Phase 4F Test Contract';
  get diagnostics n = row_count;
  if n<>0 then raise exception 'viewer modified contract'; end if;
  delete from public.contracts where title='Phase 4F Test Contract';
  get diagnostics n = row_count;
  if n<>0 then raise exception 'viewer deleted contract'; end if;
  begin
    insert into public.contracts(organization_id,title) values ('f4000000-0000-4000-8000-000000000011','Viewer inserted');
    raise exception 'viewer inserted contract';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f4000000-0000-4000-8000-000000000004',true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.contracts where title='Phase 4F Test Contract';
  if n<>0 then raise exception 'cross-tenant read succeeded'; end if;
  update public.contracts set title='Cross-tenant changed' where title='Phase 4F Test Contract';
  get diagnostics n = row_count;
  if n<>0 then raise exception 'cross-tenant update succeeded'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f4000000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.contracts where title='Phase 4F Test Contract';
  if n<>0 then raise exception 'manager gained implicit contract access'; end if;
end $$;
reset role;
insert into public.member_permissions(organization_id,user_id,section,allowed) values
 ('f4000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000005','contracts',true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.contracts where title='Phase 4F Test Contract';
  if n<>1 then raise exception 'explicit manager contract access failed'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f4000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare n int; begin
  update public.contracts set vendor='Test vendor' where title='Phase 4F Test Contract';
  get diagnostics n = row_count;
  if n<>1 then raise exception 'authorized operator update failed'; end if;
  insert into public.contracts(organization_id,title) values ('f4000000-0000-4000-8000-000000000011','Operator inserted');
  delete from public.contracts where title='Operator inserted';
  get diagnostics n = row_count;
  if n<>1 then raise exception 'authorized operator delete failed'; end if;
  begin
    update public.contracts set organization_id='f4000000-0000-4000-8000-000000000012' where title='Phase 4F Test Contract';
    raise exception 'organization change succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','f4000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.contracts where title='Phase 4F Test Contract' and vendor='Test vendor';
  if n<>1 then raise exception 'admin read after operator update failed'; end if;
end $$;
reset role;
rollback;
