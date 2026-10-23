begin;

create or replace function public.verify_announcement_job_key(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select length(coalesce(p_key, '')) > 40 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'service_role_key' and decrypted_secret = p_key
  );
$$;
revoke all on function public.verify_announcement_job_key(text) from public, anon, authenticated;
grant execute on function public.verify_announcement_job_key(text) to service_role;

commit;
