import { SupabaseClient } from '@supabase/supabase-js'

export type NotificacionTipo = 
  | 'conversion' 
  | 'comision_aprobada' 
  | 'comision_pagada' 
  | 'cliente_riesgo' 
  | 'soporte_respuesta'
  | 'ticket_nuevo'
  | 'ticket_respuesta_vendedor'
  | 'organizacion_por_vencer'
  | 'nueva_organizacion'
  | 'comision_pendiente'
  | 'ticket_nuevo_cliente'
  | 'respuesta_cliente'
  | 'trial_por_vencer'
  | 'creditos_bajos'
  | 'cambio_plan_aplicado'
  | 'pago_confirmado'
  | 'caso_asignado'
  | 'conversacion_escalada'
  | 'creditos_cliente_bajos'
  | 'caso_estancado'
  | 'cliente_solicita_cancelar'
  | 'cuenta_suspendida'
  | 'cuenta_reactivada'

interface NotificacionData {
  userId: string
  tenantId?: string | null
  tipo: NotificacionTipo
  titulo: string
  cuerpo: string
  url?: string
  entidadId?: string
}

export async function crearNotificacion(
  supabaseAdmin: SupabaseClient<any, "public", any>, 
  data: NotificacionData
) {
  try {
    // Verificar si el usuario ha desactivado este tipo de notificación
    const { data: pref } = await supabaseAdmin
      .from('notification_preferences')
      .select('activado')
      .eq('user_id', data.userId)
      .eq('tipo', data.tipo)
      .single()

    // Si existe la preferencia y activado es falso, no enviamos la notificación
    if (pref && pref.activado === false) {
      return { success: true, skipped: true }
    }

    // Insertar la notificación
    const { data: notif, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: data.userId,
        tenant_id: data.tenantId || null,
        tipo: data.tipo,
        titulo: data.titulo,
        cuerpo: data.cuerpo,
        url: data.url || null,
        entidad_id: data.entidadId || null
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { success: true, notificacion: notif }
  } catch (err: any) {
    console.error('Error al crear notificación:', err.message)
    return { success: false, error: err.message }
  }
}

export async function notificarATodosLosSuperadmins(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  data: Omit<NotificacionData, 'userId'>
) {
  try {
    const { data: superadmins, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('rol', 'super_admin')
      .eq('activo', true)

    if (error) throw error

    if (!superadmins || superadmins.length === 0) {
      return { success: true, count: 0 }
    }

    let enviados = 0
    for (const admin of superadmins) {
      await crearNotificacion(supabaseAdmin, {
        ...data,
        userId: admin.id
      })
      enviados++
    }

    return { success: true, count: enviados }
  } catch (err: any) {
    console.error('Error notificando a superadmins:', err.message)
    return { success: false, error: err.message }
  }
}

export async function notificarAAdminsDeOrganizacion(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  tenantId: string,
  data: Omit<NotificacionData, 'userId' | 'tenantId'>
) {
  try {
    const { data: admins, error } = await supabaseAdmin
      .from('users')
      .select('id, roles_personalizados!inner(es_propietario)')
      .eq('tenant_id', tenantId)
      .eq('roles_personalizados.es_propietario', true)
      .eq('activo', true)

    if (error) throw error

    if (!admins || admins.length === 0) {
      return { success: true, count: 0 }
    }

    let enviados = 0
    for (const admin of admins) {
      const res = await crearNotificacion(supabaseAdmin, {
        ...data,
        tenantId,
        userId: admin.id
      })
      if (!res.success) {
        return { success: false, error: 'crearNotificacion falló: ' + res.error }
      }
      enviados++
    }

    return { success: true, count: enviados }
  } catch (err: any) {
    console.error('Error notificando a admins de organización:', err.message)
    return { success: false, error: err.message }
  }
}
