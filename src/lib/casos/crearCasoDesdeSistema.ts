import { supabaseAdmin } from '@/utils/supabase/admin'
import { notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'

export async function crearCasoDesdeSistema(
  conversationId: string, 
  tenantId: string, 
  branchId: string, 
  contactId: string, 
  motivo: string,
  tipoCaso: string = 'normal',
  prioridad: string = 'normal'
) {
  // Verificar si ya existe un caso ACTIVO (no cerrado) para evitar conflictos con unique_active_case
  const { data: existingCase } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .neq('estatus', 'cerrado')
    .maybeSingle()

  if (existingCase) return existingCase.id

  const { data: nuevoCaso, error } = await supabaseAdmin
    .from('cases')
    .insert([{
      tenant_id: tenantId,
      branch_id: branchId,
      contact_id: contactId,
      conversation_id: conversationId,
      tipo: tipoCaso,
      prioridad: prioridad,
      descripcion: motivo,
      estatus: 'pendiente',
      agente_id: null,
      fecha_apertura: new Date().toISOString()
    }])
    .select('id')
    .single()

  if (error) {
    console.error('Error insertando caso derivado automáticamente:', error)
    return null
  }

  if (nuevoCaso) {
    await notificarAAdminsDeOrganizacion(supabaseAdmin, tenantId, {
      tipo: 'conversacion_escalada',
      titulo: 'Conversación derivada a soporte',
      cuerpo: 'Se ha creado un nuevo caso automáticamente que requiere atención humana.',
      url: `/dashboard/casos/${nuevoCaso.id}`,
      entidadId: nuevoCaso.id
    })
    return nuevoCaso.id
  }
  return null
}
