# Controles de seguridad

## Activar en Supabase

Ejecutar **`supabase/migrations/005_security_hardening.sql`** en SQL Editor, con rol `postgres`. Requiere la migración 001; funciona tanto con 001 sola como con las actualizaciones posteriores. No activa Cloudinary y no borra datos. Esta versión de la app requiere 005: usa `request_summaries` para leer y `create_withdrawal` para solicitar retiros.

El SQL de seguridad no se ejecutó desde este entorno: no contamos con acceso administrativo al proyecto. Hasta aplicarlo, los cambios del servidor no están activos.

## Qué se reforzó

- Los retiros se crean con una función de parámetros definidos. El servidor obtiene el usuario de la sesión; no acepta `user_id`, estado, fecha ni URL de comprobante desde el formulario. No arma SQL concatenando texto del usuario.
- Montos positivos de hasta ARS 999.999.999, con hasta dos decimales; CBU/CVU con exactamente 22 números; titular de 2 a 120 caracteres; alias opcional de 6 a 20 caracteres ASCII con letras, números, puntos o guiones. Se conservan nombres legítimos con tildes y apóstrofes. La validación de CBU/CVU es de formato, no comprueba que exista ni que pertenezca al titular.
- La validación importante se repite en PostgreSQL. Cambiar el HTML o enviar peticiones manuales no evita estos controles.
- RLS limita las solicitudes y conversaciones al propietario y a administradores autorizados. La vista usa `security_invoker`, respetando la RLS de la tabla. Las políticas restrictivas agregan límites incluso si se agrega otra política permisiva.
- Se revocan privilegios de tabla y columna innecesarios, la inserción directa de solicitudes y la ejecución pública de funciones internas. El administrador puede aprobar/rechazar solicitudes pendientes; no reescribir montos ni cuentas bancarias.
- El chat limita el cuerpo a 2000 caracteres y 20 envíos por minuto por remitente. Los textos con signos o frases parecidas a SQL siguen siendo datos; React los muestra escapados, sin interpretar HTML. No se usan `innerHTML`, `eval` ni consultas SQL construidas desde entradas de formularios.
- Los formularios rechazan campos repetidos o extra. Las funciones de comprobantes preparadas para Cloudinary validan UUID, monto, campos y formato del archivo. Nunca reciben claves secretas del navegador.
- La interfaz pide columnas explícitas y filtra los datos por usuario. Los errores internos se sustituyen por mensajes públicos; no se muestran detalles de tablas ni trazas.
- El cliente rechaza claves `service_role`/secretas en la configuración del navegador. Solo admite una clave pública publishable o la anon heredada. Esta comprobación de configuración no sustituye la verificación criptográfica del token que realiza Supabase.
- Los enlaces de contacto aceptan HTTPS y los dominios previstos, evitando esquemas como `javascript:` y dominios parecidos.

## Comprobaciones realizadas y pendientes

El login también admite Turnstile y gestiona bloqueos por exceso de solicitudes. Ver [LOGIN_SEGURO.md](LOGIN_SEGURO.md): la activación de CAPTCHA y los límites reales se configuran en Supabase Auth, no mediante una migración SQL.

Se ejecutan pruebas locales con `npm test`, que incluyen intentos de entradas SQL/HTML, caracteres de control, manipulación de formularios y validación de claves. La compilación comprueba TypeScript para ambas interfaces.

`supabase/tests/005_security_checks.sql` comprueba los permisos con dos usuarios y un administrador, los retiros mediante RPC, el chat, la auditoría y el aislamiento de datos. Crea datos temporales y hace `ROLLBACK`; se recomienda ejecutarlo en un proyecto de prueba. **Estas pruebas SQL todavía no se ejecutaron aquí**. Si muestra `FAIL`, revisar el error antes de usar el proyecto con datos reales.

Los controles de autenticación administrados por Supabase (límites de login, contraseñas y altas públicas) se configuran en su Dashboard. Si las cuentas se crean exclusivamente desde administración, deshabilitar las altas públicas. Las claves secretas deben permanecer únicamente en el entorno de servidor; una clave pública y la URL del proyecto son visibles por diseño y dependen de RLS para limitar el acceso.

No hay garantía de seguridad absoluta. Estos cambios reducen riesgos y requieren verificar su aplicación en el proyecto real. Los recursos de marca del bucket público y los enlaces de contacto son públicos intencionalmente; las solicitudes y los chats son privados. No se ha realizado una prueba de penetración completa, un análisis antivirus de adjuntos ni una auditoría del proveedor de hosting.

Referencias: [prevención de inyección SQL de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html), [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones de base de datos](https://supabase.com/docs/guides/database/functions).
