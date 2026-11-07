# Optimización del portal y del panel

Los cambios del cliente funcionan sobre el esquema existente. No se ejecutaron
migraciones, consultas de mantenimiento ni operaciones sobre producción durante
esta implementación. Los borradores SQL están fuera del directorio de migraciones:
[instrucciones SQL](../supabase/optimization-drafts/README.md).

## Caché y sesiones

- Solo se persisten campos conocidos de configuración pública visual, por proyecto
  y modo de aplicación, durante un máximo de 30 minutos. Al abrir se revalida con
  el servidor; recuperar el foco no repite esa consulta durante el primer minuto.
- Las respuestas privadas permanecen en memoria, con vencimiento y un máximo de
  100 entradas. Las peticiones simultáneas con la misma clave se comparten.
- Cambiar de cuenta o salir vacía la caché privada, filtros y estado de operaciones.
  Las respuestas de la cuenta anterior en vuelo no vuelven a poblar esa caché.
- Los RPC de presentación de bonos se comparten durante cinco segundos. Al crear
  una solicitud o recibir un cambio se invalidan, sin descartar las imágenes ya
  firmadas ni el perfil del jugador.
- Las URL de imágenes privadas se reutilizan solo en memoria y por menos tiempo
  que su firma. Los comprobantes y respuestas financieras no van a Cache Storage.
- El service worker guarda únicamente archivos versionados de `/assets` del mismo
  origen, hasta 64 entradas. No intercepta HTML, Auth, Supabase ni adjuntos privados.
  Se registra también sin activar push y no solicita permisos de notificaciones.
- Los archivos JS/CSS versionados tienen caché HTTP larga; HTML y el worker se
  revalidan. React, Supabase e iconos se separan para reutilizarlos entre versiones.

## Consultas y navegación

- El inicio del jugador consulta pendientes y su último retiro aprobado; no descarga
  mensajes ni todas las partes de los retiros.
- Los historiales del perfil se consultan al desplegarlos, cinco solicitudes por
  página. Las partes se restringen a esos IDs.
- Retiros del panel: diez pendientes y diez resueltos por página, con conteos
  independientes. Hasta cinco IDs por consulta de partes: el máximo de 100 partes
  por retiro no puede truncar silenciosamente la respuesta de la página.
- Jugadores: veinte resultados por página, búsqueda en servidor con espera de 250 ms
  y cancelación de búsquedas anteriores. La búsqueda de recomendadores es independiente.
- Chats: resumen compacto para los contadores, y nombre/cuerpo solo de la página de
  cincuenta conversaciones. Se mantienen los filtros al cambiar de sección.
- Sin modificar SQL, contar pendientes de chat aún requiere recorrer los resúmenes:
  la vista actual compara remitente con jugador. El resumen transaccional propuesto
  en el documento SQL es el siguiente paso para reducir también ese trabajo.
- Los chats cargan cincuenta mensajes recientes, con cursor por fecha e ID para
  recuperar anteriores. El chat del jugador incorpora INSERT recibidos por Realtime
  sin volver a descargar la conversación. Recuperar el foco comprueba también los
  vínculos externos para descartar mensajes de conversaciones desvinculadas.
- El refresco manual del panel se conserva. No se agregaron sondeos del panel.
- La configuración inicial ya no espera a descargar las imágenes para mostrar la
  aplicación. Se conservan los formularios cuando falla un envío.
- Se cargan las secciones bajo demanda, se conserva búsqueda/página de jugadores y
  se recupera el desplazamiento de las pantallas visitadas.
- Videos fuera de vista o con pestaña oculta se pausan. Se respeta movimiento
  reducido y los relojes de bonos solo actualizan cuando hay una cuenta regresiva.

## Recursos visuales

Los PNG originales permanecen disponibles. El portal utiliza versiones locales
optimizadas para sus rutas predeterminadas, evitando descargar además el PNG de
Storage. Los recursos personalizados siguen consultándose desde sus rutas guardadas.

| Recurso | Antes | Después |
| --- | ---: | ---: |
| CSS inicial del portal | 376,42 KB | 192,27 KB |
| Avatar local | 1.428,32 KB, 1024 px | 92,09 KB, 256 px |
| Panda de acceso | 1.032,68 KB | 676,65 KB |

La imagen de acceso mantiene dimensiones y usa WebP sin pérdida. El avatar se
redimensionó para su uso en pantalla. Estas cifras son tamaños de archivos de
compilación; no son un porcentaje de ahorro de CPU o disco de Supabase.

## Funciones de servidor

Los cambios de estas funciones quedaron en el código fuente y necesitan un
despliegue específico de Edge Functions para activarse; publicar Vercel no las actualiza.
No se desplegaron durante esta implementación.

- `external-chat`: valida el texto antes de subir la imagen.
- `submit-deposit`: si se pierde la respuesta de una inserción, conserva el
  comprobante porque la carga pudo quedar registrada. Solo lo limpia tras un
  rechazo SQL confirmado y una lectura que compruebe que ese asset no está
  referenciado. Si esa lectura falla, también lo conserva. El envío normal no
  agrega consultas; los archivos de resultado incierto requieren una conciliación
  posterior antes de borrarse. Este ajuste de la Edge sigue sin desplegarse.
- `send-announcement-push`: consulta dispositivos por lote, procesa como máximo cinco
  anuncios simultáneamente y establece un timeout de diez segundos por envío.
  Conserva la limpieza de endpoints 404/410 y los avisos con errores transitorios.
  La deduplicación por dispositivo y el backoff persistente quedan pendientes del
  diseño SQL de la cola.
- Las nuevas imágenes del editor de temas que no se pudieron guardar se limpian
  únicamente después de releer la configuración y confirmar que no están en uso.
  Si no puede confirmarse, se conserva el archivo. No se borran versiones previas.

## Verificación

### Envío de comprobantes en el portal moderno

El tercer paso muestra una sola acción principal: elegir la foto mediante un
recuadro grande y, después de seleccionarla, ver la imagen y enviar para revisión.
Cancelar la galería conserva la selección anterior; una foto dañada no borra una
foto válida. Un fallo de envío conserva el archivo y ofrece reintentar. El envío
tiene un bloqueo local inmediato contra solicitudes repetidas y mantiene la
compresión existente. La confirmación sustituye los controles de subida cuando
el servidor registra una carga pendiente. No añade consultas, assets ni cambios SQL.

La prueba de navegador usa archivos y respuestas simulados; cubre selección,
cancelación, reemplazo inválido, vista previa, error/reintento, toques repetidos y
confirmación, además de revisar anchos de 320 px, móvil y escritorio.

### Bonos por horario — activación pendiente

El editor de bonos permite una franja diaria independiente de `cooldown_hours`:
hora de inicio/fin y días de la semana, siempre en `America/Asuncion`. Por defecto
propone 14:00–17:00 todos los días. El porcentaje, el mínimo/máximo del depósito y
el número de cargas mantienen su configuración existente. Un bono del 50% con
máximo de carga de $50.000 da como máximo $25.000 de bono en esa carga; no es un
tope de premio para depósitos mayores.

La tarjeta del jugador no repite el texto del horario que ya incluye su banner.
Mientras espera, muestra «Disponible en» y una cuenta regresiva calculada en el
dispositivo; no agrega consultas. Los objetivos se calculan al cambiar los datos
o la franja, no cada segundo. Todas las tarjetas comparten un solo temporizador
local para los segundos, que se detiene con la pestaña oculta y al finalizar las esperas. Si un
cooldown termina fuera del horario, el objetivo es la siguiente apertura válida.
El horario detallado sigue disponible en el botón de información del bono.

Inicio incluido y fin excluido. Las franjas que cruzan medianoche pertenecen al
día de inicio (viernes 23:00–02:00 termina el sábado). Los bonos sin horario
mantienen su comportamiento. El portal muestra la franja y bloquea la selección
fuera de horario; si vence mientras se prepara una carga, requiere elegir otro
bono o continuar expresamente sin bono. El reloj de interfaz solo ayuda a mostrar
la disponibilidad: la comprobación definitiva usa el reloj del servidor.

`useBonusScheduleClock` programa un timeout local hasta la siguiente apertura o
cierre; no consulta la base ni agrega cron. Cancela el timeout con la pestaña
oculta y recalcula al volver. Las columnas se consultan junto con promociones;
si faltan únicamente las nuevas, se reintenta con todas las columnas anteriores,
conservando rangos y límites. Esa capacidad se recuerda en memoria hasta recargar.
No se permite guardar una programación que el servidor todavía no soporta.

El borrador `07_bonos_por_horario.sql` **no se ejecutó** y es independiente del 06.
Agrega tres columnas a promociones y un guard de inserción a solicitudes; no
reemplaza la validación vigente de importes, porcentajes, premios o número de carga.
El horario se valida al registrar la solicitud, después de la subida del
comprobante. Una solicitud registrada a tiempo conserva su premio aunque se
atienda después o se edite el horario de la promoción. No se acepta una fecha
enviada por el dispositivo para evitar el horario.

El código fuente de `submit-deposit` también comprueba la franja antes de subir
el comprobante. Si cierra durante la subida, el guard SQL rechaza la inserción y
la Edge limpia la imagen no registrada. No convierte una solicitud con bono en
otra sin bono silenciosamente. Esa Edge **no se desplegó**; el script general de
despliegue del repositorio no la incluye, por lo que necesita un despliegue
específico. La protección SQL funciona también con la Edge anterior; la nueva
evita subidas innecesarias y comunica el error preciso.

Validación: pruebas de límites y zona horaria, cambio semanal/medianoche,
compatibilidad de columnas, handler de Edge con subida y limpieza simuladas,
guard SQL con la función `validate_request` de la migración 069 y aprobación
posterior al cierre. En navegador se prueba crear/editar la franja y adelantar el
reloj hasta su cierre sin consultas nuevas. Antes de activar falta probar el
borrador en una copia del esquema completo y desplegar la Edge correspondiente.

### Bandeja compartida de cargas — activación pendiente

El código incluye el flujo compartido y conserva el anterior cuando la RPC
`get_deposit_queue_mode` no existe. La capacidad se consulta una vez por minuto como
máximo mediante la caché en memoria de la sesión; no se programa un sondeo nuevo.
No se escriben tomas en localStorage ni se simula un bloqueo entre computadoras.

El borrador `supabase/optimization-drafts/06_bandeja_compartida.sql` **no se ejecutó**.
Al activarlo, el panel deja de pedir SAC, muestra Disponibles/Mis cargas/Todas y
consulta como máximo 30 filas por página, con filtros y orden en el servidor. El
historial general mantiene su paginación. La suscripción de Cargas agrupa eventos,
se elimina al salir de la sección y pospone consultas cuando la pestaña está oculta.
La auditoría se carga a pedido y trae los últimos 20 movimientos de una solicitud.

Tomar, liberar, revisar, reasignar y confirmar bloquean primero la misma fila de
`requests`. Cada asignación tiene un token nuevo: una pantalla anterior no puede
confirmar usando una asignación que fue liberada o reasignada, incluso si vuelve
al mismo operador. Aceptar inicia la etapa de acreditación manual: ya no se libera
sin intervención del superadministrador y motivo. No hay vencimiento automático.
Las cargas aprobadas antes de activar esta función requieren recuperación por
el supervisor; no se asume que una carga sin toma todavía no fue acreditada.

Se reutilizan las funciones actuales de bonos especiales y confirmación, incluido
el reinicio diario de premios y la notificación idempotente. Las RPC antiguas de
depósito dejan de ser ejecutables directamente por el cliente y una política
restrictiva impide que una pestaña vieja apruebe depósitos por REST. Los retiros
conservan su flujo. La asignación bancaria deja de filtrar teléfonos por SAC y
conserva las cuentas activas, turnos de caja, mantenimiento y reservas previas.

Verificar primero en un proyecto de pruebas con el esquema real. Coordinar la
activación sin operadores acreditando en la plataforma y recargar los paneles.
El panel coordina la atención; no verifica una acreditación externa manual.
El consumo real de consultas/WAL/almacenamiento debe medirse con tráfico real:
los límites evitan descargar toda la bandeja, pero cada toma añade una escritura
y su registro de auditoría.

Prueba adicional del SQL en PostgreSQL aislado en memoria, sin lectura de `.env`:

```sh
PGLITE_MODULE=/ruta/a/@electric-sql/pglite/dist/index.js node tests/deposit-queue-sql.mjs
```

Esta prueba usa funciones vigentes de revisión, confirmación y reparto bancario
con un esquema reducido. Cubre permisos, tokens antiguos, liberación, reasignación,
bonos especiales/reset diario, idempotencia y reserva de cuenta sin SAC. La prueba
de navegador también cubre el flujo nuevo y la compatibilidad con el esquema viejo.
Quedan pendientes la prueba con el esquema completo, dos conexiones PostgreSQL
simultáneas y la entrega real de eventos Realtime en un proyecto de pruebas.

El panel usa una base de grafito con acentos de apariencia, estados semánticos y
estilos separados del portal de jugadores. La navegación se agrupa por tarea,
permite buscar secciones localmente y conserva los permisos existentes. Se retiraron
los tutoriales del panel; los controles que configuran tutoriales para jugadores
siguen disponibles. El resumen, los totales de bonos y el chat se adaptan al ancho
de pantalla sin agregar consultas. La prueba de navegador acepta `--visual` para
recorrer las secciones y guardar capturas de escritorio, tablet y móvil.

```sh
npm test
npm run build
npm run build:admin
```

Las pruebas nuevas cubren caché, caducidad, cambio de cuenta con respuestas en vuelo,
paginación y alcance de consultas, carga de partes sin truncamiento, limpieza ante
respuestas perdidas, worker estático y concurrencia/fallos de push con servicios simulados.

Prueba opcional de navegador con Playwright disponible:

```sh
# Compilar cada modo en un directorio distinto e iniciar una preview en cada puerto.
npx vite preview --outDir /tmp/gana777-optimized-user --host 127.0.0.1 --port 5180
npx vite preview --outDir /tmp/gana777-optimized-admin --host 127.0.0.1 --port 5181
# En otra terminal:
node tests/browser-optimization.mjs
```

Se pueden configurar `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `USER_PREVIEW_URL` y
`ADMIN_PREVIEW_URL`. La prueba intercepta todo HTTP remoto y WebSocket: no inicia
sesiones reales ni usa datos de producción. Cubre móvil, panel, búsquedas, históricos,
mensajes anteriores, chat externo y salida. Capturas y resultados se escriben en
`/tmp/gana777-browser-checks`.

La ejecución real de transferencias, Cloudinary, Telegram y push, y los planes SQL
de producción requieren una verificación de integración posterior. No se realizaron
operaciones financieras reales para probar esta versión.
