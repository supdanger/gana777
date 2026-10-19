-- Identificador estable y recursos visuales para las tarjetas bancarias.
begin;

create table if not exists public.bank_themes (
  key text primary key check (key ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (length(name) between 1 and 80),
  background_path text,
  logo_path text,
  updated_at timestamptz not null default now(),
  check (background_path is null or background_path ~ '^bank-themes/[a-z0-9-]+/[a-zA-Z0-9._-]+$'),
  check (logo_path is null or logo_path ~ '^bank-themes/[a-z0-9-]+/[a-zA-Z0-9._-]+$')
);
insert into public.bank_themes(key,name) values ('default','GANA777 predeterminado'),('naranja-x','Naranja X')
on conflict (key) do update set name=excluded.name;

alter table public.bank_accounts add column if not exists theme_key text not null default 'default';
alter table public.bank_accounts drop constraint if exists bank_accounts_theme_key_fkey;
alter table public.bank_accounts add constraint bank_accounts_theme_key_fkey
  foreign key (theme_key) references public.bank_themes(key) on update cascade on delete restrict;

alter table public.bank_themes enable row level security;
revoke all on public.bank_themes from public,anon,authenticated;
grant select on public.bank_themes to authenticated;
grant update(background_path,logo_path,updated_at) on public.bank_themes to authenticated;
drop policy if exists bank_themes_read on public.bank_themes;
drop policy if exists bank_themes_update on public.bank_themes;
create policy bank_themes_read on public.bank_themes for select to authenticated using (true);
create policy bank_themes_update on public.bank_themes for update to authenticated
  using (public.has_admin_permission('accounts')) with check (public.has_admin_permission('accounts'));

-- PostgreSQL no permite cambiar el tipo de retorno con CREATE OR REPLACE.
drop function if exists public.assign_bank_account();
create function public.assign_bank_account()
returns table(
  assignment_id uuid,id uuid,bank text,holder text,cbu text,alias text,
  theme_key text,theme_background_path text,theme_logo_path text
)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing_assignment uuid; chosen_account uuid;
  current_mode text; deadline timestamptz; incoming text;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then raise exception using errcode = '42501',message = 'Ingresá a tu cuenta.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,11));
  perform pg_advisory_xact_lock(777011);
  select s.mode,s.resumes_at,s.next_shift_key into current_mode,deadline,incoming
    from public.bank_operation_state s where s.id for update;
  if current_mode = 'closing' and deadline <= now() then
    update public.work_shifts set active=false,updated_at=now() where active;
    update public.work_shifts set active=true,updated_at=now() where key=incoming;
    update public.bank_operation_state as state set mode='online',outgoing_shift_key=null,
      next_shift_key=null,resumes_at=null,updated_at=now() where state.id;
    current_mode := 'online';
  end if;
  if current_mode = 'closing' then raise exception 'Estamos realizando el cierre de caja.'; end if;
  if current_mode = 'maintenance' then raise exception 'Las cargas están temporalmente en mantenimiento.'; end if;

  update public.bank_account_assignments set status='expired'
    where user_id=actor and status='reserved' and expires_at<=now();
  select a.id into existing_assignment from public.bank_account_assignments a
    where a.user_id=actor and a.status='reserved' and a.expires_at>now()
    order by a.created_at desc limit 1;
  if existing_assignment is not null then
    return query select a.id,b.id,b.bank,b.holder,b.cbu,b.alias,b.theme_key,t.background_path,t.logo_path
      from public.bank_account_assignments a join public.bank_accounts b on b.id=a.bank_account_id
      join public.bank_themes t on t.key=b.theme_key where a.id=existing_assignment;
    return;
  end if;

  select b.id into chosen_account from public.bank_accounts b
    join public.work_shifts s on s.key=b.shift_key and s.active where b.active
    order by b.usage_count+(select count(*) from public.bank_account_assignments a
      where a.bank_account_id=b.id and a.status='reserved' and a.expires_at>now()),b.usage_count,b.id
    for update of b limit 1;
  if chosen_account is null then raise exception 'No hay una cuenta habilitada para recibir cargas.'; end if;
  insert into public.bank_account_assignments as created(user_id,bank_account_id)
    values(actor,chosen_account) returning created.id into existing_assignment;
  return query select a.id,b.id,b.bank,b.holder,b.cbu,b.alias,b.theme_key,t.background_path,t.logo_path
    from public.bank_account_assignments a join public.bank_accounts b on b.id=a.bank_account_id
    join public.bank_themes t on t.key=b.theme_key where a.id=existing_assignment;
end $$;
revoke all on function public.assign_bank_account() from public,anon,authenticated;
grant execute on function public.assign_bank_account() to authenticated;

commit;
