# Pausa opcional al rechazar retiros

La migración `108_withdrawal_rejection_pause.sql` está aplicada después de las
migraciones previas. El panel y el portal se publican con el mismo cambio.
Esta función no necesita una nueva Edge Function.

## Operación

En Retiros, abrir una solicitud pendiente sin pagos realizados y elegir Rechazar
retiro. La pausa está desactivada por defecto. Al activarla, solo se ofrecen
15 minutos, 2 horas, 6 horas y 12 horas. El motivo es obligatorio y visible para
el jugador. Cancelar conserva la solicitud y el detalle abierto.

El servidor valida los mismos cuatro valores, el permiso `withdrawal`, el estado
pendiente y la ausencia de pagos. Guarda el rechazo, el motivo, el operador y la
pausa en una transacción. Un reintento del mismo rechazo devuelve la resolución
existente sin volver a penalizar, cambiar el plazo ni prolongarlo.

Un rechazo sin pausa no levanta otra pausa ya vigente. Si hubiera restricciones
coincidentes, se conserva el vencimiento más lejano. El historial anterior sin
motivo registrado continúa mostrándose normalmente.

## Reglas existentes

No se reemplazaron `create_withdrawal`, la validación original de retiros, el
reparto en partes, el ajuste de monto ni `confirm_withdrawal_part`. Continúan
el mínimo de $5.000 para nuevas solicitudes, el límite por solicitud, el retiro
pendiente y la espera de 24 horas después de la acreditación. El nuevo trigger
solo agrega una validación a la inserción de nuevos retiros: no afecta depósitos,
pagos parciales ni ajustes administrativos sobre solicitudes ya creadas.

El rechazo usa el bloqueo de la solicitud; las solicitudes nuevas y la pausa
se serializan con el mismo bloqueo por usuario que emplea la regla de 24 horas.
Los errores de la operación revierten tanto el rechazo como su pausa.

## Jugador y recursos

El portal consulta la disponibilidad al abrir Retiros, ante cambios propios
recibidos en tiempo real, al recuperar la conexión o al volver a la pestaña.
Las notificaciones de solicitud y pausa se agrupan para evitar lecturas duplicadas.
El aviso usa el canal Realtime del jugador que ya existe, sin una nueva conexión.

La RPC devuelve la fecha de vencimiento y la hora del servidor. El reloj de la
pantalla ya existente calcula horas, minutos y segundos localmente. No se consulta
la base cada segundo ni al vencer el contador; tampoco se ejecutan tareas cron.
La comprobación del servidor protege igualmente las solicitudes enviadas mediante
RPC o inserción directa, incluso si se modifica la hora del dispositivo.

Al terminar la pausa, el formulario se habilita si las otras reglas lo permiten.
Si todavía corre la espera de 24 horas, el contador muestra el plazo más largo
y explica que esa espera sigue vigente. El motivo del último rechazo se muestra
cuando corresponde. Un fallo al verificar la disponibilidad mantiene deshabilitado
el envío y ofrece Reintentar.

La consulta de la pausa usa la clave primaria por usuario. El rechazo queda
indexado por solicitud y usuario; cada usuario conserva una sola fila de pausa.
RLS permite leer solo datos propios o autorizados al personal de retiros. El
cliente no tiene permisos para escribir las tablas de pausas ni de motivos.

## Pruebas

- `npm test`: incluye la lista cerrada de plazos y las pruebas existentes.
- `tests/withdrawal-pause-sql.mjs`: PostgreSQL aislado con las funciones originales
  de creación, ajuste, pagos y ventana de 24 horas. Comprueba cuatro pausas,
  rechazo sin pausa, mínimo, permisos, RLS, reintentos, depósitos, partes pagadas,
  ajustes y pagos. Ejecutar con `PGLITE_MODULE=/ruta/a/pglite/dist/index.js`.
- `WITHDRAWAL_PAUSE_ONLY=1 ... node tests/browser-optimization.mjs`: rechazo con
  cada plazo y sin pausa, error que conserva el formulario, cancelar, mínimo,
  bloqueo del envío forzado, contador sin peticiones por segundo, recarga sin
  reiniciar el plazo, vencimiento y espera previa de 24 horas, además de móvil.

Las pruebas del navegador simulan las llamadas remotas; no operan sobre usuarios
reales. Las pruebas SQL se ejecutan en PGlite y no sustituyen la validación de
despliegue en el proyecto Supabase real.
