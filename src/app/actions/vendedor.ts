'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarAuditoria } from '@/lib/auditoria'
import { crearNotificacion, notificarATodosLosSuperadmins } from '@/lib/notificaciones'
import { registrarError } from '@/lib/errores'
import { enviarEmailInvitacion } from '@/lib/email'

async function requireVendedor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: userData } = await supabase
    .from('users')
    .select('rol, avatar_url, apodo, color')
    .eq('id', user.id)
    .single()

  if (userData?.rol !== 'vendedor') throw new Error('No autorizado')

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!vendedor) throw new Error('Vendedor no encontrado')
  return { supabase, vendedor, userId: user.id, avatarUrl: userData.avatar_url, apodo: userData.apodo, color: userData.color }
}

export async function getVendedorClientes() {
  try {
    const { supabase, vendedor } = await requireVendedor()
    const { data, error } = await supabase
      .from('vendedor_clientes')
      .select(`*, organizaciones (nombre, estado, plan_id, plans(nombre))`)
      .eq('vendedor_id', vendedor.id)
      .order('fecha_vinculacion', { ascending: false })
    if (error) return { success: false, error: error.message }
    return { success: true, clientes: data, vendedor }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarClienteSeguimiento(id: string, data: {
  estado_seguimiento?: string
  notas?: string
}) {
  try {
    const { supabase, vendedor, userId } = await requireVendedor()

    const { data: anterior } = await supabase
      .from('vendedor_clientes')
      .select('*')
      .eq('id', id)
      .single()

    const { data: result, error } = await supabase
      .from('vendedor_clientes')
      .update(data)
      .eq('id', id)
      .eq('vendedor_id', vendedor.id)
      .select()
      .single()
    if (error) return { success: false, error: error.message }

    if (anterior?.estado_seguimiento !== 'en_riesgo' && data.estado_seguimiento === 'en_riesgo') {
      const { data: orgInfo } = await supabaseAdmin.from('organizaciones').select('nombre').eq('id', result.organizacion_id).single()
      await crearNotificacion(supabaseAdmin, {
        userId: userId,
        tipo: 'cliente_riesgo',
        titulo: 'Cliente en riesgo',
        cuerpo: `El cliente ${orgInfo?.nombre} ha sido marcado como "en riesgo". Revisa su estado.`,
        url: '/vendedor/clientes',
        entidadId: result.organizacion_id
      })
    }

    if (result.organizacion_id) {
      await registrarAuditoria({
        tenant_id: result.organizacion_id,
        user_id: userId,
        accion: `el vendedor "${vendedor.nombre}" actualizó el seguimiento de este cliente`,
        tabla_afectada: 'vendedor_clientes',
        registro_id: id,
        valor_anterior: anterior,
        valor_nuevo: result
      })
    }

    return { success: true, cliente: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getVendedorComisiones() {
  try {
    const { supabase, vendedor } = await requireVendedor()
    const { data, error } = await supabase
      .from('comisiones')
      .select(`*, organizaciones (nombre)`)
      .eq('vendedor_id', vendedor.id)
      .order('fecha_generacion', { ascending: false })
    if (error) return { success: false, error: error.message }
    return { success: true, comisiones: data, vendedor }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getVendedorDashboard() {
  try {
    const { supabase, vendedor, avatarUrl, apodo, color } = await requireVendedor()

    const [{ data: clientes }, { data: comisiones }] = await Promise.all([
      supabase.from('vendedor_clientes')
        .select(`*, organizaciones (nombre, estado, plan_id, plans(nombre, precio_usd))`)
        .eq('vendedor_id', vendedor.id),
      supabase.from('comisiones')
        .select('tipo, importe, moneda, estado, mes_referencia')
        .eq('vendedor_id', vendedor.id)
    ])

    const totalClientes = clientes?.length || 0
    const clientesActivos = clientes?.filter(c => c.estado_seguimiento === 'activo').length || 0
    const clientesTrial = clientes?.filter(c => c.estado_seguimiento === 'trial').length || 0
    const comisionesPendientes = comisiones?.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0) || 0
    const comisionesAprobadas = comisiones?.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0) || 0
    const comisionesPagadas = comisiones?.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0) || 0
    const mrrCartera = clientes?.reduce((acc, c) => {
      const precio = (c.organizaciones as any)?.plans?.precio_usd || 0
      return c.estado_seguimiento === 'activo' ? acc + Number(precio) : acc
    }, 0) || 0

    return {
      success: true,
      data: { vendedor, avatarUrl, apodo, color, totalClientes, clientesActivos, clientesTrial, mrrCartera, comisionesPendientes, comisionesAprobadas, comisionesPagadas }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function crearCuentaTrial(data: {
  nombre_organizacion: string
  email_admin: string
  nombre_admin?: string
}) {
  try {
    const { supabase, vendedor } = await requireVendedor()
    // Usar supabaseAdmin importado estáticamente para crear usuarios

    const { data: invitacionCreada, error: invitacionError } = await supabaseAdmin
      .from('invitaciones_pendientes')
      .insert({
        email: data.email_admin,
        tipo: 'admin_trial',
        datos: {
          nombre: data.nombre_admin || null,
          nombre_organizacion: data.nombre_organizacion,
          vendedor_id: vendedor.id
        },
        creado_por: vendedor.user_id
      })
      .select()
      .single()

    if (invitacionError) {
      return { success: false, error: 'Error al crear la invitación. Inténtalo de nuevo.' }
    }

    const { error: emailError } = await enviarEmailInvitacion({
      email: data.email_admin,
      actionLink: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/registro-trial`,
      rol: 'tenant_user'
    })

    if (emailError) {
      await registrarError({
        origen: 'app',
        descripcion: 'Invitación de cliente trial creada pero fallo al enviar el email',
        stacktrace: JSON.stringify(emailError)
      })
    }

    await registrarAuditoria({
      tenant_id: null,
      user_id: vendedor.user_id,
      accion: `el vendedor "${vendedor.nombre}" invitó a crear la cuenta trial "${data.nombre_organizacion}"`,
      tabla_afectada: 'invitaciones_pendientes',
      registro_id: invitacionCreada.id,
      valor_nuevo: { email: data.email_admin, nombre_organizacion: data.nombre_organizacion }
    })

    return { success: true, pendiente: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarPerfilVendedor(nombre: string, apodo: string, color: string | null, avatarUrl?: string) {
  try {
    const { supabase, vendedor, userId } = await requireVendedor()
    if (!nombre || nombre.trim() === '') {
      return { success: false, error: 'El nombre no puede estar vacío' }
    }

    const updatePayload: any = { nombre: nombre.trim(), apodo: apodo.trim() || null, color }
    if (avatarUrl !== undefined) {
      updatePayload.avatar_url = avatarUrl
    }

    const { error: errUsers } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('id', userId)

    if (errUsers) throw new Error('Error al actualizar usuario: ' + errUsers.message)

    const { data: anterior } = await supabaseAdmin.from('vendedores').select('*').eq('id', vendedor.id).single()
    const { data: result, error: errVendedores } = await supabaseAdmin
      .from('vendedores')
      .update({ nombre: nombre.trim() })
      .eq('id', vendedor.id)
      .select()
      .single()

    if (errVendedores) throw new Error('Error al actualizar vendedor: ' + errVendedores.message)

    await registrarAuditoria({
      tenant_id: null,
      user_id: userId,
      accion: 'actualizar_perfil_vendedor',
      tabla_afectada: 'vendedores',
      registro_id: vendedor.id,
      valor_anterior: anterior,
      valor_nuevo: result
    })

    const { revalidatePath } = await import('next/cache')
    revalidatePath('/vendedor/perfil')
    revalidatePath('/vendedor', 'layout')
    
    return { success: true, vendedor: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function cambiarContrasenaVendedor(password: string) {
  try {
    const { supabase, userId } = await requireVendedor()

    if (password.length < 8) {
      return { success: false, error: 'La contraseña debe tener al menos 8 caracteres' }
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { success: false, error: error.message }

    await registrarAuditoria({
      tenant_id: null,
      user_id: userId,
      accion: 'cambiar_contrasena',
      tabla_afectada: 'auth.users',
      registro_id: userId,
      valor_anterior: null,
      valor_nuevo: null
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ==========================================
// SOPORTE (TICKETS)
// ==========================================

export async function crearTicketSoporte(asunto: string, mensajeInicial: string) {
  try {
    const { supabase, vendedor, userId } = await requireVendedor()

    if (!asunto || !asunto.trim()) return { success: false, error: 'El asunto es obligatorio' }
    if (!mensajeInicial || !mensajeInicial.trim()) return { success: false, error: 'El mensaje es obligatorio' }

    // Crear ticket
    const { data: ticket, error: errTicket } = await supabase
      .from('support_tickets')
      .insert({
        vendedor_id: vendedor.id,
        asunto: asunto.trim()
      })
      .select()
      .single()

    if (errTicket) throw new Error(errTicket.message)

    // Crear mensaje inicial
    const { error: errMsg } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        user_id: userId,
        mensaje: mensajeInicial.trim()
      })

    if (errMsg) throw new Error(errMsg.message)

    await registrarAuditoria({
      tenant_id: null,
      user_id: userId,
      accion: 'crear_ticket_soporte',
      tabla_afectada: 'support_tickets',
      registro_id: ticket.id,
      valor_nuevo: ticket
    })

    await notificarATodosLosSuperadmins(supabaseAdmin, {
      tipo: 'ticket_nuevo',
      titulo: 'Nuevo ticket de soporte',
      cuerpo: `El vendedor "${vendedor.nombre}" ha abierto un ticket: ${asunto.trim()}`,
      url: `/superadmin/tickets/${ticket.id}`,
      entidadId: ticket.id
    })

    return { success: true, ticket }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getTicketsVendedor() {
  try {
    const { supabase, vendedor, userId } = await requireVendedor()
    
    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        support_ticket_messages ( mensaje, timestamp ),
        tickets_fijados ( user_id )
      `)
      .eq('vendedor_id', vendedor.id)
      .order('fecha_apertura', { ascending: false })

    if (error) throw new Error(error.message)

    const formatted = data?.map(t => {
      const sortedMessages = (t.support_ticket_messages || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      return {
        ...t,
        ultimo_mensaje: sortedMessages.length > 0 ? sortedMessages[0] : null,
        fijado: t.tickets_fijados && t.tickets_fijados.length > 0
      }
    })

    return { success: true, tickets: formatted }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getTicketDetalle(ticketId: string) {
  try {
    const { supabase, vendedor } = await requireVendedor()

    const { data: ticket, error: errTicket } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .eq('vendedor_id', vendedor.id)
      .single()

    if (errTicket || !ticket) throw new Error('Ticket no encontrado')

    const { data: mensajes, error: errMsgs } = await supabase
      .from('support_ticket_messages')
      .select('*, users(nombre, email, rol)')
      .eq('ticket_id', ticket.id)
      .order('timestamp', { ascending: true })

    if (errMsgs) throw new Error(errMsgs.message)

    return { success: true, ticket, mensajes }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function enviarMensajeTicket(ticketId: string, mensaje: string) {
  try {
    const { supabase, vendedor, userId } = await requireVendedor()

    if (!mensaje || !mensaje.trim()) return { success: false, error: 'El mensaje no puede estar vacío' }

    // Verificar si el ticket existe y es nuestro
    const { data: ticket, error: errTicket } = await supabase
      .from('support_tickets')
      .select('id, estatus, asignado_a')
      .eq('id', ticketId)
      .eq('vendedor_id', vendedor.id)
      .single()

    if (errTicket || !ticket) throw new Error('Ticket no encontrado')

    // Si estaba cerrado, lo reabrimos
    if (ticket.estatus === 'cerrado') {
      await supabase
        .from('support_tickets')
        .update({ estatus: 'abierto', fecha_cierre: null })
        .eq('id', ticket.id)
    }

    const { data: nuevoMensaje, error: errMsg } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        user_id: userId,
        mensaje: mensaje.trim()
      })
      .select('*, users(nombre, email, rol)')
      .single()

    if (errMsg) throw new Error(errMsg.message)

    if (ticket.asignado_a) {
      await crearNotificacion(supabaseAdmin, {
        userId: ticket.asignado_a,
        tipo: 'ticket_respuesta_vendedor',
        titulo: 'Nueva respuesta de vendedor',
        cuerpo: `El vendedor "${vendedor.nombre}" ha respondido a un ticket.`,
        url: `/superadmin/tickets/${ticket.id}`,
        entidadId: ticket.id
      })
    } else {
      await notificarATodosLosSuperadmins(supabaseAdmin, {
        tipo: 'ticket_respuesta_vendedor',
        titulo: 'Nueva respuesta de vendedor',
        cuerpo: `El vendedor "${vendedor.nombre}" ha respondido a un ticket.`,
        url: `/superadmin/tickets/${ticket.id}`,
        entidadId: ticket.id
      })
    }

    return { success: true, mensaje: nuevoMensaje }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function calificarTicketVendedor(ticketId: string, calificacion: number, comentario: string) {
  try {
    const { supabase, vendedor } = await requireVendedor()

    const { error } = await supabase
      .from('support_tickets')
      .update({
        calificacion: calificacion,
        comentario_calificacion: comentario,
        fecha_calificacion: new Date().toISOString()
      })
      .eq('id', ticketId)
      .eq('vendedor_id', vendedor.id)
      .is('calificacion', null)

    if (error) throw new Error(error.message)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
