-- BORRADOR. No ejecutado. Revisar primero pg_policies en producción y comparar
-- con las definiciones de 015 y 026. Conserva sus mismos permisos y su carácter
-- restrictivo/permisivo. No usar si las políticas reales fueron personalizadas.
-- Probar con JWT de jugador/cajero/superadmin en una copia de la base.
-- Los subselects solo envuelven funciones independientes de la fila actual.
begin;

alter policy request_read on public.requests using (
  user_id = (select auth.uid())
  or (select public.has_admin_permission('home'))
  or (select public.has_admin_permission('history'))
  or (select public.has_admin_permission('users'))
  or (kind = 'deposit' and (select public.has_admin_permission('deposit')))
  or (kind = 'withdrawal' and (select public.has_admin_permission('withdrawal')))
);

alter policy security_request_scope on public.requests using (
  user_id = (select auth.uid())
  or (select public.has_admin_permission('home'))
  or (select public.has_admin_permission('history'))
  or (select public.has_admin_permission('users'))
  or (kind = 'deposit' and (select public.has_admin_permission('deposit')))
  or (kind = 'withdrawal' and (select public.has_admin_permission('withdrawal')))
) with check (user_id = (select auth.uid()) or (select public.is_admin()));

alter policy message_read on public.messages using (
  user_id = (select auth.uid()) or (select public.has_admin_permission('chat'))
  or (select public.has_admin_permission('users'))
);

alter policy security_message_scope on public.messages using (
  user_id = (select auth.uid()) or (select public.has_admin_permission('chat'))
  or (select public.has_admin_permission('users'))
) with check (
  sender_id = (select auth.uid()) and
  (user_id = (select auth.uid()) or (select public.has_admin_permission('chat')))
);

alter policy message_send on public.messages with check (
  sender_id = (select auth.uid()) and
  (user_id = (select auth.uid()) or (select public.has_admin_permission('chat')))
);

alter policy withdrawal_parts_read on public.withdrawal_parts using (
  exists (
    select 1 from public.requests r where r.id = request_id
      and (r.user_id = (select auth.uid()) or (select public.has_admin_permission('withdrawal')))
  )
);

commit;
