# Estado — Créditos y facturación (Respondi)

Sistema de créditos: 1 mensaje respondido por la IA = 1 crédito. Ver
`docs/arquitectura.md` para el diseño general; aquí va el detalle de
lo construido.

## Pieza A — Consumo real de créditos (hecho)
RPC `descontar_credito_ia`: lee saldo por `tenant_id` (última fila
por `timestamp`), inserta fila `tipo: 'debito'`, `origen: 'consumo_ia'`,
`cantidad: -1`. Llamada desde `route.ts` tras éxito de la IA, antes
de `liberarCandado()`. Fix incluido: `metricas.ts` filtraba
`message_quotas` por una columna `branch_id` inexistente en aquel
momento y por `created_at` en vez de `timestamp` — ya corregido.

Desplegado y revisado, pero **la prueba real de extremo a extremo
sigue bloqueada por falta de `OPENAI_API_KEY`** (ver
`docs/estado/pendientes.md`, Fase 0).

## Esquema de `message_quotas`
`tipo` es un ENUM (`tipo_movimiento`) con solo dos valores: `abono` y
`debito` — no admite texto libre. La columna `origen` (enum
`origen_movimiento`: `consumo_ia`/`recarga_manual`/`recarga_plan`)
lleva el matiz de forma consultable, dejando `tipo` solo para la
dirección del movimiento. Columna `branch_id` (nulable): solo se
rellena en consumo real vía `descontar_credito_ia`, nunca en recargas.

## Pieza D — Recarga manual (hecho)
RPC `abonar_credito_ia(p_tenant_id, p_cantidad, p_origen,
p_descripcion, p_modo)`: `tipo` se calcula automáticamente por el
signo de `p_cantidad`. `p_modo` es `'sumar'` (por defecto) o `'reset'`
(resetea el saldo al valor de `p_cantidad` — usado en renovación de
plan salvo que `plans.acumula_creditos = true`). Columna
`plans.acumula_creditos` (boolean, default false) editable desde
`/superadmin/planes`. `registrarPagoYRenovar` recarga créditos
automáticamente al renovar/pagar un plan. Server Action
`recargarCreditosIA` + modal en `/superadmin/organizaciones` para
recarga manual (cantidad libre, positiva o negativa, motivo
obligatorio). **Verificado end-to-end en producción** (abono +5000,
débito -200, incluyendo `audit_log` correcto).

## Pieza B — Stripe, suscripción mensual (en curso)
Avanzado lo que no depende de las claves: migraciones
`organizaciones.stripe_customer_id`, `organizaciones.stripe_subscription_id`,
`plans.stripe_price_id` (todas ejecutadas), campo "ID de precio de
Stripe" en el formulario de `/superadmin/planes`.

**Pendiente** (cuando Jorge/Andreina hagan el papeleo de cuentas
junto con Meta/Whaticket):
- Crear cuenta Stripe (modo test primero)
- Instalar SDK `stripe` + `@stripe/stripe-js`
- Variables `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY`/`STRIPE_WEBHOOK_SECRET`
- Crear productos/precios en Stripe, pegar cada `stripe_price_id` en
  su plan
- Endpoint de Checkout (`/api/stripe/checkout`) y webhook
  (`/api/stripe/webhook`, usando `req.text()` para el raw body +
  verificar firma), reutilizando `registrarPagoYRenovar`

Decidido: cuando Stripe esté conectado, el modal "Cambiar plan" de
`/superadmin/organizaciones` se bloquea (Opción A) para organizaciones
con `stripe_subscription_id` no nulo — el cambio de plan solo se
podrá hacer desde el portal de Stripe. Se descartó sincronizar
automáticamente vía API con prorrateo, por ser más arriesgado de cara
al papeleo/verificaciones de la cuenta.

## Pieza E — Historial de consumo visible al cliente (hecho)
Pantalla `/dashboard/facturacion`: resumen de créditos (reutiliza
`getMetricas`) + tabla de movimientos propios vía
`getMovimientosCreditosCliente` (usa `getAuthContext`, siempre filtra
por el propio `tenant_id`, nunca acepta uno externo) + hueco visual
reservado para gestión de suscripción Stripe (deshabilitado, sin dato
de plan inventado). Nueva sección de permiso `'facturacion'` en
`roles_personalizados` (lectura/escritura, sin dimensión de "alcance"
porque es siempre a nivel de organización completa) — para poder
delegar el acceso a alguien tipo contable. Verificado visualmente en
producción. Enlazado en el sidebar del cliente, grupo Organización,
justo después de "Sucursales".

## Reporting global — `/superadmin/creditos` (hecho)
"Movimientos de créditos": tabla filtrable de `message_quotas`
(organización, sucursal, tipo, origen, rango de fechas) + 4 tarjetas
de resumen (total consumido, total recargado por plan, total
recargado manual, saldo total de la plataforma) vía vista
`saldos_actuales_ia` y RPC `get_resumen_creditos`. Filtro por país
aplicado en JS tras traer los datos (no en el query embebido, para no
perder movimientos con `branch_id` nulo por un `!inner` join). Enlace
directo desde el modal de cada organización (`?tenant_id=`).

## Cuentas trial — inconsistencia de siembra de créditos (resuelta)
Existían dos caminos de alta con comportamiento distinto en créditos
— ver `docs/estado/incidentes-resueltos.md` (RPC `crear_cuenta_completa`
como solución unificada).

## Sin uso real todavía
`plans.precio_credito_adicional` y `plans.precio_sucursal_extra`
existen en el formulario de planes pero no se usan en ningún flujo de
cobro real — pendientes de cuando se diseñe el cobro de excedentes
sobre los límites del plan.

## Bloqueado / aplazado
Bloque 2.1 (traducir errores crudos de Postgres a mensajes
entendibles) — pausado a propósito hasta cerrar la auditoría de
esquema y la estrategia de errores/seguridad.
