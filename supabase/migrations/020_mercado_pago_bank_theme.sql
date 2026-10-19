-- Agrega el tema visual de Mercado Pago al registro de diseños bancarios.
insert into public.bank_themes(key,name)
values ('mercado-pago','Mercado Pago')
on conflict (key) do update set name=excluded.name;
