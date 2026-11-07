-- PREPARADO, NO EJECUTADO. Requiere la bandeja compartida (migración 094).
-- Archivo reversible de pruebas: no modifica estados, importes, créditos ni comprobantes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';
create table if not exists public.deposit_queue_archives (
  request_id uuid primary key references public.requests(id) on delete cascade,
  batch_id uuid not null,
  archived_at timestamptz not null default now(),
  cutoff_at timestamptz not null,
  archived_by uuid references auth.users(id) on delete set null,
  reason text not null check(length(btrim(reason)) between 5 and 300)
);
alter table public.deposit_queue_archives enable row level security;
revoke all on public.deposit_queue_archives from public,anon,authenticated;
grant select on public.deposit_queue_archives to authenticated;
drop policy if exists deposit_queue_archives_read on public.deposit_queue_archives;
create policy deposit_queue_archives_read on public.deposit_queue_archives for select to authenticated
  using (public.has_admin_permission('deposit') or public.has_admin_permission('history'));

create or replace function public.list_deposit_queue(p_filter text default 'available', p_page integer default 0)
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
      and not exists (select 1 from public.deposit_queue_archives a where a.request_id = r.id)
      and (p_filter = 'all' or (p_filter = 'mine' and c.claimed_by = auth.uid())
        or (p_filter = 'available' and r.status = 'pending' and c.claimed_by is null));
  -- Seleccionar ids antes de construir las filas evita resolver perfiles/rutas del historial completo.
  select coalesce(jsonb_agg(app_private.deposit_queue_row(page.id) order by page.created_at desc, page.id desc), '[]') into v_rows
  from (
    select r.id, r.created_at from public.requests r
      left join public.deposit_claims c on c.request_id = r.id
      where r.kind = 'deposit' and r.status in ('pending','approved')
        and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
      and not exists (select 1 from public.deposit_queue_archives a where a.request_id = r.id)
        and (p_filter = 'all' or (p_filter = 'mine' and c.claimed_by = auth.uid())
          or (p_filter = 'available' and r.status = 'pending' and c.claimed_by is null))
      order by r.created_at desc, r.id desc limit 30 offset (p_page * 30)
  ) page;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'pending_count', v_pending);
end $$;

-- Impide tomar, reasignar o confirmar desde una pantalla antigua de una prueba archivada.
do $guard$
declare definition text; signature text;
  old_check text := 'if not exists (select 1 from public.deposit_claims c where c.request_id = p_request_id';
  new_check text := 'if exists(select 1 from public.deposit_queue_archives where request_id=p_request_id) then
    raise exception ''Esta carga fue archivada como prueba.'';
  end if;
  if not exists (select 1 from public.deposit_claims c where c.request_id = p_request_id';
  credit_check text := 'or exists(select 1 from public.deposit_credits where request_id = p_request_id)';
begin
  select pg_get_functiondef(to_regprocedure('app_private.assert_deposit_claim(uuid,uuid)')) into definition;
  if definition is null then raise exception 'Falta la protección de tomas de cargas.'; end if;
  if strpos(definition,'public.deposit_queue_archives')=0 then
    if strpos(definition,old_check)=0 then raise exception 'Revisar assert_deposit_claim antes de archivar.'; end if;
    execute replace(definition,old_check,new_check);
  end if;
  foreach signature in array array['public.take_deposit(uuid)','public.reassign_deposit(uuid,uuid,text)'] loop
    select pg_get_functiondef(to_regprocedure(signature)) into definition;
    if definition is null then raise exception 'Falta la función %',signature; end if;
    if strpos(definition,'public.deposit_queue_archives')=0 then
      if strpos(definition,credit_check)=0 then raise exception 'Revisar % antes de archivar.',signature; end if;
      execute replace(definition,credit_check,credit_check||'
    or exists(select 1 from public.deposit_queue_archives where request_id=p_request_id)');
    end if;
  end loop;
end $guard$;

create or replace function public.list_deposit_claim_events(p_request_id uuid)
returns table(event text, actor_name text, previous_name text, next_name text, reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.has_admin_permission('deposit') or public.has_admin_permission('history')) then
    raise exception 'No tenés permiso para operar esta carga.';
  end if;
  return query select events.event, events.actor_name, events.previous_name, events.next_name, events.reason, events.created_at
  from (
    select e.event, coalesce(app_private.deposit_actor_name(e.actor),'Compañero') as actor_name,
      app_private.deposit_actor_name(e.previous_owner) as previous_name,
      app_private.deposit_actor_name(e.next_owner) as next_name, e.reason, e.created_at, e.id as ordinal
      from public.deposit_claim_events e where e.request_id=p_request_id
    union all
    select 'archived_test',coalesce(app_private.deposit_actor_name(a.archived_by),'Administración'),
      null::text,null::text,a.reason,a.archived_at,9223372036854775807::bigint
      from public.deposit_queue_archives a where a.request_id=p_request_id
  ) events order by events.created_at desc,events.ordinal desc limit 20;
end $$;
commit;
