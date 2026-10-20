# Recomendados y premios

## Regla

Al crear un jugador en **Usuarios**, buscar opcionalmente al recomendador por usuario o ID de plataforma y seleccionarlo entre las coincidencias. El recomendador debe ser otro jugador existente; escribir un nombre sin seleccionarlo no registra el vínculo. Se permite recomendar entre distintos principales de WhatsApp; el teléfono conserva la unicidad global existente.

La primera carga **aprobada** del recomendado genera, en la misma transacción, dos premios independientes de $1.000. Las cargas pendientes o rechazadas, los retiros y las cargas posteriores no generan premios. Los bonos ordinarios de carga siguen intactos: este diseño trata la recomendación como premio adicional.

No hay asignaciones retroactivas ni cambios posteriores de recomendador. Se bloquean autorrecomendaciones, cuentas del personal y ciclos. Cada recomendado tiene una única relación y un único premio por beneficiario. No se generan premios para usuarios existentes por aplicar la migración.

## Acreditación manual

La web no integra una API de saldo de la plataforma externa. Los premios son una cola operativa en **Operaciones → Recomendados**, debajo de Retiros, no un saldo monetario automáticamente acreditado. El apartado conserva el acceso para superadministradores y personal con permiso de Usuarios o Bonos. El vínculo se sigue eligiendo al crear al jugador en Usuarios.

1. En Recomendados, seleccionar **Tomar bono para acreditar**.
2. Copiar usuario/ID y monto, y efectuar la carga en la plataforma externa.
3. Seleccionar **Ya acredité este bono** únicamente después de verificar esa carga.

Una reserva impide que otro operador tome o confirme el premio. No vence automáticamente: un vencimiento podría habilitar otra acreditación después de un pago externo ya realizado. El mismo operador, o un superadministrador, puede liberar la reserva tras comprobar que no hubo acreditación. Las reservas, liberaciones y confirmaciones dejan eventos de auditoría.

La confirmación repetida no vuelve a generar registros de acreditación. La base no puede verificar por sí sola si un operador cargó dinero en la plataforma externa; esa comprobación sigue siendo una responsabilidad operativa.

El modal de una carga aprobada avisa si se generaron premios; su total copiable **no los incluye**, porque se tramitan desde la cola separada. Cada jugador puede consultar exclusivamente sus propios premios en Perfil, con paginación de cinco registros. La cola administrativa pagina de a diez.

## Despliegue

```bash
npx supabase db push
npm run deploy:functions
```

Desplegar también el portal y el panel con sus comandos habituales. La migración necesaria es `022_player_referrals.sql`; la función modificada es `manage-players`. No ejecutar `migration repair --status applied` como sustituto de aplicar el esquema.

El panel comprueba la compatibilidad de `manage-players` antes de crear un recomendado: una versión antigua puede crear usuarios ignorando el vínculo. Después de crear también verifica la relación guardada. Si informa que la cuenta ya se creó, no repetir el alta. Cada tarjeta indica el recomendador o «Sin recomendador registrado». El contador de cargas no confirma por sí solo que exista una primera carga aprobada. No borrar/recrear cuentas ni generar premios retroactivos para resolver un despliegue incompleto.

## Verificación

`supabase/tests/022_referrals_checks.sql` verifica con cuentas ficticias dentro de una transacción: pendientes/rechazos sin premio, primera aprobación y segunda aprobación sin duplicar, conservación del bono normal, reservas excluyentes, confirmación idempotente, aislamiento entre jugadores y permisos administrativos. Termina en `rollback`; ejecutarlo como postgres en un proyecto de prueba con las migraciones aplicadas.

Verificar adicionalmente con dos sesiones simultáneas que dos aprobaciones del mismo recomendado producen exactamente dos premios totales, y que dos operadores no pueden reservar a la vez el mismo premio.

El programa no verifica documentalmente si dos teléfonos pertenecen a la misma persona. No se debe presentar la unicidad de teléfono como una garantía completa contra abuso de identidades.
