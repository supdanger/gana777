# Acceso rápido del portal

El build `npm run build` (modo `user`) publica un manifiesto web y los íconos de GANA777 en `/pwa/`. El comando predeterminado `vite build` (modo `production`) también los publica: todos los modos excepto `admin` representan el portal, igual que en `src/lib.ts`. La app se abre en modo independiente y conserva la autenticación normal del portal. `npm run build:admin` no publica estos archivos ni enlaza un manifiesto. No se publica en tiendas.

En el login y en Inicio aparece **Instalar GANA777**. Si el navegador ofrece instalación nativa, el botón abre su confirmación; en caso contrario muestra instrucciones para el menú del navegador. En iPhone/iPad se indica Safari → Compartir → Agregar a inicio. No se solicita instalar automáticamente. El botón se oculta al abrir como aplicación o tras aceptar la instalación.

## Despliegue y seguridad

- Publicar el build de jugadores en su dominio HTTPS habitual, separado del panel; no requiere migraciones ni funciones nuevas.
- Mantener accesibles `/pwa/manifest.webmanifest` y los tres PNG como archivos reales, sin reescribirlos al HTML de la SPA. El manifiesto debe servirse como `application/manifest+json` o JSON.
- Si el hosting configura CSP, permitir el manifiesto y los íconos desde el mismo origen (`manifest-src 'self'` e `img-src 'self'` junto a los orígenes ya requeridos por el portal).
- No hay service worker, modo sin conexión, caché adicional de solicitudes, pagos, datos personales ni comprobantes. El portal sigue necesitando internet. El almacenamiento de sesión existente no cambia.
- El navegador y el dispositivo deciden cuándo ofrecer la instalación; el botón no puede forzarla. Una ventana privada o el navegador integrado de WhatsApp puede no admitirla.

## Comprobación manual al publicar

1. En Chrome Android, abrir el portal por HTTPS, iniciar la instalación y comprobar el nombre e ícono. Abrir desde la pantalla de inicio: no debe aparecer la barra de direcciones.
2. En Safari iPhone, agregar a inicio, comprobar el ícono y abrir el acceso. Verificar login, cargas, selección de comprobante y regreso desde WhatsApp.
3. Comprobar que el botón no aparece dentro de la aplicación instalada y que sigue siendo posible iniciar/cerrar sesión normalmente.
4. Abrir el panel: no debe enlazar el manifiesto ni mostrar el botón de instalación.
5. Sin internet, no debe aparentar que una operación financiera se envió correctamente. No se implementa una cola sin conexión.

## Si Android indica que no se puede instalar

Comprobar primero la publicación, no asumir que el problema es el navegador:

- El HTML de la raíz debe incluir `<link rel="manifest" href="/pwa/manifest.webmanifest">`.
- Abrir `/pwa/manifest.webmanifest` en el dominio utilizado por el teléfono: debe devolver JSON, no un error, una pantalla de autenticación o el HTML del portal.
- `/pwa/icon-192.png` y `/pwa/icon-512.png` deben mostrar imágenes PNG reales y accesibles sin iniciar sesión.
- Repetir estas comprobaciones tanto en el dominio personalizado como en el dominio Vercel, si se utilizan ambos. La instalación corresponde al origen visitado.
- Si Vercel compila con `vite build`, antes de esta corrección se omitían los metadatos PWA aunque el portal mostrara el botón. Volver a publicar con el código corregido. El panel debe conservar `npm run build:admin`.
- Después del despliegue, cerrar y volver a abrir la pestaña por HTTPS. Probar en una pestaña normal, no incógnita, y verificar si el acceso ya está instalado. El navegador decide cuándo ofrecer su confirmación.

No se debe afirmar que una corrección local resolvió el teléfono hasta comprobar los archivos publicados y volver a probar en Android.
