-- Trigger helpers run through their triggers; clients do not need RPC access.
revoke all on function public.knowledge_folder_stamp() from public;
revoke all on function public.knowledge_item_stamp() from public;
