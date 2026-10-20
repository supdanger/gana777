# Botón con banner antes de Cargar

En el panel, **Configuración → Portal**, se puede definir un nombre accesible, un destino HTTPS, una imagen JPG/PNG/WebP (hasta 5 MB) y activar u ocultar el botón.

El enlace aparece primero entre las tarjetas del inicio, antes de Cargar, Retiros y Chat, únicamente cuando está habilitado con imagen y destino válidos. Abre otra pestaña con `noopener noreferrer`: el portal no agrega credenciales, tokens ni datos del usuario al enlace. La sesión de la página de destino depende de su propio origen y cookies; no se implementa inicio de sesión automático allí.

La imagen misma funciona como botón y ocupa todo el ancho de las otras tarjetas, sin borde ni fondo visible detrás. El botón mantiene una proporción de 6:1 y recorta el centro de imágenes más altas para evitar franjas vacías arriba y abajo. Conviene dejar textos y símbolos importantes en la franja central. El contenedor tiene esquinas de 7 px y la vista previa del panel usa el mismo ajuste. Las filas no fuerzan una altura igual: Cargar, Retiros y Chat siguen compactos. Los controles de configuración usan el permiso existente **Contactos**, igual que el resto del contenido de `app_settings`; no se habilita a todos los cajeros.

El banner predeterminado actual es la última imagen trabajada y enviada por el usuario: `src/assets/home-casino-banner-v3.png` (1642 × 322 px). Se copia sin alterar el archivo y se muestra completo. Se conservan el original y la versión generada anterior (`home-casino-banner.png` y `home-casino-banner-v2.png`). El nuevo diseño aparece como vista previa inicial y se sube a Storage automáticamente al guardar si todavía no hay un banner. El botón **Usar banner incluido** permite elegirlo sin borrar imágenes existentes. Para reemplazar una versión anterior ya guardada, pulsar ese botón y **Guardar banner** después de publicar. Una imagen personalizada guardada se conserva mientras no se elija reemplazarla. El enlace no se deduce del texto del banner: se debe configurar expresamente en el panel. Los prompts de la versión generada anterior se conservan en `docs/BANNER-INICIO-IMAGEN.md`.

## Publicación

1. Aplicar `supabase/migrations/023_home_banner_link.sql` (por ejemplo, `npx supabase db push`). Agrega columnas con el botón oculto por defecto y una política de subida limitada a la carpeta `home-banners/` de `app-assets`. Conserva las políticas de lectura y edición de ajustes existentes.
2. Publicar portal (`npm run build`) y panel (`npm run build:admin`). No requiere nuevas Edge Functions.
3. En Portal, subir la imagen, cargar la URL, activar y guardar. Hasta configurarlo no se muestra ningún botón vacío al jugador.

Los archivos nuevos usan rutas únicas, sin sobrescribir imágenes existentes. Cambiar un banner no borra automáticamente el anterior; si se interrumpe el guardado después de subir una imagen, puede quedar un archivo no referenciado. Esto evita borrar una imagen que haya quedado guardada en una respuesta de red incierta.

## Verificación

- Configuración solo accesible al superadmin o con permiso Contactos. La base conserva RLS para impedir que un jugador actualice `app_settings`.
- Activar y guardar: aparece antes de Cargar; probar destino desde portal y desde la aplicación instalada. Comprobar que el portal permanece abierto y el usuario puede volver.
- Cambiar imagen/URL: se actualiza al guardar en el panel abierto y mediante realtime/foco en otros clientes. Desactivar: desaparece.
- Verificar tamaños de 320, 390 y 430 px, nombres largos, navegación con teclado y la vista previa de la imagen.
- Rechazar HTTP, `javascript:`, URL con credenciales, formatos distintos de JPG/PNG/WebP, archivos falsos, vacíos y mayores de 5 MB.
- La migración y los permisos Storage requieren comprobación en Supabase: las pruebas locales no sustituyen esa validación.
