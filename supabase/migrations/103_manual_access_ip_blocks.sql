begin;
create table public.access_ip_blocks (
  ip_hash text primary key,
  active boolean not null default true,
  request_id uuid not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.access_ip_blocks enable row level security;
revoke all on public.access_ip_blocks from anon, authenticated;
grant all on public.access_ip_blocks to service_role;
commit;
