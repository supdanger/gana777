-- BORRADOR: NO EJECUTADO. Revisar primero en un proyecto de pruebas con migraciones 001–089.
-- Activar con operadores fuera de las pantallas de acreditación y recargar sus paneles.
-- Conserva SAC históricos, turnos de caja, bonos, asignaciones y lógica de acreditación.
begin;

create table public.deposit_claims (
  request_id uuid primary key references public.requests(id) on delete cascade,
  claimed_by uuid references auth.users(id) on delete restrict,
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz,
  credit_started_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete restrict,
  check ((claimed_by is null) = (claimed_at is null))
);
create index deposit_claims_owner_idx on public.deposit_claims(claimed_by, request_id)
  where claimed_by is not null and resolved_at is null;
create index deposit_queue_pending_idx on public.requests(created_at, id)
  where kind = 'deposit' and status = 'pending';

create table public.deposit_claim_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  previous_owner uuid references auth.users(id) on delete set null,
  next_owner uuid references auth.users(id) on delete set null,
  event text not null check (event in ('taken','released','reassigned','approved','rejected','credited')),
  reason text check (reason is null or length(reason) between 5 and 300),
  created_at timestamptz not null default now()
);
create index deposit_claim_events_request_idx on public.deposit_claim_events(request_id, id desc);
alter table public.deposit_claims enable row level security;
alter table public.deposit_claim_events enable row level security;
revoke all on public.deposit_claims, public.deposit_claim_events from public, anon, authenticated;
grant select on public.deposit_claims, public.deposit_claim_events to authenticated;
create policy deposit_claim_read on public.deposit_claims for select to authenticated
  using (public.has_admin_permission('deposit') or public.has_admin_permission('history'));
create policy deposit_claim_events_read on public.deposit_claim_events for select to authenticated
  using (public.has_admin_permission('deposit') or public.has_admin_permission('history'));

-- El mismo bloqueo de requests se usa SIEMPRE antes de leer/escribir la toma.
create function app_private.assert_deposit_claim(p_request_id uuid, p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para operar esta carga.';
  end if;
  perform 1 from public.requests where id = p_request_id and kind = 'deposit' for update;
  if not found then raise exception 'La carga ya no está disponible.'; end if;
  if not exists (select 1 from public.deposit_claims c where c.request_id = p_request_id
    and c.claimed_by = auth.uid() and c.claim_token = p_token) then
    raise exception 'La asignación de esta carga cambió. Volvé a abrirla.';
  end if;
end $$;

-- Devuelve una sola solicitud; sin duplicar ni reemplazar request_summaries.
create function app_private.deposit_actor_name(p_actor uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.display_name,''),nullif(p.username,''),
    nullif(u.raw_user_meta_data->>'display_name',''),nullif(split_part(u.email,'@',1),''),'Compañero')
  from auth.users u left join public.cashier_profiles p on p.user_id=u.id where u.id=p_actor;
$$;

create function app_private.deposit_queue_row(p_request_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(r) || jsonb_build_object('claimed_by', c.claimed_by,
    'claimed_name', app_private.deposit_actor_name(c.claimed_by),
    'claim_token', c.claim_token, 'claimed_at', c.claimed_at, 'credit_started_at', c.credit_started_at)
  from public.request_summaries r left join public.deposit_claims c on c.request_id = r.id
  where r.id = p_request_id and r.kind = 'deposit';
$$;

create function public.list_deposit_queue(p_filter text default 'available', p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total bigint; v_pending bigint; v_rows jsonb;
begin
  if auth.uid() is null or not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para operar esta carga.';
  end if;
  if p_filter is null or p_filter not in ('available','mine','all') or p_page is null or p_page < 0 or p_page > 100000 then
    raise exception 'Filtro de cargas inválido.';
  end if;
  select count(*) into v_pending from public.requests where kind = 'deposit' and status = 'pending';
  select count(*) into v_total from public.requests r
    left join public.deposit_claims c on c.request_id = r.id
    where r.kind = 'deposit' and r.status in ('pending','approved')
      and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
      and (p_filter = 'all' or (p_filter = 'mine' and c.claimed_by = auth.uid())
        or (p_filter = 'available' and r.status = 'pending' and c.claimed_by is null));
  -- Seleccionar ids antes de construir las filas evita resolver perfiles/rutas del historial completo.
  select coalesce(jsonb_agg(app_private.deposit_queue_row(page.id) order by page.created_at, page.id), '[]') into v_rows
  from (
    select r.id, r.created_at from public.requests r
      left join public.deposit_claims c on c.request_id = r.id
      where r.kind = 'deposit' and r.status in ('pending','approved')
        and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
        and (p_filter = 'all' or (p_filter = 'mine' and c.claimed_by = auth.uid())
          or (p_filter = 'available' and r.status = 'pending' and c.claimed_by is null))
      order by r.created_at, r.id limit 30 offset (p_page * 30)
  ) page;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'pending_count', v_pending);
end $$;

create function public.take_deposit(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_request public.requests%rowtype; v_claim public.deposit_claims%rowtype;
begin
  if auth.uid() is null or not public.has_admin_permission('deposit') then
    raise exception 'No tenés permiso para operar esta carga.';
  end if;
  select * into v_request from public.requests where id = p_request_id for update;
  if not found or v_request.kind <> 'deposit' or v_request.status not in ('pending','approved')
    or exists(select 1 from public.deposit_credits where request_id = p_request_id) then
    raise exception 'La carga ya no está disponible.';
  end if;
  select * into v_claim from public.deposit_claims where request_id = p_request_id;
  if v_claim.claimed_by = auth.uid() then return app_private.deposit_queue_row(p_request_id); end if;
  if v_claim.claimed_by is not null then
    raise exception 'La carga ya fue tomada por otro compañero. Actualizá la bandeja.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Una carga aceptada requiere revisión del supervisor para cambiar de responsable.';
  end if;
  insert into public.deposit_claims(request_id, claimed_by, claimed_at)
    values (p_request_id, auth.uid(), now())
    on conflict (request_id) do update set claimed_by = auth.uid(), claimed_at = now(),
      claim_token = gen_random_uuid(), credit_started_at = null, resolved_at = null, resolved_by = null;
  insert into public.deposit_claim_events(request_id,actor,next_owner,event)
    values(p_request_id,auth.uid(),auth.uid(),'taken');
  return app_private.deposit_queue_row(p_request_id);
end $$;

create function public.release_deposit(p_request_id uuid, p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.assert_deposit_claim(p_request_id, p_token);
  if exists(select 1 from public.requests where id = p_request_id and status <> 'pending')
    or exists(select 1 from public.deposit_claims where request_id = p_request_id and credit_started_at is not null) then
    raise exception 'Una carga aceptada requiere revisión del supervisor para cambiar de responsable.';
  end if;
  update public.deposit_claims set claimed_by = null, claimed_at = null, claim_token = gen_random_uuid()
    where request_id = p_request_id;
  insert into public.deposit_claim_events(request_id,actor,previous_owner,event)
    values(p_request_id,auth.uid(),auth.uid(),'released');
end $$;

-- El supervisor asume personalmente la carga; no se la entrega a alguien que no la está mirando.
create function public.reassign_deposit(p_request_id uuid, p_token uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_token uuid; v_status text;
begin
  if auth.uid() is null or not public.is_super_admin() then raise exception 'No tenés permiso para operar esta carga.'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 300 then
    raise exception 'Escribí un motivo de entre 5 y 300 caracteres.';
  end if;
  select status into v_status from public.requests where id = p_request_id and kind = 'deposit' for update;
  if not found or v_status not in ('pending','approved')
    or exists(select 1 from public.deposit_credits where request_id = p_request_id) then
    raise exception 'La carga ya no está disponible.';
  end if;
  select claimed_by, claim_token into v_owner, v_token from public.deposit_claims where request_id = p_request_id;
  if v_token is distinct from p_token then raise exception 'La asignación de esta carga cambió. Volvé a abrirla.'; end if;
  insert into public.deposit_claims(request_id,claimed_by,claimed_at,credit_started_at)
    values(p_request_id,auth.uid(),now(),case when v_status='approved' then now() end)
    on conflict(request_id) do update set claimed_by=auth.uid(), claimed_at=now(), claim_token=gen_random_uuid();
  insert into public.deposit_claim_events(request_id,actor,previous_owner,next_owner,event,reason)
    values(p_request_id,auth.uid(),v_owner,auth.uid(),'reassigned',btrim(p_reason));
  return app_private.deposit_queue_row(p_request_id);
end $$;

create function public.review_queue_deposit(p_request_id uuid, p_token uuid, p_status text,
  p_actual_amount numeric default null, p_apply_bonus boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_request public.requests%rowtype;
begin
  perform app_private.assert_deposit_claim(p_request_id,p_token);
  select * into v_request from public.requests where id=p_request_id;
  if v_request.status <> 'pending' or p_status is null or p_status not in ('approved','rejected') then
    raise exception 'La carga ya no está disponible.';
  end if;
  if p_status='approved' and v_request.requested_special_bonus_id is not null then
    perform public.review_special_deposit(p_request_id,p_actual_amount,p_apply_bonus);
  else
    update public.requests set status=p_status where id=p_request_id;
  end if;
  update public.deposit_claims set credit_started_at=case when p_status='approved' then now() else credit_started_at end,
    resolved_at=case when p_status='rejected' then now() end,
    resolved_by=case when p_status='rejected' then auth.uid() end where request_id=p_request_id;
  insert into public.deposit_claim_events(request_id,actor,previous_owner,next_owner,event)
    values(p_request_id,auth.uid(),auth.uid(),auth.uid(),p_status);
  return app_private.deposit_queue_row(p_request_id);
end $$;

create function public.confirm_queue_deposit_credit(p_request_id uuid, p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform app_private.assert_deposit_claim(p_request_id,p_token);
  -- Reutiliza íntegramente la función existente: bonos, giros, referidos y notificación idempotente.
  v_result := public.confirm_deposit_credit(p_request_id);
  if not exists(select 1 from public.deposit_claims where request_id=p_request_id and resolved_at is not null) then
    update public.deposit_claims set resolved_at=now(),resolved_by=auth.uid() where request_id=p_request_id;
    insert into public.deposit_claim_events(request_id,actor,previous_owner,next_owner,event)
      values(p_request_id,auth.uid(),auth.uid(),auth.uid(),'credited');
  end if;
  return v_result;
end $$;

-- Las pestañas viejas tampoco pueden saltarse la toma por REST o por las RPC antiguas.
create function public.list_deposit_claim_events(p_request_id uuid)
returns table(event text, actor_name text, previous_name text, next_name text, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.has_admin_permission('deposit') or public.has_admin_permission('history')) then
    raise exception 'No tenés permiso para operar esta carga.';
  end if;
  return query select e.event, coalesce(app_private.deposit_actor_name(e.actor),'Compañero'),
    app_private.deposit_actor_name(e.previous_owner), app_private.deposit_actor_name(e.next_owner), e.reason,e.created_at
    from public.deposit_claim_events e
    where e.request_id=p_request_id order by e.id desc limit 20;
end $$;

-- Las pestañas viejas tampoco pueden saltarse la toma por REST o por las RPC antiguas.
create policy deposit_reviews_via_queue on public.requests as restrictive for update to authenticated
  using (kind <> 'deposit') with check (kind <> 'deposit');
revoke execute on function public.review_special_deposit(uuid,numeric,boolean),
  public.confirm_deposit_credit(uuid) from public, anon, authenticated;

revoke all on function app_private.assert_deposit_claim(uuid,uuid), app_private.deposit_queue_row(uuid), app_private.deposit_actor_name(uuid) from public,anon,authenticated;
revoke all on function public.list_deposit_queue(text,integer), public.take_deposit(uuid),
  public.release_deposit(uuid,uuid), public.reassign_deposit(uuid,uuid,text),
  public.review_queue_deposit(uuid,uuid,text,numeric,boolean), public.confirm_queue_deposit_credit(uuid,uuid), public.list_deposit_claim_events(uuid)
  from public,anon,authenticated;
grant execute on function public.list_deposit_queue(text,integer), public.take_deposit(uuid),
  public.release_deposit(uuid,uuid), public.reassign_deposit(uuid,uuid,text),
  public.review_queue_deposit(uuid,uuid,text,numeric,boolean), public.confirm_queue_deposit_credit(uuid,uuid), public.list_deposit_claim_events(uuid)
  to authenticated;

-- Elimina únicamente el filtro por teléfonos SAC de la asignación bancaria.
-- Falla de forma transaccional si la función real no coincide con la base revisada.
do $$
declare v_def text; v_old text := 'where b.active and (not sac_routing or exists (
      select 1 from public.sac_phones sp where sp.phone_number = b.phone_number
    ))';
begin
  select pg_get_functiondef('public.assign_bank_account()'::regprocedure) into v_def;
  if strpos(v_def,v_old)=0 then raise exception 'Revisar assign_bank_account antes de retirar SAC.'; end if;
  v_def := replace(v_def,v_old,'where b.active');
  v_def := replace(v_def,'select exists(select 1 from public.sac_phones) into sac_routing;','');
  execute v_def;
end $$;

-- No borra historia ni cambia las asignaciones reservadas previamente.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.deposit_claims;
  end if;
end $$;

-- Publicar la capacidad al final: el frontend conserva el flujo anterior si esta RPC no existe.
create function public.get_deposit_queue_mode() returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Operación no permitida.'; end if;
  return 1;
end $$;
revoke all on function public.get_deposit_queue_mode() from public,anon,authenticated;
grant execute on function public.get_deposit_queue_mode() to authenticated;
commit;
