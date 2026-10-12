begin;

-- Imported rows represent separate custody records, even when their values match.
drop index if exists public.workspace_sim_unique;
drop index if exists public.workspace_serial_unique;
create index if not exists workspace_sim_lookup on public.workspace_records (organization_id, lower(data->>'sim_number')) where module='sim';
create index if not exists workspace_serial_lookup on public.workspace_records (organization_id, lower(data->>'serial_number')) where module='assets';

create or replace function public.import_workspace_records(p_rows jsonb, p_duplicate_policy text default 'insert')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  item jsonb;
  item_module text;
  item_data jsonb;
  inserted_sim integer := 0;
  inserted_assets integer := 0;
  failed integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or current_organization_id() is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'Import must contain at most 20,000 rows';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      item_module := item->>'module';
      item_data := coalesce(item->'data', '{}'::jsonb) - 'id' - 'organization_id' - 'created_by' - 'role' - 'permissions';
      if item_module not in ('sim','assets') or not workspace_write(item_module) then
        raise exception 'Module access denied';
      end if;
      item_data := jsonb_strip_nulls(item_data) || jsonb_build_object('attachments', coalesce(item_data->'attachments','[]'::jsonb));
      if jsonb_typeof(item_data->'attachments') <> 'array' then
        item_data := jsonb_set(item_data, '{attachments}', '[]'::jsonb);
      end if;

      insert into public.workspace_records (organization_id,module,data,created_by)
      values (current_organization_id(),item_module,item_data,auth.uid());
      if item_module='sim' then inserted_sim := inserted_sim + 1;
      else inserted_assets := inserted_assets + 1;
      end if;
    exception when others then
      failed := failed + 1;
      failures := failures || jsonb_build_array(jsonb_build_object('sheet',item->>'sheet','row',item->>'row','message',sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'sim',jsonb_build_object('inserted',inserted_sim,'updated',0),
    'assets',jsonb_build_object('inserted',inserted_assets,'updated',0),
    'skipped',0,'failed',failed,'errors',failures
  );
end $$;

revoke all on function public.import_workspace_records(jsonb,text) from public, anon;
grant execute on function public.import_workspace_records(jsonb,text) to authenticated;
commit;
