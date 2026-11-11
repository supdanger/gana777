# Retiros por transferencias

## Mínimo de retiro: $5.000

Las nuevas solicitudes del jugador deben ser de **$5.000 o más**. El formulario
muestra el mínimo, deshabilita el envío por debajo del umbral y comprueba el monto
nuevamente antes de llamar a `create_withdrawal`. Se aceptan importes locales como
`5.000` y `5.000,00`; $4.999,99 se rechaza.

La protección también está en la base, aplicada con
`supabase/migrations/101_minimum_withdrawal_amount.sql`. Agrega un trigger
independiente de inserción: alcanza la RPC y las inserciones directas, sin
reemplazar las validaciones, permisos o límites vigentes. No modifica retiros
anteriores ni sus pagos parciales; el mínimo corresponde al total de la nueva
solicitud. El ajuste administrativo de una solicitud existente conserva su regla.

Se validó la migración en PostgreSQL temporal con `tests/withdrawal-minimum-sql.mjs`,
incluyendo la RPC existente, inserción directa, límite inclusivo, conservación de
retiros anteriores y ejecución repetida de la migración. La prueba no lee `.env`
ni se conecta a la base real:

```sh
PGLITE_MODULE=/ruta/a/pglite/dist/index.js node tests/withdrawal-minimum-sql.mjs
```

## Pagos por transferencias

Aplicar `supabase/migrations/026_withdrawal_parts.sql` antes de publicar las nuevas versiones del panel y del portal. La migración crea un bucket privado para comprobantes de retiro y divide también los retiros que sigan pendientes al momento de aplicarla. Después, publicar ambas aplicaciones. No requiere desplegar una Edge Function nueva.

Una solicitud conserva su monto total y la espera de 24 horas comienza cuando se completa el último pago. Cada pago puede ser de hasta $100.000; por ejemplo, $1.000.000 genera diez pagos de $100.000. El máximo por solicitud es $10.000.000 (100 pagos). El panel carga una foto JPG, PNG o WebP de hasta 5 MB por pago y la confirma después de transferir. El retiro pasa a acreditado solamente cuando la suma de los pagos coincide con el total y todos están confirmados. Si ya hubo un pago, el retiro no se puede rechazar desde el panel.

El jugador ve el retiro agrupado en su historial; cada transferencia aparece como «Retiro 1 de 10 · Realizado» o «Pendiente», con su importe y su comprobante. Los comprobantes se guardan en un bucket privado; solo el titular y el personal con permiso de Retiros pueden obtener un enlace temporal de lectura. La interfaz no ofrece edición ni eliminación de estas fotos. Como ocurre con cualquier imagen mostrada en un navegador, no es técnicamente posible impedir capturas de pantalla o que el usuario la guarde por otros medios.

Verificación antes de operar con dinero real: ejecutar `supabase/tests/026_withdrawal_parts_checks.sql` en un proyecto de prueba y comprobar desde el panel una solicitud de $1.000.000, diez fotos, la acreditación del último pago y la vista del historial con una cuenta de jugador. También verificar que otra cuenta no pueda abrir los comprobantes. El test SQL usa una transacción y revierte sus datos ficticios.
