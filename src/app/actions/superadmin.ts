'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'

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
export async function getDashboardData() {
  try {
    const { supabase } = await requireSuperAdmin()

    const { data: organizaciones } = await supabase
      .from('organizaciones')
      .select('estado, fecha_vencimiento')

    let organizacionesActivas = 0
    let organizacionesTrial = 0
    let organizacionesVencidas = 0
    let organizacionesSuspendidas = 0
    let trialsPorVencer = 0

    const now = new Date()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    organizaciones?.forEach(o => {
      if (o.estado === 'activo') organizacionesActivas++
      if (o.estado === 'trial') {
        organizacionesTrial++
        if (o.fecha_vencimiento && new Date(o.fecha_vencimiento) <= in3Days) {
          trialsPorVencer++
        }
      }
      if (o.estado === 'vencido') organizacionesVencidas++
      if (o.estado === 'suspendido') organizacionesSuspendidas++
    })

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: cuotas } = await supabase
      .from('message_quotas')
      .select('cantidad')
      .eq('tipo', 'consumo')
      .gte('created_at', startOfMonth)
    
    const totalMensajesMes = cuotas?.reduce((acc, curr) => acc + curr.cantidad, 0) || 0

    const { count: erroresSinResolver } = await supabase
      .from('error_logs')
      .select('*', { count: 'exact', head: true })
      .eq('resuelto', false)

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
  const { supabase } = await requireSuperAdmin()

  let query = supabase
    .from('organizaciones')
    .select(`
      id, nombre, estado, plan_id, fecha_vencimiento, id_vendedor, created_at,
      plans (nombre),
      vendedores (nombre)
    `)
    .order('created_at', { ascending: false })

  if (filtro && filtro !== 'Todos') {
    query = query.eq('estado', filtro.toLowerCase())
  }

  const { data, error } = await query
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
        organizaciones (nombre, estado, plan_id, plans(nombre))
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
  notas?: string
}) {
  const { supabase, userId } = await requireSuperAdmin()

  // Invitar al vendedor por email para que tenga acceso
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`
  })

  if (inviteError || !inviteData?.user) {
    return { success: false, error: inviteError?.message || 'Error al invitar al vendedor' }
  }

  // Crear registro en users con rol vendedor
  await supabaseAdmin.from('users').insert([{
    id: inviteData.user.id,
    email: data.email,
    nombre: data.nombre,
    rol: 'vendedor',
    activo: true,
    invitacion_aceptada: false
  }])

  // Crear registro en vendedores
  const { data: result, error } = await supabase
    .from('vendedores')
    .insert([{
      user_id: inviteData.user.id,
      nombre: data.nombre,
      email: data.email,
      comision_conversion_pct: data.comision_conversion_pct,
      comision_mrr_pct: data.comision_mrr_pct,
      notas: data.notas || null,
      activo: true
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  // Log
  await supabase.from('comisiones_log').insert({
    comision_id: result.id,
    accion: 'crear_vendedor',
    user_id: userId,
    valor_anterior: null,
    valor_nuevo: { nombre: data.nombre, email: data.email }
  }) // no bloquear si falla el log

  revalidatePath('/superadmin/vendedores')
  return { success: true, vendedor: result }
}

// E) actualizarVendedor
export async function actualizarVendedor(id: string, data: {
  nombre?: string
  comision_conversion_pct?: number
  comision_mrr_pct?: number
  activo?: boolean
  notas?: string
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

// F) getPlanes
export async function getPlanes() {
  const { supabase } = await requireSuperAdmin()
  const { data, error } = await supabase.from('plans').select('*').order('precio_usd', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, planes: data }
}

// G) actualizarPlan
export async function actualizarPlan(id: string, data: any) {
  const { supabase } = await requireSuperAdmin()
  const { data: result, error } = await supabase.from('plans').update(data).eq('id', id).select().single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/planes')
  return { success: true, plan: result }
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

  revalidatePath('/superadmin/comisiones')
  return { success: true, comision: result }
}

// M) crearComisionManual
export async function crearComisionManual(data: {
  vendedor_id: string
  organizacion_id: string
  tipo: 'conversion' | 'mrr_mensual'
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
        organizaciones (nombre, estado, plan_id, plans(nombre, precio_usd))
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
        organizaciones (nombre, estado, plan_id, plans(nombre))
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
