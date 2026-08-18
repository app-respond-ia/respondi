import { SupabaseClient } from '@supabase/supabase-js'

export type NotificacionTipo = 
  | 'conversion' 
  | 'comision_aprobada' 
  | 'comision_pagada' 
  | 'cliente_riesgo' 
  | 'soporte_respuesta'

interface NotificacionData {
  userId: string
  tenantId?: string | null
  tipo: NotificacionTipo
  titulo: string
  cuerpo: string
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
        cuerpo: data.cuerpo
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
