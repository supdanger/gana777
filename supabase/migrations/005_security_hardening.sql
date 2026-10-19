-- Requiere 001. Compatible con 002/003/004, sin activar Cloudinary.
-- Ejecutar en SQL Editor con el rol postgres. No borra datos existentes.
begin;

revoke create on schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
-- PUBLIC's implicit EXECUTE grant is global; a schema-only REVOKE cannot remove it.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- Reset table AND column privileges on private application tables.
do $$
declare table_name text; column_names text; privilege_name text;
begin
  foreach table_name in array array['admin_users','requests','messages','bank_accounts','request_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    select string_agg(quote_ident(attname), ',') into column_names from pg_attribute
      where attrelid = format('public.%I', table_name)::regclass and attnum > 0 and not attisdropped;
    foreach privilege_name in array array['select','insert','update','references'] loop
      execute format('revoke %s (%s) on public.%I from public, anon, authenticated', privilege_name, column_names, table_name);
    end loop;
  end loop;
end $$;

grant select on public.requests, public.messages, public.bank_accounts, public.request_events to authenticated;
grant update(status) on public.requests to authenticated;
grant insert(user_id,sender_id,body) on public.messages to authenticated;
grant insert,update,delete on public.bank_accounts to authenticated;
grant all on public.requests to service_role;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.validate_request() from public, anon, authenticated;
revoke all on function public.audit_request() from public, anon, authenticated;
drop policy if exists request_create on public.requests;

-- An owner always remains the owner: RLS is evaluated inside PostgreSQL.
drop policy if exists request_read on public.requests;
create policy request_read on public.requests for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists request_review on public.requests;
create policy request_review on public.requests for update to authenticated
using (public.is_admin() and status = 'pending')
with check (public.is_admin() and status in ('approved','rejected'));
drop policy if exists message_read on public.messages;
create policy message_read on public.messages for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists message_send on public.messages;
create policy message_send on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and (user_id = (select auth.uid()) or public.is_admin()));

-- Restrictive guards also apply if another permissive policy is added later.
drop policy if exists security_request_scope on public.requests;
create policy security_request_scope on public.requests as restrictive for all to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists security_request_review on public.requests;
create policy security_request_review on public.requests as restrictive for update to authenticated
using (public.is_admin() and status = 'pending')
with check (public.is_admin() and status in ('approved','rejected'));
drop policy if exists security_message_scope on public.messages;
create policy security_message_scope on public.messages as restrictive for all to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (sender_id = (select auth.uid()) and (user_id = (select auth.uid()) or public.is_admin()));
drop policy if exists security_bank_read on public.bank_accounts;
create policy security_bank_read on public.bank_accounts as restrictive for select to authenticated
using (active or public.is_admin());
drop policy if exists security_bank_insert on public.bank_accounts;
create policy security_bank_insert on public.bank_accounts as restrictive for insert to authenticated
with check (public.is_admin());
drop policy if exists security_bank_update on public.bank_accounts;
create policy security_bank_update on public.bank_accounts as restrictive for update to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists security_bank_delete on public.bank_accounts;
create policy security_bank_delete on public.bank_accounts as restrictive for delete to authenticated
using (public.is_admin());
drop policy if exists security_audit_scope on public.request_events;
create policy security_audit_scope on public.request_events as restrictive for select to authenticated
using (public.is_admin());

create or replace function app_private.valid_holder(value text) returns boolean
language sql immutable set search_path = '' as $$
  select value is not null and length(value) between 2 and 120
    and value ~ '^[-[:alpha:] .''’]+$' and value ~ '[[:alpha:]]';
$$;
revoke all on function app_private.valid_holder(text) from public, anon, authenticated;

create or replace function public.guard_request_input() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if auth.role() in ('anon','authenticated') and not public.is_admin() then
      raise exception using errcode = '42501', message = 'Operación no permitida.';
    end if;
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
      or old.status <> 'pending' or new.status not in ('approved','rejected') then
      raise exception using errcode = '22023', message = 'Solo se puede revisar una solicitud pendiente.';
    end if;
    return new;
  end if;
  if auth.role() in ('anon','authenticated') and (auth.uid() is null or new.user_id <> auth.uid()) then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  if new.status <> 'pending' or new.amount <= 0 or new.amount > 999999999 then
    raise exception using errcode = '22023', message = 'Datos de solicitud no válidos.';
  end if;
  new.created_at := now();
  if new.kind = 'withdrawal' then
    new.holder := btrim(new.holder);
    new.alias := nullif(btrim(new.alias), '');
    if not app_private.valid_holder(new.holder) or new.cbu is null or new.cbu !~ '^[0-9]{22}$'
      or (new.alias is not null and new.alias !~ '^[a-zA-Z0-9.-]{6,20}$') then
      raise exception using errcode = '22023', message = 'Datos bancarios no válidos.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_request_input() from public, anon, authenticated;
drop trigger if exists guard_request_input on public.requests;
create trigger guard_request_input before insert or update on public.requests
for each row execute function public.guard_request_input();

-- Fixed, typed RPC. The caller cannot choose user_id, status, timestamps or receipt URLs.
create or replace function public.create_withdrawal(
  p_amount text, p_holder text, p_cbu text, p_alias text default null
) returns setof public.requests
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); amount_value numeric; holder_value text := btrim(p_holder); alias_value text := nullif(btrim(p_alias),'');
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'Ingresá a tu cuenta.';
  end if;
  if p_amount is null or length(p_amount) > 12 or btrim(p_amount) !~ '^[0-9]+([.,][0-9]{1,2})?$' then
    raise exception using errcode = '22023', message = 'Monto no válido.';
  end if;
  amount_value := replace(btrim(p_amount), ',', '.')::numeric;
  if amount_value <= 0 or amount_value > 999999999 or not app_private.valid_holder(holder_value)
    or p_cbu is null or p_cbu !~ '^[0-9]{22}$'
    or (alias_value is not null and alias_value !~ '^[a-zA-Z0-9.-]{6,20}$') then
    raise exception using errcode = '22023', message = 'Datos de retiro no válidos.';
  end if;
  return query insert into public.requests(user_id,kind,amount,holder,cbu,alias)
    values(actor,'withdrawal',amount_value,holder_value,p_cbu,alias_value) returning *;
end $$;
revoke all on function public.create_withdrawal(text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_withdrawal(text,text,text,text) to authenticated;

create or replace function public.guard_message_input() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or new.sender_id <> actor or (new.user_id <> actor and not public.is_admin()) then
    raise exception using errcode = '42501', message = 'Operación no permitida.';
  end if;
  new.body := btrim(new.body);
  if new.body is null or length(new.body) not between 1 and 2000 or new.body !~ '[^[:space:]]'
    or regexp_replace(new.body, E'[\n\r\t]', '', 'g') ~ '[[:cntrl:]]'
    or new.body ~ U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]' then
    raise exception using errcode = '22023', message = 'Mensaje no válido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 2));
  if (select count(*) from public.messages where sender_id = actor and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Alcanzaste el límite de mensajes. Esperá un minuto.';
  end if;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.guard_message_input() from public, anon, authenticated;
drop trigger if exists guard_message_input on public.messages;
create trigger guard_message_input before insert on public.messages
for each row execute function public.guard_message_input();
create index if not exists messages_sender_date on public.messages(sender_id,created_at);

-- security_invoker preserves the underlying table's RLS. Optional fields support 001-only projects.
create or replace view public.request_summaries with (security_invoker = true) as
select r.id,r.user_id,r.kind,r.amount,r.status,r.created_at,r.holder,r.cbu,r.alias,r.receipt_path,
  to_jsonb(r)->>'receipt_url' as receipt_url,
  (to_jsonb(r)->>'bonus_id')::uuid as bonus_id,
  coalesce((to_jsonb(r)->>'bonus_percent')::numeric,0) as bonus_percent
from public.requests r;
revoke all on public.request_summaries from public, anon, authenticated;
grant select on public.request_summaries to authenticated;
commit;
