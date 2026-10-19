-- Keep abuse protection responsive: five valid upload attempts per rolling minute.
begin;

drop function if exists public.reserve_receipt_upload();
create function public.reserve_receipt_upload() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  recent_attempts integer;
  retry_after integer;
begin
  if current_user_id is null then raise exception 'Ingresá a tu cuenta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 1));

  select count(*)::integer,
    greatest(1,ceil(extract(epoch from (min(created_at) + interval '1 minute' - now())))::integer)
    into recent_attempts,retry_after
  from public.receipt_upload_attempts
  where user_id=current_user_id and created_at > now() - interval '1 minute';

  if recent_attempts >= 5 then return retry_after; end if;

  delete from public.receipt_upload_attempts
  where user_id=current_user_id and created_at < now() - interval '1 day';
  insert into public.receipt_upload_attempts(user_id) values (current_user_id);
  return 0;
end $$;

revoke all on function public.reserve_receipt_upload() from public,anon,authenticated;
grant execute on function public.reserve_receipt_upload() to authenticated;

commit;
