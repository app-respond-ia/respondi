'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { getAuthContext } from '@/lib/auth-context'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import { crearTicketCliente } from './soporte-cliente'

// Cambiar de plan desde el panel del cliente. Hasta que Stripe esté conectado,
// el cliente elige el plan y la petición le llega al equipo de Respondi como
// ticket de soporte; el cambio lo hace el equipo desde superadmin. Antes el
// botón "Ampliar plan" del inicio no hacía nada.

const ASUNTO = 'Cambio de plan'

export async function getPlanesDisponibles() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const [{ data: org }, { data: planes, error }] = await Promise.all([
    supabaseAdmin
      .from('organizaciones')
      .select('plan_id, plan_pendiente_id, trial_activo, fecha_vencimiento')
      .eq('id', auth.tenant_id)
      .single(),
    // Los planes de pago que se venden (el de prueba no es algo a lo que se
    // "pase"); son públicos, como una página de precios
    supabaseAdmin
      .from('plans')
      .select('id, nombre, precio_usd, creditos_mensuales, canales_max, sucursales_max, usuarios_max, dias_trial')
      .eq('activo', true)
      .order('precio_usd', { ascending: true })
  ])
  if (error || !org) return { success: false, error: error?.message || 'Organización no encontrada' }

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
      planes: (planes || []).filter(p => !(p.dias_trial > 0)),
      planActualId: org.plan_id,
      planPendienteId: org.plan_pendiente_id,
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
  const { planes, planActualId, enPrueba, peticionAbierta } = res.data

  const plan = planes.find(p => p.id === planId)
  if (!plan) return { success: false, error: 'Ese plan no está disponible.' }
  if (plan.id === planActualId && !enPrueba) return { success: false, error: 'Ya tienes ese plan.' }
  if (peticionAbierta) {
    return { success: false, error: 'Ya hay una petición de cambio de plan abierta. El equipo de Respondi te contestará en Soporte.' }
  }

  const { data: actual } = await supabaseAdmin.from('plans').select('nombre').eq('id', planActualId).maybeSingle()
  const desde = enPrueba ? `la prueba gratuita${actual?.nombre ? ` (${actual.nombre})` : ''}` : `el plan ${actual?.nombre || 'actual'}`
  const ticket = await crearTicketCliente(
    `${ASUNTO}: ${plan.nombre}`,
    `Queremos pasar de ${desde} al plan ${plan.nombre} (${Number(plan.precio_usd).toLocaleString('es-ES')} USD/mes). Petición enviada desde Facturación.`
  )
  if (!ticket.success) return { success: false, error: ticket.error || 'No se ha podido enviar la petición' }

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
