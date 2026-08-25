'use server'
import { superadminHasPermission } from '@/lib/permisosSuperadmin'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { registrarAuditoria } from '@/lib/auditoria'
import { crearNotificacion, notificarATodosLosSuperadmins, notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'
import { setImpersonatedTenantId, clearImpersonatedTenantId } from '@/lib/impersonate'

// Helper de auth para asegurar que la action solo la ejecuta un super admin
export async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No autorizado')

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('rol, superadmin_rol_id, superadmin_roles(*)')
    .eq('id', session.user.id)
    .single()

  if (userData?.rol !== 'super_admin') {
    throw new Error('No autorizado. Se requiere rol super_admin')
  }

  const roleData = Array.isArray(userData.superadmin_roles) 
    ? userData.superadmin_roles[0] 
    : userData.superadmin_roles

  const userLevel = roleData?.nivel ?? 5
  const userPermisos = roleData?.permisos ?? []
  const esPropietario = roleData?.es_propietario ?? false

  return { 
    supabase, 
    userId: session.user.id, 
    userLevel, 
    userPermisos, 
    esPropietario,
    roleData
  }
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
      supabase.from('organizaciones').select('estado, fecha_inicio, fecha_vencimiento, plans!plan_id(precio_usd)'),
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

export async function getEvolucionNegocio(from?: string, to?: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    
    const now = new Date()
    const startDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const endDate = to ? new Date(to) : now

    // Necesitamos TODAS las organizaciones para calcular el MRR en cualquier punto del tiempo.
    const { data: organizaciones, error } = await supabase
      .from('organizaciones')
      .select('estado, fecha_inicio, fecha_vencimiento, plans!plan_id(precio_usd)')
      
    if (error) throw error

    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    const granularity = diffDays > 365 ? 'mes' : diffDays > 90 ? 'semana' : 'dia'

    const dataPoints = []
    let current = new Date(startDate)
    current.setHours(0, 0, 0, 0)
    
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)

    while (current <= end) {
      const bucketEnd = new Date(current)
      let label = ''
      
      if (granularity === 'dia') {
        bucketEnd.setHours(23, 59, 59, 999)
        label = current.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
      } else if (granularity === 'semana') {
        bucketEnd.setDate(current.getDate() + 6)
        bucketEnd.setHours(23, 59, 59, 999)
        if (bucketEnd > end) bucketEnd.setTime(end.getTime())
        label = `Sem. ${current.getDate()} ${current.toLocaleDateString('es-ES', { month: 'short' })}`
      } else {
        bucketEnd.setMonth(current.getMonth() + 1)
        bucketEnd.setDate(0)
        bucketEnd.setHours(23, 59, 59, 999)
        if (bucketEnd > end) bucketEnd.setTime(end.getTime())
        label = current.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      }

      let nuevas = 0
      let bajas = 0
      let mrrSnapshot = 0

      organizaciones.forEach(o => {
        const fInicio = o.fecha_inicio ? new Date(o.fecha_inicio) : null
        const fVencimiento = o.fecha_vencimiento ? new Date(o.fecha_vencimiento) : null
        const precio = o.plans && (o.plans as any).precio_usd ? Number((o.plans as any).precio_usd) : 0

        if (fInicio && fInicio >= current && fInicio <= bucketEnd) nuevas++
        
        if ((o.estado === 'vencido' || o.estado === 'suspendido') && fVencimiento && fVencimiento >= current && fVencimiento <= bucketEnd) {
          bajas++
        }

        if (fInicio && fInicio <= bucketEnd) {
          if (!fVencimiento || fVencimiento > bucketEnd) {
            if (o.estado !== 'trial') { // Aproximación para no contar las que sabemos que 100% no llegaron a pagar
              mrrSnapshot += precio
            }
          }
        }
      })

      dataPoints.push({
        fecha: label,
        timestamp: current.getTime(),
        nuevasOrganizaciones: nuevas,
        bajas,
        mrr: mrrSnapshot
      })

      if (granularity === 'dia') {
        current.setDate(current.getDate() + 1)
      } else if (granularity === 'semana') {
        current.setDate(current.getDate() + 7)
      } else {
        current.setMonth(current.getMonth() + 1)
        current.setDate(1)
      }
    }

    return { success: true, data: dataPoints }
  } catch (err: any) {
    return { success: false, error: err.message, data: null }
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
  const auth = await requireSuperAdmin()
  
  if (!superadminHasPermission(auth, 'organizaciones', 'escritura')) {
    return { success: false, error: 'No tienes permiso de escritura para impersonar' }
  }

  const { supabase, userId } = auth
  
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
    const auth = await requireSuperAdmin()
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, nombre, email, activo, superadmin_rol_id, superadmin_roles(nombre, nivel, es_propietario)')
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

export async function actualizarPerfilSuperadmin(nombre: string, apodo: string, color: string | null, avatarUrl?: string) {
  try {
    const { userId } = await requireSuperAdmin()
    if (!nombre || nombre.trim() === '') {
      return { success: false, error: 'El nombre no puede estar vacío' }
    }

    const updatePayload: any = { nombre: nombre.trim(), apodo: apodo.trim() || null, color }
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
// ==========================================
// ROLES Y PERMISOS DE SUPERADMIN
// ==========================================

export async function canManageSuperadminRole(userId: string, targetRoleLevel: number) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('superadmin_rol_id, superadmin_roles(nivel, es_propietario)')
    .eq('id', userId)
    .single()

  if (!user) return { allowed: false, error: 'Usuario no encontrado' }
  
  const roleData = Array.isArray(user.superadmin_roles) 
    ? user.superadmin_roles[0] 
    : user.superadmin_roles

  if (roleData?.es_propietario) return { allowed: true, userLevel: 1 }

  const userLevel = roleData?.nivel ?? 5

  if (userLevel >= targetRoleLevel) {
    return { 
      allowed: false, 
      error: 'No tienes jerarquía suficiente para gestionar roles de este nivel' 
    }
  }

  return { allowed: true, userLevel }
}

export async function getSuperadminRoles() {
  try {
    const auth = await requireSuperAdmin()

    const { data, error } = await supabaseAdmin
      .from('superadmin_roles')
      .select('*')
      .order('nivel', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al cargar los roles' }
  }
}

export async function getMisPermisosSuperadmin() {
  try {
    const auth = await requireSuperAdmin()
    return { 
      success: true, 
      userLevel: auth.userLevel, 
      permisos: auth.userPermisos, 
      esPropietario: auth.esPropietario 
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function crearSuperadminRol(data: {
  nombre: string
  descripcion?: string
  nivel?: number
  permisos: { seccion: string, nivel: string }[]
}) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'gestion_superadmins', 'escritura')) {
      return { success: false, error: 'No tienes permiso para crear roles' }
    }
    
    const newLevel = data.nivel ?? 5
    if (newLevel <= 1) return { success: false, error: 'No se pueden crear roles de nivel 1 manualmente' }

    const check = await canManageSuperadminRole(auth.userId, newLevel)
    if (!check.allowed) return { success: false, error: check.error }

    const { data: result, error } = await supabaseAdmin
      .from('superadmin_roles')
      .insert([{
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        nivel: newLevel,
        permisos: data.permisos
      }])
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarSuperadminRol(id: string, data: {
  nombre?: string
  descripcion?: string
  nivel?: number
  permisos?: { seccion: string, nivel: string }[]
}) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'gestion_superadmins', 'escritura')) {
      return { success: false, error: 'No tienes permiso para editar roles' }
    }

    const { data: targetRole } = await supabaseAdmin
      .from('superadmin_roles')
      .select('*')
      .eq('id', id)
      .single()

    if (!targetRole) return { success: false, error: 'Rol no encontrado' }
    if (targetRole.es_propietario) return { success: false, error: 'El rol Propietario no se puede editar' }
    
    const check = await canManageSuperadminRole(auth.userId, targetRole.nivel)
    if (!check.allowed) return { success: false, error: check.error }

    if (data.nivel && data.nivel !== targetRole.nivel) {
      if (data.nivel <= 1) return { success: false, error: 'No se puede cambiar un rol a nivel 1' }
      const newCheck = await canManageSuperadminRole(auth.userId, data.nivel)
      if (!newCheck.allowed) return { success: false, error: newCheck.error }
    }

    const { data: result, error } = await supabaseAdmin
      .from('superadmin_roles')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function eliminarSuperadminRol(id: string) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'gestion_superadmins', 'escritura')) {
      return { success: false, error: 'No tienes permiso para eliminar roles' }
    }

    const { data: targetRole } = await supabaseAdmin
      .from('superadmin_roles')
      .select('*')
      .eq('id', id)
      .single()

    if (!targetRole) return { success: false, error: 'Rol no encontrado' }
    if (targetRole.es_propietario) return { success: false, error: 'El rol Propietario no se puede eliminar' }
    
    const check = await canManageSuperadminRole(auth.userId, targetRole.nivel)
    if (!check.allowed) return { success: false, error: check.error }

    const { error } = await supabaseAdmin
      .from('superadmin_roles')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}


export async function asignarRolSuperadmin(targetUserId: string, rolId: string | null) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'gestion_superadmins', 'escritura')) {
      return { success: false, error: 'No tienes permiso para gestionar superadmins' }
    }

    // Comprobar rol actual del target
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('superadmin_rol_id, superadmin_roles(nivel, es_propietario)')
      .eq('id', targetUserId)
      .single()

    if (!targetUser) return { success: false, error: 'Usuario no encontrado' }
    
    const currentTargetRole = Array.isArray(targetUser.superadmin_roles) 
      ? targetUser.superadmin_roles[0] 
      : targetUser.superadmin_roles

    const currentTargetLevel = currentTargetRole?.nivel ?? 5

    // No puedes quitarle rol a alguien de mayor nivel
    const checkUser = await canManageSuperadminRole(auth.userId, currentTargetLevel)
    if (!checkUser.allowed && currentTargetRole?.es_propietario !== true) { // Propietarios pueden modificar a cualquiera si ellos son propietarios
        if (!auth.esPropietario) {
            return { success: false, error: 'No tienes permiso para modificar a este usuario' }
        }
    }

    // Comprobar el rol que se quiere asignar
    if (rolId) {
      const { data: targetRole } = await supabaseAdmin
        .from('superadmin_roles')
        .select('*')
        .eq('id', rolId)
        .single()
      
      if (!targetRole) return { success: false, error: 'Rol no encontrado' }
      
      const checkRole = await canManageSuperadminRole(auth.userId, targetRole.nivel)
      if (!checkRole.allowed) return { success: false, error: 'No tienes permiso para asignar este rol' }
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ superadmin_rol_id: rolId })
      .eq('id', targetUserId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ============================================================
// FASE 2: RENDIMIENTO DE VENDEDORES (Visión General)
// ============================================================

export async function getRendimientoVendedores(from?: string, to?: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    
    const { data: vendedores, error } = await supabase.from('vendedores').select(`
      id,
      nombre,
      vendedor_clientes ( id, fecha_vinculacion ),
      comisiones ( importe, estado, fecha_generacion, fecha_pago, moneda )
    `)
    
    if (error) throw error

    let fromDate = from ? new Date(from) : null
    let toDate = to ? new Date(to) : null

    // Asegurarse de que toDate llega a final del día si no tiene hora específica
    if (toDate && to && to.length <= 10) {
      toDate.setHours(23, 59, 59, 999)
    }

    const isInRange = (dateString: string | null) => {
      if (!dateString) return false
      const d = new Date(dateString)
      if (fromDate && d < fromDate) return false
      if (toDate && d > toDate) return false
      return true
    }

    const stats = (vendedores || []).map(v => {
      const clientes = v.vendedor_clientes || []
      const comisiones = v.comisiones || []

      const clientesHistoricos = clientes.length
      const clientesCaptadosEnRango = from || to ? clientes.filter((c: any) => isInRange(c.fecha_vinculacion)).length : clientesHistoricos

      let comisionesGeneradasEnRango = 0
      let comisionesPagadasEnRango = 0
      let comisionesPendientes = 0

      comisiones.forEach((c: any) => {
        const importe = Number(c.importe) || 0

        // Comisiones pendientes (sin filtro de fecha porque es estado actual)
        if (c.estado === 'pendiente') {
          comisionesPendientes += importe
        }

        // Comisiones generadas en rango
        if (isInRange(c.fecha_generacion)) {
          comisionesGeneradasEnRango += importe
        }

        // Comisiones pagadas en rango
        if (c.estado === 'pagada' && isInRange(c.fecha_pago)) {
          comisionesPagadasEnRango += importe
        }
      })

      return {
        id: v.id,
        nombre: v.nombre,
        clientesCaptadosEnRango,
        clientesHistoricos,
        comisionesGeneradasEnRango,
        comisionesPagadasEnRango,
        comisionesPendientes
      }
    }).filter(v => v.clientesHistoricos > 0 || v.comisionesGeneradasEnRango > 0 || v.comisionesPendientes > 0 || v.comisionesPagadasEnRango > 0)

    // Ordenar por defecto por comisionesGeneradasEnRango DESC
    stats.sort((a, b) => b.comisionesGeneradasEnRango - a.comisionesGeneradasEnRango)

    return { success: true, data: stats }
  } catch (err: any) {
    return { success: false, error: err.message, data: [] }
  }
}

// ============================================================
// FASE 3: CALIDAD DE SOPORTE (Visión General)
// ============================================================

export async function getCalidadSoporte(from?: string, to?: string, superadminId?: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    
    // Fetch all support tickets (vendedores) and client tickets (clientes)
    let querySupport = supabase.from('support_tickets').select('fecha_apertura, fecha_cierre, calificacion, fecha_calificacion, asignado_a')
    let queryClient = supabase.from('client_tickets').select('fecha_apertura, fecha_cierre, calificacion, fecha_calificacion, asignado_a')

    if (superadminId && superadminId !== 'todos') {
      querySupport = querySupport.eq('asignado_a', superadminId)
      queryClient = queryClient.eq('asignado_a', superadminId)
    }

    const [supportRes, clientRes] = await Promise.all([querySupport, queryClient])
    if (supportRes.error) throw supportRes.error
    if (clientRes.error) throw clientRes.error

    const supportTickets = supportRes.data || []
    const clientTickets = clientRes.data || []

    const now = new Date()
    const startDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    let endDate = to ? new Date(to) : now
    if (to && to.length <= 10) endDate.setHours(23, 59, 59, 999)

    // Helper: is in range
    const isInRange = (dateString: string | null) => {
      if (!dateString) return false
      const d = new Date(dateString)
      return d >= startDate && d <= endDate
    }

    // Calcular KPIs resumen
    const calcKPIs = (tickets: any[]) => {
      let abiertosEnRango = 0
      let cerradosEnRango = 0
      let sumaHoras = 0
      let countHoras = 0
      let sumaValoracion = 0
      let countValoracion = 0

      tickets.forEach(t => {
        const apertura = t.fecha_apertura ? new Date(t.fecha_apertura) : null
        const cierre = t.fecha_cierre ? new Date(t.fecha_cierre) : null

        if (t.fecha_apertura && isInRange(t.fecha_apertura)) abiertosEnRango++
        if (t.fecha_cierre && isInRange(t.fecha_cierre)) cerradosEnRango++

        if (apertura && cierre && isInRange(t.fecha_cierre)) {
          const diffHoras = (cierre.getTime() - apertura.getTime()) / (1000 * 60 * 60)
          sumaHoras += diffHoras
          countHoras++
        }

        if (t.calificacion !== null && t.fecha_calificacion && isInRange(t.fecha_calificacion)) {
           sumaValoracion += t.calificacion
           countValoracion++
        }
      })

      return {
        abiertosEnRango,
        cerradosEnRango,
        tiempoMedioResolucionHoras: countHoras > 0 ? Number((sumaHoras / countHoras).toFixed(1)) : 0,
        valoracionMedia: countValoracion > 0 ? Number((sumaValoracion / countValoracion).toFixed(1)) : 0
      }
    }

    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    const granularity = diffDays > 365 ? 'mes' : diffDays > 90 ? 'semana' : 'dia'

    const dataPoints = []
    let current = new Date(startDate)
    current.setHours(0, 0, 0, 0)
    
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)

    while (current <= end) {
      const bucketEnd = new Date(current)
      let label = ''
      
      if (granularity === 'dia') {
        bucketEnd.setHours(23, 59, 59, 999)
        label = current.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
      } else if (granularity === 'semana') {
        bucketEnd.setDate(current.getDate() + 6)
        bucketEnd.setHours(23, 59, 59, 999)
        if (bucketEnd > end) bucketEnd.setTime(end.getTime())
        label = `Sem. ${current.getDate()} ${current.toLocaleDateString('es-ES', { month: 'short' })}`
      } else {
        bucketEnd.setMonth(current.getMonth() + 1)
        bucketEnd.setDate(0)
        bucketEnd.setHours(23, 59, 59, 999)
        if (bucketEnd > end) bucketEnd.setTime(end.getTime())
        label = current.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      }

      // Calc medias para bucket
      const calcBucketMedia = (tickets: any[]) => {
        let sum = 0
        let count = 0
        tickets.forEach(t => {
          if (t.calificacion !== null && t.fecha_calificacion) {
            const d = new Date(t.fecha_calificacion)
            if (d >= current && d <= bucketEnd) {
              sum += t.calificacion
              count++
            }
          }
        })
        return count > 0 ? Number((sum / count).toFixed(1)) : null
      }

      dataPoints.push({
        fecha: label,
        timestamp: current.getTime(),
        mediaVendedores: calcBucketMedia(supportTickets),
        mediaClientes: calcBucketMedia(clientTickets)
      })

      if (granularity === 'dia') {
        current.setDate(current.getDate() + 1)
      } else if (granularity === 'semana') {
        current.setDate(current.getDate() + 7)
      } else {
        current.setMonth(current.getMonth() + 1)
        current.setDate(1)
      }
    }

    return { 
      success: true, 
      data: {
        grafico: dataPoints,
        resumen: {
          vendedores: calcKPIs(supportTickets),
          clientes: calcKPIs(clientTickets)
        }
      } 
    }
  } catch (err: any) {
    return { success: false, error: err.message, data: null }
  }
}


export async function getConsumoIA(from?: string, to?: string) {
  try {
    const { supabase } = await requireSuperAdmin()
    
    // Fetch ai_logs
    const { data: logs, error } = await supabase
      .from('ai_logs')
      .select(`
        timestamp,
        tokens_input,
        tokens_output,
        costo_estimado_usd,
        modelo_ia,
        tenant_id,
        organizaciones(nombre)
      `)
      .order('timestamp', { ascending: true })
      
    if (error) throw error

    // filter by dates
    const now = new Date()
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    const toDate = to ? new Date(to) : now
    toDate.setHours(23, 59, 59, 999)

    const validLogs = (logs || []).filter((l: any) => {
      const d = new Date(l.timestamp)
      return d >= fromDate && d <= toDate
    })

    // Resumen
    let tokens_totales = 0
    let costo_total_usd = 0

    validLogs.forEach((l: any) => {
      tokens_totales += (l.tokens_input || 0) + (l.tokens_output || 0)
      costo_total_usd += Number(l.costo_estimado_usd || 0)
    })

    const costo_medio_mensaje_usd = validLogs.length > 0 ? costo_total_usd / validLogs.length : 0

    // Top Organizaciones
    const orgMap: Record<string, { nombre: string, tokens_totales: number, costo_usd: number }> = {}
    
    // Desglose Modelos
    const modelMap: Record<string, { modelo_ia: string, tokens_totales: number, costo_usd: number }> = {}

    validLogs.forEach((l: any) => {
      // org
      const orgId = l.tenant_id
      if (orgId) {
        if (!orgMap[orgId]) {
          orgMap[orgId] = { 
            nombre: l.organizaciones ? (Array.isArray(l.organizaciones) ? l.organizaciones[0]?.nombre : l.organizaciones.nombre) : 'Desconocida', 
            tokens_totales: 0, 
            costo_usd: 0 
          }
        }
        orgMap[orgId].tokens_totales += (l.tokens_input || 0) + (l.tokens_output || 0)
        orgMap[orgId].costo_usd += Number(l.costo_estimado_usd || 0)
      }

      // model
      const mod = l.modelo_ia || 'desconocido'
      if (!modelMap[mod]) {
        modelMap[mod] = { modelo_ia: mod, tokens_totales: 0, costo_usd: 0 }
      }
      modelMap[mod].tokens_totales += (l.tokens_input || 0) + (l.tokens_output || 0)
      modelMap[mod].costo_usd += Number(l.costo_estimado_usd || 0)
    })

    const top_organizaciones = Object.values(orgMap).sort((a, b) => b.costo_usd - a.costo_usd).slice(0, 10)
    
    const desglose_modelos = Object.values(modelMap).map(m => ({
      modelo_ia: m.modelo_ia,
      porcentaje_tokens: tokens_totales > 0 ? (m.tokens_totales / tokens_totales) * 100 : 0,
      costo_usd: m.costo_usd
    })).sort((a, b) => b.costo_usd - a.costo_usd)

    // Grafico
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)
    let granularity: 'dia' | 'semana' | 'mes' = 'dia'
    if (diffDays > 60) granularity = 'semana'
    if (diffDays > 180) granularity = 'mes'

    const dataPoints: { fecha: string; timestamp: number; coste_usd: number }[] = []
    let current = new Date(fromDate)

    while (current <= toDate) {
      let bucketEnd = new Date(current)
      if (granularity === 'dia') {
        bucketEnd.setHours(23, 59, 59, 999)
      } else if (granularity === 'semana') {
        bucketEnd.setDate(bucketEnd.getDate() + 6)
        bucketEnd.setHours(23, 59, 59, 999)
      } else {
        bucketEnd.setMonth(bucketEnd.getMonth() + 1)
        bucketEnd.setDate(0)
        bucketEnd.setHours(23, 59, 59, 999)
      }

      const bucketLogs = validLogs.filter((l: any) => {
        const d = new Date(l.timestamp)
        return d >= current && d <= bucketEnd
      })

      const bucketCost = bucketLogs.reduce((acc: number, l: any) => acc + Number(l.costo_estimado_usd || 0), 0)

      let label = ''
      if (granularity === 'dia') {
        label = current.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      } else if (granularity === 'semana') {
        label = `${current.getDate()} - ${bucketEnd.getDate()} ${bucketEnd.toLocaleDateString('es-ES', { month: 'short' })}`
      } else {
        label = current.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
      }

      dataPoints.push({
        fecha: label,
        timestamp: current.getTime(),
        coste_usd: bucketCost
      })

      if (granularity === 'dia') {
        current.setDate(current.getDate() + 1)
      } else if (granularity === 'semana') {
        current.setDate(current.getDate() + 7)
      } else {
        current.setMonth(current.getMonth() + 1)
        current.setDate(1)
      }
    }

    return {
      success: true,
      data: {
        resumen: {
          tokens_totales,
          costo_total_usd,
          costo_medio_mensaje_usd
        },
        grafico: dataPoints,
        top_organizaciones,
        desglose_modelos
      }
    }

  } catch (err: any) {
    return { success: false, error: err.message, data: null }
  }
}
