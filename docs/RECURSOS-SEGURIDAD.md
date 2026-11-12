# Revisión de consumo antes del despliegue

Pruebas locales del 12 de noviembre de 2026. Compilación de producción en Chromium;
APIs y WebSockets simulados, sin solicitudes a usuarios ni a la base real.
Las mediciones PostgreSQL se hicieron en PGlite con datos sintéticos.

## Peticiones del portal

Misma pantalla de inicio, cinco minutos de reloj simulado y pestaña visible:

| Escenario | Peticiones HTTP en reposo | De ellas, comprobaciones de sesión |
| --- | ---: | ---: |
| Antes, comprobación cada 15 segundos | 21 | 20 |
| Optimizado, canal Realtime operativo | 2 | 1 |
| Canal no disponible, respaldo de seguridad | 21 | 20 |
| Pestaña oculta, versión optimizada | 0 | 0 |

La carga inicial se mantuvo en 11 peticiones en este escenario. La reducción
observada en reposo fue del 90,5 %. Los dos accesos restantes corresponden a la
comprobación de sesión de respaldo y a la actualización de notificaciones.
Las cifras excluyen mensajes WebSocket y archivos estáticos. Se verificó una sola
conexión WebSocket multiplexada, sin otra conexión para la revocación.

En régimen estable, las comprobaciones de sesión pasan de 240 a 20 por hora y
pestaña visible con canal sano: 91,7 % menos. Para 100 pestañas son 24.000 frente a
2.000 comprobaciones/hora; es una proyección aritmética, no una prueba de carga.
Si el canal falla se mantiene deliberadamente el respaldo rápido de 15 segundos.
Un evento perdido con canal sano se detecta como máximo en el respaldo de 3 minutos
mientras la pestaña esté visible y haya conexión. El servidor sigue rechazando
operaciones protegidas desde el momento del bloqueo.

## Memoria y consultas

El heap JavaScript usado en las muestras locales estuvo aproximadamente entre
5,3 y 6,2 MiB. Esto no es la RAM total del navegador ni el consumo del servidor,
y no sustituye una prueba larga de fugas o una prueba de concurrencia.

Con 100.000 eventos sintéticos, la consulta de historial recorría toda la tabla:
100.000 filas descartadas, 1.640 bloques compartidos consultados y 33,790 ms en
la muestra. El nuevo índice de ámbito y referencia cambió el plan a BitmapOr e
índices: 10 bloques consultados y 0,243 ms en esa ejecución local. Los tiempos
son ilustrativos de PostgreSQL/WASM; no predicen la latencia de Supabase.

La autorización de personal en `player-access` combina la comprobación de cuenta
y permiso en una RPC, evitando una ida remota adicional por llamada. Los datos
de seguridad siguen consultándose al abrir la ficha, con límites de 20 solicitudes
relacionadas y 30 eventos.

## Cambios y validación

La migración `106_security_request_efficiency.sql` añade el índice, el canal de
avisos de sesión y la autorización combinada. El aviso solo contiene el ID propio
y una fecha de revocación. Su política permite al destinatario recibir el aviso
incluso suspendido, sin permitirle leer datos de otras cuentas.

Se comprobaron permisos/RLS, pausas, vencimiento, revocación de sesiones y tokens,
cierre por evento real simulado y cierre por comprobación de respaldo. Pasaron
las 44 pruebas del proyecto, las pruebas SQL aisladas y la revisión de navegador.
Se compilaron el portal, el panel y los módulos Edge modificados.

Repetir perfiles:

```sh
REQUEST_PROFILE=after ADMIN_PREVIEW_URL=http://127.0.0.1:5183 USER_PREVIEW_URL=http://127.0.0.1:5182 node tests/browser-optimization.mjs
REQUEST_PROFILE=fallback ADMIN_PREVIEW_URL=http://127.0.0.1:5183 USER_PREVIEW_URL=http://127.0.0.1:5182 node tests/browser-optimization.mjs
REQUEST_PROFILE=hidden ADMIN_PREVIEW_URL=http://127.0.0.1:5183 USER_PREVIEW_URL=http://127.0.0.1:5182 node tests/browser-optimization.mjs
```

Para el perfil SQL: `SECURITY_SQL_PROFILE=1 PGLITE_MODULE=/ruta/a/pglite/dist/index.js node tests/access-security-sql.mjs`.
Los resultados detallados quedan en `/tmp/gana777-browser-checks/` y
`/tmp/gana777-security-sql-profile.json`.

## Alcance del resultado

Se corrigieron dos fuentes identificadas de consumo innecesario. No se detectaron
errores en los escenarios validados. La capacidad máxima, CPU/RAM de Supabase,
coste facturable y latencia real requieren métricas del proyecto y una prueba de
carga en un entorno preparado para ello. No se ejecutó carga contra producción.
Antes de publicar deben aplicarse las migraciones pendientes 103–108 y desplegar
las funciones con la autenticación compartida, además del panel y el portal.

La migración 107 y la revisión de actualizaciones del panel por eventos se
documentan en [PANEL-EN-VIVO.md](./PANEL-EN-VIVO.md).

La pausa opcional de retiros y su validación adicional están documentadas en [RETIROS-PAUSA.md](./RETIROS-PAUSA.md).
