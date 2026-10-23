# Mensajes programados

El panel muestra **Mensajes** solo al superadministrador. Cada campaña tiene un título, un mensaje, días de la semana y una hora en `America/Asuncion`. La tarea `gana777-scheduled-announcements` corre cada minuto e inserta el aviso una sola vez por usuario y día programado. Los usuarios lo ven dentro del portal aunque no hayan activado push.

Aplicar `supabase/migrations/043_scheduled_announcements.sql` y `044_verify_announcement_job_key.sql`, y desplegar la función `send-announcement-push` para enviar además las notificaciones del sistema. La primera migración instala y programa `pg_cron` y `pg_net`. El envío push usa dos secretos en Supabase Vault:

```sql
select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
select vault.create_secret('TU_SERVICE_ROLE_KEY', 'service_role_key');
```

Guardá el valor real de la clave solo en Vault. La función Edge valida esa clave mediante la función SQL de la segunda migración antes de procesar las notificaciones pendientes. Si los secretos aún no están configurados, los avisos dentro del portal siguen funcionando y la tarea push no hace solicitudes.

Para revisar las ejecuciones, consultá `cron.job_run_details` y los campos `last_sent_on` y `last_sent_count` de `scheduled_announcements`. La hora de las campañas sigue la zona de Asunción aunque cambie el horario de verano.
