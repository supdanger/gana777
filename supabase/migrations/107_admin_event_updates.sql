begin;
create table public.admin_live_signals (
  scope text primary key,
  version bigint not null default 0
);
insert into public.admin_live_signals(scope) values ('deposit'),('withdrawal'),('chat'),('external-chat'),('access-requests'),('users'),('platform'),('shifts'),('accounts'),('bonuses'),('settings'),('staff');
alter table public.admin_live_signals enable row level security;
revoke all on public.admin_live_signals from public,anon,authenticated;
grant select on public.admin_live_signals to authenticated;
grant all on public.admin_live_signals to service_role;
create policy admin_signal_read on public.admin_live_signals for select to authenticated using(
  (select public.account_access_allowed()) and public.is_admin() and
  (scope in ('staff','settings') or (scope in ('deposit','withdrawal') and public.has_admin_permission('history')) or (scope='accounts' and public.has_admin_permission('deposit')) or public.has_admin_permission(case scope when 'external-chat' then 'external_chat' when 'access-requests' then 'access_requests' else scope end))
);
create function public.emit_admin_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed boolean; targets text[];
begin
  if tg_op='INSERT' then select exists(select 1 from new_changes) into changed;
  elsif tg_op='DELETE' then select exists(select 1 from old_changes) into changed;
  elsif tg_table_name='bank_accounts' then select exists(select to_jsonb(n)-'updated_at'-'usage_count'-'last_used_at' from new_changes n except select to_jsonb(o)-'updated_at'-'usage_count'-'last_used_at' from old_changes o) into changed;
  else select exists(select to_jsonb(n)-'updated_at'-'last_seen_at' from new_changes n except select to_jsonb(o)-'updated_at'-'last_seen_at' from old_changes o) into changed;
  end if;
  if not changed then return null; end if;
  if tg_table_name='requests' then
    if tg_op='DELETE' then select array_agg(distinct kind::text) into targets from old_changes;
    elsif tg_op='UPDATE' then select array_agg(distinct kind) into targets from (select kind::text from new_changes union select kind::text from old_changes) k;
    else select array_agg(distinct kind::text) into targets from new_changes;
    end if;
  elsif tg_table_name='external_chat_threads' then
    targets:=array['external-chat'];
    if tg_op='DELETE' then select exists(select 1 from old_changes where linked_user_id is not null) into changed;
    elsif tg_op='INSERT' then select exists(select 1 from new_changes where linked_user_id is not null) into changed;
    else select exists(select 1 from new_changes where linked_user_id is not null union all select 1 from old_changes where linked_user_id is not null) into changed;
    end if;
    if changed then targets:=array_append(targets,'chat'); end if;
  elsif tg_table_name='external_chat_messages' then
    targets:=array['external-chat'];
    if tg_op='DELETE' then select exists(select 1 from old_changes c join public.external_chat_threads t on t.id=c.thread_id where t.linked_user_id is not null) into changed;
    elsif tg_op='INSERT' then select exists(select 1 from new_changes c join public.external_chat_threads t on t.id=c.thread_id where t.linked_user_id is not null) into changed;
    else select exists(select 1 from new_changes c join public.external_chat_threads t on t.id=c.thread_id where t.linked_user_id is not null union all select 1 from old_changes c join public.external_chat_threads t on t.id=c.thread_id where t.linked_user_id is not null) into changed;
    end if;
    if changed then targets:=array_append(targets,'chat'); end if;
  else targets:=string_to_array(tg_argv[0],',');
  end if;
  update public.admin_live_signals set version=version+1 where scope=any(targets);
  return null;
end;
$$;
revoke all on function public.emit_admin_change() from public,anon,authenticated;
do $$ declare item record;
begin
  for item in select * from (values
    ('requests','deposit,withdrawal'),('withdrawal_parts','withdrawal'),('deposit_claims','deposit'),('deposit_credits','deposit'),
    ('messages','chat'),('chat_thread_completions','chat'),('external_chat_threads','external-chat,chat'),('external_chat_messages','external-chat,chat'),
    ('player_access_requests','access-requests'),('player_access_messages','access-requests'),
    ('user_profiles','users,platform'),('player_casino_links','users,access-requests'),('player_account_controls','users,access-requests'),
    ('access_security_controls','access-requests'),('access_security_events','access-requests'),
    ('cashier_profiles','staff'),('admin_permissions','staff'),('admin_users','staff'),
    ('bank_accounts','accounts'),('bank_themes','accounts'),('sac_stations','shifts'),('sac_phones','shifts'),('bank_operation_state','shifts'),('withdrawal_source_accounts','withdrawal'),('work_shifts','shifts'),('bonus_counter_shifts','bonuses'),('promotions','bonuses'),('app_settings','settings'),('contact_animations','settings')
  ) as mapping(table_name,scopes)
  loop
    if to_regclass('public.'||item.table_name) is null then continue; end if;
    execute format('create trigger admin_live_insert after insert on public.%I referencing new table as new_changes for each statement execute function public.emit_admin_change(%L)',item.table_name,item.scopes);
    execute format('create trigger admin_live_update after update on public.%I referencing new table as new_changes old table as old_changes for each statement execute function public.emit_admin_change(%L)',item.table_name,item.scopes);
    execute format('create trigger admin_live_delete after delete on public.%I referencing old table as old_changes for each statement execute function public.emit_admin_change(%L)',item.table_name,item.scopes);
  end loop;
end; $$;
alter publication supabase_realtime add table public.admin_live_signals;

create function public.admin_inbox_totals(p_external boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.account_request_guard();
  if not public.has_admin_permission(case when p_external then 'external_chat' else 'chat' end) then raise exception 'Operación no permitida.' using errcode='42501'; end if;
  if p_external then
    return (select jsonb_build_object('all',count(*),'pending',count(*) filter(where completed_at is null and last_sender_type='visitor'),'completed',count(*) filter(where completed_at is not null)) from public.external_chat_inbox);
  end if;
  return (select jsonb_build_object('all',count(*),'pending',count(*) filter(where completed_at is null and last_sender_id=user_id),'completed',count(*) filter(where completed_at is not null)) from public.chat_inbox);
end;
$$;
create function public.admin_inbox_page(p_external boolean,p_filter text,p_search text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare term text:= '%'||replace(replace(replace(left(trim(coalesce(p_search,'')),120),'\','\\'),'%','\%'),'_','\_')||'%';
begin
  perform public.account_request_guard();
  if not public.has_admin_permission(case when p_external then 'external_chat' else 'chat' end) then raise exception 'Operación no permitida.' using errcode='42501'; end if;
  if p_filter not in ('all','pending','waiting','completed') or p_page<0 or p_page>100000 then raise exception 'Filtro no válido.'; end if;
  if p_external then
    return (with filtered as not materialized(select v.* from public.external_chat_inbox v where
      (p_filter='all' or (p_filter='completed' and completed_at is not null) or (completed_at is null and ((p_filter='pending' and last_sender_type='visitor') or (p_filter='waiting' and last_sender_type<>'visitor'))))
      and (coalesce(nickname,'') ilike term or coalesce(last_body,'') ilike term))
      select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from filtered order by case when p_filter='pending' then last_message_at end asc,case when p_filter='pending' then last_message_id end asc,last_message_at desc,last_message_id desc offset p_page*50 limit 50)t),'[]'::jsonb)));
  end if;
  return (with filtered as not materialized(select v.* from public.chat_inbox v where
    (p_filter='all' or (p_filter='completed' and completed_at is not null) or (completed_at is null and ((p_filter='pending' and last_sender_id=user_id) or (p_filter='waiting' and last_sender_id<>user_id))))
    and (coalesce(username,'') ilike term or coalesce(display_name,'') ilike term or coalesce(last_body,'') ilike term))
    select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from filtered order by case when p_filter='pending' then last_created_at end asc,case when p_filter='pending' then last_message_id end asc,last_created_at desc,last_message_id desc offset p_page*50 limit 50)t),'[]'::jsonb)));
end;
$$;
revoke all on function public.admin_inbox_totals(boolean),public.admin_inbox_page(boolean,text,text,integer) from public,anon;
grant execute on function public.admin_inbox_totals(boolean),public.admin_inbox_page(boolean,text,text,integer) to authenticated;
commit;
