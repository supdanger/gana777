# Integración del chat externo

El widget se instala como un script, siguiendo el patrón de JivoChat. El visitante no necesita iniciar sesión. El servicio asigna un apodo único de casino y crea una conversación separada del chat de jugadores.

## Código que se entrega a la plataforma

El panel administrativo muestra y copia el código con la URL y la clave pública de Supabase ya completadas. El bloque final tiene esta forma:

```html
<script async src="https://gana777bet.online/external-chat-widget.js"
  data-endpoint="https://PROJECT_REF.supabase.co/functions/v1/external-chat"
  data-key="SUPABASE_PUBLISHABLE_KEY"></script>
```

La clave publishable es pública y está diseñada para usarse en el navegador. El widget no recibe claves de servicio, tokens de Telegram ni credenciales del panel.

## Activación

1. Aplicar `supabase/migrations/062_external_chat.sql` al proyecto Supabase.
2. Publicar la función `external-chat` y el archivo `public/external-chat-widget.js` en el dominio `gana777bet.online` conectado a Vercel.
3. Publicar el panel para que el equipo pueda copiar el código desde **Chat externo**.
4. Enviar el bloque copiado a la plataforma para que lo agregue a su HTML.

La función acepta conexiones desde `https://gana777bet.com`, `https://www.gana777bet.com`, `https://gana777bet.online` y el dominio de prueba `https://gana777.vercel.app`. La vista de prueba está disponible en ambos dominios del portal; sus conversaciones se marcan como **PRUEBA** en el panel.

Las conversaciones se ven en **Chat externo** dentro del panel. Se pueden responder y marcar como completadas. Los permisos son los mismos que para el chat de jugadores.
