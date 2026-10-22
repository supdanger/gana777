begin;

-- Conserva el origen de la cuenta aunque se cierre su conversación de solicitud.
alter table public.user_profiles
  add column account_origin text not null default 'panel'
  check (account_origin in ('panel', 'platform'));

update public.user_profiles p
  set account_origin = 'platform'
  where exists (
    select 1 from public.player_access_requests r
    where r.player_user_id = p.user_id and r.status = 'approved'
  );

create index user_profiles_platform_created
  on public.user_profiles(created_at desc, user_id)
  where account_origin = 'platform';

commit;
