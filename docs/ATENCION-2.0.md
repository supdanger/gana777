# Atención 2.0 — primera etapa

El menú incorpora **Centro de atención**, con bandejas de jugadores, chat externo
y solicitudes de acceso. Conserva las rutas existentes y muestra únicamente las
bandejas autorizadas para cada operador. Los contadores suman solo esas áreas.

Los chats separan **Por responder**, **Esperando al jugador/visitante**, **Todas**
y **Completadas**. Esperar al jugador significa que el último mensaje es de soporte
y la conversación sigue abierta; no representa una asignación a un operador.
Los pendientes se ordenan por mensaje más antiguo antes de aplicar la paginación.
La espera indica el tiempo desde el último mensaje recibido, calculado al renderizar;
no es una medición del primer mensaje sin respuesta ni actualiza mediante sondeo.

Al pulsar «Ver datos del jugador», se abre una ficha en un diálogo y se consultan
sus operaciones pendientes en las áreas permitidas: hasta tres cargas y tres retiros,
con conteo del total por tipo. La ficha no se consulta mientras permanezca cerrada.
No descarga comprobantes ni partes de retiros. Cambiar de jugador cancela las
consultas anteriores; Actualizar vuelve a consultar la ficha. Los visitantes
externos conservan su flujo actual de vinculación explícita con un jugador.

Esta etapa no requiere migraciones ni nuevas Edge Functions. No incorpora todavía
asignaciones compartidas, derivaciones o notas internas.
No se publicó ni se modificó la base de producción durante la implementación.

Validación: comprobación TypeScript, suite de pruebas, compilación en ambos modos
y prueba de navegador con servicios simulados (`tests/browser-optimization.mjs`).

## Chat de jugadores — respuestas y operaciones

- Se agregan seis respuestas rápidas. Se insertan en el borrador sin sobrescribir
  lo escrito y se pueden editar antes de enviar. No se envían automáticamente ni
  agregan consultas. Si exceden 2000 caracteres, se conserva el texto anterior.
- El borrador de texto se conserva por jugador mientras la bandeja siga montada.
  Se guarda solo en memoria del componente: cambiar de sección, recargar o salir
  lo descarta. Las imágenes no se conservan entre conversaciones.
- Un fallo de envío conserva el texto. El envío usa un bloqueo inmediato para
  evitar solicitudes simultáneas desde el formulario y limpia únicamente el
  borrador confirmado de ese jugador.
- Cada operación pendiente permite desplegar referencia, estado, fechas, datos
  disponibles del titular/cuenta y bono. Abrir su detalle no agrega consultas.
- Los movimientos recientes se consultan solo al abrirlos, con cinco filas por
  página, filtro por tipo y alcance explícito al jugador seleccionado. Los
  permisos de cargas y retiros se conservan. Cerrar el historial cancela su
  consulta; cambiar de jugador reinicia la ficha y el historial.
- El estado aprobado de un retiro se muestra como aprobación; no afirma que se
  haya completado el pago. La acreditación de cargas se muestra solo cuando el
  campo correspondiente la confirma.

La prueba de navegador incluye edición de plantillas, borradores entre jugadores,
error/reintento, bloqueo de envíos repetidos, detalle sin consultas adicionales,
historial bajo demanda y paginación/cambio de tipo, con servicios simulados.

### Orden visual de la ficha del jugador

La ficha presenta primero el nombre, después los contadores de cargas y retiros
pendientes y, por último, el acceso al historial. Solo muestra los tipos autorizados.
Si no hay pendientes, lo indica con un mensaje breve y un icono de confirmación.
El historial cambia entre Cargas/Retiros mediante botones visibles. Cada movimiento
separa tipo, estado, monto y fecha; la información adicional sigue desplegable.
La distribución adapta la altura al espacio disponible y mantiene las áreas de
trabajo dentro de la pantalla. Las consultas y permisos conservan el alcance anterior.


### Centro de Atención compacto

El Centro usa la altura disponible de la ventana. Jugadores y Chat externo abren
por defecto la lista **Todas**, a todo el ancho, sin una conversación vacía al lado.
Cada fila distingue nombre, último mensaje, origen, estado y actividad; en espacios
estrechos se priorizan nombre, mensaje y estado.

Al seleccionar una fila se oculta la lista y se abre solo la conversación. El botón
«Volver a conversaciones» conserva búsqueda, filtro, página y posición del listado,
y devuelve el foco a la fila elegida. Los borradores de jugadores se conservan en
memoria al volver a la lista. La ficha del jugador se consulta por medio de «Ver datos
del jugador», con cierre por botón o Escape y devolución del foco al control.

Los encabezados repetidos se ocultan mientras una conversación está abierta. El área
de respuesta permanece visible; listas, mensajes e historial largos se recorren dentro
de su área. Las solicitudes de acceso también muestran el listado a todo el ancho y abren
solo la solicitud elegida o el formulario de creación manual. «Volver a solicitudes»
conserva búsqueda, filtro y posición; al regresar se limpian las contraseñas del formulario. No se cambiaron
las reglas de envío, permisos, aprobación, vinculación o notificaciones.

La verificación de navegador comprueba altura de página, respuesta visible y
espacio de lectura en 1440×900, 1366×768, 1100×700, 1024×600, 955×900,
390×844 y 320×700, además de la apertura y cierre de la ficha con teclado, el regreso al listado y
la conservación de filtros y borradores.


### Tema único del panel

El panel utiliza una sola paleta oscura con acentos violetas. Se retiraron el selector
de apariencia, las cinco variantes y la lectura/escritura de preferencias de tema.
Una preferencia guardada en una sesión anterior ya no cambia los colores. Los tokens
`--panel-*` concentran la paleta que se ajustará de aquí en adelante.


### Aspecto visual sólido

La paleta única usa superficies oscuras uniformes, acentos violetas moderados y
separadores de bajo contraste. Las pestañas y filtros se distinguen por el fondo,
sin contornos brillantes. Las acciones secundarias son neutras y la acción de envío
conserva un relleno violeta. Los estados mantienen color y texto, y el foco de teclado
sigue visible. No se modificaron los flujos de atención ni las reglas de operaciones.
