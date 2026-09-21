begin;
create or replace function public.import_workspace_records(p_rows jsonb,p_duplicate_policy text default 'skip') returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb;item_module text;item_data jsonb;existing public.workspace_records;inserted_sim int:=0;updated_sim int:=0;inserted_assets int:=0;updated_assets int:=0;skipped int:=0;failed int:=0;failures jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or current_organization_id() is null then raise exception 'Authentication required';end if;
 if p_duplicate_policy not in('skip','update') then raise exception 'Invalid duplicate policy';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20000 then raise exception 'Import must contain at most 20,000 rows';end if;
 for item in select value from jsonb_array_elements(p_rows) loop begin
  item_module:=item->>'module';item_data:=coalesce(item->'data','{}'::jsonb)-'id'-'organization_id'-'created_by'-'role'-'permissions';
  if item_module not in('sim','assets') or not workspace_write(item_module) then raise exception 'Module access denied';end if;
  item_data:=jsonb_strip_nulls(item_data)||jsonb_build_object('attachments',coalesce(item_data->'attachments','[]'::jsonb));
  if jsonb_typeof(item_data->'attachments')<>'array' then item_data:=jsonb_set(item_data,'{attachments}','[]'::jsonb);end if;
  select * into existing from workspace_records r where r.organization_id=current_organization_id() and r.module=item_module and ((nullif(item_data->>'employee_id','') is not null and lower(r.data->>'employee_id')=lower(item_data->>'employee_id')) or (item_module='sim' and nullif(item_data->>'sim_number','') is not null and lower(r.data->>'sim_number')=lower(item_data->>'sim_number')) or (item_module='assets' and nullif(item_data->>'asset_tag','') is not null and lower(r.data->>'asset_tag')=lower(item_data->>'asset_tag')) or (item_module='assets' and nullif(item_data->>'serial_number','') is not null and lower(r.data->>'serial_number')=lower(item_data->>'serial_number'))) order by r.created_at limit 1;
  if existing.id is not null then if p_duplicate_policy='skip' then skipped:=skipped+1;else update workspace_records set data=existing.data||item_data,version=version+1,updated_at=now(),updated_by=auth.uid() where id=existing.id and organization_id=current_organization_id();if item_module='sim' then updated_sim:=updated_sim+1;else updated_assets:=updated_assets+1;end if;end if;
  else insert into workspace_records(organization_id,module,data,created_by) values(current_organization_id(),item_module,item_data,auth.uid());if item_module='sim' then inserted_sim:=inserted_sim+1;else inserted_assets:=inserted_assets+1;end if;end if;
 exception when others then failed:=failed+1;failures:=failures||jsonb_build_array(jsonb_build_object('row',item->>'row','message',sqlerrm));end;end loop;
 return jsonb_build_object('sim',jsonb_build_object('inserted',inserted_sim,'updated',updated_sim),'assets',jsonb_build_object('inserted',inserted_assets,'updated',updated_assets),'skipped',skipped,'failed',failed,'errors',failures);
end$$;
revoke all on function public.import_workspace_records(jsonb,text) from public,anon;
grant execute on function public.import_workspace_records(jsonb,text) to authenticated;
commit;
