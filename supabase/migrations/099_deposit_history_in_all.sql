-- Todas incluye el historial. Disponibles sigue siendo solo lo que nadie tomó.
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
    where r.kind = 'deposit'
      and not exists (select 1 from public.deposit_queue_archives a where a.request_id = r.id)
      and (
        (p_filter = 'all' and r.status in ('pending','approved','rejected'))
        or (p_filter <> 'all' and r.status = 'pending'
          and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
          and ((p_filter = 'mine' and c.claimed_by = auth.uid())
            or (p_filter = 'available' and c.claimed_by is null)))
      );
  select coalesce(jsonb_agg(app_private.deposit_queue_row(page.id) order by page.created_at desc, page.id desc), '[]') into v_rows
  from (
    select r.id, r.created_at from public.requests r
      left join public.deposit_claims c on c.request_id = r.id
      where r.kind = 'deposit'
        and not exists (select 1 from public.deposit_queue_archives a where a.request_id = r.id)
        and (
          (p_filter = 'all' and r.status in ('pending','approved','rejected'))
          or (p_filter <> 'all' and r.status = 'pending'
            and not exists (select 1 from public.deposit_credits d where d.request_id = r.id)
            and ((p_filter = 'mine' and c.claimed_by = auth.uid())
              or (p_filter = 'available' and c.claimed_by is null)))
        )
      order by r.created_at desc, r.id desc limit 30 offset (p_page * 30)
  ) page;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'pending_count', v_pending);
end $$;

commit;
