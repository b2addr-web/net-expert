begin;

-- Keep request creation available through the existing tenant-scoped API.
-- All subsequent lifecycle and evidence writes belong to server-side code.
revoke insert, update, delete on public.signature_requests from public, anon, authenticated;
grant insert (
  organization_id, template_id, created_by, employee_name, employee_id,
  phone_e164, email, notes, status, token_hash, token_expires_at
) on public.signature_requests to authenticated;
alter policy signature_requests_write on public.signature_requests
  with check (organization_id = public.current_organization_id()
    and created_by = auth.uid() and public.workspace_write('signatures')
    and status = 'pending_send');
drop policy if exists signature_requests_update on public.signature_requests;

-- Serialize template edits against new references. Readers with tenant
-- permissions cannot rewrite a template version attached to any request.
create or replace function public.lock_signature_template_reference()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.signature_templates t
    where t.id = new.template_id and t.organization_id = new.organization_id and t.active
      and split_part(t.original_file_path, '/', 1) = t.organization_id::text
      and split_part(t.original_file_path, '/', 2) = t.created_by::text
      and exists (select 1 from storage.objects o where o.bucket_id = 'knowledge-files' and o.name = t.original_file_path)
    for share of t;
  if not found then
    raise exception 'SIGNATURE_TEMPLATE_UNAVAILABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.lock_signature_template_reference() from public, anon, authenticated;
create trigger signature_request_lock_template
  before insert or update of template_id, organization_id on public.signature_requests
  for each row execute function public.lock_signature_template_reference();

create or replace function public.protect_used_signature_template()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.signature_requests where template_id = old.id) then
    raise exception 'SIGNATURE_TEMPLATE_IN_USE' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_used_signature_template() from public, anon, authenticated;
create trigger signature_template_protect_used
  before update or delete on public.signature_templates
  for each row execute function public.protect_used_signature_template();
create index if not exists signature_requests_template_lookup on public.signature_requests(template_id);

create or replace function public.validate_signature_template_source()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if split_part(new.original_file_path, '/', 1) <> new.organization_id::text
     or split_part(new.original_file_path, '/', 2) <> new.created_by::text
     or not exists (
       select 1 from storage.objects
       where bucket_id = 'knowledge-files' and name = new.original_file_path
     ) then
    raise exception 'INVALID_SIGNATURE_TEMPLATE_SOURCE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_signature_template_source() from public, anon, authenticated;
create trigger signature_template_validate_source
  before insert or update of original_file_path, organization_id, created_by on public.signature_templates
  for each row execute function public.validate_signature_template_source();

-- Protect registered original objects and completed archives from ordinary
-- Storage edits. Existing permissive policies still govern other files.
create or replace function public.signature_storage_object_protected(object_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.signature_templates where original_file_path = object_name)
    or exists (
      select 1 from public.signature_requests r join public.knowledge_items k on k.id = r.final_knowledge_item_id
      where r.status = 'completed' and k.file_path = object_name
    );
$$;
revoke all on function public.signature_storage_object_protected(text) from public, anon;
grant execute on function public.signature_storage_object_protected(text) to authenticated;
create policy signature_objects_no_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'knowledge-files' or not public.signature_storage_object_protected(name))
  with check (bucket_id <> 'knowledge-files' or not public.signature_storage_object_protected(name));
create policy signature_objects_no_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'knowledge-files' or not public.signature_storage_object_protected(name));

create or replace function public.protect_completed_signature_archive()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.signature_requests where final_knowledge_item_id = old.id and status = 'completed') then
    raise exception 'SIGNATURE_ARCHIVE_IN_USE' using errcode = '23514';
  end if;
  return old;
end;
$$;
revoke all on function public.protect_completed_signature_archive() from public, anon, authenticated;
create trigger signature_archive_protect_delete before delete on public.knowledge_items
  for each row execute function public.protect_completed_signature_archive();
create index if not exists signature_requests_final_item_lookup on public.signature_requests(final_knowledge_item_id)
  where final_knowledge_item_id is not null;

-- Global templates are readable where needed, but only the trusted
-- platform service can create, update, or delete a global template.
drop policy whatsapp_templates_all on public.whatsapp_message_templates;
create policy whatsapp_templates_read on public.whatsapp_message_templates for select to authenticated
  using ((organization_id is null or organization_id = public.current_organization_id())
    and public.has_section_access('whatsapp'));
create policy whatsapp_templates_insert on public.whatsapp_message_templates for insert to authenticated
  with check (organization_id = public.current_organization_id()
    and created_by = auth.uid() and public.workspace_write('whatsapp'));
create policy whatsapp_templates_update on public.whatsapp_message_templates for update to authenticated
  using (organization_id = public.current_organization_id() and public.workspace_write('whatsapp'))
  with check (organization_id = public.current_organization_id() and public.workspace_write('whatsapp'));
create policy whatsapp_templates_delete on public.whatsapp_message_templates for delete to authenticated
  using (organization_id = public.current_organization_id() and public.workspace_write('whatsapp'));

commit;
