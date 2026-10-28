begin;

alter table public.external_chat_threads
  drop constraint if exists external_chat_threads_origin_check;
alter table public.external_chat_threads
  add constraint external_chat_threads_origin_check
  check (origin in (
    'https://gana777bet.com',
    'https://www.gana777bet.com',
    'https://gana777bet.online',
    'https://gana777.vercel.app'
  ));

commit;
