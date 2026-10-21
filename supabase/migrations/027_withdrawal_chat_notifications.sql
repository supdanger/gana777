begin;

alter table public.user_notifications drop constraint if exists user_notifications_request_id_key;
alter table public.user_notifications drop constraint if exists user_notifications_kind_check;
alter table public.user_notifications alter column request_id drop not null;
alter table public.user_notifications add column part_number integer;
alter table public.user_notifications add column message_id uuid references public.messages(id) on delete cascade;
alter table public.user_notifications add constraint user_notifications_kind_check
  check (kind in ('deposit_credited', 'withdrawal_paid', 'chat_message'));
alter table public.user_notifications add constraint user_notifications_source_check check (
  (kind = 'deposit_credited' and request_id is not null and part_number is null and message_id is null) or
  (kind = 'withdrawal_paid' and request_id is not null and part_number is not null and message_id is null) or
  (kind = 'chat_message' and request_id is null and part_number is null and message_id is not null)
);
create unique index user_notifications_deposit_once on public.user_notifications(request_id) where kind = 'deposit_credited';
create unique index user_notifications_withdrawal_part_once on public.user_notifications(request_id, part_number) where kind = 'withdrawal_paid';
create unique index user_notifications_chat_once on public.user_notifications(message_id) where kind = 'chat_message';

-- El índice parcial anterior reemplaza la antigua unicidad global de request_id.
create or replace function public.confirm_deposit_credit(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.requests%rowtype;
  v_notification_id uuid;
  v_new boolean := false;
begin
  if not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para acreditar cargas.' using errcode = '42501';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'deposit' or v_request.status <> 'approved' then
    raise exception 'La carga debe estar aprobada antes de confirmar la acreditación.' using errcode = '22023';
  end if;
  insert into public.deposit_credits(request_id, user_id, confirmed_by)
    values (v_request.id, v_request.user_id, auth.uid())
    on conflict (request_id) do nothing;
  insert into public.user_notifications(user_id, request_id, kind, title, body)
    values (v_request.user_id, v_request.id, 'deposit_credited', '¡Tu carga fue acreditada!',
      'Ya acreditamos tu carga de ' || to_char(v_request.amount, 'FM999G999G999G990D00') || '. Entrá a Gana777 para verla.')
    on conflict (request_id) where kind = 'deposit_credited' do nothing returning id into v_notification_id;
  v_new := v_notification_id is not null;
  if not v_new then
    select id into v_notification_id from public.user_notifications
      where request_id = v_request.id and kind = 'deposit_credited';
  end if;
  return jsonb_build_object('notification_id', v_notification_id, 'newly_credited', v_new);
end $$;

create or replace function public.confirm_withdrawal_part(p_request_id uuid, p_part_number integer, p_receipt_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_request public.requests%rowtype;
  v_part public.withdrawal_parts%rowtype;
  v_total integer;
begin
  if not public.has_admin_permission('withdrawal') then
    raise exception 'No tenés permiso para acreditar retiros.' using errcode = '42501';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'withdrawal' or v_request.status <> 'pending' then
    raise exception 'El retiro ya no está pendiente.' using errcode = '22023';
  end if;
  if p_part_number is null or p_receipt_path is null
    or p_receipt_path !~ ('^' || p_request_id::text || '/' || p_part_number::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'withdrawal-receipts' and o.name = p_receipt_path)
  then raise exception 'Comprobante de pago inválido.' using errcode = '22023'; end if;
  update public.withdrawal_parts set receipt_path = p_receipt_path, paid_at = now(), paid_by = auth.uid()
    where request_id = p_request_id and part_number = p_part_number and paid_at is null
    returning * into v_part;
  if not found then raise exception 'Este pago ya fue confirmado.' using errcode = '22023'; end if;
  select count(*) into v_total from public.withdrawal_parts where request_id = p_request_id;
  insert into public.user_notifications(user_id, request_id, part_number, kind, title, body)
    values (v_request.user_id, p_request_id, p_part_number, 'withdrawal_paid',
      'Retiro ' || p_part_number || ' de ' || v_total || ' realizado',
      'Transferimos $ ' || to_char(v_part.amount, 'FM999G999G999G990D00') || '. El comprobante ya está en Tus retiros.');
  if not exists (select 1 from public.withdrawal_parts where request_id = p_request_id and paid_at is null) then
    update public.requests set status = 'approved' where id = p_request_id;
  end if;
end $$;

create or replace function public.notify_player_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_id <> new.user_id then
    insert into public.user_notifications(user_id, message_id, kind, title, body)
      values (new.user_id, new.id, 'chat_message', 'Nuevo mensaje de soporte',
        'Tenés un nuevo mensaje en el chat de Gana777.');
  end if;
  return new;
end $$;
revoke all on function public.notify_player_chat_message() from public, anon, authenticated;
create trigger notify_player_chat_message after insert on public.messages
for each row execute function public.notify_player_chat_message();

commit;
