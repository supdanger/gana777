-- Diseños adicionales; los banners se suben desde Cuentas a Supabase Storage.
insert into public.bank_themes(key,name) values
  ('galicia','Banco Galicia'),
  ('uala','Ualá'),
  ('lemon','Lemon'),
  ('astropay','AstroPay'),
  ('claro-pay','Claro Pay'),
  ('personal-pay','Personal Pay'),
  ('brubank','Brubank')
on conflict (key) do update set name=excluded.name;
