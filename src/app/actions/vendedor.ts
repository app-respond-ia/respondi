'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'

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

    return { success: true, organizacion: org }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
