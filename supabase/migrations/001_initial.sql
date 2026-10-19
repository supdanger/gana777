-- Ejecutar una sola vez en un proyecto nuevo, mediante el SQL Editor de Supabase.
begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admin_users where user_id = (select auth.uid())); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank text not null,
  holder text not null,
  cbu text not null check (cbu ~ '^[0-9]{22}$'),
  alias text not null,
  active boolean not null default true
);
create unique index one_active_bank on public.bank_accounts(active) where active;
alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select, insert, update, delete on public.bank_accounts to authenticated;
create policy bank_read on public.bank_accounts for select to authenticated using (active or public.is_admin());
create policy bank_manage on public.bank_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  holder text check (length(holder) between 1 and 120),
  cbu text,
  alias text check (length(alias) <= 100),
  receipt_path text unique,
  created_at timestamptz not null default now(),
  check ((kind = 'deposit' and receipt_path is not null) or
         (kind = 'withdrawal' and holder is not null and cbu ~ '^[0-9]{22}$' and cbu is not null and receipt_path is null))
);
create index requests_user_date on public.requests(user_id,created_at desc);
alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
grant select on public.requests to authenticated;
grant insert(user_id,kind,amount,holder,cbu,alias,receipt_path) on public.requests to authenticated;
grant update(status) on public.requests to authenticated;
create policy request_read on public.requests for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy request_create on public.requests for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');
create policy request_review on public.requests for update to authenticated using (public.is_admin() and status = 'pending') with check (public.is_admin() and status in ('approved','rejected'));

create function public.validate_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Serializa las solicitudes de una cuenta para impedir retiros simultáneos.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.kind = 'withdrawal' and exists (
    select 1 from public.requests where user_id = new.user_id and kind = 'withdrawal'
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Solo podés solicitar un retiro cada 24 horas.';
  end if;
  if new.kind = 'deposit' then
    if not exists(select 1 from public.bank_accounts where active) then
      raise exception 'No hay una cuenta habilitada para recibir cargas.';
    end if;
    if not exists(select 1 from storage.objects where bucket_id = 'receipts'
        and name = new.receipt_path and (storage.foldername(name))[1] = new.user_id::text) then
      raise exception 'El comprobante no existe o no pertenece a tu cuenta.';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.validate_request() from public;
create trigger validate_request before insert on public.requests for each row execute function public.validate_request();

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id),
  actor_id uuid references auth.users(id),
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default now()
);
alter table public.request_events enable row level security;
revoke all on public.request_events from anon, authenticated;
grant select on public.request_events to authenticated;
create policy audit_read on public.request_events for select to authenticated using (public.is_admin());
create function public.audit_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.request_events(request_id,actor_id,previous_status,new_status)
  values(new.id, auth.uid(), old.status, new.status);
  return new;
end; $$;
revoke all on function public.audit_request() from public;
create trigger audit_request after update of status on public.requests for each row execute function public.audit_request();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  sender_id uuid not null references auth.users(id),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_thread_date on public.messages(user_id,created_at);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert(user_id,sender_id,body) on public.messages to authenticated;
create policy message_read on public.messages for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy message_send on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and (user_id = (select auth.uid()) or public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('receipts','receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy receipt_upload on storage.objects for insert to authenticated
with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipt_read on storage.objects for select to authenticated
using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
create policy receipt_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
and not exists(select 1 from public.requests where receipt_path = name));

alter publication supabase_realtime add table public.requests, public.messages;
commit;
