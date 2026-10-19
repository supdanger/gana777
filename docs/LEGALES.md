# Documentos legales del portal

Los enlaces del pie del login y del portal abren Términos y condiciones y Política de privacidad. Los textos están en `src/player-legal.tsx`, identificados expresamente como **borrador para revisión**. No deben presentarse como documentos definitivos ni como garantía de cumplimiento.

## Información pendiente

Completar las variables públicas del despliegue del portal, según `.env.example`:

- `VITE_LEGAL_OPERATOR_NAME`: responsable real, no solamente la marca comercial.
- `VITE_LEGAL_OPERATOR_CUIT`: CUIT del responsable.
- `VITE_LEGAL_OPERATOR_ADDRESS`: domicilio legal.
- `VITE_PRIVACY_CONTACT_EMAIL`: correo atendido para consultas y ejercicio de derechos.

Se deben verificar además las habilitaciones y jurisdicciones del servicio, el proveedor real de alojamiento, las regiones y subencargados de los servicios en la nube, los mecanismos de transferencia internacional y los plazos concretos de conservación por categoría, incluyendo respaldos. La revisión legal y operativa debe resolver estos puntos antes de quitar el aviso de borrador.

## Alcance implementado

La información se basa en las funciones existentes: cuentas y teléfonos administrados por el panel, identificador externo y WhatsApp asignado, solicitudes de carga y retiro, datos bancarios, mensajes y comprobantes. La base y la autenticación utilizan Supabase; los comprobantes nuevos utilizan Cloudinary. Turnstile es condicional a su configuración.

Los enlaces **no registran aceptación contractual ni consentimiento**. No se agregó una casilla ni un registro de consentimiento, y no debe afirmarse que existen. Cualquier tratamiento que necesite consentimiento específico requiere evaluar e implementar su obtención y evidencia de forma separada. Los enlaces tampoco implementan un proceso automático de atención de derechos, borrado o conservación.

La política requiere que el responsable disponga de un canal real y un procedimiento para atender solicitudes. Tampoco debe confundirse el aviso +18 con una verificación de edad: el portal no incorpora una comprobación documental de edad por mostrar ese texto.

## Fuentes oficiales revisadas

- [Ley 25.326, texto actualizado](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion).
- [AAIP: derechos de las personas](https://www.argentina.gob.ar/aaip/datospersonales/derechos).
- [AAIP: transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).

Estos documentos no reemplazan el asesoramiento legal ni las medidas técnicas y organizativas efectivas.
