-- Acelera el listado paginado de cargas: kind = 'deposit' ordenado por fecha.
create index if not exists requests_kind_created_at on public.requests (kind, created_at desc);
