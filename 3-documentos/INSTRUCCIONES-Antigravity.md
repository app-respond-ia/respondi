# Respondi · Instrucciones para construir la app con Google Antigravity

> Documento de arranque. Pégalo en Antigravity como contexto inicial del
> proyecto. Léelo entero antes de empezar. Construiremos por fases: NO intentes
> hacer todo de una vez. Termina y valida cada fase antes de pasar a la siguiente.

---

## 1. Qué es Respondi (contexto)

Respondi es un SaaS que automatiza la atención al cliente de comercios en
Instagram, WhatsApp y Facebook usando IA. Cada comercio conecta sus canales, la
IA responde a sus clientes según la configuración del negocio (precios,
horarios, novedades, reglas), y cuando algo necesita un humano, se abre un
"caso" que atiende un agente.

Es **multi-tenant**: muchos comercios distintos usan la misma app, y cada uno
solo ve sus propios datos.

### Los 4 roles
- **Super-admin (Atsura)**: dueña del SaaS. Ve todos los comercios, gestiona
  planes, vendedores y errores del sistema.
- **Admin**: dueño de un comercio. Configura su negocio, ve métricas, gestiona
  usuarios y casos de su comercio.
- **Agente**: atiende los casos que le asignan. Responde a clientes.
- **Operario**: solo carga las "novedades del día" (stock, horarios, promos).

### La jerarquía de datos
Comercio (tenant) → Sucursal → Canal → Conversación → Mensaje

---

## 2. Stack técnico (obligatorio)

- **Frontend**: Next.js (App Router) + React + Tailwind CSS.
- **Backend / base de datos**: Supabase (PostgreSQL + Auth + RLS + Edge Functions).
- **Automatización de IA y canales**: n8n (ya existe, se integra por webhooks).
- **Modelo de IA**: OpenAI (GPT-4o y GPT-4o mini según el plan).
- **Hosting**: Vercel.
- **Control de versiones**: GitHub.

---

## 3. Qué archivos te entrego

1. **`respondi-schema.sql`** — el esquema COMPLETO de la base de datos para
   Supabase: tablas, tipos, índices y políticas de seguridad (RLS). Es la
   fuente de verdad del backend. Ejecútalo tal cual en Supabase.

2. **30 archivos HTML** — el prototipo visual de TODAS las pantallas, ya
   diseñadas con la identidad de marca (morado y blanco, tipografías Sora +
   Inter). Son la **guía de diseño orientativa**: muestran qué pantallas hay,
   qué contiene cada una y cómo se ven. NO son la app final; son la referencia.

3. **`respondi-diagrama.html` / `.mermaid`** — diagrama visual de las tablas y
   sus relaciones, para entender el modelo de datos de un vistazo.

### Lista de pantallas (HTML) por rol

**Entrada (sin login):**
- `login.html` · `registro-trial.html` · `aceptar-invitacion.html`
- `recuperar-contrasena.html` · `onboarding-wizard.html`

**Admin (dueño del comercio):**
- `dashboard.html` · `metricas.html` · `casos.html` · `caso-detalle.html`
- `conversaciones.html` · `conversacion-detalle.html` · `chats.html`
- `novedades.html` · `blacklist.html` · `perfil-comercio.html`
- `skills.html` · `precios.html` · `reglas.html` · `etiquetas.html`
- `canales.html` · `usuarios.html` · `audit-log.html`

**Agente:**
- `agente-casos.html` · `agente-caso-detalle.html`

**Operario:**
- `operario-novedades.html`

**Super-admin (Atsura):**
- `superadmin-dashboard.html` · `superadmin-comercios.html`
- `superadmin-planes.html` · `superadmin-vendedores.html`
- `superadmin-errores.html`

---

## 4. Principio de diseño

La maqueta visual es **orientativa**: respeta la identidad (colores morados,
tipografías, estilo de tarjetas y popups) y la estructura de cada pantalla,
pero **prioriza que la app funcione bien** sobre clonar el pixel exacto. Si algo
del diseño choca con una buena práctica de Next.js o con el funcionamiento real,
prioriza el funcionamiento. Reutiliza componentes (sidebar, cabecera, tarjetas)
en vez de repetir código.

Importante: en el prototipo, Tailwind se carga por CDN (sale un aviso en
consola). En la app real, instala Tailwind correctamente como parte del proyecto
Next.js. Eso quita el aviso.

---

## 5. Plan por fases

### FASE 0 · Preparar el proyecto
1. Crea un proyecto Next.js con App Router, Tailwind y TypeScript.
2. Crea un proyecto en Supabase. Conéctalo (variables de entorno:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Ejecuta `respondi-schema.sql` en el SQL Editor de Supabase. Verifica que se
   crearon las 25 tablas y que RLS quedó activo.
4. Conecta el repositorio a GitHub y configura el despliegue en Vercel.
5. Instala el cliente de Supabase para Next.js (`@supabase/supabase-js` y
   `@supabase/ssr`).

**Validación**: la app arranca, conecta con Supabase y las tablas existen.

### FASE 1 · Login y roles
1. Implementa autenticación con Supabase Auth (email + contraseña; opcional
   Google). Usa las pantallas `login.html`, `recuperar-contrasena.html` como
   guía visual.
2. Al registrarse o iniciar sesión, busca la fila del usuario en la tabla
   `users` (enlazada a `auth.users` por el `id`) para saber su `rol` y su
   `tenant_id`.
3. Redirige según el rol:
   - `super_admin` → panel de Atsura (`/superadmin`)
   - `admin` → panel del comercio (`/app`)
   - `agente` → bandeja del agente (`/agente`)
   - `operario` → novedades (`/operario`)
4. Protege las rutas: cada rol solo accede a lo suyo. Un agente no puede entrar
   a la configuración del admin, etc.
5. Implementa el registro de trial (`registro-trial.html`): crea el comercio,
   la primera sucursal, el usuario admin, y un trial de 14 días.
6. Implementa el flujo de invitación (`aceptar-invitacion.html`): un admin
   invita por correo, el invitado acepta y se crea su usuario con su rol.

**Validación**: puedes registrarte, iniciar sesión con cada rol y acabar en el
panel correcto, sin poder colarte en paneles de otros roles.

### FASE 2 · Panel del admin con datos reales
Construye las pantallas del admin conectadas a Supabase, en este orden:
1. **Estructura base**: el layout con sidebar + cabecera (con selector de
   sucursal), reutilizable. La cabecera filtra por sucursal activa.
2. **Configuración** (lo que alimenta a la IA): perfil del comercio, horarios,
   skills, precios, reglas, etiquetas, canales. Son CRUD sobre sus tablas.
3. **Operación**: conversaciones (histórico), casos, chats (responder en vivo),
   novedades, blacklist.
4. **Usuarios**: invitar, listar, editar, desactivar (respetando el límite del
   plan).
5. **Métricas** y **dashboard**: leen y agregan datos reales.
6. **Audit log**: lee la tabla `audit_log`.

Recuerda: todo filtrado por `tenant_id` automáticamente gracias a RLS. El
selector de sucursal de la cabecera filtra además por `branch_id`.

**Validación**: un admin puede configurar su comercio de punta a punta y ver
sus conversaciones, casos y métricas reales.

### FASE 3 · Los otros roles
1. **Agente** (`/agente`): bandeja de "mis casos" (solo los asignados a él),
   detalle de caso (cambiar estatus, notas, responder), y la pantalla de chats.
   El agente también puede cargar novedades.
2. **Operario** (`/operario`): solo la pantalla de novedades (ver y cargar).
3. **Super-admin** (`/superadmin`): dashboard global, comercios (activar/
   suspender planes, registrar pagos), planes (CRUD), vendedores (CRUD),
   errores del sistema (lee `error_logs`).

**Validación**: cada rol entra a su panel y hace su trabajo, con los permisos
correctos (el agente solo ve sus casos; el operario solo novedades; etc.).

### FASE 4 · IA y canales (lo más complejo, al final)
Esta fase conecta Respondi con n8n y los canales reales. Aquí la app deja de ser
solo pantallas y empieza a responder de verdad.
1. **Webhooks de entrada**: cuando llega un mensaje de un cliente por Instagram/
   WhatsApp/Facebook (vía Whaticket o Meta oficial según el canal), n8n lo
   recibe y lo guarda en `messages`, creando `contact` y `conversation` si no
   existen.
2. **El cerebro de la IA**: n8n arma el contexto (perfil del comercio, precios,
   horarios, novedades vigentes, skills) y llama a OpenAI. La respuesta se
   guarda como `message` con `remitente='ia'` y se envía al canal del cliente.
3. **Apertura de casos**: si se cumple una regla (`case_rules`) o la IA detecta
   que necesita un humano, se crea un `case` y la IA avisa al cliente.
4. **Responder desde la app** (pantalla Chats): cuando un humano escribe, se
   pausa la IA en esa conversación (`conversations.ia_pausada = true`) y el
   mensaje se envía al canal por la API correspondiente.
5. **Créditos**: cada respuesta de la IA descuenta un crédito (`message_quotas`).
   Si se agotan, la IA deja de responder y avisa.
6. **Cron**: cerrar conversaciones inactivas (>24h) y generarles un resumen
   (`conversations.resumen`); archivar novedades vencidas; abrir/cerrar votaciones
   si aplica.

**Validación**: un cliente escribe por un canal, la IA responde con info real
del comercio, y si hace falta, se abre un caso que un agente atiende.

---

## 6. Cosas importantes que NO se deben perder

Estas decisiones ya están reflejadas en el SQL. Respétalas:

- **Aislamiento por comercio (RLS)**: cada comercio solo ve sus datos. El
  super-admin tiene acceso total. Ya está en las políticas del SQL.
- **El agente solo ve SUS casos**, no los de otros agentes.
- **Las notas de casos son inmutables**: no se pueden editar ni borrar.
- **Etiquetas = categorías/tags**: la tabla se llama `message_categories`. Son
  lo mismo, no dos conceptos. La IA las asigna a las conversaciones.
- **Canales**: en trial, todos los canales van por Whaticket. En planes pagos,
  el admin elige por canal entre Whaticket (barato, con riesgo) o Meta oficial
  (sin riesgo). Está en la tabla `channels` (campo `metodo`).
- **Pausar IA**: cuando un humano atiende un chat, la IA se pausa en esa
  conversación para no responder a la vez (`conversations.ia_pausada`).
- **El operario y el agente** pueden cargar novedades; el admin también.
- **Precios** pueden ser exactos, "desde", o "consultar" (campo `precio_tipo`).
- **Skills**: para el admin se presentan como un cuestionario guiado; no usar la
  palabra técnica "skill" de cara al usuario admin.

---

## 7. Orden recomendado de trabajo

Haz una fase, pruébala de punta a punta, y solo entonces sigue. Si una fase es
grande (como la Fase 2), pártela por pantallas y valida cada una. No acumules
trabajo sin probar. Cuando tengas dudas sobre cómo debe verse o comportarse una
pantalla, mira su archivo HTML correspondiente: ahí está la intención de diseño.
