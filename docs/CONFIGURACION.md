# Recursos visuales y comprobantes

## Contactos con Lottie JSON

Preparación para el futuro panel: ejecutar `supabase/migrations/004_contact_lottie.sql` después de 001 y 003. No necesita Cloudinary ni la migración 002. Permite archivos `application/json` en `app-assets` y crea `contact_animations`, con una fila para WhatsApp, Telegram e Instagram. Solo el administrador puede cambiar sus rutas.

El futuro panel debe subir un JSON Lottie vectorial a Storage y guardar su ruta en `animation_path`:

| Contacto (`channel`) | Ruta sugerida |
| --- | --- |
| `whatsapp` | `contacts/whatsapp.json` |
| `telegram` | `contacts/telegram.json` |
| `instagram` | `contacts/instagram.json` |

La app lee los cambios por Realtime. `animation_path = null` conserva el icono estático. El enlace de cada contacto sigue siendo independiente de su animación. No se incluye todavía la pantalla de subida del panel ni archivos JSON definitivos.

El reproductor Lottie Light 5.13.0 se carga desde cdnjs únicamente cuando hay un JSON configurado; admite animaciones vectoriales sin expresiones. Usar archivos autónomos, sin recursos externos. Los iconos actuales se mantienen si falta un archivo, el JSON no es válido, falla la conexión o el dispositivo prefiere movimiento reducido. Las animaciones se pausan fuera de pantalla y al ocultar la pestaña.

Se verificó la compilación. La reproducción con los JSON definitivos queda pendiente hasta que se suban.

## Preparar solo Storage ahora

Ejecutar `supabase/migrations/003_prepare_storage.sql` en SQL Editor. Requiere la migración 001; no requiere la 002 ni activa Cloudinary. Puede repetirse y conserva los archivos existentes. Prepara el bucket público `app-assets` para imágenes de hasta 5 MB, con escritura reservada al administrador. Después subir las imágenes siguiendo la sección correspondiente. El SQL no sube archivos de la PC.

## Aplicar la actualización de la base

En Supabase → SQL Editor, ejecutar `supabase/migrations/002_content_and_cloudinary.sql` después de la migración 001. Si 001 ya está aplicada, **no volver a ejecutarla**. La migración 002 conserva las solicitudes y los comprobantes anteriores. Después de 002, las cargas nuevas requieren las funciones de Cloudinary.

## Subir las imágenes a Supabase Storage

El bucket público `app-assets` guarda únicamente recursos visuales de la app. Solo el administrador puede subir, reemplazar o borrar archivos. Las imágenes no contienen datos de usuarios.

Con `.env` configurado y la cuenta `gana777@gmail.com` habilitada en `admin_users`, ejecutar:

```powershell
npm.cmd run assets:upload
```

El comando pide la contraseña en la terminal sin mostrarla ni guardarla. Sube el panda transparente y el banner original, conservando los archivos ya existentes. Alternativamente, subirlos desde Supabase → Storage → app-assets con estas rutas:

| Archivo local | Ruta en Storage |
| --- | --- |
| `public/preview-assets/panda-login-transparent.png` | `brand/panda-login-transparent.png` |
| `public/preview-assets/panda-user-avatar.png` | `avatars/panda-user-avatar.png` |
| `public/preview-assets/welcome-reference.png` | `banners/welcome-reference.png` |

El panda del login es un PNG con transparencia real, extraído localmente de la referencia original. La app reconoce la antigua ruta `brand/login-reference.png` y utiliza automáticamente la nueva imagen, sin requerir SQL adicional. El banner sigue mostrando la zona correspondiente de la referencia original mediante CSS. Mientras falten esos archivos en Storage, los recursos incluidos en la app permiten ver el diseño; Storage tiene prioridad una vez que la imagen termina de cargar.

Para usar imágenes independientes en el futuro, subirlas a `app-assets` y cambiar `login_image_layout` o `image_layout` a `image`. Así se muestran completas sin el marco de referencia. `logo_path` admite un logotipo independiente. Los íconos de los controles se dibujan como SVG en el código.

## Configuración de bonos para el futuro panel

`promotions` controla el banner y los bonos seleccionables; `app_settings` controla el personaje del login, el logo y los enlaces de contacto. Los usuarios tienen acceso de lectura; solo los administradores pueden modificarlos. La interfaz vuelve a consultar estas tablas cuando recibe cambios por Realtime.

El banner inicial es el de bienvenida de la imagen. No se activa automáticamente un bono del 10% ni se acredita saldo. Cada bono elegible es un porcentaje o un monto fijo, y solo aparece si la carga está entre su mínimo y su máximo. La base copia ese valor al guardar la solicitud; el cliente no puede inventarlo. Un bono se puede editar: el cambio vale para las próximas cargas, y las ya enviadas conservan el porcentaje o el monto que tenían. Si una carga ya lo usó, no se puede eliminar; se pausa con `active = false`.

Antes de crear estos bonos hay que ejecutar `supabase/migrations/010_bonus_rules.sql` y, después, volver a desplegar la función `submit-deposit`.

Ejemplo para habilitar un 10% entre $10.000 y $50.000, y un monto fijo de $5.000 entre $20.000 y $100.000, sin cambiar el banner de bienvenida:

```sql
insert into public.promotions(title,bonus_mode,bonus_percent,bonus_amount,min_amount,max_amount,active,selectable,show_banner)
values ('Bono 10%','percent',10,0,10000,50000,true,true,false);

insert into public.promotions(title,bonus_mode,bonus_percent,bonus_amount,min_amount,max_amount,active,selectable,show_banner)
values ('Bono $5000','fixed',0,5000,20000,100000,true,true,false);
```

Para cambiar el banner, actualizar `image_path` y `image_layout = 'image'` de la promoción visible. Si hay más de una con `show_banner`, se muestra la primera según `sort_order`. Los enlaces sociales sin configurar se muestran atenuados y no abren destinos inventados.

## Configurar Cloudinary

Los comprobantes nuevos se suben a Cloudinary desde `submit-deposit`, una Supabase Edge Function. Supabase conserva su URL y el identificador necesario para consultarlos. Los bytes del archivo no se guardan en Supabase Storage.

Configurar estos secretos en **Supabase → Edge Functions → Secrets**:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Supabase proporciona automáticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al entorno de funciones. Ninguna clave secreta debe tener prefijo `VITE_` ni formar parte de los repositorios. `.env.functions.example` es solo una plantilla, no contiene credenciales.

Con Supabase CLI instalado y la sesión del proyecto configurada, desplegar desde esta carpeta:

```powershell
supabase functions deploy submit-deposit --project-ref TU_PROJECT_REF
supabase functions deploy receipt-url --project-ref TU_PROJECT_REF
supabase functions deploy manage-cashiers --project-ref TU_PROJECT_REF
```

El archivo `supabase/config.toml` desactiva la verificación JWT del gateway para estas funciones. **Ambos handlers verifican explícitamente el token con `auth.getUser`** antes de acceder a datos o Cloudinary; no aceptan cargas anónimas. `receipt-url` también comprueba el rol de administrador.

Los comprobantes usan el tipo `authenticated` de Cloudinary. Su URL guardada no es una URL pública. El panel solicita un enlace de descarga firmado que vence en 60 segundos. Se conserva la lectura temporal de comprobantes antiguos almacenados en el bucket privado `receipts`.

Límites: 5 MB, JPG/PNG/WebP/PDF y cinco intentos por usuario cada diez minutos. La función comprueba el contenido inicial del archivo, el monto y el bono antes de registrarlo. Si falla el registro después de subir, intenta eliminar el archivo de Cloudinary. Si hay un corte de red durante la subida o falla esa eliminación, puede requerirse limpiar archivos huérfanos desde Cloudinary.

Si la cuenta Cloudinary bloquea PDFs, habilitar su entrega en sus ajustes o usar imágenes. Esta integración no requiere un upload preset público.

## Verificaciones

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:admin
```

Las pruebas locales comprueban montos, límites/formato de archivos y firmas. La migración y las funciones necesitan pruebas en un proyecto real antes de usarse con usuarios: carga → comprobante privado en Cloudinary → URL en Supabase → apertura desde una cuenta administradora. Verificar que una cuenta común no pueda insertar cargas con URL propia, abrir comprobantes ajenos ni modificar promociones.

La revisión automática del diseño en Chrome local no pudo completarse: la conexión de depuración no respondió. Queda pendiente comprobar visualmente las cinco pantallas en un teléfono o navegador.

Documentación oficial: [subidas firmadas de Cloudinary](https://cloudinary.com/documentation/upload_images), [acceso a archivos privados](https://cloudinary.com/documentation/control_access_to_media), [permisos de Storage](https://supabase.com/docs/guides/storage/security/access-control).
