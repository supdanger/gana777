-- Índices de lectura. Sin CONCURRENTLY para poder aplicarlos en la migración.
-- La base es chica; el bloqueo es breve.

create index if not exists opt_requests_user_kind_page
  on public.requests(user_id, kind, created_at desc, id desc);

create index if not exists opt_requests_pending_queue
  on public.requests(kind, created_at, id) where status = 'pending';

create index if not exists opt_requests_last_approved_withdrawal
  on public.requests(user_id, approved_at desc, created_at desc, id desc)
  where kind = 'withdrawal' and status = 'approved';

create index if not exists opt_deposit_credits_date
  on public.deposit_credits(credited_at) include (user_id, request_id);

create index if not exists opt_announcement_push_pending
  on public.user_notifications(created_at, id) include (push_claimed_at)
  where kind = 'announcement' and push_sent_at is null;

create index if not exists opt_telegram_stalled
  on public.telegram_alerts(claimed_at) where status = 'sending';

create index if not exists opt_external_chat_attachment
  on public.external_chat_messages(attachment_path) include (thread_id)
  where attachment_path is not null;

create index if not exists opt_chat_attachment
  on public.messages(attachment_path) include (user_id)
  where attachment_path is not null;
