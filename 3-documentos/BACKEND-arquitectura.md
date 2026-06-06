# Arquitectura Backend - Respondi

Este documento detalla la arquitectura de seguridad, funciones de servidor, edge functions y bases de datos requeridas para el funcionamiento completo de Respondi.

---

## 1. Políticas de Seguridad RLS (Row Level Security)

Actualmente, el archivo `respondi-schema.sql` define las políticas básicas para garantizar el aislamiento *Multi-Tenant*. Sin embargo, muchas de las políticas actuales conceden permisos `ALL` (Insert/Update/Delete) a **cualquier usuario** del comercio, independientemente de su rol. Esto debe ser refinado en la Fase 2.

### Tabla de Políticas por Categoría

| Tabla / Entidad | Política requerida | Estado actual | Acción Pendiente |
| :--- | :--- | :--- | :--- |
| **Comercios** | Lectura: Usuarios del tenant. Escritura: Solo super-admin. | ✅ Hecho | Ninguna. |
| **Sucursales** | Lectura: Todo el tenant. Escritura: **Solo Admin**. | ⚠️ Parcial | Restringir `INSERT/UPDATE/DELETE` a `rol = 'admin'`. Actualmente todos pueden editar. |
| **Users (Empleados)** | Lectura: Todo el tenant. Escritura: **Solo Admin**. | ✅ Hecho | Ninguna (política `users_admin_manage` ya lo cubre). |
| **Configuración** (Skills, Precios, Reglas, Etiquetas, Canales) | Lectura: Todo el tenant. Escritura: **Solo Admin**. | ⚠️ Parcial | Restringir escritura a `rol = 'admin'`. Actualmente todos pueden editar (`skills_tenant`, etc.). |
| **Casos** | Lectura: Admin ve todos; Agente ve los suyos. Escritura: Admin o Agente asignado. | ✅ Hecho | Ninguna (`cases_write` ya lo cubre). |
| **Notas de Casos** | Lectura/Inserción: Todo el tenant. Modificación/Borrado: Bloqueado (inmutables). | ✅ Hecho | Ninguna (`notes_insert` solo permite insert). |
| **Novedades (Daily Updates)** | Lectura: Todo el tenant. Escritura: Admin, Operario, Agente. | ✅ Hecho | Ninguna (`updates_write` ya lo cubre). |
| **Contactos, Conversaciones, Mensajes** | Lectura/Escritura: Admin y Agentes. (El Operario no debería poder borrar conversaciones). | ⚠️ Parcial | Restringir `DELETE` para que agentes/operarios no puedan borrar historial. |
| **Cuotas y Facturación** | Lectura: Solo Admin. Escritura: Bloqueada (solo por triggers/service role). | ⚠️ Parcial | Restringir lectura a `rol = 'admin'`. Actualmente todos pueden leer. Bloquear escritura manual. |
| **Audit Logs y AI Logs** | Lectura: Solo Admin. Escritura: Bloqueada (solo inserción por triggers). | ✅ Hecho | Ninguna (`audit_tenant` está restringido a admin). |
| **Planes y Vendedores** | Lectura: Pública (usuarios autenticados). Escritura: Solo super-admin. | ✅ Hecho | Ninguna. |

---

## 2. Server Actions y Route Handlers (Next.js)

Operan del lado del servidor de Next.js. Las acciones que involucran crear recursos compartidos (como el registro de un comercio) utilizan el **Service Role Key** para saltar el RLS, mientras que el resto utiliza el cliente autenticado estándar.

### Autenticación y Onboarding (Fase 1)
- `login(email, pass)`: Inicia sesión normal. ✅ Hecho.
- `loginWithGoogle()`: Redirige al flujo OAuth. ✅ Hecho.
- `signupTrial(datos)`: Crea Auth User, Comercio, Sucursal, public.user e inicia sesión. **(Usa Service Role Key)**. ✅ Hecho.
- `resetPasswordForEmail() / updatePasswordAndAcceptInvite()`: Flujos de recuperación/invitación. **(Usa Service Role Key)**. ✅ Hecho.
- `inviteUser(email, rol, branch_id)`: Un Admin invita a un empleado. Envía correo y crea `public.users` en estado pendiente. **(Usa Service Role Key)**. ⏳ Pendiente (Fase 2).

### Estado de UI
- `setActiveBranch(branch_id)`: Guarda la sucursal activa en una Cookie HTTP-only. ✅ Hecho.

### CRUD de Configuración y Operación (Fase 2 - ⏳ Pendientes)
*Todos usarán el cliente estándar (respetando RLS) para mutar la DB.*
- `createSkill()`, `updateSkill()`, `deleteSkill()`
- `createPrice()`, `updatePrice()`, `deletePrice()`
- `createRule()`, `updateRule()`, `deleteRule()`
- `createCategory()`, `updateCategory()`, `deleteCategory()`
- `createNovedad()`, `updateNovedad()`, `desactivarNovedad()`
- `escalarCaso()`, `resolverCaso()`, `addCaseNote()`
- `vincularCanal()`: Handler para iniciar el flujo OAuth de Facebook/Meta o la integración con Whaticket.

---

## 3. Edge Functions (Supabase)

Funciones serverless independientes que manejarán la integración asíncrona pesada (Webhooks y LLM) y cron jobs. Necesarias para la **Fase 4 y 5**.

### Webhooks y Procesamiento
- **`webhook-meta`** ⏳ (Fase 4): Recibe notificaciones de Facebook/Instagram/WhatsApp.
  - Verifica el payload de Meta.
  - Almacena el mensaje en la tabla `messages` y actualiza/crea `conversations` y `contacts`.
  - Invoca de forma asíncrona a `process-llm` o lo encola.
- **`webhook-whaticket`** ⏳ (Fase 4): Alternativa para líneas de WhatsApp no oficiales usando API de terceros.

### Inteligencia Artificial
- **`process-llm`** ⏳ (Fase 4): Orquestador principal de la IA.
  - Lee el historial de la conversación.
  - Obtiene el perfil del comercio, sucursal, horarios, novedades, lista de precios y skills activos.
  - Valida el saldo de créditos (`message_quotas`).
  - Llama a la API de OpenAI (gpt-4o-mini).
  - Interpreta el output: si es una respuesta, envía el mensaje vía API de Meta; si detecta intención de escalado, llama internamente a la creación del Caso.
  - Registra el log en `ai_logs` y descuenta 1 crédito en `message_quotas`.

### Cron Jobs (pg_cron + Edge Functions)
- **`cron-reset-quotas`** ⏳ (Fase 5): Se ejecuta diariamente a las 00:00 UTC. Revisa comercios en `trial` o con planes que reinician cuota diaria y crea un abono en `message_quotas`.
- **`cron-subscription-check`** ⏳ (Fase 5): Desactiva comercios cuyo `fecha_vencimiento` del trial o plan haya pasado.
- **`cron-daily-summary`** ⏳ (Fase 5): Genera un resumen de la actividad de IA para los dueños de comercios y los envía por email o notificación.

---

## 4. Funciones SQL y Triggers de Base de Datos

Ejecución pura en PostgreSQL para garantizar la integridad y automatizar flujos sin latencia de red.

### Triggers Pendientes (Fases 1 y 4)
- **`on_auth_user_created`** ⏳ (Opcional/Recomendado): Trigger en `auth.users` que intercepte si alguien inicia sesión por primera vez con Google sin haber pasado por el trial, para crear su registro `public.users` temporal o rechazarlo si no fue invitado.
- **`update_conversation_timestamp`** ⏳: Al insertar en `messages`, actualiza `fecha_ultimo_mensaje` en `conversations`.
- **`auto_close_inactive_conversations`** ⏳: Cierra automáticamente conversaciones que llevan > 24h sin respuesta (útil para la ventana de servicio de WhatsApp de 24h).

### Funciones PL/pgSQL Pendientes (Fases 4 y 5)
- **`deduct_credit(tenant_id)`** ⏳: Función atómica que lee el saldo actual en `message_quotas`, verifica si `saldo > 0` y en la misma transacción inserta un registro tipo `debito` con cantidad `-1`. Retorna `true` si fue exitoso o `false` si no hay saldo.
- **`audit_logger()`** ⏳: Función que puede adjuntarse como trigger a tablas clave (`skills`, `price_list`, `users`) para automáticamente insertar un registro en `audit_log` con el `valor_anterior` y `valor_nuevo` (JSONB) cuando ocurre un UPDATE o DELETE.
