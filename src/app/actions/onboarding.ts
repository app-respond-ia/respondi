'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function getOnboardingState() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'no_session' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'no_tenant' }

  // Buscar sucursal — primero por branch_id del usuario, luego por tenant_id
  let branchId = userData.branch_id

  if (!branchId) {
    const { data: branch } = await supabase
      .from('sucursales')
      .select('id')
      .eq('tenant_id', userData.tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (branch) {
      branchId = branch.id
      // Asignar branch_id al usuario si no lo tenía
      await supabase
        .from('users')
        .update({ branch_id: branchId })
        .eq('id', user.id)
    }
  }

  if (!branchId) {
    // No hay sucursal todavía — puede pasar justo después del registro
    // Devolvemos estado inicial sin redirigir a login
    return {
      success: true,
      tenantId: userData.tenant_id,
      branchId: null,
      paso: 1,
      completado: false
    }
  }

  const { data: sucursal } = await supabase
    .from('sucursales')
    .select('onboarding_paso, onboarding_completado')
    .eq('id', branchId)
    .single()

  return {
    success: true,
    tenantId: userData.tenant_id,
    branchId,
    paso: sucursal?.onboarding_paso ?? 1,
    completado: sucursal?.onboarding_completado ?? false
  }
}

export async function saveStep1(data: {
  nombrePersona: string
  nombreNegocio: string
  direccionFiscal: string
  nombreSucursal: string
  direccionSucursal: string
  timezone: string
  servicios: string
  politicas: string[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  // Usar supabaseAdmin para evitar problemas de RLS
  let tenantId: string | null = null
  let intentos = 0
  
  while (!tenantId && intentos < 5) {
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    
    tenantId = userData?.tenant_id || null
    
    if (!tenantId) {
      intentos++
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  if (!tenantId) throw new Error('No tenant')

  // Actualizar organización con nombre y dirección fiscal
  await supabase
    .from('organizaciones')
    .update({ nombre: data.nombreNegocio, direccion_fiscal: data.direccionFiscal })
    .eq('id', tenantId)

  // Buscar sucursal existente
  let { data: branch } = await supabase
    .from('sucursales')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!branch) {
    const { data: newBranch, error: branchErr } = await supabase
      .from('sucursales')
      .insert({
        tenant_id: tenantId,
        nombre: data.nombreSucursal,
        direccion: data.direccionSucursal,
        timezone: data.timezone,
        activa: true,
        onboarding_completado: false,
        onboarding_paso: 1
      })
      .select('id')
      .single()
    if (branchErr) throw branchErr
    branch = newBranch
  } else {
    await supabase
      .from('sucursales')
      .update({
        nombre: data.nombreSucursal,
        direccion: data.direccionSucursal,
        timezone: data.timezone
      })
      .eq('id', branch.id)
  }

  // Asegurarse de que el usuario tiene branch_id asignado
  await supabase
    .from('users')
    .update({ branch_id: branch.id, nombre: data.nombrePersona })
    .eq('id', user.id)

  // Upsert business_profile
  const politicasStr = data.politicas.join('\n')
  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('branch_id', branch.id)
    .single()

  if (!profile) {
    await supabase.from('business_profiles').insert({
      branch_id: branch.id,
      servicios: data.servicios,
      politicas: politicasStr
    })
  } else {
    await supabase.from('business_profiles').update({
      servicios: data.servicios,
      politicas: politicasStr
    }).eq('id', profile.id)
  }

  await supabase.from('sucursales').update({ onboarding_paso: 2 }).eq('id', branch.id)
  return { success: true, branchId: branch.id }
}

export async function saveStep2(data: {
  branchId: string
  horarios: { dia_semana: number; apertura: string; cierre: string; activo: boolean }[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  await supabase.from('business_hours').delete().eq('branch_id', data.branchId)

  const rows = data.horarios.map(h => ({
    branch_id: data.branchId,
    dia_semana: h.dia_semana,
    apertura: h.activo ? (h.apertura.length === 5 ? `${h.apertura}:00` : h.apertura) : null,
    cierre: h.activo ? (h.cierre.length === 5 ? `${h.cierre}:00` : h.cierre) : null,
    cerrado: !h.activo,
    orden: 0
  }))

  const { error } = await supabase.from('business_hours').insert(rows)
  if (error) throw error

  await supabase.from('sucursales').update({ onboarding_paso: 3 }).eq('id', data.branchId)
  return { success: true }
}

export async function saveStep3(data: {
  tenantId: string
  branchId: string
  skills: { idName: string, nombre: string, activo: boolean }[]
}) {
  const supabase = await createClient()

  await supabase.from('skills').delete().eq('branch_id', data.branchId)

  const rows = data.skills.filter(s => s.activo).map((s, idx) => ({
    tenant_id: data.tenantId,
    branch_id: data.branchId,
    nombre: s.nombre,
    descripcion: s.nombre,
    activo: true,
    orden: idx
  }))

  if (rows.length > 0) {
    const { error } = await supabase.from('skills').insert(rows)
    if (error) throw error
  }

  await supabase.from('sucursales').update({ onboarding_paso: 4 }).eq('id', data.branchId)
  return { success: true }
}

export async function saveStep4(data: { tenantId: string, branchId: string, msg: string }) {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('branch_id', data.branchId)
    .single()

  if (!profile) {
    await supabase.from('business_profiles').insert({
      branch_id: data.branchId,
      msg_fuera_horario: data.msg
    })
  } else {
    await supabase.from('business_profiles')
      .update({ msg_fuera_horario: data.msg })
      .eq('branch_id', data.branchId)
  }

  await supabase.from('sucursales').update({ onboarding_paso: 5 }).eq('id', data.branchId)
  return { success: true }
}

export async function saveStep5(data: {
  tenantId: string
  branchId: string
  productos: { nombre: string, precio: number }[]
}) {
  const supabase = await createClient()

  await supabase.from('price_list').delete().eq('branch_id', data.branchId)

  if (data.productos.length > 0) {
    const rows = data.productos.map(p => ({
      tenant_id: data.tenantId,
      branch_id: data.branchId,
      nombre: p.nombre,
      precio: p.precio,
      precio_tipo: 'exacto',
      disponible: true
    }))
    const { error } = await supabase.from('price_list').insert(rows)
    if (error) throw error
  }

  await supabase.from('sucursales').update({
    onboarding_paso: 5,
    onboarding_completado: true
  }).eq('id', data.branchId)

  return { success: true }
}
