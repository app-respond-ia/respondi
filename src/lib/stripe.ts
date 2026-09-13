import Stripe from 'stripe'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { notificarAAdminsDeOrganizacion, notificarATodosLosSuperadmins } from '@/lib/notificaciones'
import { registrarError } from '@/lib/errores'
import { registrarAuditoria } from '@/lib/auditoria'

// STRIPE: el cobro de los planes (13-09-2026, decidido con Jorge: sin paso
// provisional). Cómo funciona:
//  - Los productos y precios de Stripe los crea Respondi a partir de `plans`
//    (`asegurarPrecioDelPlan`), así que en Stripe no hay que tocar nada.
//  - El cliente elige un plan en Facturación y paga en Stripe Checkout
//    (`crearCheckout`). Si ya tiene suscripción, el cambio se hace en la
//    propia suscripción (`cambiarPlanEnStripe`): subida al momento cobrando
//    la parte proporcional, bajada en la siguiente renovación.
//  - Stripe avisa por webhook (`aplicarEventoStripe`): al cobrar, el plan se
//    activa y se recargan los créditos; si un cobro falla o el cliente se da
//    de baja, la organización lo refleja.
//  - Tarjeta, facturas y baja: el portal de Stripe (`crearPortal`).
// En las pruebas, STRIPE_API_URL apunta a un Stripe simulado.

let cliente: Stripe | null = null

export function stripeConfigurado() {
  return !!process.env.STRIPE_SECRET_KEY
}

export function stripe(): Stripe {
  if (cliente) return cliente
  const clave = process.env.STRIPE_SECRET_KEY
  if (!clave) throw new Error('Stripe no está configurado (falta STRIPE_SECRET_KEY).')
  const opciones: Stripe.StripeConfig = { maxNetworkRetries: 2, timeout: 20000 }
  const simulado = process.env.STRIPE_API_URL
  if (simulado) {
    const u = new URL(simulado)
    opciones.host = u.hostname
    opciones.port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80)
    opciones.protocol = u.protocol === 'https:' ? 'https' : 'http'
  }
  cliente = new Stripe(clave, opciones)
  return cliente
}

function urlBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app').replace(/\/$/, '')
}

type Plan = { id: string; nombre: string; precio_usd: number | string; stripe_product_id: string | null; stripe_price_id: string | null; personalizado?: boolean; dias_trial?: number | null }

// El precio de Stripe de un plan. Se crea el producto la primera vez y un
// precio nuevo cada vez que cambia el importe (los precios de Stripe no se
// editan: el viejo se archiva). Devuelve el identificador del precio vigente.
export async function asegurarPrecioDelPlan(plan: Plan): Promise<string> {
  const s = stripe()
  const centimos = Math.round(Number(plan.precio_usd) * 100)
  if (!(centimos > 0)) throw new Error(`El plan "${plan.nombre}" no tiene precio: no se puede cobrar.`)

  let productoId = plan.stripe_product_id
  if (!productoId) {
    const producto = await s.products.create({ name: `Respondi · ${plan.nombre}`, metadata: { plan_id: plan.id } })
    productoId = producto.id
    await supabaseAdmin.from('plans').update({ stripe_product_id: productoId }).eq('id', plan.id)
  }

  if (plan.stripe_price_id) {
    // ¿Sigue valiendo lo mismo?
    try {
      const actual = await s.prices.retrieve(plan.stripe_price_id)
      if (actual.active && actual.unit_amount === centimos && actual.currency === 'usd' && actual.recurring?.interval === 'month') return plan.stripe_price_id
      if (actual.active) await s.prices.update(plan.stripe_price_id, { active: false })
    } catch {
      // Un precio que ya no existe en Stripe (otra cuenta, borrado): se crea otro
    }
  }
  const precio = await s.prices.create({
    product: productoId,
    currency: 'usd',
    unit_amount: centimos,
    recurring: { interval: 'month' },
    metadata: { plan_id: plan.id }
  })
  await supabaseAdmin.from('plans').update({ stripe_price_id: precio.id }).eq('id', plan.id)
  return precio.id
}

// El cliente de Stripe de una organización (se crea la primera vez, con la
// organización en sus metadatos: así cualquier aviso de Stripe se sabe de quién es)
export async function asegurarClienteStripe(org: { id: string; nombre: string; stripe_customer_id: string | null }, email: string | null) {
  if (org.stripe_customer_id) return org.stripe_customer_id
  const c = await stripe().customers.create({ name: org.nombre, email: email || undefined, metadata: { tenant_id: org.id } })
  await supabaseAdmin.from('organizaciones').update({ stripe_customer_id: c.id }).eq('id', org.id)
  return c.id
}

export async function crearCheckout(p: { org: { id: string; nombre: string; stripe_customer_id: string | null }; plan: Plan; email: string | null }) {
  const precio = await asegurarPrecioDelPlan(p.plan)
  const customer = await asegurarClienteStripe(p.org, p.email)
  const sesion = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: precio, quantity: 1 }],
    success_url: `${urlBase()}/dashboard/facturacion?pago=ok`,
    cancel_url: `${urlBase()}/dashboard/facturacion?pago=cancelado`,
    locale: 'es',
    allow_promotion_codes: true,
    subscription_data: { metadata: { tenant_id: p.org.id, plan_id: p.plan.id } },
    metadata: { tenant_id: p.org.id, plan_id: p.plan.id }
  })
  if (!sesion.url) throw new Error('Stripe no ha devuelto la página de pago.')
  return sesion.url
}

export async function crearPortal(customerId: string) {
  const sesion = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${urlBase()}/dashboard/facturacion` })
  return sesion.url
}

// Cambiar de plan con una suscripción en marcha. Subida: ya, cobrando la
// parte proporcional. Bajada: queda apuntada (`plan_pendiente_id`) y se
// aplica al renovar (en `invoice.paid`), como hacía el superadmin a mano.
export async function cambiarPlanEnStripe(org: { id: string; plan_id: string | null; stripe_subscription_id: string; plan_pendiente_id: string | null }, plan: Plan): Promise<'ahora' | 'renovacion'> {
  const s = stripe()
  const { data: actual } = await supabaseAdmin.from('plans').select('precio_usd').eq('id', org.plan_id || '').maybeSingle()
  const precioActual = Number(actual?.precio_usd || 0)
  const precioNuevo = Number(plan.precio_usd)
  if (precioNuevo >= precioActual) {
    const precio = await asegurarPrecioDelPlan(plan)
    const sub = await s.subscriptions.retrieve(org.stripe_subscription_id)
    const item = sub.items.data[0]
    await s.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: item.id, price: precio }],
      proration_behavior: 'create_prorations',
      metadata: { tenant_id: org.id, plan_id: plan.id }
    })
    await supabaseAdmin.from('organizaciones').update({ plan_id: plan.id, plan_pendiente_id: null }).eq('id', org.id)
    return 'ahora'
  }
  await supabaseAdmin.from('organizaciones').update({ plan_pendiente_id: plan.id }).eq('id', org.id)
  return 'renovacion'
}

// ---------- Lo que dice Stripe (webhooks) ----------

export function verificarEvento(cuerpo: string, firma: string | null): Stripe.Event {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET
  if (!secreto) throw new Error('Falta STRIPE_WEBHOOK_SECRET')
  return stripe().webhooks.constructEvent(cuerpo, firma || '', secreto)
}

async function orgPorCliente(customerId: string | null | undefined, metadatos?: Record<string, string> | null) {
  const tenant = metadatos?.tenant_id
  if (tenant) {
    const { data } = await supabaseAdmin.from('organizaciones').select('id, nombre, plan_id, plan_pendiente_id, estado, trial_activo, fecha_vencimiento, stripe_customer_id, stripe_subscription_id, stripe_estado').eq('id', tenant).maybeSingle()
    if (data) return data
  }
  if (!customerId) return null
  const { data } = await supabaseAdmin.from('organizaciones').select('id, nombre, plan_id, plan_pendiente_id, estado, trial_activo, fecha_vencimiento, stripe_customer_id, stripe_subscription_id, stripe_estado').eq('stripe_customer_id', customerId).maybeSingle()
  return data
}

async function planPorPrecio(priceId: string | null | undefined) {
  if (!priceId) return null
  const { data } = await supabaseAdmin.from('plans').select('id, nombre, creditos_mensuales, acumula_creditos').eq('stripe_price_id', priceId).maybeSingle()
  return data
}

const fecha = (segundos: number | null | undefined) => (segundos ? new Date(segundos * 1000) : null)

// Un cobro que ha ido bien: el plan queda activo hasta el fin del periodo y
// se recargan los créditos del plan (igual que "Registrar pago y renovar")
async function aplicarCobro(org: any, p: { planId: string | null; periodoFin: Date | null; subscriptionId: string | null; importe: number | null; moneda: string | null }) {
  let planId = p.planId || org.plan_id
  // Una bajada pendiente se aplica ahora, al empezar el periodo nuevo
  if (org.plan_pendiente_id && org.stripe_subscription_id && p.planId !== org.plan_pendiente_id) {
    const { data: pendiente } = await supabaseAdmin.from('plans').select('id, nombre, precio_usd, stripe_product_id, stripe_price_id, personalizado').eq('id', org.plan_pendiente_id).maybeSingle()
    if (pendiente) {
      try {
        const s = stripe()
        const precio = await asegurarPrecioDelPlan(pendiente as any)
        const sub = await s.subscriptions.retrieve(org.stripe_subscription_id)
        await s.subscriptions.update(org.stripe_subscription_id, { items: [{ id: sub.items.data[0].id, price: precio }], proration_behavior: 'none', metadata: { tenant_id: org.id, plan_id: pendiente.id } })
        planId = pendiente.id
      } catch (e: any) {
        await registrarError({ origen: 'app', descripcion: 'No se ha podido aplicar la bajada de plan en Stripe al renovar', stacktrace: JSON.stringify({ tenant: org.id, message: e?.message }), tenant_id: org.id })
      }
    }
  }
  const { data: plan } = await supabaseAdmin.from('plans').select('id, nombre, creditos_mensuales, acumula_creditos').eq('id', planId || '').maybeSingle()
  const vence = p.periodoFin || new Date(Date.now() + 31 * 24 * 3600 * 1000)
  await supabaseAdmin.from('organizaciones').update({
    plan_id: planId,
    plan_pendiente_id: null,
    plan_solicitado_id: null,
    plan_solicitado_en: null,
    estado: 'activo',
    trial_activo: false,
    fecha_vencimiento: vence.toISOString().slice(0, 10),
    stripe_estado: 'activa',
    stripe_periodo_fin: vence.toISOString(),
    stripe_cancelar_al_final: false,
    forma_pago: 'tdc',
    ...(p.subscriptionId ? { stripe_subscription_id: p.subscriptionId } : {})
  }).eq('id', org.id)

  if (plan && plan.creditos_mensuales !== null && plan.creditos_mensuales !== undefined) {
    const { error } = await supabaseAdmin.rpc('abonar_credito_ia', {
      p_tenant_id: org.id,
      p_cantidad: plan.creditos_mensuales,
      p_origen: 'recarga_plan',
      p_descripcion: `Cobro del plan ${plan.nombre} por Stripe`,
      p_modo: plan.acumula_creditos ? 'sumar' : 'reset'
    })
    if (error) await registrarError({ origen: 'app', descripcion: 'No se han podido abonar los créditos tras el cobro de Stripe', stacktrace: JSON.stringify({ tenant: org.id, error: error.message }), tenant_id: org.id })
  }

  const importe = p.importe !== null && p.importe !== undefined ? `${(p.importe / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${(p.moneda || 'usd').toUpperCase()}` : null
  await notificarAAdminsDeOrganizacion(supabaseAdmin, org.id, {
    tipo: 'pago_confirmado',
    titulo: 'Pago recibido',
    cuerpo: `${importe ? `Hemos recibido tu pago de ${importe}. ` : ''}Tu plan ${plan?.nombre || ''} está activo hasta el ${vence.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}${plan?.creditos_mensuales ? ` y tienes ${Number(plan.creditos_mensuales).toLocaleString('es-ES')} créditos de IA` : ''}.`,
    url: '/dashboard/facturacion'
  })
  await registrarAuditoria({
    tenant_id: org.id,
    user_id: null as any,
    accion: `Stripe: cobro del plan ${plan?.nombre || ''}${importe ? ` (${importe})` : ''}`,
    tabla_afectada: 'organizaciones',
    registro_id: org.id,
    valor_nuevo: { plan_id: planId, fecha_vencimiento: vence.toISOString().slice(0, 10) }
  })
}

// Aplica un aviso de Stripe. Devuelve un texto corto de lo que ha hecho.
export async function aplicarEventoStripe(evento: Stripe.Event): Promise<string> {
  const s = stripe()
  switch (evento.type) {
    case 'checkout.session.completed': {
      const sesion = evento.data.object as Stripe.Checkout.Session
      const org = await orgPorCliente(typeof sesion.customer === 'string' ? sesion.customer : sesion.customer?.id, sesion.metadata as any)
      if (!org) return 'organización desconocida'
      const subscriptionId = typeof sesion.subscription === 'string' ? sesion.subscription : sesion.subscription?.id || null
      await supabaseAdmin.from('organizaciones').update({
        stripe_customer_id: typeof sesion.customer === 'string' ? sesion.customer : org.stripe_customer_id,
        ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
        ...(sesion.metadata?.plan_id ? { plan_id: sesion.metadata.plan_id } : {}),
        plan_solicitado_id: null,
        plan_solicitado_en: null
      }).eq('id', org.id)
      return `suscripción ${subscriptionId || '?'} enlazada`
    }
    case 'invoice.paid': {
      const factura = evento.data.object as Stripe.Invoice
      const customerId = typeof factura.customer === 'string' ? factura.customer : factura.customer?.id
      const detalles: any = (factura as any).parent?.subscription_details || (factura as any).subscription_details || null
      const subscriptionId: string | null = detalles?.subscription ? (typeof detalles.subscription === 'string' ? detalles.subscription : detalles.subscription?.id) : ((factura as any).subscription ? (typeof (factura as any).subscription === 'string' ? (factura as any).subscription : (factura as any).subscription?.id) : null)
      const org = await orgPorCliente(customerId, (detalles?.metadata as any) || (factura.metadata as any))
      if (!org) return 'organización desconocida'
      // De qué plan es el cobro y hasta cuándo llega
      const linea: any = factura.lines?.data?.[0]
      const priceId: string | null = linea?.pricing?.price_details?.price || linea?.price?.id || null
      const plan = await planPorPrecio(priceId)
      const fin = fecha(linea?.period?.end)
      await aplicarCobro(org, { planId: plan?.id || (detalles?.metadata as any)?.plan_id || null, periodoFin: fin, subscriptionId, importe: factura.amount_paid ?? null, moneda: factura.currency ?? null })
      return `cobro aplicado (${plan?.nombre || 'plan actual'})`
    }
    case 'invoice.payment_failed': {
      const factura = evento.data.object as Stripe.Invoice
      const customerId = typeof factura.customer === 'string' ? factura.customer : factura.customer?.id
      const org = await orgPorCliente(customerId, (factura.metadata as any))
      if (!org) return 'organización desconocida'
      await supabaseAdmin.from('organizaciones').update({ stripe_estado: 'impagada' }).eq('id', org.id)
      await notificarAAdminsDeOrganizacion(supabaseAdmin, org.id, {
        tipo: 'pago_fallido',
        titulo: 'No hemos podido cobrar tu plan',
        cuerpo: 'El cobro de tu suscripción ha fallado. Revisa la tarjeta en Facturación → Gestionar pago; Stripe lo volverá a intentar y, si no se cobra, la IA dejará de atender al terminar el periodo pagado.',
        url: '/dashboard/facturacion'
      })
      await notificarATodosLosSuperadmins(supabaseAdmin, { tipo: 'cliente_cambio_plan', tenantId: org.id, titulo: 'Cobro fallido', cuerpo: `A "${org.nombre}" le ha fallado el cobro de la suscripción.`, url: '/superadmin/organizaciones' })
      return 'impago apuntado'
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = evento.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
      const org = await orgPorCliente(customerId, sub.metadata as any)
      if (!org) return 'organización desconocida'
      const item: any = sub.items?.data?.[0]
      const plan = await planPorPrecio(item?.price?.id)
      const fin = fecha(item?.current_period_end ?? (sub as any).current_period_end)
      const estado = ['active', 'trialing'].includes(sub.status) ? 'activa' : ['past_due', 'unpaid', 'incomplete'].includes(sub.status) ? 'impagada' : sub.status === 'canceled' ? 'cancelada' : org.stripe_estado
      await supabaseAdmin.from('organizaciones').update({
        stripe_subscription_id: sub.id,
        stripe_estado: estado,
        stripe_cancelar_al_final: !!sub.cancel_at_period_end,
        ...(fin ? { stripe_periodo_fin: fin.toISOString() } : {}),
        // Solo si el plan de la suscripción ya es distinto (subida aplicada): la
        // bajada pendiente no se toca aquí, se aplica al cobrar
        ...(plan && plan.id !== org.plan_id && !org.plan_pendiente_id ? { plan_id: plan.id } : {})
      }).eq('id', org.id)
      return `suscripción ${sub.status}${sub.cancel_at_period_end ? ' (baja al final del periodo)' : ''}`
    }
    case 'customer.subscription.deleted': {
      const sub = evento.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
      const org = await orgPorCliente(customerId, sub.metadata as any)
      if (!org) return 'organización desconocida'
      const hoy = new Date().toISOString().slice(0, 10)
      await supabaseAdmin.from('organizaciones').update({
        stripe_estado: 'cancelada',
        stripe_subscription_id: null,
        stripe_cancelar_al_final: false,
        plan_pendiente_id: null,
        // Si el periodo pagado ya ha terminado, la cuenta vence; si no, sigue hasta esa fecha
        ...(org.fecha_vencimiento && org.fecha_vencimiento > hoy ? {} : { estado: 'vencido' })
      }).eq('id', org.id)
      await notificarAAdminsDeOrganizacion(supabaseAdmin, org.id, {
        tipo: 'cuenta_suspendida',
        titulo: 'Suscripción cancelada',
        cuerpo: `Tu suscripción se ha cancelado.${org.fecha_vencimiento && org.fecha_vencimiento > hoy ? ` Puedes seguir usando Respondi hasta el ${new Date(org.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}.` : ''} Cuando quieras volver, elige un plan en Facturación.`,
        url: '/dashboard/facturacion'
      })
      await notificarATodosLosSuperadmins(supabaseAdmin, { tipo: 'cliente_solicita_cancelar', tenantId: org.id, titulo: 'Baja de suscripción', cuerpo: `"${org.nombre}" ha cancelado su suscripción en Stripe.`, url: '/superadmin/organizaciones' })
      return 'baja aplicada'
    }
    default:
      void s
      return 'ignorado'
  }
}
