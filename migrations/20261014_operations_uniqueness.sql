-- Follow-up for projects where operations_modules was applied before these indexes were added.
create unique index if not exists service_subscriptions_no_duplicate on public.service_subscriptions(organization_id,lower(name),lower(provider),start_date,end_date);
create unique index if not exists inventory_items_no_duplicate on public.inventory_items(organization_id,lower(name),lower(brand),lower(model),lower(storage_location));
