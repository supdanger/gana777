# Enlaces cortos reutilizables

Publicado el 2026-11-07. La migración 100 está aplicada en oxqktxkeehmnqwvjqmez.
Las funciones `player-entry` y `manage-players` quedaron desplegadas. El resto de
las Edge Functions no se volvió a publicar.

Formato: `https://gana777bet.online/#e=<32 caracteres aleatorios>`.
El secreto contiene 192 bits aleatorios; solo su SHA-256 se guarda en la base.
Dura 24 horas, no contiene contraseñas y permite varios ingresos. Renovar reemplaza
el secreto anterior. El panel también permite revocarlo; esto impide nuevos ingresos,
sin cerrar sesiones ya abiertas. No se modifica el enlace del casino.

Al abrirlo se monta primero la pantalla de ingreso directo. El login y los datos
de otra sesión no se montan mientras se valida. El secreto se retira de la URL y
queda en memoria para reintentar si falla la conexión. Recargar esa pantalla después
de retirarlo requiere volver a abrir el enlace original. No se almacena en cachés.
Las API devuelven `Cache-Control: no-store`.

El servidor reserva un intento por enlace cada 15 segundos, crea un token de Auth
interno, lo canjea y devuelve una sesión normal. Valida el vencimiento/revocación
de nuevo antes de responder. Las tablas y RPC nuevas solo son accesibles por
service_role; nunca se entrega ese permiso al navegador. Los enlaces de cuentas
de personal se rechazan. Las vistas previas de enlaces no consumen su vigencia.

Orden de publicación:

1. Aplicar `supabase/migrations/100_reusable_player_entry.sql` en el proyecto vinculado.
2. Desplegar `player-entry` y luego `manage-players`, con la configuración de JWT
   incluida en config.toml. `manage-players` conserva su autenticación y permisos.
3. Publicar frontend y `external-chat-widget.js` juntos. Los enlaces antiguos
   de Auth siguen admitidos por el renderizador mientras mantengan su vigencia.
4. Crear un enlace de prueba y verificar ingreso repetido, vencimiento,
   revocación y reintento desde teléfono. Los enlaces antiguos no se convierten:
   generar uno nuevo para cada jugador que necesite reutilización.

No publicar solo la UI antes de las funciones: el texto de 24 horas correspondería
todavía a enlaces antiguos de un solo uso. Para revertir, restaurar la generación
anterior en manage-players y mantener la función de canje hasta vencer los enlaces
nuevos emitidos; conservar la tabla hasta ese momento.

Pruebas SQL: ejecutar `tests/player-entry-sql.mjs` con PGLITE_MODULE apuntando a
PostgreSQL local en memoria. Nunca ejecutar sus fixtures en producción.
