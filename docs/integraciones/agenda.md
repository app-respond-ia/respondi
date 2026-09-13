# Agenda de reservas

Arrancada el 12-09-2026, después de Shopify. Decidido con Jorge: una agenda
que valga para cualquier negocio (peluquería, clínica, taller, academia y
también un restaurante con mesas y turnos), en tres tramos seguidos:

1. **Servicios, recursos, citas, herramientas de la IA, calendario y
   automatizaciones** (hecho el 12-09-2026).
2. **Modo restaurante**: mesas con capacidad, combinaciones, turnos,
   duración por comensales, aforo por turno, cortesía, sin reserva (hecho
   el 13-09-2026).
3. **Enlace público de reserva** (web, Instagram, QR) y gestión con
   llave (hecho el 13-09-2026).

Decisiones de Jorge: la IA confirma directamente lo que cabe en las reglas y
lo raro va a una persona (el negocio puede poner "confirmación a mano");
sin señales ni depósitos de momento; entra en todos los planes; el cliente
nunca se registra ni tiene contraseña (su teléfono o correo es su contacto).

## El modelo, en tres piezas

- **Recursos** (`recursos`): lo que se ocupa al reservar. Persona, mesa,
  sala, equipo u otro. Cada uno con capacidad mínima y máxima (una mesa de
  4 admite de 2 a 4), zona, color, si el cliente puede elegirlo por nombre,
  su horario propio (`recursos_horarios`; si no tiene, usa el del negocio) y
  qué servicios hace (`recursos_servicios`; sin marcar ninguno, hace todos
  los de su tipo). Bloqueos (`agenda_bloqueos`): vacaciones, festivos,
  averías; sin recurso = todo el negocio.
- **Servicios**: los artículos de la lista de precios marcados como
  reservables. Columnas nuevas en `price_list`: `reservable`,
  `duracion_minutos`, `tiempo_antes_minutos`, `tiempo_despues_minutos`,
  `huecos_internos` (el tinte: aplicar, 30 min libre, aclarar),
  `tipo_recurso`, `recursos_necesarios`, `aforo` (clases: plazas por hueco),
  `precio_por_persona`, `extras`, `cancelacion_horas`, `confirmacion`,
  `reservable_online`.
- **Citas** (`citas`): quién, qué servicio, cuándo, cuántas personas, estado
  (pendiente, confirmada, en curso, completada, no se presentó, cancelada
  por cliente o por negocio), origen (ia, panel, enlace), copia de nombre,
  teléfono y correo, extras, precio estimado, `token_gestion` (la llave del
  enlace de cambiar/cancelar), `avisos` (qué recordatorios han salido) y su
  historial (`citas_historial`). La ocupación real de cada recurso va en
  `citas_recursos`, porque con huecos internos no coincide con la cita.
- **Ajustes** (`agenda_ajustes`, uno por sucursal): activa, modo
  (servicios / restaurante), paso de la agenda, antelación mínima y máxima,
  máximo de reservas activas por cliente, confirmación automática o manual,
  desde cuántas personas es grupo grande, plazo de cancelación, y los del
  restaurante (turnos, duración por comensales, aforo por turno, cortesía,
  combinar mesas), instrucciones para la IA y el enlace público.
- **Lista de espera** (`agenda_espera`): quien quería un día lleno; al
  cancelarse una cita de ese día se le avisa por orden de llegada.

## El blindaje contra la doble reserva

`citas_recursos` lleva una restricción `EXCLUDE USING gist (recurso_id WITH
=, tstzrange(desde, hasta) WITH &&, grupo WITH <>)`: el mismo recurso no
puede tener dos ocupaciones que se crucen salvo que sean del mismo `grupo`
(las plazas de una misma clase). Las citas individuales llevan su propio id
como grupo, así que siempre chocan. La reserva entera se hace en una función
de base de datos (`reservar_cita`, `mover_cita`) que devuelve `ocupado` o
`aforo` si no cabe; las clases con aforo se cuentan dentro de un candado
(`pg_advisory_xact_lock`). Verificado con reservas reales contra la base de
datos (`verificar-agenda-bd.mjs`, 6/6): solapada → rechazo; contigua →
entra; mover encima de otra → rechazo y la cita conserva su hueco; clase de
2 plazas admite dos y rechaza la tercera; una individual no se mete encima
de la clase.

## Cómo se calculan los huecos

`src/lib/agenda/disponibilidad.ts`. Un hueco es una hora de inicio (en la
zona horaria de la sucursal, en pasos de `paso_minutos`) en la que todos los
tramos que ocupa el servicio (antes, el servicio menos sus huecos internos,
después) caen dentro del horario del recurso, no pisan bloqueos ni citas, y
respetan la antelación. Si el servicio pide varios recursos, hacen falta
tantos libres como pida. Se reparte al menos cargado del día. Para las
clases con aforo, el hueco existe mientras queden plazas en ese grupo.
El panel puede reservar fuera de horario y sin antelación (`sinReglas`),
pero nunca encima de otra cita.

Las horas se manejan sin librerías con `src/lib/agenda/tiempo.ts` (Intl):
`instanteLocal` (día y hora de la sucursal → instante UTC, con cambios de
hora), `partesEnZona`, `textoFechaHora`.

## Modo restaurante (tramo 2)

Se activa en Ajustes → "Tipo de negocio: Restaurante". Lo que cambia:

- **Lo que se reserva es una mesa**, no un artículo de la lista de precios
  (`servicioMesa` en `disponibilidad.ts`, id `mesa`, `servicio_id` vacío en
  la cita y `servicio_nombre` "Mesa para N"). Si además hay servicios
  reservables (un menú degustación, un reservado), siguen funcionando.
- **Mesas** = recursos de tipo mesa con capacidad mínima y máxima y zona
  (terraza, interior). Se asigna la **más ajustada** que quepa (para 2, una
  de 2 antes que una de 4); si no cabe en ninguna y "juntar mesas" está
  encendido, una **combinación** (`recursos_combinaciones`: dos o más mesas
  con su capacidad; ocupa todas). La zona se puede pedir.
- **Turnos** (Comida 13:00–16:00 con última entrada 15:00, Cena…): las
  entradas van del inicio a la última entrada en pasos de la agenda. Sin
  turnos, vale el horario del negocio. **Duración según comensales**
  (hasta 2: 60 min; hasta 4: 90; hasta 8: 120), **aforo por turno** (solo
  con turnos definidos; sin ellos contaría la comida y la cena juntas) y
  **grupo grande** igual que en servicios.
- **Cortesía**: pasados X minutos de la hora sin que llegue nadie
  (`llegada_en` vacío), el reloj marca la reserva como "no se presentó" y
  libera la mesa (`repasarCortesia`, cada 5 min; sale la automatización de
  plantón si está encendida). "Ha llegado" en el detalle pone la hora de
  llegada y la protege.
- **Sentar sin reserva**: la mesa queda "en curso" desde ahora mismo, sin
  reglas (el panel puede reservar incluso en una hora ya pasada).
- **Vista de sala** (pestaña Sala): las mesas por zona con sus reservas del
  turno elegido (libre / reservada / por confirmar / sentados); pulsar una
  mesa libre abre la reserva con esa mesa; una ocupada abre el detalle.
- **La IA** pregunta siempre cuántas personas, pasa servicio "mesa", zona si
  la piden y las peticiones (alergias, trona); `cambiar_cita` también cambia
  el número de personas ("al final somos 2") y con ello la mesa y la
  duración.

## Las tres puertas

Todo pasa por `src/lib/agenda/citas.ts` (`crearCita`, `moverCita`,
`cancelarCita`, `cambiarEstadoCita`), que aplica las reglas (grupo grande,
tope por cliente, antelación, plazo de cancelación cuando cancela el cliente),
escribe el historial y avisa a las automatizaciones (`dispararEventoAgenda`).

- **La IA en el chat** (`src/lib/agenda/herramientas-ia.ts`): ver_huecos,
  reservar_cita, cambiar_cita, cancelar_cita, mis_citas y
  apuntar_espera_agenda. Existen solo con la agenda activada y algo
  reservable. La IA recibe la fecha de hoy en la zona de la sucursal, los
  servicios con duración y precio, los profesionales elegibles, las reglas y
  las indicaciones del negocio. Solo toca las citas del contacto que
  escribe. Lo raro (grupo grande, tope, fuera de plazo) abre un caso en la
  conversación y el motor de la IA lo cuenta como escalado. Red de
  seguridad en `generarRespuesta.ts`: si el cliente habla de reservar y la
  IA contesta sin usar la agenda, se le pide que lo revise (llamar a
  ver_huecos o preguntar lo que falta, sin inventar horas).
- **El panel** (`src/app/dashboard/agenda`, acciones en
  `src/app/actions/agenda.ts`): calendario del día por recurso (columnas) y
  vista de semana, lista en móvil, nueva cita con búsqueda de huecos (y
  "fuera de horario"), detalle con confirmar / ha llegado / terminada / no ha
  venido / mover / cancelar e historial, bloqueos, recursos con horario
  propio y servicios que hacen, ajustes. Permiso nuevo: sección **Agenda**
  (lectura / escritura) en Roles.
- **El enlace público** (`src/app/r/[enlace]`, acciones sin sesión en
  `src/app/actions/reservas-publicas.ts`): respondi.vercel.app/r/su-enlace.
  El negocio elige el trozo de dirección y lo enciende en Ajustes (con botón
  de copiar y código QR). Tres pasos en el móvil: qué (servicio, o mesa con
  personas y zona; profesional si se puede elegir; extras), cuándo (siete
  días a la vista, cualquier otro día, huecos por mañana / tarde / noche) y
  quién (nombre, WhatsApp o correo, peticiones, privacidad). Sin cuenta: el
  teléfono o el correo es el contacto de Respondi (se crea si no existe) y
  la confirmación sale por la automatización "Cita reservada". Solo se
  enseñan los servicios con "se puede reservar desde el enlace público" y
  las personas elegibles; los teléfonos sin prefijo se completan con el país
  de la sucursal (`completarTelefono`); los grupos grandes se mandan a
  escribir; un campo trampa frena a los robots; el tope de reservas por
  cliente aplica.
  **Gestionar con la llave** (`/reserva/[token]`): la confirmación lleva un
  enlace con `token_gestion` (32 caracteres, único) para ver la reserva,
  cambiarla de día u hora o cancelarla, dentro del plazo del negocio; fuera
  de plazo la página lo dice y remite a escribir. Las acciones del enlace
  pasan por el mismo `citas.ts` que la IA y el panel.

## Automatizaciones nuevas (categoría "Citas y reservas", 8)

Necesitan la agenda activada (`requiereAgenda`), no la tienda. Disparador
nuevo `evento_agenda` (cita_creada, cita_movida, cita_cancelada,
cita_confirmada, cita_en_curso, cita_completada, cita_no_presentado,
cita_recordatorio, cita_por_confirmar, cliente_sin_cita, hueco_liberado),
también en el editor de recetas propias.

- Cita reservada (aviso cuando la apunta el equipo o entra por el enlace;
  las de la IA no lo necesitan).
- Recordatorio de cita (X horas antes y un segundo aviso opcional; una cita
  reservada después del punto del aviso no lo recibe).
- Pedir confirmación (X horas antes; si el cliente responde SÍ, queda
  anotado en la cita y en su historial: `confirmarCitaPorRespuesta` en la
  entrada de mensajes).
- No se presentó, Reseña tras la cita (espera, marketing), Hace tiempo que
  no viene (semanas; marketing; una vez por última cita), Hueco liberado
  (lista de espera, hasta tres por cancelación), Cita por confirmar (aviso
  al equipo cuando entra pendiente).

Cada una con su plantilla de WhatsApp prediseñada
(`plantillas-predisenadas.ts`, huecos: cliente, servicio, cita_fecha,
cita_hora, negocio, enlace, tiempo). Los repasos del reloj están en
`src/lib/agenda/repasos.ts` y corren en `/api/cron/automatizaciones`
(recordatorios y confirmaciones cada 5 min; los dormidos a las 11). Los
mensajes automáticos no gastan créditos de Respondi (los cobra Meta).

## Cómo se prueba (scratchpad de la sesión)

- `verificar-agenda-bd.mjs` (6): el blindaje de la base de datos.
- `probar-agenda.mjs` (52): ajustes, servicios reservables (y sus
  validaciones), recursos con horario propio y servicios que hacen, 35
  huecos de 9:00 a 17:30, ocupación (una cita de 10:00 quita 9:45, 10:00 y
  10:15), reparto al libre, huecos internos del tinte, aforo de la clase,
  bloqueos por recurso y de todo el negocio, mover, estados, cancelar,
  historial, reglas sin forzar (grupo grande, antelación, tope), borrar
  recursos, auditoría. Sin restos.
- `probar-agenda-automatizaciones.mjs` (32, WhatsApp simulado): las ocho
  automatizaciones, incluida la respuesta SÍ por el webhook de Meta y que
  no se repiten. Sin restos.
- `probar-agenda-ia.mjs` (20, OpenAI real): reservar en dos turnos,
  cambiar, mis citas, cancelar, grupo grande → caso, fuera de plazo → caso,
  día lleno → lista de espera. Esta prueba obligó a tres redes de seguridad
  en `generarRespuesta.ts`: la suave (habla de reservar sin usar la agenda →
  revisión), la de "promete hacerlo en un momento" (nadie lo hará luego) y
  la fuerte (pide cancelar o cambiar a una hora concreta, o dice "sí" a lo
  que la IA acababa de proponer → se le obliga a llamar a cancelar_cita o
  cambiar_cita). Sin ellas, gpt-4.1-mini contestaba "ahora mismo lo
  cambio, un segundo" sin llamar a nada. Nota: la cuenta de OpenAI se quedó
  sin crédito a mitad de sesión (429); Jorge la recargó y la prueba pasó.
- `captura-agenda.mjs` (11, navegador real): calendario, detalle, nueva
  cita, semana, recursos, ajustes, formulario de precios con reserva, móvil.
- `probar-agenda-restaurante.mjs` (30): turnos y última entrada, mesa más
  ajustada por comensales, zona, combinación para 8, sin mesa para 11 ni
  para 1, ocupación y vuelta de la mesa, terraza ocupada por el grupo, aforo
  por turno (y sin turnos no cuenta), duración por comensales, sentar sin
  reserva, cortesía que libera la mesa (y no toca a los sentados), sin
  turnos vale el horario, combinaciones.
- `probar-agenda-ia-restaurante.mjs` (9, OpenAI real): pregunta las
  personas, reserva mesa para 4 en la terraza (la más ajustada), grupo de
  12 → caso, "al final somos 2 a las 20:30" cambia hora y personas,
  cancelar.
- `captura-restaurante.mjs` (9, navegador real): sala por zonas y turno,
  nueva reserva con zona, sentar sin reserva, mesas que se juntan, ajustes
  con turnos, móvil.
- `probar-reserva-publica.mjs` (33, sin sesión): enlace inexistente,
  apagado, sin nada reservable, lo que se enseña (no el servicio privado ni
  la persona no elegible), huecos, servicio privado y persona no elegible
  rechazados, grupo grande, teléfono sin prefijo (sin país no vale; con la
  sucursal en España se completa a +34), privacidad obligatoria, robot,
  reserva con extra y petición (crea el contacto, origen "enlace"), hueco
  ocupado, reserva por correo, tope por cliente, ver / cambiar / cancelar
  con la llave, llave falsa, fuera de plazo, y una mesa de restaurante por
  el enlace. Las dos acciones que solo usa el servidor (`getReservaPublica`,
  `getReservaPorToken`) se comprueban por el HTML de la página: no tienen
  identificador de acción público.
- `captura-reserva-publica.mjs` (9, navegador real): la sección del enlace
  en Ajustes con QR, y la página pública desde un móvil sin sesión: pasos,
  huecos, reserva, confirmación, gestionar y cancelar con la llave.
- Ojo al lanzar pruebas: nunca dos a la vez. Todas limpian el mismo
  inquilino de pruebas y se pisan (pasó el 13-09-2026 con la mecánica del
  restaurante en segundo plano y la de la IA delante).

## Verificado en producción

- **Tramo 1 (12-09-2026, commit `3aa96f1`)**: `prod-automatizaciones` 9/9
  (45 automatizaciones, todas listas y apagadas, frenos, dominio
  inexistente contra Shopify real), `captura-agenda` con `PROD=1` 11/11
  (calendario con citas, detalle, nueva cita con huecos, semana, recursos,
  ajustes, formulario de precios con reserva, móvil sin desbordar, sin
  errores de JavaScript), y el reloj de la base de datos trató un aviso
  pendiente en 16 s (`prod-latido`). Sin restos y saldo del inquilino de
  pruebas en 7.
- **Tramo 2 (13-09-2026, commit `6acf53a`)**: `prod-automatizaciones` 9/9,
  `captura-restaurante` con `PROD=1` 9/9 (sala por zonas y turno, nueva
  reserva, sentar sin reserva, mesas que se juntan, ajustes, móvil). El
  reloj de la base de datos no recogió el aviso pendiente en los 100 s de
  la primera comprobación (los cuelgues de 60 s del cron, conocidos); en la
  segunda lo trató en 14 s. Sin restos y saldo en 7.
- **Tramo 3 (13-09-2026, commit `f7bf356`)**: `prod-automatizaciones` 9/9,
  `captura-reserva-publica` con `PROD=1` 9/9 (la sección del enlace con QR
  en Ajustes y, desde un móvil sin sesión, respondi.vercel.app/r/…: pasos,
  huecos, reserva, confirmación, gestionar y cancelar con la llave), y el
  reloj de la base de datos trató un aviso pendiente en 26 s. Sin restos y
  saldo en 7.

## Pendiente

- Google Calendar (necesita un proyecto de Google creado por Jorge).
