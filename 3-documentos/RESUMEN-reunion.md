# RESPONDI · Prototipo del frontend
## Documento para la reunión de equipo

---

## ¿Qué es esto?

Es el **prototipo visual** de la app Respondi. Son 12 pantallas en HTML que muestran cómo se verá y se navegará la aplicación. No tiene base de datos detrás, no guarda nada, no envía correos — es solo la maqueta para validar el diseño, los flujos y las decisiones de producto antes de pasar a construir la app real con Google Antigravity, Supabase, GitHub y Vercel.

**Todas las pantallas:**
- Funcionan en móvil y ordenador (responsive).
- Están en modo claro forzado (fondo blanco siempre, ignora el modo oscuro del móvil).
- Siguen la identidad de marca: morado y blanco, tipografías Sora + Inter.
- Tienen interacciones que funcionan: cambios de pestaña, abrir/cerrar popups, filtros, interruptores, plegar/desplegar bloques. Los botones que "hablan con servidor" (guardar, enviar correo, descargar) están en su sitio pero todavía no actúan — eso será fase de Antigravity.

---

## Zona de entrada — antes de iniciar sesión

**1. `login.html`** — Pantalla única de inicio de sesión para los 4 roles (admin, agente, operario, super-admin). El sistema redirige según el rol. Incluye botón de Google y enlace a recuperar contraseña.

**2. `registro-trial.html`** — Solo para el plan trial (los planes de pago los activa Atsura). El usuario crea su cuenta para probar 14 días. Incluye el aceptar del riesgo de Whaticket destacado en color ámbar.

**3. `aceptar-invitacion.html`** — Para empleados (agentes y operarios) que el admin crea desde dentro de la app. Reciben un correo, llegan aquí, ven su correo bloqueado y activan su cuenta.

**4. `recuperar-contrasena.html`** — Pedir correo y mostrar confirmación de envío. Dos vistas con transición funcional.

**5. `onboarding-wizard.html`** — El asistente paso a paso de 6 pasos que rellena el admin la primera vez que entra, tras registrarse para el trial. Recoge datos fiscales, comerciales, textos operativos y todo lo necesario para que la IA empiece a funcionar.

---

## Pantallas internas del admin (panel principal)

Todas tienen el mismo esqueleto: sidebar morado oscuro a la izquierda con 14 secciones, cabecera blanca con selector de sucursal y notificaciones.

**6. `dashboard.html`** — Página de inicio del admin. Los 7 KPIs que define el anteproyecto (sección 4.8), gráfico de evolución de conversaciones, banner del trial recordando los días que quedan, selector hoy/semana/mes.

**7. `casos.html`** — Bandeja de casos que necesitan atención de una persona. Lista con filtros por estado (pendiente, atendiendo, resuelto, cerrado), colores de SLA (verde a tiempo, ámbar próximo a vencer, rojo vencido). Cada caso tiene un botón "Chat" para abrir su detalle.

**8. `caso-detalle.html`** — Detalle de un caso concreto. Dos columnas en ordenador, una arriba de otra en móvil. A la izquierda la conversación completa (mensajes del cliente en gris, de la IA en morado, del agente en verde). A la derecha los datos del caso, agente asignado con botón para reasignar, selector de estatus, y notas de avance (inmutables, como dice el anteproyecto).

**9. `perfil-comercio.html`** — Datos del comercio en 5 pestañas: Datos fiscales, Datos comerciales (con Políticas y Condiciones como listas editables fila por fila), Textos operativos, Lista de precios (resumen + acceso a su sección), Novedades (resumen + acceso).

**10. `precios.html`** — Productos y servicios del comercio. En ordenador es tabla, en móvil son tarjetas. Cada ítem tiene su tipo (producto/servicio), su tipo de precio (exacto, desde, o a consultar) y su disponibilidad. Tiene popup para crear/editar ítems y otro popup para importar desde Excel (con tres vistas: inicio, error con detalle fila por fila, éxito).

**11. `skills.html`** — Esta cambió mucho en la conversación. Es un **cuestionario guiado**, no un editor técnico. Bloques plegables con preguntas concretas sobre el negocio (cómo informa precios, qué ofrece ante reclamos, tono y estilo, etc.). El admin nunca ve la palabra "skill" ni descripciones técnicas — solo contesta preguntas con opciones y respuestas por defecto razonables. La app convierte sus respuestas en instrucciones para la IA.

**12. `reglas.html`** — Las situaciones en las que la IA crea un caso para que un humano intervenga. Llega con 5 reglas plantilla activas (cliente con reclamo, quiere humano, pedido grande, tema sensible, cliente molesto) que el admin puede editar, desactivar, borrar o ampliar con reglas propias. Tiene popup para crear/editar.

---

## Decisiones de producto importantes (registradas en `CAMBIOS-anteproyecto.md`)

Durante la maquetación tomamos varias decisiones que se apartan del anteproyecto original. Todas están documentadas en `CAMBIOS-anteproyecto.md` para que cuando se construya la app real, la base de datos y la lógica se ajusten a esto. Resumen:

1. **Acceso a la app:** solo el trial es autoservicio público. Los planes de pago los activa Atsura. Operarios y agentes los crea el admin desde dentro.

2. **Sección Conversaciones** añadida al sidebar (para histórico de chats, separada de Casos).

3. **Perfil del comercio:** se eliminó el campo "Servicios" como texto libre (ya está en Lista de precios). Políticas y Condiciones pasan a ser filas en una sola tabla `business_rules` con un campo `tipo` para distinguir cuál es cuál.

4. **Lista de precios:** se añaden dos campos a la tabla `price_list`:
   - `tipo` (producto / servicio) para diferenciar.
   - `precio_tipo` (exacto / desde / consultar) para precios variables.

5. **Importación Excel** definida con precisión: 7 columnas exactas, validación todo-o-nada, panel de errores fila por fila.

6. **Skills de IA:** rediseñadas como cuestionario guiado en lugar de descripciones técnicas. La tabla `skills` se amplía con `respuestas` (JSONB) y `descripcion_generada` (texto). Las 8 skills del anteproyecto se precargan al crear el comercio con respuestas por defecto.

7. **Modo oscuro:** Respondi no tiene modo oscuro. Solo modo claro forzado.

8. **Reglas de casos:** la tabla `case_rules` cambia `palabras_clave` por `descripcion_intencion` (la IA moderna interpreta intenciones, no necesita palabras exactas). Se añade `es_plantilla` (bool). 5 plantillas precargadas al crear el comercio.

---

## ¿Qué falta?

Pantallas internas del admin todavía sin maquetar:
- Conversaciones (histórico de chats)
- Novedades del día (las carga el operario; el admin también las ve)
- Blacklist (clientes bloqueados)
- Categorías (etiquetas para clasificar conversaciones)
- Canales (Instagram, WhatsApp, Facebook)
- Usuarios (gestión de operarios y agentes)
- Audit log (registro de cambios)

Después del admin, faltan los otros roles:
- **Agente** — bandeja de casos asignados, detalle para responder.
- **Operario** — pantalla para cargar novedades del día.
- **Super-admin (Atsura)** — dashboard global, gestión de tenants, planes, vendedores.

Y por último, preparar el mensaje detallado para **Google Antigravity** con el schema final de base de datos (anteproyecto + cambios documentados), la conexión con Supabase para autenticación, y la sustitución de los datos de ejemplo por datos reales.

---

## Cómo abrir las pantallas

Cada archivo `.html` se abre con doble clic — se ve en cualquier navegador (Chrome, Safari, Firefox, Edge). Funcionan tanto en móvil como en ordenador. No necesitan internet salvo para cargar las fuentes y los iconos.

Recomiendo abrir el orden lógico de un usuario nuevo:
1. `login.html` → 2. `registro-trial.html` → 3. `onboarding-wizard.html` → 4. `dashboard.html` → y desde ahí, navegar por las secciones que quieran ver.
