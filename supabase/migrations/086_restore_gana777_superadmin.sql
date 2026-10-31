begin;

-- Restaura el acceso del administrador principal sin tocar otros usuarios.
insert into public.admin_users (user_id, is_super_admin)
select id, true
from auth.users
where lower(email) = lower('gana777@gmail.com')
on conflict (user_id) do update
set is_super_admin = true;

commit;
