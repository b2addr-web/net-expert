-- Phase E review-only migration. Do not run against production without approval.
begin;
-- Service-role archival inserts must preserve the explicit creator; normal
-- authenticated inserts still derive created_by from auth.uid().
create or replace function public.knowledge_item_stamp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  if auth.uid() is not null then new.created_by:=auth.uid(); end if;
  new.created_at:=now();
  if new.item_type='note' and new.file_path is not null and btrim(new.body)='' then new.item_type:='file'; end if;
  select nullif(btrim(p.full_name),'') into new.author_name from public.profiles p where p.id=new.created_by;
 else
  new.organization_id:=old.organization_id; new.created_by:=old.created_by; new.created_at:=old.created_at; new.author_name:=old.author_name; new.item_type:=old.item_type;
  if old.item_type='note' and new.file_path is null and old.file_path is not null then new.file_name:=null; new.file_size:=null; else new.file_path:=old.file_path; new.file_size:=old.file_size; end if;
 end if;
 if new.folder_id is not null and not exists (select 1 from public.knowledge_folders f where f.id=new.folder_id and f.organization_id=new.organization_id and f.created_by=new.created_by) then raise exception 'INVALID_KNOWLEDGE_FOLDER'; end if;
 new.updated_at:=now(); return new;
end;
$$;
alter table public.signature_requests drop constraint if exists signature_requests_status_check;
alter table public.signature_requests add constraint signature_requests_status_check
  check (status in ('pending_send','sent','awaiting_signature','signed','archiving','completed','send_failed','archive_failed','expired','cancelled'));
alter table public.signature_requests add column if not exists archive_attempts integer not null default 0 check (archive_attempts >= 0);
alter table public.signature_requests add column if not exists archive_error text;
alter table public.signature_events drop constraint if exists signature_events_event_type_check;
alter table public.signature_events add constraint signature_events_event_type_check
  check (event_type in ('created','send_attempted','sent','delivered','read','send_failed','archive_failed','opened','signed','expired','cancelled','final_file_saved'));
create index if not exists signature_requests_archive_status on public.signature_requests(organization_id,status) where status in ('archiving','archive_failed');
commit;
