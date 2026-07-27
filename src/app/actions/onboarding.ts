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

  const { data: userData, error: userErr } = await supabaseAdmin
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (userErr || !userData?.tenant_id) throw new Error('No tenant')
  const tenantId = userData.tenant_id

  await supabaseAdmin
    .from('organizaciones')
    .update({ nombre: data.nombreNegocio, direccion_fiscal: data.direccionFiscal })
    .eq('id', tenantId)

  const { data: branches } = await supabaseAdmin
    .from('sucursales')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(1)

  let branch = branches && branches.length > 0 ? branches[0] : null

  if (!branch) {
    const { data: newBranch, error: branchErr } = await supabaseAdmin
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
    await supabaseAdmin
      .from('sucursales')
      .update({
        nombre: data.nombreSucursal,
        direccion: data.direccionSucursal,
        timezone: data.timezone
      })
      .eq('id', branch.id)
  }

  await supabaseAdmin
    .from('users')
    .update({ branch_id: branch.id, nombre: data.nombrePersona })
    .eq('id', user.id)

  const politicasStr = data.politicas.join('\n')
  const { data: profiles } = await supabaseAdmin
    .from('business_profiles')
    .select('id')
    .eq('branch_id', branch.id)
    .limit(1)

  const profile = profiles && profiles.length > 0 ? profiles[0] : null

  if (!profile) {
    await supabaseAdmin.from('business_profiles').insert({
      branch_id: branch.id,
      servicios: data.servicios,
      politicas: politicasStr
    })
  } else {
    await supabaseAdmin.from('business_profiles').update({
      servicios: data.servicios,
      politicas: politicasStr
    }).eq('id', profile.id)
  }

  await supabaseAdmin.from('sucursales').update({ onboarding_paso: 2 }).eq('id', branch.id)
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
  try {
    const supabase = await createClient()

    const { error: delError } = await supabase.from('skills').delete().eq('branch_id', data.branchId)
    if (delError) {
      console.error('Error borrando skills en paso 3:', delError, JSON.stringify(delError))
      throw delError
    }

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
      if (error) {
        console.error('Error insertando skills en paso 3:', error, JSON.stringify(error))
        throw error
      }
    }

    const { error: updError } = await supabase.from('sucursales').update({ onboarding_paso: 4 }).eq('id', data.branchId)
    if (updError) {
      console.error('Error actualizando sucursal en paso 3:', updError, JSON.stringify(updError))
      throw updError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error en paso Skills de IA:', error, JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    throw error
  }
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
