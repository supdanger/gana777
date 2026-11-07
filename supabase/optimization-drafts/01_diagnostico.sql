-- BORRADOR. Solo lectura. No modifica tablas, configuración ni datos.
select current_database() as database_name, pg_size_pretty(pg_database_size(current_database())) as database_size;

select n.nspname as schema_name, c.relname as relation_name,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'm') and n.nspname not in ('pg_catalog', 'information_schema')
order by pg_total_relation_size(c.oid) desc limit 40;

select schemaname, relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze,
  seq_scan, idx_scan
from pg_stat_user_tables order by n_dead_tup desc limit 30;

select schemaname, relname, indexrelname, idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes order by pg_relation_size(indexrelid) desc limit 40;

select schemaname, tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in
  ('requests','deposit_credits','user_notifications','telegram_alerts','messages','external_chat_messages')
order by tablename, indexname;

select slot_name, active, restart_lsn, confirmed_flush_lsn,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained_wal
from pg_replication_slots;

-- Requiere pg_cron, ya utilizado por las migraciones de este repositorio.
select jobid, jobname, schedule, active from cron.job order by jobid;
select jobid, status, count(*) as executions, min(start_time), max(start_time)
from cron.job_run_details group by jobid, status order by executions desc;

select status, count(*), min(created_at), max(created_at)
from public.telegram_alerts group by status;
select count(*) as stalled_telegram_sends from public.telegram_alerts
where status = 'sending' and claimed_at < now() - interval '5 minutes';

select kind, count(*), min(created_at), max(created_at)
from public.user_notifications group by kind;

select schemaname, tablename, policyname, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- Metadatos de Storage; no representan el disco PostgreSQL consumido por el archivo.
select bucket_id, count(*) as objects,
  pg_size_pretty(coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$'
    then (metadata->>'size')::bigint else 0 end), 0)::bigint) as declared_object_bytes
from storage.objects group by bucket_id order by count(*) desc;
