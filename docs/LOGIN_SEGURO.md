# Límites de acceso y anti-bots

Supabase Auth aplica límites del lado del servidor. El endpoint `/auth/v1/token`, usado para contraseña y renovación de sesión, tiene por defecto 150 solicitudes cada cinco minutos por IP, con ráfagas de hasta 30. La configuración real de este proyecto todavía no se ha leído ni modificado desde este entorno.

## Activar CAPTCHA en el servicio de Auth

1. Crear un widget **Cloudflare Turnstile** y registrar los dominios de usuarios y administración. Para probar localmente, configurar también el hostname de desarrollo o utilizar un proyecto de prueba con las claves de prueba de Cloudflare.
2. En Supabase Dashboard → Authentication → Bot and Abuse Protection, activar CAPTCHA, elegir Turnstile y guardar su **Secret Key** allí. La clave secreta no va en el código, en variables `VITE_` ni en el chat.
3. Agregar la **Site Key pública** a `.env` y a ambos despliegues:

```text
VITE_TURNSTILE_SITE_KEY=TU_SITE_KEY_PUBLICA
```

4. Reiniciar Vite o recompilar los dos despliegues. La app muestra el widget, envía el token mediante `signInWithPassword(..., {options: {captchaToken}})` y lo descarta después de cada intento o al vencer.

La validación real del token la realiza Supabase Auth cuando CAPTCHA está activado en el Dashboard. Configurar solo la Site Key en el navegador **no protege las llamadas directas a Auth**. Con Site Key configurada, la app no envía el login hasta completar la verificación; si falla el widget, permite reintentarlo sin saltarse el CAPTCHA.

## Ajustar el límite nativo

En Supabase Dashboard → Authentication → Rate Limits, revisar el límite del endpoint de tokens. Puede ajustarse según el tráfico; por ejemplo, 60 solicitudes cada cinco minutos por IP es más restrictivo que el valor predeterminado. Cuenta también renovaciones de sesión, y varios usuarios pueden compartir IP, especialmente en redes móviles: ajustar según el uso real. El proveedor usa un token bucket, por lo que permite ráfagas; no equivale a bloquear una cuenta tras cinco contraseñas erróneas.

Se incluye una herramienta que consulta o cambia únicamente `rate_limit_token_refresh` por la Management API. Para usarla, crear el archivo ignorado `.env.auth.local`:

```text
SUPABASE_ACCESS_TOKEN=TU_TOKEN_DE_GESTION
SUPABASE_PROJECT_REF=REFERENCIA_DEL_PROYECTO
```

El token se genera en la cuenta de Supabase → Access Tokens; no es la clave anon ni service_role. No compartirlo ni añadirlo al repositorio.

```powershell
# Consultar: no cambia nada.
npm.cmd run auth:limits
# Aplicar un valor elegido. No cambia usuarios, contraseñas, CAPTCHA ni SMTP.
npm.cmd run auth:limits -- --apply --limit 60
```

La herramienta evita imprimir la configuración completa de Auth porque puede contener secretos. No se ejecutaron cambios reales desde este entorno.

## Qué quedó integrado

- Manejo de respuestas 429 con pausa visible de 60 segundos antes de reintentar; la espera se conserva al recargar la misma pestaña. Si el servidor sigue limitando después, volverá a rechazar el acceso. La pausa es una ayuda de interfaz; no sustituye el límite del servidor.
- Prevención de solicitudes simultáneas desde el formulario.
- Errores de credenciales genéricos, sin confirmar si el correo existe.
- Turnstile opcional para ambas interfaces. Sin Site Key, no aparece el widget. No se guardan contraseñas ni tokens de CAPTCHA en el almacenamiento del navegador.

No se agregó un bloqueo de cuentas por SQL ni un proxy de login que se pueda evitar llamando directamente al endpoint de Auth. El hook nativo de verificación de contraseña admite reglas por cuenta, pero actualmente es una función de Teams/Enterprise; no se asume ese plan. Bloquear cuentas solo por fallos también puede permitir que un atacante bloquee a usuarios legítimos.

Las pruebas locales validan el manejo de errores, el plazo de reintento y que la herramienta de gestión no cambie otros ajustes ni exponga secretos. Queda pendiente probar CAPTCHA y el límite en un proyecto real, incluyendo una llamada directa a Auth sin token, que debe fallar después de activar CAPTCHA.

Fuentes oficiales: [límites de Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA de Supabase](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [disponibilidad de Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks).
