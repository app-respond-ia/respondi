'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { getAuthContext } from '@/lib/auth-context'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import { crearTicketCliente } from './soporte-cliente'
import { notificarATodosLosSuperadmins } from '@/lib/notificaciones'
import { estadoCreditos, revisarAvisosCreditos } from '@/lib/creditos'

// Cambiar de plan desde el panel del cliente. Hasta que Stripe esté conectado,
// el cliente elige el plan y la petición le llega al equipo de Respondi como
// ticket de soporte; el cambio lo hace el equipo desde superadmin. Antes el
// botón "Ampliar plan" del inicio no hacía nada.

const ASUNTO = 'Cambio de plan'

export async function getPlanesDisponibles() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const [{ data: org }, { data: planesCrudo, error }] = await Promise.all([
    supabaseAdmin
      .from('organizaciones')
      .select('plan_id, plan_pendiente_id, plan_solicitado_id, plan_solicitado_en, trial_activo, fecha_vencimiento')
      .eq('id', auth.tenant_id)
      .single(),
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
    .map(p => ({ id: p.id, nombre: p.nombre, precio_usd: p.precio_usd, creditos_mensuales: p.creditos_mensuales, canales_max: p.canales_max, sucursales_max: p.sucursales_max, usuarios_max: p.usuarios_max, dias_trial: p.dias_trial, a_medida: !!p.personalizado }))

  const { data: pedido } = await supabaseAdmin
    .from('client_tickets')
    .select('id, asunto, fecha_apertura')
    .eq('tenant_id', auth.tenant_id)
    .like('asunto', `${ASUNTO}%`)
    .not('estatus', 'in', '(resuelto,cerrado)')
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    success: true,
    data: {
      planes: planes.filter(p => !(p.dias_trial > 0)),
      planActualId: org.plan_id,
      planPendienteId: org.plan_pendiente_id,
      // Lo que el cliente ha pedido y espera que Respondi apruebe
      planSolicitadoId: org.plan_solicitado_id,
      planSolicitadoEn: org.plan_solicitado_en,
      enPrueba: !!org.trial_activo,
      vence: org.fecha_vencimiento,
      peticionAbierta: pedido ? { id: pedido.id, asunto: pedido.asunto } : null
    }
  }
}

export async function solicitarCambioPlan(planId: string) {
  const denegado = await sinPermiso('facturacion')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const res = await getPlanesDisponibles()
  if (!res.success || !res.data) return { success: false, error: res.error || 'No se han podido cargar los planes' }
  const { planes, planActualId, enPrueba, peticionAbierta, planSolicitadoId } = res.data

  const plan = planes.find(p => p.id === planId)
  if (!plan || plan.dias_trial > 0) return { success: false, error: 'Ese plan no está disponible.' }
  if (plan.id === planActualId && !enPrueba) return { success: false, error: 'Ya tienes ese plan.' }
  if (peticionAbierta || planSolicitadoId) {
    return { success: false, error: 'Ya hay una petición de cambio de plan pendiente. El equipo de Respondi la revisará en breve.' }
  }

  const { data: actual } = await supabaseAdmin.from('plans').select('nombre').eq('id', planActualId).maybeSingle()
  const desde = enPrueba ? `la prueba gratuita${actual?.nombre ? ` (${actual.nombre})` : ''}` : `el plan ${actual?.nombre || 'actual'}`
  const ticket = await crearTicketCliente(
    `${ASUNTO}: ${plan.nombre}`,
    `Queremos pasar de ${desde} al plan ${plan.nombre} (${Number(plan.precio_usd).toLocaleString('es-ES')} USD/mes). Petición enviada desde Facturación.`
  )
  if (!ticket.success) return { success: false, error: ticket.error || 'No se ha podido enviar la petición' }

  // La petición queda apuntada en la organización: el superadmin la aprueba
  // o la rechaza desde Organizaciones (hasta que Stripe cobre solo)
  await supabaseAdmin.from('organizaciones').update({ plan_solicitado_id: plan.id, plan_solicitado_en: new Date().toISOString() }).eq('id', auth.tenant_id)
  const { data: orgNombre } = await supabaseAdmin.from('organizaciones').select('nombre').eq('id', auth.tenant_id).maybeSingle()
  await notificarATodosLosSuperadmins(supabaseAdmin, {
    tipo: 'cliente_cambio_plan',
    tenantId: auth.tenant_id,
    titulo: 'Solicitud de cambio de plan',
    cuerpo: `"${orgNombre?.nombre || 'Una organización'}" pide pasar de ${desde} al plan ${plan.nombre}. Apruébalo o recházalo en Organizaciones.`,
    url: '/superadmin/organizaciones'
  })

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `pidió cambiar al plan ${plan.nombre}`,
    tabla_afectada: 'organizaciones',
    registro_id: auth.tenant_id,
    valor_nuevo: { plan_solicitado: plan.nombre }
  })

  return { success: true }
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
