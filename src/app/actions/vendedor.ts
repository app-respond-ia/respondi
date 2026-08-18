'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarAuditoria } from '@/lib/auditoria'
import { crearNotificacion } from '@/lib/notificaciones'

async function requireVendedor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: userData } = await supabase
    .from('users')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (userData?.rol !== 'vendedor') throw new Error('No autorizado')

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!vendedor) throw new Error('Vendedor no encontrado')
  return { supabase, vendedor, userId: user.id }
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
        cuerpo: `El cliente ${orgInfo?.nombre} ha sido marcado como "en riesgo". Revisa su estado.`
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
    const { supabase, vendedor } = await requireVendedor()

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
      data: { vendedor, totalClientes, clientesActivos, clientesTrial, mrrCartera, comisionesPendientes, comisionesAprobadas, comisionesPagadas }
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

    const { data: planTrial } = await supabase.from('plans').select('id').eq('nombre', 'Trial').single()
    if (!planTrial) return { success: false, error: 'Plan Trial no encontrado' }

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email_admin, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`
    })

    if (inviteError || !inviteData?.user) {
      return { success: false, error: inviteError?.message || 'Error al invitar al administrador' }
    }

    const fechaVencimiento = new Date()
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 14)

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizaciones')
      .insert([{
        nombre: data.nombre_organizacion,
        plan_id: planTrial.id,
        estado: 'trial',
        fecha_vencimiento: fechaVencimiento.toISOString(),
        id_vendedor: vendedor.id
      }])
      .select()
      .single()

    if (orgError) {
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
      return { success: false, error: orgError.message }
    }

    const { data: sucursal } = await supabaseAdmin
      .from('sucursales')
      .insert([{ tenant_id: org.id, nombre: data.nombre_organizacion, onboarding_completado: false }])
      .select()
      .single()

    await supabaseAdmin.from('users').insert([{
      id: inviteData.user.id,
      tenant_id: org.id,
      branch_id: sucursal?.id,
      email: data.email_admin,
      nombre: data.nombre_admin || null,
      rol: 'admin',
      activo: true,
      invitacion_aceptada: false
    }])

    if (sucursal) {
      await supabaseAdmin.from('user_branches').insert([{ user_id: inviteData.user.id, branch_id: sucursal.id }])
    }

    await supabase.from('vendedor_clientes').insert([{
      vendedor_id: vendedor.id,
      organizacion_id: org.id,
      estado_seguimiento: 'trial'
    }])

    await registrarAuditoria({
      tenant_id: org.id,
      user_id: vendedor.user_id,
      accion: `el vendedor "${vendedor.nombre}" creó esta cuenta trial`,
      tabla_afectada: 'organizaciones',
      registro_id: org.id,
      valor_nuevo: org
    })

    return { success: true, organizacion: org }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarPerfilVendedor(nombre: string) {
  try {
    const { supabase, vendedor, userId } = await requireVendedor()
    if (!nombre || nombre.trim() === '') {
      return { success: false, error: 'El nombre no puede estar vacío' }
    }

    const { error: errUsers } = await supabaseAdmin
      .from('users')
      .update({ nombre: nombre.trim() })
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

    await supabaseAdmin.from('audit_log').insert({
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
    revalidatePath('/vendedor')
    
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

    await supabaseAdmin.from('audit_log').insert({
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

    // TODO: Notificar al superadmin si se requiere en un futuro.

    return { success: true, ticket }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getTicketsVendedor() {
  try {
    const { supabase, vendedor } = await requireVendedor()
    
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('vendedor_id', vendedor.id)
      .order('fecha_apertura', { ascending: false })

    if (error) throw new Error(error.message)
    return { success: true, tickets: data }
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
      .select('*, users(nombre, email)')
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
      .select('id, estatus')
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
      .select('*, users(nombre, email)')
      .single()

    if (errMsg) throw new Error(errMsg.message)

    return { success: true, mensaje: nuevoMensaje }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
