-- OPERACIÓN AUTORIZADA: aprobadas sin acreditación, desde el inicio hasta el corte fijo indicado abajo.
-- Ejecutar primero 09. No elimina solicitudes ni inserta créditos/notificaciones.
-- Las pendientes de revisión y las creadas después del corte permanecen en la bandeja.
-- CORTE FIJO: 2026-11-07T17:54:33+00:00. No avanzar este corte al reintentar la operación.
begin;
set transaction isolation level read committed;
set local lock_timeout = '3s';
set local statement_timeout = '20s';
create temp table archive_test_run(batch_id uuid,cutoff_at timestamptz) on commit drop;
insert into archive_test_run values('037d369b-95cb-497e-a0b5-f9e94aba5390'::uuid,'2026-11-07T17:54:33+00:00'::timestamptz);
create temp table archive_test_candidates on commit drop as
  select r.id from public.requests r cross join archive_test_run run
  where r.kind='deposit' and r.status='approved' and r.created_at<=run.cutoff_at
    and not exists(select 1 from public.deposit_credits d where d.request_id=r.id)
    and not exists(select 1 from public.deposit_queue_archives a where a.request_id=r.id);
-- Orden de bloqueo estable. La inserción posterior vuelve a comprobar acreditaciones
-- con un snapshot nuevo, por si una confirmación terminó mientras esperábamos el bloqueo.
do $$ begin
  perform 1 from public.requests r join archive_test_candidates c on c.id=r.id order by r.id for update of r;
end $$;
insert into public.deposit_queue_archives(request_id,batch_id,cutoff_at,archived_by,reason)
  select r.id,run.batch_id,run.cutoff_at,auth.uid(),
    'Carga de prueba anterior al inicio operativo; retirada de la bandeja por instrucción del administrador.'
  from public.requests r join archive_test_candidates c on c.id=r.id cross join archive_test_run run
  where r.kind='deposit' and r.status='approved' and r.created_at<=run.cutoff_at
    and not exists(select 1 from public.deposit_credits d where d.request_id=r.id)
  on conflict(request_id) do nothing;
-- Invalida pantallas abiertas y dispara el canal de tomas existente, sin nuevos canales.
update public.deposit_claims c set claim_token=gen_random_uuid()
  from public.deposit_queue_archives a,archive_test_run run
  where c.request_id=a.request_id and a.batch_id=run.batch_id;
select run.batch_id,run.cutoff_at,count(a.request_id) as archived_requests
  from archive_test_run run left join public.deposit_queue_archives a on a.batch_id=run.batch_id
  group by run.batch_id,run.cutoff_at;
commit;
