'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { getAuthContext } from '@/lib/auth-context'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import { registrarError } from '@/lib/errores'
import { estadoCreditos, revisarAvisosCreditos } from '@/lib/creditos'
import { stripeConfigurado, crearCheckout, crearPortal, cambiarPlanEnStripe } from '@/lib/stripe'

// Los planes desde el panel del cliente: elegir uno y pagarlo con Stripe
// (13-09-2026, decidido con Jorge: sin aprobación a mano). Con una
// suscripción en marcha, el cambio se hace en la propia suscripción: subida
// al momento, bajada en la siguiente renovación.

const CAMPOS_ORG = 'id, nombre, plan_id, plan_pendiente_id, trial_activo, fecha_vencimiento, estado, stripe_customer_id, stripe_subscription_id, stripe_estado, stripe_periodo_fin, stripe_cancelar_al_final'

export async function getPlanesDisponibles() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const [{ data: org }, { data: planesCrudo, error }] = await Promise.all([
    supabaseAdmin.from('organizaciones').select(CAMPOS_ORG).eq('id', auth.tenant_id).single(),
    // Los planes de pago que se venden (el de prueba no es algo a lo que se
    // "pase"); son públicos, como una página de precios. Los planes a medida
    // solo los ve la organización para la que se hicieron.
    supabaseAdmin
      .from('plans')
      .select('id, nombre, precio_usd, creditos_mensuales, canales_max, sucursales_max, usuarios_max, dias_trial, personalizado, organizaciones_ids')
      .eq('activo', true)
      .order('precio_usd', { ascending: true })
  ])
  if (error || !org) return { success: false, error: error?.message || 'Organización no encontrada' }
  const planes = (planesCrudo || [])
    .filter(p => !p.personalizado || (p.organizaciones_ids || []).includes(auth.tenant_id!))
    .filter(p => !(p.dias_trial > 0))
    .map(p => ({ id: p.id, nombre: p.nombre, precio_usd: p.precio_usd, creditos_mensuales: p.creditos_mensuales, canales_max: p.canales_max, sucursales_max: p.sucursales_max, usuarios_max: p.usuarios_max, dias_trial: p.dias_trial, a_medida: !!p.personalizado }))

  return {
    success: true,
    data: {
      planes,
      planActualId: org.plan_id,
      planPendienteId: org.plan_pendiente_id,
      enPrueba: !!org.trial_activo,
      vence: org.fecha_vencimiento,
      estado: org.estado,
      // La suscripción de Stripe, si la hay
      suscripcion: org.stripe_subscription_id ? {
        estado: org.stripe_estado,
        periodoFin: org.stripe_periodo_fin,
        cancelarAlFinal: !!org.stripe_cancelar_al_final
      } : null,
      pagoDisponible: stripeConfigurado()
    }
  }
}

// Elegir un plan. Sin suscripción: devuelve la página de pago de Stripe.
// Con suscripción: cambia el plan y dice cuándo se aplica.
export async function iniciarPagoPlan(planId: string): Promise<{ success: boolean; error?: string; url?: string; cuando?: 'ahora' | 'renovacion' }> {
  const denegado = await sinPermiso('facturacion')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  if (!stripeConfigurado()) return { success: false, error: 'El pago con tarjeta todavía no está activado. Escríbenos en Soporte.' }

  const res = await getPlanesDisponibles()
  if (!res.success || !res.data) return { success: false, error: res.error || 'No se han podido cargar los planes' }
  const { planes, planActualId, enPrueba } = res.data
  const elegido = planes.find(p => p.id === planId)
  if (!elegido) return { success: false, error: 'Ese plan no está disponible.' }
  if (elegido.id === planActualId && !enPrueba) return { success: false, error: 'Ya tienes ese plan.' }

  const [{ data: org }, { data: plan }, { data: usuario }] = await Promise.all([
    supabaseAdmin.from('organizaciones').select(CAMPOS_ORG).eq('id', auth.tenant_id).single(),
    supabaseAdmin.from('plans').select('id, nombre, precio_usd, stripe_product_id, stripe_price_id, personalizado, dias_trial').eq('id', planId).single(),
    supabaseAdmin.from('users').select('email').eq('id', auth.user_id).maybeSingle()
  ])
  if (!org || !plan) return { success: false, error: 'Organización o plan no encontrados.' }

  try {
    if (org.stripe_subscription_id && org.stripe_estado !== 'cancelada') {
      const cuando = await cambiarPlanEnStripe(org, plan)
      await registrarAuditoria({
        tenant_id: auth.tenant_id,
        user_id: auth.user_id,
        accion: cuando === 'ahora' ? `cambió al plan ${plan.nombre} (cobrado por Stripe)` : `pidió bajar al plan ${plan.nombre} en la próxima renovación`,
        tabla_afectada: 'organizaciones',
        registro_id: auth.tenant_id,
        valor_nuevo: { plan_id: plan.id, cuando }
      })
      return { success: true, cuando }
    }
    const url = await crearCheckout({ org, plan, email: usuario?.email || null })
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: `fue a pagar el plan ${plan.nombre} en Stripe`,
      tabla_afectada: 'organizaciones',
      registro_id: auth.tenant_id,
      valor_nuevo: { plan_id: plan.id }
    })
    return { success: true, url }
  } catch (e: any) {
    await registrarError({ origen: 'app', descripcion: 'Stripe no ha podido preparar el pago', stacktrace: JSON.stringify({ tenant: auth.tenant_id, plan: planId, message: e?.message }), tenant_id: auth.tenant_id })
    return { success: false, error: `No se ha podido preparar el pago: ${e?.message}` }
  }
}

// Tarjeta, facturas, baja: el portal de Stripe
export async function abrirPortalPago(): Promise<{ success: boolean; error?: string; url?: string }> {
  const denegado = await sinPermiso('facturacion')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  if (!stripeConfigurado()) return { success: false, error: 'El pago con tarjeta todavía no está activado.' }

  const { data: org } = await supabaseAdmin.from('organizaciones').select('stripe_customer_id').eq('id', auth.tenant_id).single()
  if (!org?.stripe_customer_id) return { success: false, error: 'Todavía no tienes ningún pago con tarjeta. Elige un plan para empezar.' }
  try {
    return { success: true, url: await crearPortal(org.stripe_customer_id) }
  } catch (e: any) {
    return { success: false, error: `No se ha podido abrir la gestión del pago: ${e?.message}` }
  }
}

// Los créditos que quedan y su color, para Facturación y el inicio. De paso
// revisa si toca avisar (20 % o agotados), por si el aviso del momento del
// gasto no llegó.
export async function getEstadoCreditos() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const estado = await estadoCreditos(auth.tenant_id!)
  if (!estado) return { success: false, error: 'Organización no encontrada' }
  const aviso = await revisarAvisosCreditos(auth.tenant_id!)
  return { success: true, data: { ...estado, aviso } }
}
