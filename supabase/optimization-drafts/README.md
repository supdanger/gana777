# Optimización SQL pendiente de revisión

Estos archivos son **borradores**, fuera de `supabase/migrations`. No se ejecutaron,
no se publicaron y el frontend optimizado funciona con el esquema actual.
No ejecutar el directorio completo ni convertirlo en una migración automática.

Orden propuesto:

1. `01_diagnostico.sql`: solo lecturas. Guardar los resultados y contrastar con las
   métricas de disco, WAL, CPU y Storage del panel de Supabase.
2. `02_telegram_recuperacion.sql`: corregir el cron que actualmente no despierta
   al trabajador cuando solamente quedan envíos `sending` vencidos.
3. `03_indices_candidatos.sql`: ejecutar únicamente los índices respaldados por
   `EXPLAIN (ANALYZE, BUFFERS)` de consultas SELECT representativas. Cada sentencia
   `CONCURRENTLY` va por separado, fuera de una transacción. Revisar antes si hay
   un índice equivalente con otro nombre. Un índice también ocupa disco y genera
   trabajo de escritura. Si queda inválido, investigarlo antes de reintentar.
4. `04_retencion.sql`: instala una función que por defecto **solo simula**. Revisar
   candidatos, respaldo y retención antes de invocarla con `p_dry_run := false`.
   No crea un cron de limpieza automáticamente. Cada invocación borra como máximo
   500 filas por categoría de forma predeterminada. `candidates` es el total en
   simulación y el tamaño del lote procesado en ejecución real, evitando un
   conteo completo por cada lote. No borra cargas, retiros,
   comprobantes, conversaciones, premios ni notificaciones de operaciones.
5. `05_rls_lecturas.sql`: conserva las condiciones de las políticas 015/026 y
   envuelve las comprobaciones independientes de la fila en subselects. Comparar
   con las políticas reales antes de aplicar; no sobrescribir personalizaciones.
   Confirmar resultados y planes con los distintos roles en una copia de prueba.
6. `06_bandeja_compartida.sql`: cambio funcional independiente. Agrega tomas y
   auditoría de cargas, RPC con bloqueo transaccional/token y filtros paginados.
   Retira el filtro SAC de la asignación bancaria sin borrar SAC históricos ni
   cambiar turnos de caja o reservas previas. Revisar en una copia del esquema real,
   coordinar la salida de operadores de las pantallas de acreditación y recargar
   todos los paneles. La UI nueva se activa únicamente cuando existe su RPC de
   capacidad; antes de eso sigue funcionando el flujo anterior.
7. `07_bonos_por_horario.sql`: independiente del 06. Agrega horario y días a
   promociones y valida la franja en la inserción real de la solicitud. El máximo
   sigue limitando el depósito: 50% en cargas de hasta $50.000 da $25.000 de bono
   en una carga de $50.000. No modifica bonos ni solicitudes existentes. Validar
   en una copia del esquema completo, desplegar específicamente `submit-deposit`
   para el control previo a la subida y recargar el panel antes de configurar
   promociones con horario. Los bonos previos quedan sin restricción horaria.

La función de retención no reduce necesariamente el archivo físico del disco:
autovacuum permite reutilizar espacio. No ejecutar `VACUUM FULL` como una tarea
automática: bloquea la tabla y puede necesitar espacio adicional.

Antes y después de cualquier aplicación:

- Confirmar las migraciones realmente aplicadas y el usuario/rol de las consultas.
- Comparar conteos y permisos de superadministrador, cajero y jugador.
- Probar Telegram con un trabajador interrumpido y con la cola vacía.
- Medir tiempos de consultas, índices, filas muertas y crecimiento al día siguiente.
- Las pruebas SQL de `supabase/tests` deben ejecutarse en una copia de prueba, no
  sobre operaciones activas de producción.

## Cambios posteriores que necesitan un diseño independiente

- Resumen transaccional de conversaciones para reemplazar el `UNION ALL` +
  `DISTINCT ON` de `chat_inbox`: requiere backfill, manejo de vínculos/desvínculos,
  concurrencia y pruebas RLS. No se adjunta una sustitución incompleta de la vista.
- Entregas push por dispositivo con reintentos, vencimiento y clave de deduplicación.
  La versión actual solo conoce una marca por notificación; una migración de esta
  cola debe coordinarse con el despliegue de la Edge Function correspondiente.
- Retención de notificaciones: revisar las claves únicas que impiden duplicados
  antes de borrar registros que funcionan como comprobante de entrega.
- Archivos huérfanos: inventariar referencias y eliminarlos mediante Storage API,
  nunca con `DELETE FROM storage.objects`. Preservar los recursos de temas guardados.

## Reversión

El cron anterior está documentado en `089_quiet_background_jobs.sql`. Los índices
nuevos pueden retirarse individualmente con `DROP INDEX CONCURRENTLY` después de
confirmar su nombre y uso. La función de retención puede eliminarse con
`DROP FUNCTION public.optimization_retention(boolean, integer, integer, integer)`.
Los datos borrados por una ejecución real requieren restauración desde un respaldo;
por eso el modo predeterminado es una simulación y no se programa automáticamente.
Para revertir políticas RLS, restaurar las definiciones guardadas en el diagnóstico,
conservando roles, `USING`, `WITH CHECK` y el carácter restrictivo de cada política.

El borrador 06 necesita una reversión coordinada, no solo quitar el frontend:
detener acreditaciones manuales, conciliar las cargas tomadas, guardar su auditoría,
retirar `get_deposit_queue_mode`, restaurar los permisos EXECUTE previos de
`review_special_deposit` y `confirm_deposit_credit`, retirar únicamente la política
`deposit_reviews_via_queue` y restaurar la definición guardada de
`assign_bank_account`. No borrar las tablas de tomas/auditoría durante la reversión.
Recargar los paneles para descartar la capacidad almacenada en memoria. Capturar
antes las definiciones, los permisos y la publicación Realtime reales del proyecto.

Para revertir el 07, pausar primero las promociones que tengan horario para que
no se transformen accidentalmente en ofertas disponibles todo el día. Retirar
el trigger `zz_guard_bonus_schedule` y la función `guard_bonus_schedule` solo
después de conciliar esa configuración; conservar columnas y solicitudes. Retirar
el frontend por sí solo no desactiva la comprobación de horario del servidor.
