# Cambios y decisiones respecto al Anteproyecto v2.0 — Respondi

Este documento recoge las decisiones tomadas durante la maquetación del frontend
que se APARTAN o COMPLETAN el anteproyecto. Servirá para preparar el mensaje a
Google Antigravity y para definir el schema final de la base de datos.

## 1. Cuentas y acceso
- App por invitación, EXCEPTO el trial: cualquier negocio puede registrarse solo
  para los 14 días de prueba (registro público de trial).
- Planes de pago: los activa Atsura (super-admin).
- Operario y agente: los crea el admin desde dentro de la app → reciben correo de
  invitación → activan su cuenta (con contraseña o con Google).
- Una sola pantalla de login para los 4 roles; el sistema redirige según rol.

## 2. Sidebar del admin
- Se añadió la sección "Conversaciones" (histórico de conversaciones), que NO
  estaba en el anteproyecto. Requiere una pantalla para consultar el histórico
  por cliente. La tabla `conversations` ya existe en el anteproyecto.

## 3. Perfil del comercio
- El campo "Servicios" como texto se ELIMINA. Lo que el comercio vende vive en
  la tabla `price_list` (sección Lista de precios). No se duplica en el perfil.
- Políticas y Condiciones dejan de ser campos de texto en `business_profiles`.
  Pasan a UNA SOLA TABLA compartida, una fila por elemento:
    · business_rules → id · branch_id · tipo (politica | condicion) ·
                        descripcion · activo
  El campo `tipo` distingue política de condición (misma estructura, una tabla).
  En la pantalla del perfil se muestran en dos listas separadas, pero se
  almacenan en la misma tabla.
  (Esto cambia la tabla `business_profiles`: se le quitan los campos
   `politicas` y `condiciones`.)

## 4. Lista de precios
- Se añade el campo `tipo` a la tabla `price_list`: valores "producto" | "servicio".
  Permite diferenciar productos de servicios.
- Se añade el campo `precio_tipo` a la tabla `price_list`: valores
  "exacto" | "desde" | "consultar".
  Define cómo se interpreta el precio:
    · exacto    → precio fijo, se muestra tal cual ($25,00).
    · desde     → precio variable, se muestra como "Desde $40,00".
    · consultar → no hay precio fijo, se muestra "A consultar" (campo `precio`
                  puede ir NULL en la BD).
  La IA usa este campo para saber cómo hablar del precio al cliente.

## Pendiente de revisar más adelante
- (Se irá completando a medida que avancen las pantallas del admin.)

## 9. Etiquetas (= categorías/tags del anteproyecto)
El anteproyecto (sección 4.5) titula esta sección "Tabla de categorías/tags",
usando las dos palabras como sinónimos. La tabla en BD se llama
`message_categories`. Sirven para que la IA etiquete los mensajes y poder
sacar métricas por temática.

En el frontend se decidió llamar a esta pantalla "Etiquetas" en singular para
evitar confusión con la palabra "categoría" (que se prestaba a interpretarse
como otra cosa). En la base de datos el nombre técnico es `message_categories`
como dice el anteproyecto. Solo cambia el nombre visible en la app.

### Mejoras añadidas sobre lo que dice el anteproyecto:
- **Descripción de intención** (`descripcion_intencion`): un campo nuevo en
  `message_categories` para que la IA sepa cuándo aplicar cada etiqueta.
- **Color** (`color`): paleta de 10 colores para distinguirlas visualmente.
- **Plantillas precargadas**: al crear un comercio se cargan 8 etiquetas
  sugeridas (`es_plantilla=true`), que el admin puede editar, desactivar o
  borrar las que él añada.
- **Tabla de unión** `conversation_tags` (relación N:M entre conversaciones y
  etiquetas).

### Esquema final de `message_categories`:
  id · branch_id · nombre · descripcion_intencion · color · activa
   · es_plantilla · orden · contador_uso (computado)

### Las 8 etiquetas precargadas al crear el comercio:

  1. Reclamo              · ámbar
     "El cliente reclama, se queja, reporta un problema o expresa insatisfacción."
  2. Consulta de precio   · morado
     "El cliente pregunta por el precio, costo o forma de pago de algo."
  3. Disponibilidad       · azul
     "El cliente pregunta si hay stock, disponibilidad o fechas."
  4. Pedido               · verde
     "El cliente quiere realizar una compra o confirmar un pedido."
  5. Reserva              · rosa
     "El cliente quiere reservar mesa, cita, plaza o agendar un turno."
  6. Información general  · gris
     "El cliente pide información sobre el negocio, ubicación u horarios."
  7. Devolución           · rojo
     "El cliente pide devolver un producto o solicitar un reembolso."
  8. Otros                · pizarra
     "Conversaciones que no encajan en ninguna otra etiqueta."

### Sidebar del admin · 14 secciones (como en el anteproyecto)
Se añadió "Etiquetas" al grupo Configuración. No hay "Motivos de caso"
ni "Categorías" como secciones separadas.

### Reglas de casos · sin cambios sobre el anteproyecto
El campo `tipo_caso` de la tabla `case_rules` se queda como texto libre, tal
como dice el documento. No se introduce una tabla aparte para gestionar esos
tipos.

## 10. Blacklist · añadir a mano + selector de modo activo
La pantalla cubre la sección 4.7 del anteproyecto sin cambios estructurales,
con dos pequeñas mejoras de usabilidad:

### Mejora 1 · Bloqueo manual por el admin
El anteproyecto solo contempla el flujo "IA sugiere → caso → admin decide".
Se añade un botón "Bloquear contacto" en la pantalla para que el admin pueda
añadir un contacto a la blacklist sin esperar a que pase nada.
El popup pide: canal, identificador, nombre opcional y razón del bloqueo.

### Mejora 2 · Modo activo como configuración visible arriba
Los tres modos de acción (ignorar | respuesta_automatica | derivar) se
muestran como tres tarjetas seleccionables al inicio. Cuando se elige
"respuesta automática", aparece un campo de texto para el mensaje a enviar.

### Tablas implicadas
- `contacts`: blacklist (bool) · blacklist_razon · fecha_blacklist
- Nuevo en `sucursales`: blacklist_modo · blacklist_respuesta_auto

## 11. Canales · Whaticket universal en trial + elección por canal en planes pagos

Cambio importante respecto al anteproyecto. El documento original (secciones
2.1 y 2.4) establece:
- Trial: Instagram por Meta oficial, WhatsApp por Whaticket.
- Planes pagos: Instagram + Facebook por Meta, WhatsApp por 360dialog (con
  Whaticket opcional firmando disclaimer).

Tras revisión con el equipo fundador, se decide modificar el modelo:

### Nuevo modelo:
- **Trial:** TODOS los canales (Instagram, WhatsApp, Facebook) se conectan
  vía Whaticket. Esto simplifica el flujo de prueba y elimina la necesidad
  de que el cliente haga OAuth con Meta para probar el producto.
- **Planes pagos:** el admin elige por cada canal:
  - Meta oficial (Instagram/Facebook por Graph API, WhatsApp por 360dialog).
    Sin riesgo, pero con costo adicional en WhatsApp (~$7/mes a 360dialog).
  - Whaticket (escaneo QR). Más barato, pero con riesgo de baneo por Meta.

### Implicaciones:
1. **Aceptación de riesgo de Whaticket** se aplica a las tres redes durante
   el trial, no solo WhatsApp. El checkbox de `registro-trial.html` cubre
   ya esto, pero el texto debe revisarse para mencionar las tres redes.

2. **Costo de Whaticket para Atsura** aumenta en el trial (tres conexiones
   por comercio en lugar de una). Es decisión de negocio del equipo
   fundador asumirlo a cambio de simplificar el onboarding.

3. **Onboarding paso 4** (sección 4.1) pasa de *"Conectar al menos 1 canal
   — Instagram v1"* a *"Conectar al menos 1 canal vía Whaticket"* durante
   el trial.

4. **Riesgo legal**: las cuentas oficiales de los comercios pueden ser
   baneadas por Meta también en Instagram y Facebook si la detección de
   sesión no oficial salta. Mayor superficie de riesgo legal para Atsura.
   La cláusula del contrato debe reflejar esto.

### Tabla `channels` (nueva):
  id · branch_id · tipo (instagram | whatsapp | facebook) ·
  metodo (whaticket | meta_oficial) · estado (activo | pendiente |
  desconectado | error) · identificador_externo · fecha_conexion ·
  ultima_actividad

### Estados visibles en la pantalla:
- **Conectado** — verde, "Conectado desde DD/MM/YYYY"
- **Pendiente** — ámbar, requiere acción (escanear QR, autorizar)
- **Error** — rojo, sesión caída, requiere reconexión
- **No conectado** — gris, botón para iniciar conexión
La pantalla cubre la sección 4.7 del anteproyecto sin cambios estructurales,
con dos pequeñas mejoras de usabilidad:

### Mejora 1 · Bloqueo manual por el admin
El anteproyecto solo contempla el flujo "IA sugiere → caso → admin decide".
Se añade un botón "Bloquear contacto" en la pantalla para que el admin pueda
añadir un contacto a la blacklist sin esperar a que pase nada. Útil cuando
el admin ya sabe de antemano que un contacto es problemático (ej. recibió un
correo previo o lo vio en otra red).

El popup pide: canal (instagram | whatsapp | facebook), identificador del
canal (handle, número), nombre opcional y razón del bloqueo.

### Mejora 2 · Modo activo como configuración visible arriba
Los tres modos de acción (ignorar | respuesta_automatica | derivar) se
muestran como tres tarjetas seleccionables al inicio de la pantalla. Cuando se
elige "respuesta automática", aparece debajo un campo de texto para escribir
el mensaje que se enviará. Sin esta visibilidad, el admin no sabría dónde
está el ajuste.

### Tablas implicadas (sin cambios sobre el anteproyecto)
- `contacts` ya tiene los campos del anteproyecto:
    blacklist (bool) · blacklist_razon · fecha_blacklist
- Nuevo campo en `sucursales` (o `business_profiles`):
    blacklist_modo (ignorar | respuesta_automatica | derivar)
    blacklist_respuesta_auto (texto, solo si modo = respuesta_automatica)

## 8. Reglas de casos · plantillas + creación libre + descripción de intención
- Las reglas funcionan como en el anteproyecto (sección 4.4), pero con dos
  cambios sobre el documento original:

### Cambio 1 · No "palabras clave", sí "descripción de intención"
- La tabla `case_rules` reemplaza el campo `palabras_clave` por
  `descripcion_intencion` (texto). La IA moderna interpreta intenciones a
  partir de una descripción natural, no necesita palabras exactas. Ejemplo:
  "Cuando el cliente reclame, se queje, esté molesto o pida hablar con un
  humano."
- Esto mejora la detección y simplifica la UI (un solo campo de texto en lugar
  de una lista de palabras).

### Cambio 2 · Set de reglas precargadas al crear el comercio
- Al crear un comercio, se precargan 5 reglas plantilla con `activa=true`.
  El admin puede activarlas, editarlas, desactivarlas, borrarlas, o crear
  nuevas reglas libres.

  1. **Cliente con reclamo**
     - descripcion_intencion: "El cliente reclama, se queja, expresa
       insatisfacción con un producto o servicio, o reporta un problema."
     - tipo_caso: "reclamo"
  2. **Cliente quiere hablar con un humano**
     - descripcion_intencion: "El cliente pide explícitamente hablar con una
       persona, con un encargado, o dice que no quiere seguir hablando con un bot."
     - tipo_caso: "derivacion_solicitada"
  3. **Pedido grande o al por mayor**
     - descripcion_intencion: "El cliente consulta por pedidos grandes, al por
       mayor, para eventos, o solicita presupuesto personalizado."
     - tipo_caso: "venta_consultiva"
  4. **Tema sensible o fuera de competencia**
     - descripcion_intencion: "El cliente pregunta sobre temas legales,
       médicos, fiscales, denuncias, o cualquier asunto delicado fuera de lo
       que el negocio puede responder."
     - tipo_caso: "tema_sensible"
  5. **Cliente molesto o agresivo**
     - descripcion_intencion: "El tono del cliente es claramente molesto,
       agresivo, ofensivo, o muestra señales de mucha frustración."
     - tipo_caso: "atencion_urgente"

### Esquema final de la tabla `case_rules`:
  id · branch_id · nombre · descripcion_intencion · tipo_caso · activa · es_plantilla
- `es_plantilla` (bool): true para las 5 precargadas, false para las que cree
  el admin. Útil para no permitir borrar las plantillas (solo desactivarlas) o
  para diferenciarlas visualmente.

## 6. Skills de IA · cuestionario guiado (NO descripciones libres)
- Las skills NO se muestran como descripciones técnicas. El admin NUNCA ve la
  palabra "skill" como descripción libre. En su lugar, contesta un CUESTIONARIO
  GUIADO con preguntas concretas sobre su negocio. La app convierte las
  respuestas en las descripciones que se inyectan al prompt de la IA.

- La pantalla muestra una LISTA DE BLOQUES (uno por skill que tiene preguntas).
  El admin puede contestar a su ritmo, saltar a la skill que quiera, modificar
  solo una.

- Las 8 skills siguen existiendo en la tabla `skills` (con nombre y orden fijos),
  pero 2 de ellas NO aparecen en el cuestionario porque no admiten preguntas
  útiles (la IA se ocupa sola). Su descripción base se queda por defecto.

### Skills SIN cuestionario (descripción base por defecto):
- #1 Idioma y saludo inicial → la IA detecta el idioma solo. El saludo lo cubre
  el "primer mensaje" del Tab 3 del perfil del comercio. No duplicar.

### Skills CON cuestionario (preguntas y opciones):

**#2 Manejo de preguntas de precio**
- Si el cliente pregunta por un producto NO cargado en la lista:
  · Decir que consulte con un agente humano [POR DEFECTO]
  · Decir que puedes informar por otro canal (teléfono, presencial)
  · Pedir más detalles para derivar
- ¿Mencionas descuentos/promociones activas?
  · Sí, siempre
  · No
  · Solo si el cliente pregunta [POR DEFECTO]

**#3 Manejo de reclamos**
- ¿Qué sueles ofrecer ante un reclamo? (multi-selección)
  · Reemplazo del producto
  · Devolución del dinero
  · Descuento en próxima compra [POR DEFECTO marcado]
  · Disculpa con explicación [POR DEFECTO marcado]
  · Otro (texto libre)
- ¿Cuándo escalas a humano?
  · Siempre, todos los reclamos
  · Solo si el cliente lo pide [POR DEFECTO]
  · Si el problema supera un monto → si elige esto, pedir monto numérico
  · Si el cliente está visiblemente molesto

**#4 Disponibilidad y stock**
- Cuando un producto no está disponible:
  · Avisa y ofrece alternativas similares [POR DEFECTO]
  · Avisa y pregunta si quiere ser notificado al reponer
  · Solo avisa que no hay stock
- ¿Hay productos por encargo?
  · Solo stock [POR DEFECTO]
  · También por encargo

**#5 Cierre de conversación**
- ¿La IA invita a una próxima compra al despedirse?
  · Sí [POR DEFECTO]
  · No
- ¿Recordar algún canal extra al final?
  · Sí, redes sociales del negocio
  · Sí, web del negocio
  · No, ningún recordatorio [POR DEFECTO]

**#6 Derivación a humano** (la lógica de cuándo derivar vive en Reglas de casos.
Aquí solo el aviso al cliente.)
- ¿Cómo anuncia la IA que un humano tomará el caso?
  · Formal: "Un agente se pondrá en contacto" [POR DEFECTO]
  · Cercano: "Te paso con uno de nuestros compañeros"
  · Personalizado (textarea libre)

**#7 Tono y estilo**
- Tono del negocio:
  · Formal
  · Cercano [POR DEFECTO]
  · Muy cercano (coloquial)
- Tratamiento:
  · Tutea
  · Usted
  · Depende del idioma del cliente [POR DEFECTO]
- Emojis:
  · No
  · Con moderación [POR DEFECTO]
  · Abundantemente
- Respuestas:
  · Cortas y directas [POR DEFECTO]
  · Con detalle

**#8 Mensajes fuera de contexto**
- Si el cliente pregunta algo no relacionado con el negocio:
  · Responde brevemente y vuelve al tema [POR DEFECTO]
  · Ignora y solo responde sobre el negocio
  · Responde con humor pero educadamente
- ¿Cuántas veces tolerar antes de derivar a agente?
  · 1
  · 2 [POR DEFECTO]
  · 3
  · Nunca derivar

### Implicación para la base de datos:
La tabla `skills` se amplía. Para cada skill con cuestionario, además de la
descripción, se guarda el JSON de respuestas del admin:

  skills → id · branch_id · nombre · orden · activo
          · respuestas (JSONB) · descripcion_generada

- `respuestas` (JSONB): las elecciones del admin. Ej. para skill #3:
   {"ofrecer": ["descuento", "disculpa"], "escalar": "monto", "monto": 100}
- `descripcion_generada` (texto): la descripción que se inyecta al prompt,
   construida automáticamente desde `respuestas`. Se regenera cada vez que el
   admin guarda el cuestionario de esa skill.
- Al crear el comercio se precargan las 8 skills con las RESPUESTAS POR DEFECTO
  arriba indicadas, y se calcula la `descripcion_generada` inicial.

Los campos `nombre` y `orden` siguen siendo fijos por sistema (no editables).
El admin solo modifica `respuestas` y `activo`.

## 7. Modo oscuro
- Respondi NO tiene modo oscuro.
- Todas las pantallas fuerzan color-scheme: light para que el sistema operativo
  del usuario no aplique modo oscuro automático.

## 5. Importación de Lista de precios por Excel
Solo aplica a la lista de precios (productos y servicios). Funcionamiento:
descargar plantilla → rellenar → subir → validar.

### Plantilla Excel — columnas EXACTAS (en este orden):
1. nombre         · texto · obligatorio
2. tipo           · lista desplegable: "producto" | "servicio" · obligatorio
3. tipo_precio    · lista desplegable: "exacto" | "desde" | "consultar" · obligatorio
4. precio         · número · obligatorio SALVO si tipo_precio = "consultar"
                    (en ese caso debe ir VACÍO)
5. moneda         · lista desplegable: "USD" | "EUR" | "VES" · obligatorio
                    SALVO si tipo_precio = "consultar" (va vacío)
6. descripcion    · texto · opcional
7. disponible     · lista desplegable: "sí" | "no" · obligatorio

- Las columnas de opciones (tipo, tipo_precio, moneda, disponible) deben ser
  LISTAS DESPLEGABLES dentro del propio Excel (validación de datos), para que el
  comercio no escriba valores inválidos. Antigravity genera el .xlsx con estas
  validaciones.

### Reglas de validación al subir:
- Comportamiento TODO O NADA: si hay aunque sea un error, NO se importa ninguna
  fila. Se muestra un panel con TODOS los errores, fila por fila.
- Cada error indica nº de fila y el problema concreto.
  Ej.: "Fila 5: la moneda 'dólares' no es válida (usa USD, EUR o VES)".
  Ej.: "Fila 8: falta el nombre".
  Ej.: "Fila 12: tipo_precio es 'consultar' pero hay un precio escrito; debe ir vacío".
- Solo cuando el archivo está 100% correcto se importan todas las filas a `price_list`.

## 12. Chats · bandeja de mensajería en vivo (humano responde desde la app)

El anteproyecto especifica la CAPACIDAD de que un humano responda desde la app
(sección 3: "responder desde la app"; sección 4.6: "El agente ve la
conversación completa y puede responder desde la app. Respondi envía el mensaje
vía la API del canal"; Flujo A paso 12). Pero NO describe una pantalla
dedicada — lo plantea como una acción dentro del detalle del caso.

Decisión del equipo: materializar esa capacidad como una PANTALLA PROPIA
llamada "Chats", estilo bandeja de mensajería (lista + chat activo), porque da
mejor experiencia para conversar en vivo que hacerlo dentro del detalle.

### Estructura:
- **Desktop:** dos paneles. Izquierda = lista de conversaciones filtrable
  (buscar, estado activa/cerrada, canal IG/WA/FB, etiquetas). Derecha = chat
  de la conversación seleccionada con barra de escritura abajo.
- **Móvil:** lista a pantalla completa; al pulsar una conversación se desliza
  al chat a pantalla completa con botón de volver.

### Diferencia con otras pantallas (para evitar duplicación conceptual):
- `casos` / `caso-detalle`: GESTIÓN de casos (estatus, notas, reasignar).
- `conversaciones` / `conversacion-detalle`: CONSULTA del histórico (resumen,
  datos del contacto).
- `chats`: CONVERSAR EN VIVO. Aquí el humano escribe y se envía al canal.

### Quién puede responder:
Agente Y admin. (El anteproyecto solo menciona al agente, pero el equipo
decide permitir también al admin.)

### Pausar IA:
Interruptor "IA en pausa" en la cabecera del chat. Cuando un humano está
atendiendo, la IA deja de responder automáticamente en esa conversación para
no solaparse. Conecta con el campo `modo_pausa` o un flag por conversación
(`conversations.ia_pausada`, campo nuevo a añadir).

### Botones de acceso (pendiente de aplicar en otras pantallas):
Añadir un botón "Abrir en Chats" o "Responder" en:
- `casos.html` (cada caso de la bandeja)
- `caso-detalle.html`
- `conversaciones.html` (cada conversación)
- `conversacion-detalle.html`
Todos llevan a `chats.html` con la conversación correspondiente abierta.

### Campo nuevo en BD:
- `conversations.ia_pausada` (bool): true cuando un humano tomó el control.
- `conversations.atendida_por` (user_id, nullable): quién está atendiendo.

### Sidebar del admin: pasa a 15 secciones.
Se añade "Chats" en el grupo Operación, tras "Conversaciones".
La pantalla cubre la sección 4.7 del anteproyecto sin cambios estructurales,
con dos pequeñas mejoras de usabilidad:

### Mejora 1 · Bloqueo manual por el admin
El anteproyecto solo contempla el flujo "IA sugiere → caso → admin decide".
Se añade un botón "Bloquear contacto" en la pantalla para que el admin pueda
añadir un contacto a la blacklist sin esperar a que pase nada. Útil cuando
el admin ya sabe de antemano que un contacto es problemático (ej. recibió un
correo previo o lo vio en otra red).

El popup pide: canal (instagram | whatsapp | facebook), identificador del
canal (handle, número), nombre opcional y razón del bloqueo.

### Mejora 2 · Modo activo como configuración visible arriba
Los tres modos de acción (ignorar | respuesta_automatica | derivar) se
muestran como tres tarjetas seleccionables al inicio de la pantalla. Cuando se
elige "respuesta automática", aparece debajo un campo de texto para escribir
el mensaje que se enviará. Sin esta visibilidad, el admin no sabría dónde
está el ajuste.

### Tablas implicadas (sin cambios sobre el anteproyecto)
- `contacts` ya tiene los campos del anteproyecto:
    blacklist (bool) · blacklist_razon · fecha_blacklist
- Nuevo campo en `sucursales` (o `business_profiles`):
    blacklist_modo (ignorar | respuesta_automatica | derivar)
    blacklist_respuesta_auto (texto, solo si modo = respuesta_automatica)

## 13. Rol Agente · puede cargar novedades

El anteproyecto (sección 3) limita al agente a: ver casos asignados, cambiar
estatus, registrar notas, responder. Y dice "no puede acceder a configuración".
Las novedades del día las carga el operario (sección 4.2 tab 5).

Decisión del equipo: permitir que el AGENTE también cargue novedades del día,
no solo verlas. En negocios pequeños la misma persona hace de agente y de
operario, así que tiene sentido práctico.

### Menú del agente (sidebar reducido):
- Mis casos (solo los asignados a él)
- Chats
- Novedades del día (ver Y cargar)

NO ve: dashboard, métricas, configuración (skills, precios, reglas, etiquetas,
canales, usuarios, perfil), blacklist, audit log, conversaciones (histórico
completo).

### Permiso en BD:
La política RLS del agente sobre `daily_updates` pasa de solo-lectura a
lectura+escritura para su branch_id. El operario mantiene su permiso igual.

### Reasignar casos:
El agente NO puede reasignar (fiel al anteproyecto: "En v1 solo el admin puede
reasignar"). Su detalle de caso no tiene el botón "Reasignar".
