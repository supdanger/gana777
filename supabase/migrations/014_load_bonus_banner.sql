-- Reemplaza el antiguo bono de bienvenida por la comunicación permanente de bonos por carga.
update public.promotions
set title = 'Bonos por carga',
    description = 'Desde $5.000 recibís $1.000 y desde $10.000 recibís $2.000.',
    image_path = null,
    image_layout = 'image'
where id = '00000000-0000-4000-8000-000000000777';
