'use server'

import { createClient } from '@/utils/supabase/server'
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

  return supabase
}

// A) getDashboardData
export async function getDashboardData() {
  try {
    const supabase = await requireSuperAdmin()

    // Comercios por estado
    const { data: comercios } = await supabase
      .from('organizaciones')
      .select('estado, fecha_vencimiento')

    let comerciosActivos = 0
    let comerciosTrial = 0
    let comerciosVencidos = 0
    let comerciosSuspendidos = 0
    let trialsPorVencer = 0

    const now = new Date()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    comercios?.forEach(c => {
      if (c.estado === 'activo') comerciosActivos++
      if (c.estado === 'trial') {
        comerciosTrial++
        if (c.fecha_vencimiento && new Date(c.fecha_vencimiento) <= in3Days) {
          trialsPorVencer++
        }
      }
      if (c.estado === 'vencido') comerciosVencidos++
      if (c.estado === 'suspendido') comerciosSuspendidos++
    })

    // Mensajes IA del mes
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: cuotas } = await supabase
      .from('message_quotas')
      .select('cantidad')
      .eq('tipo', 'consumo')
      .gte('created_at', startOfMonth)
    
    const totalMensajesMes = cuotas?.reduce((acc, curr) => acc + curr.cantidad, 0) || 0

    // Errores sin resolver
    const { count: erroresSinResolver } = await supabase
      .from('error_logs')
      .select('*', { count: 'exact', head: true })
      .eq('resuelto', false)

    return {
      success: true,
      data: {
        comerciosPorEstado: {
          activos: comerciosActivos,
          trial: comerciosTrial,
          vencidos: comerciosVencidos,
          suspendidos: comerciosSuspendidos,
          total: comercios?.length || 0
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

// B) getComercios
export async function getComercios(filtro?: string) {
  const supabase = await requireSuperAdmin()

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
  return { success: true, comercios: data }
}

// C) getVendedores
export async function getVendedores() {
  const supabase = await requireSuperAdmin()
  const { data, error } = await supabase.from('vendedores').select('*').order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }
  return { success: true, vendedores: data }
}

// D) crearVendedor
export async function crearVendedor(data: any) {
  const supabase = await requireSuperAdmin()
  const { data: result, error } = await supabase.from('vendedores').insert([data]).select().single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/vendedores')
  return { success: true, vendedor: result }
}

// E) actualizarVendedor
export async function actualizarVendedor(id: string, data: any) {
  const supabase = await requireSuperAdmin()
  const { data: result, error } = await supabase.from('vendedores').update(data).eq('id', id).select().single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/vendedores')
  return { success: true, vendedor: result }
}

// F) getPlanes
export async function getPlanes() {
  const supabase = await requireSuperAdmin()
  const { data, error } = await supabase.from('plans').select('*').order('precio_usd', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, planes: data }
}

// G) actualizarPlan
export async function actualizarPlan(id: string, data: any) {
  const supabase = await requireSuperAdmin()
  const { data: result, error } = await supabase.from('plans').update(data).eq('id', id).select().single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/planes')
  return { success: true, plan: result }
}

// H) getErrores
export async function getErrores(filtro?: 'sin_resolver' | 'resuelto') {
  const supabase = await requireSuperAdmin()

  let query = supabase
    .from('error_logs')
    .select(`
      *,
      organizaciones (nombre)
    `)
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
  const supabase = await requireSuperAdmin()
  const { error } = await supabase.from('error_logs').update({ resuelto: true }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/superadmin/errores')
  revalidatePath('/superadmin')
  return { success: true }
}
