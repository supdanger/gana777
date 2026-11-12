# Actualizaciones del panel por eventos

La migración `107_admin_event_updates.sql` está aplicada después de las
migraciones de seguridad 103–106. El panel y el portal se publican con el
mismo cambio.

## Funcionamiento

Un canal Realtime mantiene versiones por sección. Los avisos contienen solamente
sección y versión, sin mensajes, contraseñas ni datos personales. RLS limita las
secciones visibles según los permisos del personal.

No hay un intervalo HTTP para consultar si existen novedades. Al conectar o
recuperar la conexión se consulta una pequeña instantánea de versiones; solo las
versiones nuevas disparan actualizaciones. La primera sincronización recupera
cambios que pudieron ocurrir mientras cargaba el panel. Los eventos repetidos o
anteriores no generan consultas.

Los avisos se agrupan en ventanas de 750 ms. La ventana no se reinicia con cada
evento, para evitar que una conversación muy activa postergue indefinidamente la
actualización. Una pestaña oculta conserva las secciones pendientes y actualiza
una vez al volver. Las consultas activas anteriores se cancelan o descartan para
evitar resultados fuera de orden.

El encabezado indica En vivo, Conectando o Reconectando. Actualizar permanece
como respaldo manual. Si el canal está caído, se muestra la desconexión y el
cliente Realtime intenta reconectar; no se agrega un sondeo HTTP repetitivo.

## Alcance

- Cargas y retiros: bandejas visibles, historial y contadores del encabezado.
- Chats de jugadores y externos: contadores y página visible de hasta 50 filas.
  El historial abierto se consulta cuando cambia su último mensaje, sin borrar
  el borrador. Los mensajes externos sin vincular no invalidan el chat interno.
- Solicitudes: lista, contadores y conversación seleccionada; se conserva el
  enlace personal que el operador esté editando.
- Jugadores, búsqueda de Platform, cuentas, turnos y tablero SAC: refresco de las
  listas correspondientes conservando la selección y las búsquedas.
- Resumen operativo: contadores de bonos y ranking según los cambios relevantes.
- Configuración compartida del portal: cambios de ajustes, promociones y
  animaciones de contacto se agrupan por el mismo canal del panel.

Los formularios de configuración que mantienen su propio estado de edición no
se remontan ni sobrescriben automáticamente. La ficha detallada de seguridad
sigue leyéndose al abrirla o aplicar sus acciones. El control inmediato de cambios
de asignación de cargas conserva su suscripción específica por seguridad; las
recargas de la lista usan el canal compartido para evitar duplicados.

## Coste controlado

Los triggers publican una versión por sección y sentencia SQL, no una por fila.
Una inserción masiva genera un aviso por sección. Sentencias sin filas afectadas,
actualizaciones idénticas, cambios solo de fecha de actualización o de última
actividad y operaciones revertidas no notifican novedades.

Los contadores de chat se calculan en la base. Se eliminó la descarga completa
de resúmenes en bloques de 500 y la búsqueda cliente que enviaba grupos de IDs.
La página, el filtro y la búsqueda se resuelven con una RPC y un máximo de 50
filas, sin materializar todos los cuerpos de conversación como resultado cliente.

## Pruebas locales

La prueba de navegador usa builds de producción y simula HTTP/WebSockets. No
es una medición del servidor real ni una prueba de carga con muchos operadores.

| Escenario | Resultado observado |
| --- | --- |
| 5 minutos simulados en reposo | 0 consultas HTTP adicionales |
| Ráfaga de 100 versiones de chat | 1 consulta de página y 1 de totales |
| Aviso de otra conversación | 0 recargas del historial abierto |
| Versión duplicada | 0 consultas adicionales |
| 100 avisos mientras la pestaña está oculta | 0 consultas adicionales |
| Volver a la pestaña | 1 comprobación de versiones y 1 actualización de la sección |
| Reconexión con una versión perdida | Se recupera con 1 consulta de la página |
| Borrador abierto durante eventos/reconexión | Se conserva |

`tests/admin-live.test.mjs` prueba agrupación y descarte de versiones.
`tests/admin-live-sql.mjs` prueba avisos por sentencia, filtros, paginación,
permisos, aislamiento de conversaciones vinculadas, heartbeat y rollback en
PostgreSQL aislado. La revisión completa de navegador también cubre los flujos
anteriores del portal y del panel.

Para repetir el escenario principal:

```sh
ADMIN_LIVE_ONLY=1 ADMIN_PREVIEW_URL=http://127.0.0.1:5183 USER_PREVIEW_URL=http://127.0.0.1:5182 node tests/browser-optimization.mjs
```

Resultado detallado: `/tmp/gana777-browser-checks/admin-live-resource-report.json`.
Para la prueba SQL: `PGLITE_MODULE=/ruta/a/pglite/dist/index.js node tests/admin-live-sql.mjs`.

El coste real sigue dependiendo del número de operaciones, operadores conectados
y volumen de las tablas. El diseño evita consultas HTTP de novedades en reposo;
no elimina los mensajes de mantenimiento propios de WebSocket.
