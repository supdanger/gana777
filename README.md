# GANA777 · Gestión

Vite, React y TypeScript estricto. Una base de código genera dos aplicaciones con el mismo Supabase: usuarios y administración.

La app de usuarios sigue las cinco referencias móviles: login con panda, inicio con banner y tres acciones, cargas, retiros y chat. Los recursos visuales se leen desde Supabase Storage; los comprobantes nuevos van a Cloudinary mediante funciones de servidor y Supabase guarda sus referencias.

## Iniciar

```powershell
npm.cmd install
npm.cmd run dev
# Panel, en otra terminal:
npm.cmd run dev:admin -- --port 5174
```

Copiar `.env.example` a `.env` y completar la URL y la clave pública del proyecto. Nunca usar `service_role` en variables `VITE_`. Node 22.18+ o 24 permite ejecutar también las pruebas TypeScript con el script incluido.

En desarrollo se puede explorar una vista previa sin enviar operaciones. En producción solo está disponible esa opción cuando Supabase no está configurado.

## Supabase y Cloudinary

1. En un proyecto nuevo, ejecutar `supabase/migrations/001_initial.sql`.
2. Ejecutar después `supabase/migrations/002_content_and_cloudinary.sql`. Si 001 ya está aplicada, ejecutar únicamente 002.
3. Aplicar las migraciones restantes hasta `007_user_names.sql`, respetando el orden numérico.
4. Crear cuentas en Supabase Auth. Se ingresa con correo y contraseña.
5. Habilitar a `gana777@gmail.com` como administrador con el SQL siguiente.
6. Configurar la cuenta bancaria receptora real en `bank_accounts`.
7. Subir los recursos visuales y configurar/desplegar las funciones de Cloudinary siguiendo [CONFIGURACION.md](docs/CONFIGURACION.md).

```sql
insert into public.admin_users(user_id)
select id from auth.users where lower(email) = 'gana777@gmail.com'
on conflict (user_id) do nothing;
```

La cuenta debe existir primero en Authentication → Users.

## Dos repositorios y despliegues

Copiar el mismo código fuente a los dos repositorios, con `package-lock.json`. Configurar las mismas variables públicas de Supabase e instalar con `npm ci`.

| Destino | Compilación | Directorio público |
| --- | --- | --- |
| Usuarios | `npm run build` | `dist` |
| Administración | `npm run build:admin` | `dist` |

Los secretos de Cloudinary se configuran únicamente en las Edge Functions del proyecto Supabase, una sola vez. Los permisos se aplican en la base mediante RLS; el dominio del panel no concede acceso por sí mismo.

## Alcance

- Usuarios: login → inicio → cargar, retirar o chat. Cada pantalla vuelve al inicio.
- Cargas: monto ARS, bono habilitado opcional y comprobante JPG/PNG/WebP/PDF de hasta 5 MB.
- Retiros: titular, CBU/CVU de 22 dígitos, alias opcional y monto. Un retiro cada 24 horas, incluso si el anterior fue rechazado, como en la referencia.
- Panel actual: lista desplegable de cargas con monto y nombre de usuario, aprobación/rechazo, apertura de comprobantes y respuesta de chats. La interfaz para gestionar usuarios, imágenes, banners y bonos se hará después.
- Fechas en Buenos Aires, importes ARS. El monto se escribe manualmente, sin incrementos con flechas o rueda del mouse.
- Chat de texto con Realtime. No incluye adjuntos ni notificaciones externas.

Aprobar una solicitud cambia su estado; las transferencias bancarias y la acreditación en una plataforma externa requieren integrar al proveedor. El alta pública y la recuperación de contraseña todavía no están implementadas.

## Comprobar

La app requiere las migraciones **`005_security_hardening.sql`**, **`006_withdrawal_countdown.sql`** y **`007_user_names.sql`**. La última crea los perfiles visibles que permiten mostrar el nombre del usuario en el panel de cargas. Consultar [SEGURIDAD.md](docs/SEGURIDAD.md) para activación, alcance y pruebas de permisos.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:admin
```

Las pruebas de integración con Supabase y Cloudinary necesitan la migración aplicada, las funciones desplegadas y sus secretos configurados. Consultar los pasos y las verificaciones de permisos en [CONFIGURACION.md](docs/CONFIGURACION.md).
