-- BORRADOR. NO ejecutar todo el archivo de forma automática.
-- Elegir con EXPLAIN, espacio disponible e índices existentes. Una sentencia
-- CONCURRENTLY por ejecución; NO envolverlas en BEGIN/COMMIT.

-- Historial paginado por usuario y tipo; evaluar contra requests_user_date.
create index concurrently if not exists opt_requests_user_kind_page
  on public.requests(user_id, kind, created_at desc, id desc);

-- Pendientes y sus contadores, sin indexar todo el historial resuelto.
create index concurrently if not exists opt_requests_pending_queue
  on public.requests(kind, created_at, id) where status = 'pending';

-- Último retiro aprobado para el contador de espera del jugador.
create index concurrently if not exists opt_requests_last_approved_withdrawal
  on public.requests(user_id, approved_at desc, created_at desc, id desc)
  where kind = 'withdrawal' and status = 'approved';

-- Ranking de cargas acreditadas por rango temporal.
create index concurrently if not exists opt_deposit_credits_date
  on public.deposit_credits(credited_at) include (user_id, request_id);

-- Evitar recorrer notificaciones ya enviadas al comprobar una cola vacía.
create index concurrently if not exists opt_announcement_push_pending
  on public.user_notifications(created_at, id) include (push_claimed_at)
  where kind = 'announcement' and push_sent_at is null;

-- Recuperación de trabajadores interrumpidos.
create index concurrently if not exists opt_telegram_stalled
  on public.telegram_alerts(claimed_at) where status = 'sending';

-- Candidatos para los EXISTS de las políticas de lectura de adjuntos.
create index concurrently if not exists opt_external_chat_attachment
  on public.external_chat_messages(attachment_path) include (thread_id)
  where attachment_path is not null;
create index concurrently if not exists opt_chat_attachment
  on public.messages(attachment_path) include (user_id)
  where attachment_path is not null;
