# Integración del chat externo

El widget se instala como un script, siguiendo el patrón de JivoChat. El visitante no necesita iniciar sesión. El servicio asigna un apodo único de casino. El operador puede vincular la conversación con una cuenta de jugador desde el panel.

## Código que se entrega a la plataforma

El panel administrativo muestra y copia el código con la URL y la clave pública de Supabase ya completadas. El bloque final tiene esta forma:

```html
<script async src="https://gana777bet.online/external-chat-widget.js"
  data-endpoint="https://PROJECT_REF.supabase.co/functions/v1/external-chat"
  data-key="SUPABASE_PUBLISHABLE_KEY"></script>
```

La clave publishable es pública y está diseñada para usarse en el navegador. El widget no recibe claves de servicio, tokens de Telegram ni credenciales del panel.

## Activación

1. Aplicar las migraciones de Supabase hasta `supabase/migrations/076_linked_support_chat.sql`.
2. Publicar la función `external-chat` y el archivo `public/external-chat-widget.js` en el dominio `gana777bet.online` conectado a Vercel.
3. Publicar el panel para que el equipo pueda copiar el código desde **Chat externo**.
4. Enviar el bloque copiado a la plataforma para que lo agregue a su HTML.

La función acepta conexiones desde `https://gana777bet.com`, `https://www.gana777bet.com`, `https://gana777bet.online` y el dominio de prueba `https://gana777.vercel.app`. La vista de prueba está disponible en ambos dominios del portal; sus conversaciones se marcan como **PRUEBA** en el panel.

Las conversaciones sin identificar se ven en **Chat externo**. El operador busca el nombre de usuario exacto y pulsa **Vincular y abrir Chat**. La conversación pasa a **Chat**, donde se ven juntos los mensajes de la burbuja y de la app con su origen indicado. Los mensajes nuevos enviados desde cualquiera de los dos canales llegan al mismo hilo. La burbuja ve sus mensajes anteriores y los mensajes de la app enviados después del vínculo; no recibe el historial privado anterior de la cuenta. Los avisos de credenciales generados desde Platform tampoco se muestran en la burbuja. Se puede desvincular desde **Chat**.

Para vincular o desvincular, el cajero necesita los permisos **Chat** y **Chat externo**. La función `external-chat` debe volver a publicarse después de aplicar la migración 076.
