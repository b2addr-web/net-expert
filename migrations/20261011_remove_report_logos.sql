-- Retire the unused report-logo feature. The empty bucket remains inaccessible.
drop policy if exists report_logos_read_own on storage.objects;
drop policy if exists report_logos_insert_own on storage.objects;
drop policy if exists report_logos_update_own on storage.objects;
drop policy if exists report_logos_delete_own on storage.objects;
