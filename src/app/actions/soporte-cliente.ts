'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { resolveBranchId } from '@/lib/active-branch'
import { crearNotificacion } from '@/lib/notificaciones'
import { registrarAuditoria } from '@/lib/auditoria'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function getTicketsCliente() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = await resolveBranchId(supabase, auth.user_id)

  const query = supabase
    .from('client_tickets')
    .select(`
      *,
      categoria:categoria_id(nombre, color),
      mensajes:client_ticket_messages(count)
    `)
    .eq('tenant_id', auth.tenant_id)
    .order('fecha_apertura', { ascending: false })

  if (branchId) {
    query.eq('branch_id', branchId)
  } else {
    query.is('branch_id', null)
  }

  const { data, error } = await query
  
  if (error) return { success: false, error: error.message }
  return { success: true, data: data || [] }
}

export async function getTicketDetalleCliente(ticketId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = await resolveBranchId(supabase, auth.user_id)

  const query = supabase
    .from('client_tickets')
    .select(`
      *,
      categoria:categoria_id(nombre, color),
      asignado:asignado_a(nombre, avatar_url),
      mensajes:client_ticket_messages(
        id,
        mensaje,
        timestamp,
        user_id,
        user:users(nombre, avatar_url, rol)
      )
    `)
    .eq('id', ticketId)
    .eq('tenant_id', auth.tenant_id)

  if (branchId) {
    query.eq('branch_id', branchId)
  } else {
    query.is('branch_id', null)
  }

  const { data, error } = await query.single()
  
  if (error) return { success: false, error: error.message }
  if (data?.mensajes) {
    data.mensajes.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }
  return { success: true, data }
}

export async function crearTicketCliente(asunto: string, mensajeInicial: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = await resolveBranchId(supabase, auth.user_id)

  const { data: ticket, error: ticketError } = await supabase
    .from('client_tickets')
    .insert({
      tenant_id: auth.tenant_id,
      branch_id: branchId,
      user_id: auth.user_id,
      asunto: asunto,
      estatus: 'abierto'
    })
    .select()
    .single()

  if (ticketError) return { success: false, error: ticketError.message }

  const { error: msgError } = await supabase
    .from('client_ticket_messages')
    .insert({
      tenant_id: auth.tenant_id,
      ticket_id: ticket.id,
      user_id: auth.user_id,
      mensaje: mensajeInicial
    })

  if (msgError) return { success: false, error: msgError.message }

  // Notificar a todos los superadmins
  const { data: superadmins } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('rol', 'super_admin')

  if (superadmins) {
    for (const admin of superadmins) {
      await crearNotificacion(supabaseAdmin, {
        userId: admin.id,
        titulo: 'Nuevo ticket de cliente',
        cuerpo: asunto,
        tipo: 'ticket_nuevo_cliente',
        url: `/superadmin/tickets-clientes/${ticket.id}`,
        entidadId: ticket.id
      })
    }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: 'abrió un nuevo ticket de soporte',
    tabla_afectada: 'client_tickets',
    registro_id: ticket.id,
    valor_nuevo: ticket
  })

  return { success: true, data: ticket }
}

export async function enviarMensajeTicketCliente(ticketId: string, mensaje: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Verificar que el ticket existe y es accesible
  const { data: ticket, error: ticketCheckError } = await supabase
    .from('client_tickets')
    .select('id, asignado_a, estatus, asunto')
    .eq('id', ticketId)
    .single()

  if (ticketCheckError || !ticket) return { success: false, error: 'Ticket no encontrado o sin acceso' }

  const { data: nuevoMensaje, error: msgError } = await supabase
    .from('client_ticket_messages')
    .insert({
      tenant_id: auth.tenant_id,
      ticket_id: ticketId,
      user_id: auth.user_id,
      mensaje: mensaje
    })
    .select('id, mensaje, timestamp, user_id, user:users(nombre, avatar_url, rol)')
    .single()

  if (msgError) return { success: false, error: msgError.message }

  // Si estaba cerrado, reabrirlo
  if (ticket.estatus === 'cerrado') {
    await supabase
      .from('client_tickets')
      .update({ estatus: 'abierto', fecha_cierre: null })
      .eq('id', ticketId)
  }

  // Notificar al superadmin asignado, o a todos si no hay
  const adminsToNotify = []
  if (ticket.asignado_a) {
    adminsToNotify.push({ id: ticket.asignado_a })
  } else {
    const { data: superadmins } = await supabaseAdmin.from('users').select('id').eq('rol', 'super_admin')
    if (superadmins) adminsToNotify.push(...superadmins)
  }

  for (const admin of adminsToNotify) {
    await crearNotificacion(supabaseAdmin, {
      userId: admin.id,
      titulo: 'Nueva respuesta del cliente',
      cuerpo: ticket.asunto,
      tipo: 'respuesta_cliente',
      url: `/superadmin/tickets-clientes/${ticket.id}`,
      entidadId: ticket.id
    })
  }

  return { success: true, data: nuevoMensaje }
}
