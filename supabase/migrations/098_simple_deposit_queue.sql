-- La bandeja de trabajo solo muestra cargas pendientes.
-- Aprobar y acreditar ocurre en la misma llamada, así no queda un paso de supervisor.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

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
    where r.kind = 'deposit' and r.status = 'pending'
      and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
      and not exists (select 1 from public.deposit_queue_archives a where a.request_id = r.id)
      and (p_filter = 'all' or (p_filter = 'mine' and c.claimed_by = auth.uid())
        or (p_filter = 'available' and c.claimed_by is null));
  select coalesce(jsonb_agg(app_private.deposit_queue_row(page.id) order by page.created_at desc, page.id desc), '[]') into v_rows
  from (
    select r.id, r.created_at from public.requests r
      left join public.deposit_claims c on c.request_id = r.id
      where r.kind = 'deposit' and r.status = 'pending'
        and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
        and not exists (select 1 from public.deposit_queue_archives a where a.request_id = r.id)
        and (p_filter = 'all' or (p_filter = 'mine' and c.claimed_by = auth.uid())
          or (p_filter = 'available' and c.claimed_by is null))
      order by r.created_at desc, r.id desc limit 30 offset (p_page * 30)
  ) page;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'pending_count', v_pending);
end $$;

create or replace function public.review_queue_deposit(p_request_id uuid, p_token uuid, p_status text,
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
  if p_status='approved' then
    perform public.confirm_deposit_credit(p_request_id);
    update public.deposit_claims set resolved_at=coalesce(resolved_at,now()), resolved_by=coalesce(resolved_by,auth.uid()) where request_id=p_request_id;
    insert into public.deposit_claim_events(request_id,actor,previous_owner,next_owner,event)
      values(p_request_id,auth.uid(),auth.uid(),auth.uid(),'credited');
  end if;
  return app_private.deposit_queue_row(p_request_id);
end $$;

commit;
