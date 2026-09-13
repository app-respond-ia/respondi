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

## Créditos de la prueba (12-09-2026)
500 al abrir la cuenta, **una sola vez** (no es una recarga diaria, aunque la
columna se llame `plans.creditos_diarios_trial`; decisión de Jorge). Coste
real medido: una respuesta con `gpt-4.1-nano` gasta ~1.500 tokens de entrada y
~50 de salida, es decir 0,0002 $; una cuenta de prueba que gaste los 500
créditos cuesta unos 8 céntimos. Se cambia en Superadmin → Planes →
«Créditos de la prueba».

Cada plan da los suyos al crear la cuenta: la prueba, los de la prueba; los de
pago, sus `creditos_mensuales`.

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

## Colores y avisos de créditos (13-09-2026, decidido con Jorge)
- **Color** (`src/lib/creditos-nivel.ts`, igual en cabecera, inicio y
  Facturación): verde por encima del 30 % de lo que da el plan (en la
  prueba, los créditos de la prueba; después, los del mes), amarillo entre
  el 10 % y el 30 %, rojo por debajo del 10 %, y "Sin créditos" cuando el
  saldo es 0. La cabecera lo enseña también en el móvil (solo el número) y
  lleva a Facturación.
- **Avisos** (`src/lib/creditos.ts`, `revisarAvisosCreditos`): al llegar al
  20 % y al agotarse, una sola vez cada uno: campana a los propietarios de
  la organización (`creditos_bajos`), campana a los superadmins
  (`creditos_cliente_bajos`) y correo a los propietarios
  (`enviarEmailCreditos`, por Resend: hasta que haya dominio propio solo
  entrega al dueño de la cuenta de Resend y el fallo queda en `error_logs`).
  La marca `organizaciones.aviso_creditos` ('bajo' | 'agotado') evita
  repetir y se limpia sola cuando el saldo vuelve a subir. Se revisa justo
  después de cada crédito gastado (`/api/ai/process`, con `after`), al
  rechazar por falta de saldo, y al abrir Facturación o el inicio
  (`getEstadoCreditos`).
- El aviso diario de pg_cron (`check_clientes_por_vencer_y_creditos`) estaba
  roto —usaba `organizaciones.umbral_alerta_creditos` y
  `message_quotas.created_at`, que no existen— y se ha dejado solo con el
  aviso de vencimiento (migración `20260913170000`).

## Sin créditos sueltos (13-09-2026)
Decidido con Jorge: no se venden créditos adicionales al plan; si un cliente
necesita más respuestas, sube de plan o se le hace un plan a medida. El campo
"Precio x Crédito adicional" ha desaparecido del formulario y de las tarjetas
de `/superadmin/planes` (la columna `plans.precio_credito_adicional` sigue en
la tabla, sin uso). Los créditos de regalo siguen dándose desde
Organizaciones → Recarga manual. `plans.precio_sucursal_extra` sigue sin
flujo de cobro.

## Planes a medida (13-09-2026)
`plans.personalizado` + `plans.organizaciones_ids` (uuid[]). Un plan a medida
no sale en la lista pública: solo lo ven y lo pueden pedir las organizaciones
de su lista (`getPlanesDisponibles` lo filtra y lo marca `a_medida`). Se crea
desde `/superadmin/planes` marcando "Plan a medida" y eligiendo las
organizaciones; en Organizaciones → Cambiar plan aparecen todos con la marca
"a medida".

## Cambio de plan como solicitud (13-09-2026, hasta Stripe)
`solicitarCambioPlan` apunta `organizaciones.plan_solicitado_id` /
`plan_solicitado_en`, abre el ticket de siempre y avisa a los superadmins
(`cliente_cambio_plan`). En `/superadmin/organizaciones` la fila lleva la
insignia "Pide plan X" y en su ficha hay **Aprobar** (aplica el plan con la
regla de siempre: subida inmediata, bajada en la renovación; cierra el ticket
y avisa al cliente) y **Rechazar** (con motivo opcional, avisa al cliente).
Facturación enseña el plan pedido como "Pendiente de aprobación" y bloquea
otra petición mientras tanto. Cuando Stripe esté conectado, este flujo se
sustituye por el cobro.

## Pendiente
`plans.precio_sucursal_extra` existe en el formulario de planes pero no se
usa en ningún flujo de cobro real.

## Bloqueado / aplazado
Bloque 2.1 (traducir errores crudos de Postgres a mensajes
entendibles) — pausado a propósito hasta cerrar la auditoría de
esquema y la estrategia de errores/seguridad.

## Modelo de cobro de la IA (confirmado 10-09-2026)
**1 crédito de Respondi = 1 respuesta de la IA**, sea cual sea el modelo. Lo
que cambia entre planes es QUÉ modelo se usa —los más caros solo en los
planes altos—, no cuántos créditos gasta el cliente por responder.

De ahí que el margen dependa del plan: una respuesta de gpt-4o cuesta bastante
más que una de gpt-4o-mini y el cliente paga lo mismo. Por eso el precio por
token vive en el plan (`plans.precio_input_usd_millon` y
`precio_output_usd_millon`), junto a `modelo_ia`, y los tres se editan desde
`/superadmin/planes`. `generarRespuesta` los lee de ahí para calcular el
`costo_estimado_usd` de cada respuesta en `ai_logs`.

Dos avisos:
- Si dos planes usan el mismo modelo hay que poner el mismo precio en los dos.
  Se acepta esa duplicación a cambio de no montar un catálogo de modelos con
  su propia pantalla.
- Los cuatro planes arrancan con 0,20 y 1,20 por millón, que son los valores
  que estaban fijos en el código. **No corresponden a gpt-4o**: hay que
  ponerles los precios reales antes de fiarse de los informes de consumo.

El selector de modelo solo ofrece modelos de OpenAI. Ofrecía también "Claude
3 Haiku" y "Llama 3", pero el motor únicamente habla con la API de OpenAI:
elegir cualquiera de los dos dejaba sin IA a todos los clientes de ese plan,
sin ningún aviso. Si algún día se añade otro proveedor, hay que tocar el
motor antes que el desplegable.
