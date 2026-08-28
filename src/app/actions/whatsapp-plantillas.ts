'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { getMisPermisos } from '@/app/actions/permisos'
import { registrarAuditoria } from '@/lib/auditoria'

export async function getPlantillasWhatsApp() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // First we need the whatsapp channel id for the active branch
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .select('id')
    .eq('branch_id', auth.branch_id)
    .eq('tipo', 'whatsapp')
    .eq('estado', 'activo')
    .maybeSingle()

  if (channelError || !channel) {
    return { success: false, error: 'No hay un canal de WhatsApp activo en esta sucursal.' }
  }

  const { data: plantillas, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('channel_id', channel.id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  return { success: true, plantillas, channelId: channel.id }
}

export async function crearPlantillaWhatsApp(data: { nombre: string, contenido: string, idioma: string, categoria: string, channel_id: string }) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. Verificamos permisos (solo escritura puede crear plantillas)
  const misPermisos = await getMisPermisos()
  if (!misPermisos.success) return { success: false, error: 'Error verificando permisos.' }
  
  const tienePermiso = (misPermisos as any).esAdmin || 
                       (misPermisos.data || []).some((p: any) => p.seccion === 'canales' && p.nivel === 'escritura')

  if (!tienePermiso) {
    return { success: false, error: 'No tienes permiso de escritura en canales.' }
  }

  // Prevención IDOR: Confirmamos que el channel_id existe y pertenece a este tenant y branch
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .select('id')
    .eq('id', data.channel_id)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .single()

  if (channelError || !channel) {
    return { success: false, error: 'Canal no encontrado o no autorizado.' }
  }

  // Force nombre to lowercase and replace spaces with underscores (basic cleanup if UI missed it)
  const nombreLimpio = data.nombre.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')

  const { data: nuevaPlantilla, error } = await supabase
    .from('whatsapp_templates')
    .insert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      channel_id: data.channel_id,
      nombre: nombreLimpio,
      contenido: data.contenido.trim(),
      idioma: data.idioma,
      categoria: data.categoria,
      estado: 'pendiente'
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // unique violation
      return { success: false, error: 'Ya existe una plantilla con ese nombre e idioma.' }
    }
    return { success: false, error: error.message }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó una plantilla de WhatsApp "${nombreLimpio}"`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: nuevaPlantilla.id,
    valor_nuevo: nuevaPlantilla
  })

  return { success: true, plantilla: nuevaPlantilla }
}
