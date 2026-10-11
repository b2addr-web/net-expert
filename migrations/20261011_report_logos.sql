-- Each signed-in user owns one private logo, used in their printed reports.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('report-logos','report-logos',false,2097152,array['image/png'])
on conflict (id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/png'];

create policy report_logos_read_own on storage.objects for select to authenticated
using (bucket_id='report-logos' and name=auth.uid()::text || '/logo.png');

create policy report_logos_insert_own on storage.objects for insert to authenticated
with check (bucket_id='report-logos' and name=auth.uid()::text || '/logo.png');

create policy report_logos_update_own on storage.objects for update to authenticated
using (bucket_id='report-logos' and name=auth.uid()::text || '/logo.png')
with check (bucket_id='report-logos' and name=auth.uid()::text || '/logo.png');

create policy report_logos_delete_own on storage.objects for delete to authenticated
using (bucket_id='report-logos' and name=auth.uid()::text || '/logo.png');
