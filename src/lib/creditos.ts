import { supabaseAdmin } from '@/utils/supabase/admin'
import { notificarAAdminsDeOrganizacion, notificarATodosLosSuperadmins } from '@/lib/notificaciones'
import { enviarEmailCreditos } from '@/lib/email'
import { registrarError } from '@/lib/errores'
import { nivelCreditos, AVISO_AL_PORCENTAJE, type NivelCreditos } from '@/lib/creditos-nivel'

// Los créditos de una organización, y los avisos cuando se acaban.
// Solo servidor (usa el cliente del sistema).

export interface EstadoCreditos {
  saldo: number
  // Lo que da el plan: en la prueba, lo que se dio al empezar; si no, lo del mes
  max: number
  pct: number
  nivel: NivelCreditos
}

export async function estadoCreditos(tenantId: string): Promise<EstadoCreditos | null> {
  const [{ data: org }, { data: quota }] = await Promise.all([
    supabaseAdmin.from('organizaciones').select('trial_activo, plans!plan_id(creditos_diarios_trial, creditos_mensuales)').eq('id', tenantId).maybeSingle(),
    supabaseAdmin.from('message_quotas').select('saldo').eq('tenant_id', tenantId).order('timestamp', { ascending: false }).limit(1).maybeSingle()
  ])
  if (!org) return null
  const plan: any = Array.isArray(org.plans) ? org.plans[0] : org.plans
  // En la prueba, lo que se dio al empezar; si el plan no lo dice (una
  // cuenta en prueba sobre un plan de pago), lo del mes
  const max = Number(org.trial_activo ? (plan?.creditos_diarios_trial || plan?.creditos_mensuales) : plan?.creditos_mensuales) || 0
  const saldo = Number(quota?.saldo) || 0
  return { saldo, max, ...nivelCreditos(saldo, max) }
}

// Avisa al llegar al 20 % y al agotarse, una sola vez cada uno: la marca
// `organizaciones.aviso_creditos` recuerda lo ya avisado y se limpia sola
// cuando el saldo vuelve a subir (recarga, renovación). Se llama después de
// cada crédito gastado y al abrir Facturación; repetirla no repite avisos.
export async function revisarAvisosCreditos(tenantId: string): Promise<'bajo' | 'agotado' | null> {
  try {
    const estado = await estadoCreditos(tenantId)
    if (!estado) return null
    const { data: org } = await supabaseAdmin.from('organizaciones').select('nombre, aviso_creditos').eq('id', tenantId).maybeSingle()
    if (!org) return null
    const marca = (org.aviso_creditos || null) as 'bajo' | 'agotado' | null

    // Con saldo de sobra, lo avisado deja de contar (ha habido recarga)
    const bajo = estado.max > 0 ? estado.pct <= AVISO_AL_PORCENTAJE : false
    if (estado.saldo > 0 && !bajo) {
      if (marca) await supabaseAdmin.from('organizaciones').update({ aviso_creditos: null }).eq('id', tenantId)
      return null
    }

    const agotado = estado.saldo <= 0
    if (agotado && marca === 'agotado') return null
    if (!agotado && marca) return null // ya avisado el 20 % (o el agotado, si sube un poco)

    const nuevo: 'bajo' | 'agotado' = agotado ? 'agotado' : 'bajo'
    await supabaseAdmin.from('organizaciones').update({ aviso_creditos: nuevo }).eq('id', tenantId)

    const titulo = agotado ? 'Se han agotado los créditos de IA' : 'Quedan pocos créditos de IA'
    const cuerpo = agotado
      ? 'La IA ha dejado de contestar a tus clientes porque no quedan créditos. Amplía tu plan en Facturación para que siga atendiendo.'
      : `Te quedan ${estado.saldo.toLocaleString('es-ES')} de ${estado.max.toLocaleString('es-ES')} créditos (${Math.round(estado.pct)} %). Cuando se agoten, la IA dejará de contestar: amplía tu plan en Facturación.`
    await notificarAAdminsDeOrganizacion(supabaseAdmin, tenantId, { tipo: 'creditos_bajos', titulo, cuerpo, url: '/dashboard/facturacion#planes' })
    await notificarATodosLosSuperadmins(supabaseAdmin, {
      tipo: 'creditos_cliente_bajos',
      tenantId,
      titulo: agotado ? 'Cliente sin créditos' : 'Cliente con créditos bajos',
      cuerpo: agotado
        ? `La organización "${org.nombre}" se ha quedado sin créditos de IA.`
        : `La organización "${org.nombre}" tiene pocos créditos de IA (${estado.saldo} de ${estado.max}).`,
      url: '/superadmin/organizaciones'
    })

    // Correo a los propietarios de la organización
    const { data: admins } = await supabaseAdmin
      .from('users')
      .select('email, roles_personalizados!inner(es_propietario)')
      .eq('tenant_id', tenantId)
      .eq('roles_personalizados.es_propietario', true)
      .eq('activo', true)
    const correos = (admins || []).map((a: any) => String(a.email || '').trim()).filter(Boolean)
    if (correos.length) {
      // Resend no lanza: devuelve { error } cuando no puede entregar (por
      // ejemplo, sin dominio propio solo entrega al dueño de la cuenta)
      try {
        const r: any = await enviarEmailCreditos({ para: correos, organizacion: org.nombre, saldo: estado.saldo, max: estado.max, agotado })
        if (r?.error) throw new Error(r.error.message || String(r.error))
      } catch (e: any) {
        await registrarError({ origen: 'app', descripcion: 'No se ha podido enviar el correo de créditos bajos', stacktrace: JSON.stringify({ tenantId, message: e?.message }), tenant_id: tenantId })
      }
    }
    return nuevo
  } catch (e: any) {
    await registrarError({ origen: 'app', descripcion: 'Fallo al revisar los avisos de créditos', stacktrace: JSON.stringify({ tenantId, message: e?.message }), tenant_id: tenantId })
    return null
  }
}
