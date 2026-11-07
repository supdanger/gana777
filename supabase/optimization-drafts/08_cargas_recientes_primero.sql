-- Corrección para instalaciones que ya tienen la bandeja compartida del archivo 06.
-- Solo cambia el orden de lectura; no modifica solicitudes, tomas ni permisos.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $$
declare definition text;
begin
  select pg_get_functiondef(to_regprocedure('public.list_deposit_queue(text,integer)')) into definition;
  if definition is null then raise exception 'Primero debe estar instalada la bandeja compartida.'; end if;
  if strpos(definition,'order by page.created_at desc, page.id desc') > 0
    and strpos(definition,'order by r.created_at desc, r.id desc limit 30') > 0 then return; end if;
  if strpos(definition,'order by page.created_at, page.id') = 0
    or strpos(definition,'order by r.created_at, r.id limit 30') = 0 then
    raise exception 'La función de cargas cambió: revisar su orden antes de aplicar la corrección.';
  end if;
  definition := replace(definition,'order by page.created_at, page.id','order by page.created_at desc, page.id desc');
  definition := replace(definition,'order by r.created_at, r.id limit 30','order by r.created_at desc, r.id desc limit 30');
  execute definition;
end $$;
commit;
