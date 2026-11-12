# Seguridad manual de solicitudes

En Centro de atención → Solicitudes de acceso, abrir una solicitud y seleccionar
**Seguridad y dispositivos**. La ficha se consulta bajo demanda y requiere el
permiso `access_requests`, también validado en el servidor.

Permite pausar nuevas solicitudes desde un navegador (15 minutos, 2, 6 o 12 horas,
o entre 1 minuto y 30 días), bloquear un navegador, bloquear una IP, registrar una
revisión, registrar una red compartida y retirar cada control por separado.
Todos los cambios exigen motivo y registran operador, fecha y vencimiento.
Las pausas vencen por comparación con la hora del servidor, sin tarea programada.

Una autorización de red compartida registra la revisión: no retira bloqueos,
no anula límites existentes y no aprueba automáticamente una cuenta. No se
agregan nuevas reglas automáticas. El bloqueo de navegador no identifica un
equipo físico de forma infalible y puede evadirse borrando datos. La huella técnica
se muestra como coincidencia aproximada, nunca como identidad confirmada.

La actividad mostrada corresponde a la fecha de registro de la solicitud. No es
un listado de sesiones conectadas en tiempo real. La ficha limita los relacionados
a 20 solicitudes y los eventos a 30, incluyendo controles de la misma IP/navegador.
No devuelve las IP ni los hashes internos al cliente.

## Bloqueo de usuarios existentes

En Jugadores → Seguridad / bloquear usuario, o en la ficha de una solicitud con
cuenta creada, se puede bloquear y desbloquear la cuenta con motivo e historial.
Requiere permiso `users` desde Jugadores, o `access_requests` desde la solicitud.
El servidor impide aplicar este control al propio operador, administradores y cajeros.

La migración 105 registra la suspensión, elimina las sesiones de Auth y rechaza
tokens emitidos antes del bloqueo. Las políticas restrictivas protegen las tablas
actuales con RLS y Storage; un hook previo de PostgREST también protege las RPC
con privilegios elevados. Los nuevos objetos con RLS deben incorporar la política
`account_access_guard`. La migración se detiene si ya existe otro hook para evitar
sobrescribir una configuración externa.

La función Edge también sincroniza el bloqueo de Auth. Si esa sincronización
falla, el bloqueo del portal sigue vigente y se muestra una advertencia para
reintentar. El desbloqueo no restaura las sesiones anteriores. La migración 106
añade avisos a la conexión Realtime que ya usa el portal, sin crear otra conexión.
Con canal suscrito se comprueba como respaldo cada 3 minutos; si el canal no está
disponible, cada 15 segundos. También se comprueba al volver a la pestaña y al
reconectar. No se solapan comprobaciones ni se consulta periódicamente desde una
pestaña oculta. Un aviso perdido con canal aparentemente sano se detecta mediante
el respaldo de 3 minutos. El cierre visual requiere conexión. El servidor rechaza el acceso
protegido desde el momento del bloqueo. Este control afecta al portal, no a una
sesión independiente que el jugador tenga en una plataforma de casino externa.

## Activación

Quedó aplicado en producción en este orden:

1. `103_manual_access_ip_blocks.sql`, después
   `104_access_security_controls.sql`, `105_player_account_blocks.sql` y
   `106_security_request_efficiency.sql`.
   La segunda importa los bloqueos anteriores.
2. `player-access` y las funciones que autentican con `_shared/http.ts`,
   porque la comprobación de cuenta forma parte de la autenticación compartida.
3. El panel y el portal compilados.

Es necesario ese orden: la función exige que la migración 104 exista para
comprobar los controles. El bloqueo también se valida al insertar en la base.
Los chats y solicitudes anteriores pueden seguir consultándose.

## Validación

`npm run typecheck`, `npm test`, compilación Vite en modos `admin` y `user`.
La prueba SQL aislada se ejecuta con
`PGLITE_MODULE=/ruta/a/pglite/dist/index.js node tests/access-security-sql.mjs`.
La prueba de navegador `tests/browser-optimization.mjs` intercepta las llamadas
remotas y comprueba la ficha, el motivo obligatorio, una pausa y su retirada.
`tests/account-security-sql.mjs` comprueba revocación de sesiones y JWT,
bloqueo/desbloqueo, permisos, historial y protección de cuentas del personal.
