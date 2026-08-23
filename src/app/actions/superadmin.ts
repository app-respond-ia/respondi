'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { registrarAuditoria } from '@/lib/auditoria'
import { crearNotificacion, notificarATodosLosSuperadmins, notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'
import { setImpersonatedTenantId, clearImpersonatedTenantId } from '@/lib/impersonate'

// Helper de auth para asegurar que la action solo la ejecuta un super admin
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No autorizado')

  const { data: userData } = await supabase
    .from('users')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (userData?.rol !== 'super_admin') {
    throw new Error('No autorizado. Se requiere rol super_admin')
  }

  return { supabase, userId: session.user.id }
}

// A) getDashboardData
export async function getDashboardData(from?: string, to?: string) {
  try {
    const { supabase } = await requireSuperAdmin()

    const now = new Date()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    
    // Si no hay rango, por defecto usamos los últimos 30 días
    const startDate = from ? new Date(from).toISOString() : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = to ? new Date(to).toISOString() : now.toISOString()

    const [
      organizacionesRes,
      cuotasRes,
      erroresRes
    ] = await Promise.allSettled([
      supabase.from('organizaciones').select('estado, fecha_inicio, fecha_vencimiento, plans(precio_usd)'),
      supabase.from('message_quotas').select('cantidad').eq('tipo', 'consumo').gte('timestamp', startDate).lte('timestamp', endDate),
      supabase.from('error_logs').select('*', { count: 'exact', head: true }).eq('resuelto', false)
    ])

    const organizaciones = organizacionesRes.status === 'fulfilled' ? organizacionesRes.value.data || [] : []
    const cuotas = cuotasRes.status === 'fulfilled' ? cuotasRes.value.data || [] : []
    const erroresSinResolver = erroresRes.status === 'fulfilled' ? (erroresRes.value.count || 0) : 0

    let organizacionesActivas = 0
    let organizacionesTrial = 0
    let organizacionesVencidas = 0
    let organizacionesSuspendidas = 0
    let trialsPorVencer = 0
    let mrrReal = 0
    
    let nuevasOrganizaciones = 0
    let conversionesEnRango = 0
    let churnEnRango = 0

    organizaciones?.forEach(o => {
      // Snapshot states
      if (o.estado === 'activo') {
        organizacionesActivas++
        if (o.plans && (o.plans as any).precio_usd) {
          mrrReal += Number((o.plans as any).precio_usd)
        }
      }
      if (o.estado === 'trial') {
        organizacionesTrial++
        if (o.fecha_vencimiento && new Date(o.fecha_vencimiento) <= in3Days) {
          trialsPorVencer++
        }
      }
      if (o.estado === 'vencido') organizacionesVencidas++
      if (o.estado === 'suspendido') organizacionesSuspendidas++
      
      // Range metrics
      if (o.fecha_inicio) {
        const fInicio = new Date(o.fecha_inicio)
        if (fInicio >= new Date(startDate) && fInicio <= new Date(endDate)) {
          nuevasOrganizaciones++
          if (o.estado === 'activo') {
            conversionesEnRango++
          }
        }
      }
      
      if (o.fecha_vencimiento && (o.estado === 'vencido' || o.estado === 'suspendido')) {
        const fVencimiento = new Date(o.fecha_vencimiento)
        if (fVencimiento >= new Date(startDate) && fVencimiento <= new Date(endDate)) {
          churnEnRango++
        }
      }
    })

    const tasaConversion = nuevasOrganizaciones > 0 ? (conversionesEnRango / nuevasOrganizaciones) * 100 : 0
    const totalMensajesMes = cuotas?.reduce((acc, curr) => acc + curr.cantidad, 0) || 0

    return {
      success: true,
      data: {
        organizacionesPorEstado: {
          activos: organizacionesActivas,
          trial: organizacionesTrial,
          vencidos: organizacionesVencidas,
          suspendidos: organizacionesSuspendidas,
          total: organizaciones?.length || 0
        },
        mrrReal,
        nuevasOrganizaciones,
        tasaConversion,
        churnEnRango,
        trialsPorVencer,
        totalMensajesMes,
        erroresSinResolver: erroresSinResolver || 0
      }
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error cargando dashboard', data: null }
  }
}

// B) getOrganizaciones
export async function getOrganizaciones(filtro?: string) {
  const { userId } = await requireSuperAdmin()
  void userId // verificación de auth; la query usa supabaseAdmin para evitar RLS en el join con vendedores

  let query = supabaseAdmin
    .from('organizaciones')
    .select(`
      id, nombre, estado, plan_id, plan_pendiente_id, fecha_vencimiento, id_vendedor, created_at,
      plans!plan_id (nombre),
      vendedor_clientes ( vendedores (nombre) )
    `)
    .order('created_at', { ascending: false })

  if (filtro && filtro !== 'Todos') {
    query = query.eq('estado', filtro.toLowerCase())
  }

  const { data, error } = await query

  if (error) return { success: false, error: error.message }
  return { success: true, organizaciones: data }
}

export async function entrarComoOrganizacion(organizacionId: string) {
  const { supabase, userId } = await requireSuperAdmin()
  
  await setImpersonatedTenantId(organizacionId)
  
  await supabase.from('audit_log').insert({
    tenant_id: organizacionId,
    user_id: null,
    actuado_como_id: userId,
    accion: 'inicio_impersonacion',
    tabla_afectada: 'organizaciones',
    registro_id: organizacionId
  })
  
  return { success: true }
}

export async function salirDeImpersonacion() {
  const { supabase, userId } = await requireSuperAdmin()
  
  await clearImpersonatedTenantId()
  
  await supabase.from('audit_log').insert({
    tenant_id: null,
    user_id: null,
    actuado_como_id: userId,
    accion: 'fin_impersonacion',
    tabla_afectada: 'organizaciones'
  })
  
  return { success: true }
}

// B2) cambiarPlanOrganizacion
export async function cambiarPlanOrganizacion(organizacionId: string, nuevoPlanId: string) {
  const { supabase, userId } = await requireSuperAdmin()

  const { data: org } = await supabase.from('organizaciones').select('plan_id, plans!plan_id(precio_usd)').eq('id', organizacionId).single()
  const { data: nuevoPlan } = await supabase.from('plans').select('nombre, precio_usd').eq('id', nuevoPlanId).single()

  if (!org || !nuevoPlan) return { success: false, error: 'Organización o plan no encontrados' }

  const precioActual = org.plans ? Number((org.plans as any).precio_usd) : 0
  const nuevoPrecio = Number(nuevoPlan.precio_usd)

  let updates: any = {}
  let inmediate = false
  if (nuevoPrecio >= precioActual) {
    // Upgrade o lateral: aplicar inmediato y limpiar pendiente
    updates = { plan_id: nuevoPlanId, plan_pendiente_id: null }
    inmediate = true
  } else {
    // Downgrade: programar para la renovación
    updates = { plan_pendiente_id: nuevoPlanId }
  }

  const { error } = await supabase.from('organizaciones').update(updates).eq('id', organizacionId)
  if (error) return { success: false, error: error.message }

  await supabase.from('audit_log').insert({
    tenant_id: organizacionId,
    user_id: userId,
    accion: 'cambiar_plan',
    tabla_afectada: 'organizaciones',
    registro_id: organizacionId,
    valor_anterior: { plan_id: org.plan_id },
    valor_nuevo: updates
  })

  if (inmediate) {
    await notificarAAdminsDeOrganizacion(supabaseAdmin, organizacionId, {
      tipo: 'cambio_plan_aplicado',
      titulo: 'Plan actualizado',
      cuerpo: `Tu organización ha cambiado al plan ${nuevoPlan.nombre}.`,
      url: '/dashboard'
    })
  }

  revalidatePath('/superadmin/organizaciones')
  return { success: true }
}

// B3) registrarPagoYRenovar
export async function registrarPagoYRenovar(organizacionId: string, importe: number, moneda: string, notas?: string) {
  const { supabase, userId } = await requireSuperAdmin()

  const { data: org } = await supabase.from('organizaciones').select('fecha_vencimiento, plan_pendiente_id, plan_id, estado').eq('id', organizacionId).single()
  if (!org) return { success: false, error: 'Organización no encontrada' }

  let baseDate = new Date()
  if (org.fecha_vencimiento) {
    const v = new Date(org.fecha_vencimiento)
    if (v > baseDate) {
      baseDate = v
    }
  }
  
  // sumar 1 mes
  baseDate.setMonth(baseDate.getMonth() + 1)
  const nuevaFecha = baseDate.toISOString().split('T')[0]

  let updates: any = { 
    fecha_vencimiento: nuevaFecha, 
    estado: 'activo'
  }

  if (org.plan_pendiente_id) {
    updates.plan_id = org.plan_pendiente_id
    updates.plan_pendiente_id = null
  }

  const { error } = await supabase.from('organizaciones').update(updates).eq('id', organizacionId)
  if (error) return { success: false, error: error.message }

  const { error: billingErr } = await supabase.from('billing').insert({
    tenant_id: organizacionId,
    plan_id: updates.plan_id || org.plan_id,
    importe_usd: importe,
    moneda,
    estado: 'confirmado',
    notas
  })
  if (billingErr) console.error('Error insertando en billing:', billingErr)

  await supabase.from('audit_log').insert({
    tenant_id: organizacionId,
    user_id: userId,
    accion: 'registrar_pago_renovar',
    tabla_afectada: 'organizaciones',
    registro_id: organizacionId,
    valor_anterior: { fecha_vencimiento: org.fecha_vencimiento, estado: org.estado, plan_id: org.plan_id },
    valor_nuevo: updates
  })

  const notifRes = await notificarAAdminsDeOrganizacion(supabaseAdmin, organizacionId, {
    tipo: 'pago_confirmado',
    titulo: 'Pago confirmado',
    cuerpo: `Se ha procesado un pago de ${importe} ${moneda}. Renovación hasta el ${nuevaFecha}.`,
    url: '/dashboard'
  })
  
  if (!notifRes.success) {
    return { success: false, error: 'La renovación funcionó pero la notificación falló: ' + notifRes.error }
  }

  if (org.plan_pendiente_id) {
    const { data: planDown } = await supabase.from('plans').select('nombre').eq('id', org.plan_pendiente_id).single()
    if (planDown) {
      await notificarAAdminsDeOrganizacion(supabaseAdmin, organizacionId, {
        tipo: 'cambio_plan_aplicado',
        titulo: 'Nuevo plan activo',
        cuerpo: `Tu cuenta ha cambiado al plan ${planDown.nombre} tras la renovación.`,
        url: '/dashboard'
      })
    }
  }

  revalidatePath('/superadmin/organizaciones')
  return { success: true }
}


export async function getOrganizacionesBasico() {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from('organizaciones')
    .select('id, nombre, estado')
    .in('estado', ['activo', 'trial'])
    .order('nombre', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, organizaciones: data }
}

// C) getVendedores (superadmin)
export async function getVendedores() {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from('vendedores')
    .select(`
      *,
      vendedor_clientes (
        id,
        estado_seguimiento,
        organizaciones (nombre, estado, plan_id, plans!plan_id(nombre))
      ),
      vendedor_notas (
        id,
        nota,
        created_at,
        user_id,
        users (nombre)
      )
    `)
    .order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }
  return { success: true, vendedores: data }
}

// D) crearVendedor
export async function crearVendedor(data: {
  nombre: string
  email: string
  comision_conversion_pct: number
  comision_mrr_pct: number
  telefono?: string
  dni_nif?: string
  direccion?: any
}) {
  const { supabase, userId } = await requireSuperAdmin()

  // Verificar si el email ya existe en la tabla users
  const { data: userExistente } = await supabase
    .from('users')
    .select('id, rol')
    .eq('email', data.email)
    .single()

  if (userExistente) {
    if (userExistente.rol === 'vendedor') {
      return { success: false, error: 'Este email ya tiene una cuenta de vendedor en Respondi.' }
    }
    return { success: false, error: 'Este email ya está registrado en Respondi con otro rol. Usa un email diferente.' }
  }

  // Verificar si ya existe en vendedores
  const { data: vendedorExistente } = await supabase
    .from('vendedores')
    .select('id')
    .eq('email', data.email)
    .single()

  if (vendedorExistente) {
    return { success: false, error: 'Ya existe un vendedor con este email.' }
  }

  // Invitar al vendedor por email
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`
  })

  if (inviteError || !inviteData?.user) {
    // Manejar error específico de email ya existente en Auth
    const errMsg = inviteError?.message || ''
    if (errMsg.includes('already been registered') || errMsg.includes('already exists')) {
      return { success: false, error: 'Este email ya tiene una cuenta en Respondi. Usa un email diferente.' }
    }
    return { success: false, error: errMsg || 'Error al enviar la invitación al vendedor.' }
  }

  // Crear registro en users con rol vendedor
  const { error: userErr } = await supabaseAdmin.from('users').insert([{
    id: inviteData.user.id,
    email: data.email,
    nombre: data.nombre,
    rol: 'vendedor',
    activo: true,
    invitacion_aceptada: false
  }])

  if (userErr) {
    // Rollback: eliminar el usuario de Auth si falla el insert en users
    await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
    return { success: false, error: 'Error al crear el usuario. Inténtalo de nuevo.' }
  }

  // Crear registro en vendedores
  const { data: result, error } = await supabase
    .from('vendedores')
    .insert([{
      user_id: inviteData.user.id,
      nombre: data.nombre,
      email: data.email,
      comision_conversion_pct: data.comision_conversion_pct,
      comision_mrr_pct: data.comision_mrr_pct,
      telefono: data.telefono || null,
      dni_nif: data.dni_nif || null,
      direccion: data.direccion || {},
      activo: true
    }])
    .select()
    .single()

  if (error) {
    // Rollback completo
    await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
    await supabaseAdmin.from('users').delete().eq('id', inviteData.user.id)
    return { success: false, error: error.message }
  }

  await supabase.from('audit_log').insert({
    tenant_id: null,
    user_id: userId,
    accion: 'crear_vendedor',
    tabla_afectada: 'vendedores',
    registro_id: result.id,
    valor_anterior: null,
    valor_nuevo: { nombre: data.nombre, email: data.email }
  })

  revalidatePath('/superadmin/vendedores')
  return { success: true, vendedor: result }
}

// E) actualizarVendedor
export async function actualizarVendedor(id: string, data: {
  nombre?: string
  comision_conversion_pct?: number
  comision_mrr_pct?: number
  activo?: boolean
  telefono?: string
  dni_nif?: string
  direccion?: any
}) {
  const { supabase, userId } = await requireSuperAdmin()

  const { data: anterior } = await supabase.from('vendedores').select('*').eq('id', id).single()

  const { data: result, error } = await supabase
    .from('vendedores')
    .update(data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  // Log (usamos el id del vendedor como referencia en comisiones_log de forma genérica)
  await supabase.from('audit_log').insert({
    tenant_id: null,
    user_id: userId,
    accion: 'actualizar_vendedor',
    tabla_afectada: 'vendedores',
    registro_id: id,
    valor_anterior: anterior,
    valor_nuevo: data
  })

  revalidatePath('/superadmin/vendedores')
  return { success: true, vendedor: result }
}

// E2) añadirNotaVendedor
export async function añadirNotaVendedor(vendedor_id: string, nota: string) {
  const { supabase, userId } = await requireSuperAdmin()

  if (!nota.trim()) return { success: false, error: 'La nota no puede estar vacía' }

  const { data, error } = await supabase
    .from('vendedor_notas')
    .insert([{
      vendedor_id,
      user_id: userId,
      nota: nota.trim()
    }])
    .select('*, users(nombre)')
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/superadmin/vendedores')
  return { success: true, nota: data }
}

// E3) getVendedorDetalle
export async function getVendedorDetalle(vendedorId: string) {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from('vendedores')
    .select(`
      *,
      vendedor_notas (id, nota, created_at, user_id, users(nombre))
    `)
    .eq('id', vendedorId)
    .single()
  
  if (error) return { success: false, error: error.message }
  return { success: true, vendedor: data }
}

// E4) getClientesDeVendedor
export async function getClientesDeVendedor(vendedorId: string) {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from('vendedor_clientes')
    .select(`
      *, 
      organizaciones (
        nombre, 
        estado, 
        plan_id, 
        plans!plan_id(nombre, precio_usd)
      )
    `)
    .eq('vendedor_id', vendedorId)
    .order('fecha_vinculacion', { ascending: false })
  
  if (error) return { success: false, error: error.message }
  return { success: true, clientes: data }
}

// E5) getComisionesDeVendedor
export async function getComisionesDeVendedor(vendedorId: string) {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase
    .from('comisiones')
    .select('*, organizaciones(nombre)')
    .eq('vendedor_id', vendedorId)
    .order('fecha_generacion', { ascending: false })
  
  if (error) return { success: false, error: error.message }
  return { success: true, comisiones: data }
}

// F) getPlanes
export async function getPlanes() {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase.from('plans').select('*').order('precio_usd', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, planes: data }
}

export async function crearPlan(data: any) {
  const { supabase } = await requireSuperAdmin()
  const { data: result, error } = await supabase.from('plans').insert(data).select().single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/planes')
  return { success: true, plan: result }
}

// G) actualizarPlan
export async function actualizarPlan(id: string, data: any) {
  const { supabase } = await requireSuperAdmin()
  const { data: result, error } = await supabase.from('plans').update(data).eq('id', id).select().single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/planes')
  return { success: true, plan: result }
}

export async function eliminarPlan(id: string) {
  const { supabase } = await requireSuperAdmin()
  // Check if any organization uses this plan
  const { count, error: countError } = await supabase
    .from('organizaciones')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', id)
    
  if (countError) return { success: false, error: countError.message }
  if (count && count > 0) return { success: false, error: 'No se puede eliminar este plan porque hay organizaciones usándolo.' }

  const { error } = await supabase.from('plans').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/planes')
  return { success: true }
}

// H) getErrores
export async function getErrores(filtro?: 'sin_resolver' | 'resuelto') {
  const { supabase } = await requireSuperAdmin()

  let query = supabase
    .from('error_logs')
    .select(`*, organizaciones (nombre)`)
    .order('timestamp', { ascending: false })
    .limit(100)

  if (filtro === 'resuelto') query = query.eq('resuelto', true)
  if (filtro === 'sin_resolver') query = query.eq('resuelto', false)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, errores: data }
}

// I) resolverError
export async function resolverError(id: string) {
  const { supabase } = await requireSuperAdmin()
  const { error } = await supabase.from('error_logs').update({ resuelto: true }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/errores')
  revalidatePath('/superadmin')
  return { success: true }
}

// ============================================================
// COMISIONES (superadmin)
// ============================================================

// J) getComisiones
export async function getComisiones(filtros?: {
  vendedor_id?: string
  estado?: string
  tipo?: string
}) {
  const { supabase } = await requireSuperAdmin()

  let query = supabase
    .from('comisiones')
    .select(`
      *,
      vendedores (nombre, email),
      organizaciones (nombre)
    `)
    .order('fecha_generacion', { ascending: false })

  if (filtros?.vendedor_id) query = query.eq('vendedor_id', filtros.vendedor_id)
  if (filtros?.estado) query = query.eq('estado', filtros.estado)
  if (filtros?.tipo) query = query.eq('tipo', filtros.tipo)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, comisiones: data }
}

// K) aprobarComision
export async function aprobarComision(id: string) {
  const { supabase, userId } = await requireSuperAdmin()

  const { data: anterior } = await supabase.from('comisiones').select('*').eq('id', id).single()

  const { data: result, error } = await supabase
    .from('comisiones')
    .update({
      estado: 'aprobada',
      fecha_aprobacion: new Date().toISOString(),
      aprobado_por: userId
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await supabase.from('comisiones_log').insert({
    comision_id: id,
    accion: 'aprobar',
    user_id: userId,
    valor_anterior: { estado: anterior?.estado },
    valor_nuevo: { estado: 'aprobada' }
  })

  if (anterior?.vendedor_id) {
    const { data: vendedor } = await supabase.from('vendedores').select('user_id').eq('id', anterior.vendedor_id).single()
    if (vendedor?.user_id) {
      await crearNotificacion(supabaseAdmin, {
        userId: vendedor.user_id,
        tipo: 'comision_aprobada',
        titulo: 'Comisión aprobada',
        cuerpo: `Una comisión de ${anterior.importe} ${anterior.moneda} ha sido aprobada.`,
        url: '/vendedor/comisiones',
        entidadId: anterior.id
      })
    }
  }

  revalidatePath('/superadmin/comisiones')
  return { success: true, comision: result }
}

// L) marcarComisionPagada
export async function marcarComisionPagada(id: string, notas_pago?: string) {
  const { supabase, userId } = await requireSuperAdmin()

  const { data: anterior } = await supabase.from('comisiones').select('*').eq('id', id).single()

  const { data: result, error } = await supabase
    .from('comisiones')
    .update({
      estado: 'pagada',
      fecha_pago: new Date().toISOString(),
      notas_pago: notas_pago || null
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await supabase.from('comisiones_log').insert({
    comision_id: id,
    accion: 'marcar_pagada',
    user_id: userId,
    valor_anterior: { estado: anterior?.estado },
    valor_nuevo: { estado: 'pagada', notas_pago }
  })

  if (anterior?.vendedor_id) {
    const { data: vendedor } = await supabase.from('vendedores').select('user_id').eq('id', anterior.vendedor_id).single()
    if (vendedor?.user_id) {
      await crearNotificacion(supabaseAdmin, {
        userId: vendedor.user_id,
        tipo: 'comision_pagada',
        titulo: 'Comisión pagada',
        cuerpo: `Una comisión de ${anterior.importe} ${anterior.moneda} ha sido pagada.`,
        url: '/vendedor/comisiones',
        entidadId: anterior.id
      })
    }
  }

  revalidatePath('/superadmin/comisiones')
  return { success: true, comision: result }
}

// M) crearComisionManual
export async function crearComisionManual(data: {
  vendedor_id: string
  organizacion_id: string
  tipo: 'conversion' | 'mrr_mensual' | 'manual'
  importe: number
  moneda: string
  mes_referencia?: string
  notas_pago?: string
}) {
  const { supabase, userId } = await requireSuperAdmin()

  const { data: result, error } = await supabase
    .from('comisiones')
    .insert([{
      ...data,
      estado: 'pendiente',
      fecha_generacion: new Date().toISOString()
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await supabase.from('comisiones_log').insert({
    comision_id: result.id,
    accion: 'crear_manual',
    user_id: userId,
    valor_anterior: null,
    valor_nuevo: data
  })

  await notificarATodosLosSuperadmins(supabaseAdmin, {
    tipo: 'comision_pendiente',
    titulo: 'Nueva comisión pendiente',
    cuerpo: `Se ha creado una comisión manual de ${data.importe} ${data.moneda}.`,
    url: '/superadmin/comisiones',
    entidadId: result.id
  })

  revalidatePath('/superadmin/comisiones')
  return { success: true, comision: result }
}

// ============================================================
// VENDEDOR (panel propio)
// ============================================================

async function requireVendedor() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No autorizado')

  const { data: userData } = await supabase
    .from('users')
    .select('rol')
    .eq('id', session.user.id)
    .single()

  if (userData?.rol !== 'vendedor') throw new Error('No autorizado')

  const { data: vendedor } = await supabase
    .from('vendedores')
    .select('*')
    .eq('user_id', session.user.id)
    .single()

  if (!vendedor) throw new Error('Vendedor no encontrado')

  return { supabase, vendedor, userId: session.user.id }
}

// N) getVendedorDashboard
export async function getVendedorDashboard() {
  try {
    const { supabase, vendedor } = await requireVendedor()

    const { data: clientes } = await supabase
      .from('vendedor_clientes')
      .select(`
        *,
        organizaciones (nombre, estado, plan_id, plans!plan_id(nombre, precio_usd))
      `)
      .eq('vendedor_id', vendedor.id)

    const { data: comisiones } = await supabase
      .from('comisiones')
      .select('tipo, importe, moneda, estado, mes_referencia')
      .eq('vendedor_id', vendedor.id)

    const totalClientes = clientes?.length || 0
    const clientesActivos = clientes?.filter(c => c.estado_seguimiento === 'activo').length || 0
    const clientesTrial = clientes?.filter(c => c.estado_seguimiento === 'trial').length || 0

    const comisionesPendientes = comisiones?.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0) || 0
    const comisionesAprobadas = comisiones?.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0) || 0
    const comisionesPagadas = comisiones?.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0) || 0

    // MRR estimado de la cartera
    const mrrCartera = clientes?.reduce((acc, c) => {
      const precio = (c.organizaciones as any)?.plans?.precio_usd || 0
      const activo = c.estado_seguimiento === 'activo'
      return activo ? acc + Number(precio) : acc
    }, 0) || 0

    return {
      success: true,
      data: {
        vendedor,
        totalClientes,
        clientesActivos,
        clientesTrial,
        mrrCartera,
        comisionesPendientes,
        comisionesAprobadas,
        comisionesPagadas
      }
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// O) getVendedorClientes
export async function getVendedorClientes() {
  try {
    const { supabase, vendedor } = await requireVendedor()

    const { data, error } = await supabase
      .from('vendedor_clientes')
      .select(`
        *,
        organizaciones (nombre, estado, plan_id, plans!plan_id(nombre))
      `)
      .eq('vendedor_id', vendedor.id)
      .order('fecha_vinculacion', { ascending: false })

    if (error) return { success: false, error: error.message }
    return { success: true, clientes: data, vendedor }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// P) actualizarClienteSeguimiento
export async function actualizarClienteSeguimiento(id: string, data: {
  estado_seguimiento?: string
  notas?: string
}) {
  try {
    const { supabase, vendedor } = await requireVendedor()

    const { data: result, error } = await supabase
      .from('vendedor_clientes')
      .update(data)
      .eq('id', id)
      .eq('vendedor_id', vendedor.id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, cliente: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Q) getVendedorComisiones
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

// R) crearCuentaTrial (vendedor crea un cliente nuevo)
export async function crearCuentaTrial(data: {
  nombre_organizacion: string
  email_admin: string
  nombre_admin?: string
}) {
  try {
    const { supabase, vendedor } = await requireVendedor()

    // Buscar plan trial
    const { data: planTrial } = await supabase
      .from('plans')
      .select('id')
      .eq('nombre', 'Trial')
      .single()

    if (!planTrial) return { success: false, error: 'Plan Trial no encontrado' }

    // Invitar al admin de la nueva organización
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email_admin, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`
    })

    if (inviteError || !inviteData?.user) {
      return { success: false, error: inviteError?.message || 'Error al invitar al administrador' }
    }

    // Crear organización
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

    // Crear sucursal principal
    const { data: sucursal } = await supabaseAdmin
      .from('sucursales')
      .insert([{
        tenant_id: org.id,
        nombre: data.nombre_organizacion,
        onboarding_completado: false
      }])
      .select()
      .single()

    // Crear usuario admin
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
      await supabaseAdmin.from('user_branches').insert([{
        user_id: inviteData.user.id,
        branch_id: sucursal.id
      }])
    }

    // Vincular organización al vendedor
    await supabase.from('vendedor_clientes').insert([{
      vendedor_id: vendedor.id,
      organizacion_id: org.id,
      estado_seguimiento: 'trial'
    }])

    return { success: true, organizacion: org }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarEstadoOrganizacion(id: string, estado: string) {
  try {
    const { userId } = await requireSuperAdmin()
    // Usamos supabaseAdmin para bypassear RLS y poder leer/escribir organizaciones sin restricciones

    const { data: anterior } = await supabaseAdmin
      .from('organizaciones')
      .select('estado')
      .eq('id', id)
      .single()

    const { error } = await supabaseAdmin
      .from('organizaciones')
      .update({ estado })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    await registrarAuditoria({
      tenant_id: id,
      user_id: userId,
      accion: `un super-admin cambió el estado de la organización a "${estado}"`,
      tabla_afectada: 'organizaciones',
      registro_id: id,
      valor_anterior: anterior,
      valor_nuevo: { estado }
    })

    if (anterior?.estado === 'trial' && estado === 'activo') {
      const { data: vinculo } = await supabaseAdmin.from('vendedor_clientes').select('vendedor_id, vendedores(user_id)').eq('organizacion_id', id).single()
      const vendedorUserId = (vinculo?.vendedores as any)?.user_id
      if (vendedorUserId) {
        const { data: orgInfo } = await supabaseAdmin.from('organizaciones').select('nombre').eq('id', id).single()
        await crearNotificacion(supabaseAdmin, {
          userId: vendedorUserId,
          tipo: 'conversion',
          titulo: '¡Nuevo cliente convertido!',
          cuerpo: `El cliente ${orgInfo?.nombre} ha pasado a un plan de pago.`,
          url: '/vendedor/clientes',
          entidadId: id
        })
      }
    }

    if (estado === 'suspendido' && anterior?.estado !== 'suspendido') {
      await notificarAAdminsDeOrganizacion(supabaseAdmin, id, {
        tipo: 'cuenta_suspendida',
        titulo: 'Tu cuenta ha sido suspendida',
        cuerpo: 'El acceso y los servicios de tu cuenta han sido suspendidos. Por favor, contacta con soporte para resolverlo.',
        url: '/dashboard'
      })
    } else if (estado === 'activo' && anterior?.estado === 'suspendido') {
      await notificarAAdminsDeOrganizacion(supabaseAdmin, id, {
        tipo: 'cuenta_reactivada',
        titulo: 'Tu cuenta ha sido reactivada',
        cuerpo: 'Se ha restaurado el acceso y los servicios de tu cuenta. ¡Bienvenido de nuevo!',
        url: '/dashboard'
      })
    }

    revalidatePath('/superadmin/organizaciones')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ----------------------------------------------------------------------
// SOPORTE TICKETS
// ----------------------------------------------------------------------

export async function getTicketsSoporte() {
  try {
    const { supabase, userId } = await requireSuperAdmin()
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        vendedores ( nombre ),
        ticket_categorias ( id, nombre, color ),
        asignado_a_user:users!support_tickets_asignado_a_fkey ( id, nombre, email ),
        support_ticket_messages ( mensaje, timestamp ),
        tickets_fijados ( id )
      `)
      .order('fecha_apertura', { ascending: false })

    if (error) throw error

    // Transform to pick only the last message
    const formatted = tickets?.map(t => {
      // sort messages by timestamp desc to get the last one
      const sortedMessages = (t.support_ticket_messages || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      return {
        ...t,
        ultimo_mensaje: sortedMessages.length > 0 ? sortedMessages[0] : null,
        fijado: t.tickets_fijados && t.tickets_fijados.length > 0
      }
    })

    return { success: true, data: formatted }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getTicketDetalleSuperadmin(ticketId: string) {
  try {
    const { supabase, userId } = await requireSuperAdmin()
    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        vendedores ( nombre, user_id ),
        ticket_categorias ( id, nombre, color ),
        asignado_a_user:users!support_tickets_asignado_a_fkey ( id, nombre, email ),
        support_ticket_messages (
          id,
          mensaje,
          timestamp,
          user_id,
          users!support_ticket_messages_user_id_fkey ( rol, nombre, avatar_url )
        )
      `)
      .eq('id', ticketId)
      .single()

    if (error) throw error
    if (!ticket) throw new Error('Ticket no encontrado')

    // Sort messages ascending
    if (ticket.support_ticket_messages) {
      ticket.support_ticket_messages.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }

    return { success: true, data: ticket }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function asignarCategoriaPrioridad(ticketId: string, categoriaId: string | null, prioridad: string) {
  try {
    const { supabase, userId } = await requireSuperAdmin()
    const { error } = await supabaseAdmin
      .from('support_tickets')
      .update({ categoria_id: categoriaId, prioridad })
      .eq('id', ticketId)

    if (error) throw error
    
    await registrarAuditoria({
      tenant_id: null,
      user_id: userId,
      accion: 'actualizar_ticket',
      tabla_afectada: 'support_tickets',
      registro_id: ticketId,
      valor_nuevo: { categoria_id: categoriaId, prioridad }
    })

    revalidatePath(`/superadmin/tickets/${ticketId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function responderTicket(ticketId: string, mensaje: string) {
  try {
    const { supabase, userId } = await requireSuperAdmin()
    if (!mensaje || mensaje.trim() === '') return { success: false, error: 'Mensaje vacío' }

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('vendedores ( user_id )')
      .eq('id', ticketId)
      .single()
    if (ticketError || !ticket) throw new Error('Ticket no encontrado')

    const vendedorUserId = (ticket.vendedores as any)?.user_id

    const { error } = await supabaseAdmin
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        mensaje: mensaje.trim()
      })

    if (error) throw error

    if (vendedorUserId) {
      await crearNotificacion(supabaseAdmin, {
        userId: vendedorUserId,
        tipo: 'soporte_respuesta',
        titulo: 'Nueva respuesta de soporte',
        cuerpo: 'Soporte ha respondido a tu ticket.',
        url: `/vendedor/soporte/${ticketId}`,
        entidadId: ticketId
      })
    }

    revalidatePath(`/superadmin/tickets/${ticketId}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function cambiarEstatusTicket(ticketId: string, estatus: 'abierto' | 'cerrado') {
  try {
    const { supabase, userId } = await requireSuperAdmin()
    const { error } = await supabaseAdmin
      .from('support_tickets')
      .update({ 
        estatus,
        fecha_cierre: estatus === 'cerrado' ? new Date().toISOString() : null
      })
      .eq('id', ticketId)

    if (error) throw error

    await registrarAuditoria({
      tenant_id: null,
      user_id: userId,
      accion: 'estatus_ticket',
      tabla_afectada: 'support_tickets',
      registro_id: ticketId,
      valor_nuevo: { estatus }
    })

    revalidatePath(`/superadmin/tickets/${ticketId}`)
    revalidatePath(`/superadmin/tickets`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ----------------------------------------------------------------------
// GESTIÓN DE CATEGORÍAS DE TICKETS
// ----------------------------------------------------------------------

export async function getCategoriasTickets() {
  try {
    const { supabase } = await requireSuperAdmin()
    const { data, error } = await supabase
      .from('ticket_categorias')
      .select('*')
      .order('nombre', { ascending: true })
      
    if (error) throw error
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function crearCategoriaTicket(nombre: string, color: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    const { error } = await supabase
      .from('ticket_categorias')
      .insert({ nombre: nombre.trim(), color })
      
    if (error) throw error
    revalidatePath('/superadmin/tickets')
    revalidatePath('/superadmin/tickets/categorias')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarCategoriaTicket(id: string, nombre: string, color: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    const { error } = await supabase
      .from('ticket_categorias')
      .update({ nombre: nombre.trim(), color })
      .eq('id', id)
      
    if (error) throw error
    revalidatePath('/superadmin/tickets')
    revalidatePath('/superadmin/tickets/categorias')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function borrarCategoriaTicket(id: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    
    // Check if category is used
    const { count, error: countError } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('categoria_id', id)
      
    if (countError) throw countError
    if (count && count > 0) {
      return { success: false, error: 'No se puede borrar porque hay tickets asociados a esta categoría.' }
    }

    const { error } = await supabase
      .from('ticket_categorias')
      .delete()
      .eq('id', id)
      
    if (error) throw error
    revalidatePath('/superadmin/tickets')
    revalidatePath('/superadmin/tickets/categorias')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ----------------------------------------------------------------------
// ASIGNACIÓN DE TICKETS
// ----------------------------------------------------------------------

export async function getSuperadmins() {
  try {
    const { supabase } = await requireSuperAdmin()
    const { data, error } = await supabase
      .from('users')
      .select('id, nombre, email')
      .eq('rol', 'super_admin')
      .order('nombre', { ascending: true })
      
    if (error) throw error
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function asignarTicket(ticketId: string, asignadoA: string | null) {
  try {
    const { supabase, userId } = await requireSuperAdmin()
    const { error } = await supabaseAdmin
      .from('support_tickets')
      .update({ asignado_a: asignadoA })
      .eq('id', ticketId)
      
    if (error) throw error
    
    await registrarAuditoria({
      tenant_id: null,
      user_id: userId,
      accion: 'asignar_ticket',
      tabla_afectada: 'support_tickets',
      registro_id: ticketId,
      valor_nuevo: { asignado_a: asignadoA }
    })

    revalidatePath(`/superadmin/tickets/${ticketId}`)
    revalidatePath('/superadmin/tickets')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarPerfilSuperadmin(nombre: string, apodo: string, avatarUrl?: string) {
  try {
    const { userId } = await requireSuperAdmin()
    if (!nombre || nombre.trim() === '') {
      return { success: false, error: 'El nombre no puede estar vacío' }
    }

    const updatePayload: any = { nombre: nombre.trim(), apodo: apodo.trim() }
    if (avatarUrl !== undefined) {
      updatePayload.avatar_url = avatarUrl
    }

    const { data: anterior } = await supabaseAdmin.from('users').select('nombre, apodo, avatar_url').eq('id', userId).single()

    const { error: errUsers } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('id', userId)

    if (errUsers) throw new Error('Error al actualizar usuario: ' + errUsers.message)

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: null,
      user_id: userId,
      accion: 'actualizar_perfil',
      tabla_afectada: 'users',
      registro_id: userId,
      valor_anterior: anterior,
      valor_nuevo: updatePayload
    })

    revalidatePath('/superadmin')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function cambiarContrasenaSuperadmin(password: string) {
  try {
    const { supabase, userId } = await requireSuperAdmin()

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

    revalidatePath('/superadmin')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ============================================================================
// TICKETS DE CLIENTES (SOPORTE)
// ============================================================================

export async function getCategoriasTicketsClientes() {
  try {
    await requireSuperAdmin()
    const { data, error } = await supabaseAdmin
      .from('client_ticket_categorias')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function crearCategoriaTicketCliente(nombre: string, color: string) {
  try {
    await requireSuperAdmin()
    const { data, error } = await supabaseAdmin
      .from('client_ticket_categorias')
      .insert({ nombre, color })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function actualizarCategoriaTicketCliente(id: string, nombre: string, color: string) {
  try {
    await requireSuperAdmin()
    const { data, error } = await supabaseAdmin
      .from('client_ticket_categorias')
      .update({ nombre, color })
      .eq('id', id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function borrarCategoriaTicketCliente(id: string) {
  try {
    await requireSuperAdmin()
    const { count, error: countError } = await supabaseAdmin
      .from('client_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('categoria_id', id)

    if (countError) return { success: false, error: countError.message }
    if (count && count > 0) return { success: false, error: 'No se puede borrar porque hay tickets usando esta categoría' }

    const { error } = await supabaseAdmin
      .from('client_ticket_categorias')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function getTicketsClientesSoporte() {
  try {
    await requireSuperAdmin()
    const { data, error } = await supabaseAdmin
      .from('client_tickets')
      .select(`
        *,
        categoria:categoria_id(nombre, color),
        organizacion:tenant_id(nombre),
        sucursal:branch_id(nombre),
        creador:user_id(nombre, email),
        mensajes:client_ticket_messages(mensaje, timestamp),
        tickets_fijados ( user_id )
      `)
      .order('fecha_apertura', { ascending: false })

    if (error) return { success: false, error: error.message }

    const formatted = data?.map(t => {
      const sortedMessages = (t.mensajes || []).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      return {
        ...t,
        ultimo_mensaje: sortedMessages.length > 0 ? sortedMessages[0] : null,
        fijado: t.tickets_fijados && t.tickets_fijados.length > 0
      }
    })

    return { success: true, data: formatted || [] }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function getTicketDetalleClienteSuperadmin(ticketId: string) {
  try {
    await requireSuperAdmin()
    const { data, error } = await supabaseAdmin
      .from('client_tickets')
      .select(`
        *,
        categoria:categoria_id(nombre, color),
        organizacion:tenant_id(nombre),
        sucursal:branch_id(nombre),
        creador:user_id(nombre, email, avatar_url),
        asignado:asignado_a(nombre, avatar_url),
        mensajes:client_ticket_messages(
          id,
          mensaje,
          timestamp,
          user_id,
          user:users(nombre, email, rol, avatar_url)
        )
      `)
      .eq('id', ticketId)
      .single()

    if (error) return { success: false, error: error.message }
    if (data?.mensajes) {
      data.mensajes.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }
    return { success: true, data }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function asignarCategoriaPrioridadCliente(ticketId: string, categoriaId: string | null, prioridad: string) {
  try {
    await requireSuperAdmin()
    const { error } = await supabaseAdmin
      .from('client_tickets')
      .update({ categoria_id: categoriaId, prioridad })
      .eq('id', ticketId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function asignarTicketCliente(ticketId: string, userId: string | null) {
  try {
    await requireSuperAdmin()
    const { error } = await supabaseAdmin
      .from('client_tickets')
      .update({ asignado_a: userId })
      .eq('id', ticketId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function cambiarEstatusTicketCliente(ticketId: string, estatus: string) {
  try {
    await requireSuperAdmin()
    const fecha_cierre = estatus === 'cerrado' ? new Date().toISOString() : null

    const { data: ticket, error } = await supabaseAdmin
      .from('client_tickets')
      .update({ estatus, fecha_cierre })
      .eq('id', ticketId)
      .select('user_id, asunto')
      .single()

    if (error) return { success: false, error: error.message }
    
    if (estatus === 'cerrado') {
      await crearNotificacion(supabaseAdmin, {
        userId: ticket.user_id,
        tipo: 'soporte_respuesta',
        titulo: 'Ticket cerrado',
        cuerpo: `El ticket "${ticket.asunto}" ha sido cerrado.`,
        url: `/dashboard/soporte/${ticketId}`,
        entidadId: ticketId
      })
    }
    
    return { success: true }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function responderTicketCliente(ticketId: string, mensaje: string) {
  try {
    const { userId } = await requireSuperAdmin()
    const { data: ticket, error: tErr } = await supabaseAdmin
      .from('client_tickets')
      .select('tenant_id, user_id, asunto, estatus')
      .eq('id', ticketId)
      .single()
      
    if (tErr || !ticket) return { success: false, error: 'Ticket no encontrado' }

    const { data: nuevoMensaje, error: msgError } = await supabaseAdmin
      .from('client_ticket_messages')
      .insert({
        tenant_id: ticket.tenant_id,
        ticket_id: ticketId,
        user_id: userId,
        mensaje: mensaje
      })
      .select('id, mensaje, timestamp, user_id, user:users(nombre, avatar_url, rol)')
      .single()

    if (msgError) return { success: false, error: msgError.message }

    if (ticket.estatus === 'cerrado') {
      await supabaseAdmin
        .from('client_tickets')
        .update({ estatus: 'abierto', fecha_cierre: null })
        .eq('id', ticketId)
    }

    await crearNotificacion(supabaseAdmin, {
      userId: ticket.user_id,
      tipo: 'soporte_respuesta',
      titulo: 'Nueva respuesta en soporte',
      cuerpo: `Han respondido a tu ticket "${ticket.asunto}".`,
      url: `/dashboard/soporte/${ticketId}`,
      entidadId: ticketId
    })

    return { success: true, data: nuevoMensaje }
  } catch (err: any) { return { success: false, error: err.message } }
}
