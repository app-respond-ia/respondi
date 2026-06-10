'use server'

import { createClient } from '@/utils/supabase/server'

export async function getOnboardingState() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No user' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, comercios(onboarding_paso, onboarding_completado)')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'No tenant' }

  // Check if branch exists and get its ID if we don't have it in user
  let branchId = userData.branch_id
  if (!branchId) {
    const { data: branch } = await supabase.from('sucursales').select('id').eq('tenant_id', userData.tenant_id).limit(1).single()
    if (branch) branchId = branch.id
  }

  // Handle Supabase joining array vs object
  const comercio = Array.isArray(userData.comercios) ? userData.comercios[0] : userData.comercios

  return {
    success: true,
    tenantId: userData.tenant_id,
    branchId: branchId,
    paso: comercio?.onboarding_paso || 1,
    completado: comercio?.onboarding_completado || false
  }
}

export async function saveStep1(data: {
  nombreComercio: string
  direccion: string
  timezone: string
  servicios: string
  politicas: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userData?.tenant_id
  if (!tenantId) throw new Error('No tenant')

  // Check if branch exists
  let { data: branch } = await supabase.from('sucursales').select('id').eq('tenant_id', tenantId).limit(1).single()
  
  if (!branch) {
    const { data: newBranch, error: branchErr } = await supabase
      .from('sucursales')
      .insert({
        tenant_id: tenantId,
        nombre: data.nombreComercio,
        direccion: data.direccion,
        timezone: data.timezone,
        activa: true
      })
      .select('id')
      .single()
    if (branchErr) throw branchErr
    branch = newBranch
  } else {
    // Update branch
    const { error: branchErr } = await supabase
      .from('sucursales')
      .update({
        nombre: data.nombreComercio,
        direccion: data.direccion,
        timezone: data.timezone
      })
      .eq('id', branch.id)
    if (branchErr) throw branchErr
  }

  // Update user branch_id
  await supabase.from('users').update({ branch_id: branch.id }).eq('id', user.id)

  // Upsert business_profile
  let { data: profile } = await supabase.from('business_profiles').select('id').eq('branch_id', branch.id).single()
  if (!profile) {
    const { error: profileErr } = await supabase.from('business_profiles').insert({
      branch_id: branch.id,
      servicios: data.servicios,
      politicas: data.politicas
    })
    if (profileErr) throw profileErr
  } else {
    const { error: profileErr } = await supabase.from('business_profiles').update({
      servicios: data.servicios,
      politicas: data.politicas
    }).eq('id', profile.id)
    if (profileErr) throw profileErr
  }

  // Update comercio step
  await supabase.from('comercios').update({ onboarding_paso: 2 }).eq('id', tenantId)

  return { success: true, branchId: branch.id }
}

export async function saveStep2(data: {
  branchId: string
  horarios: { dia_semana: number; apertura: string; cierre: string; activo: boolean }[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userData?.tenant_id

  // We delete existing hours for this branch to avoid duplicates, then insert
  await supabase.from('business_hours').delete().eq('branch_id', data.branchId)

  const rows = data.horarios.map(h => ({
    branch_id: data.branchId,
    dia_semana: h.dia_semana,
    apertura: h.activo ? h.apertura : null,
    cierre: h.activo ? h.cierre : null,
    cerrado: !h.activo
  }))

  const { error } = await supabase.from('business_hours').insert(rows)
  if (error) throw error

  await supabase.from('comercios').update({ onboarding_paso: 3 }).eq('id', tenantId)
  return { success: true }
}

export async function saveStep3(data: {
  tenantId: string
  branchId: string
  skills: { idName: string, nombre: string, activo: boolean }[]
}) {
  const supabase = await createClient()
  
  // delete existing skills
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

  await supabase.from('comercios').update({ onboarding_paso: 4 }).eq('id', data.tenantId)
  return { success: true }
}

export async function saveStep4(data: { tenantId: string, branchId: string, msg: string }) {
  const supabase = await createClient()

  // First ensure business profile exists, since we update it
  let { data: profile } = await supabase.from('business_profiles').select('id').eq('branch_id', data.branchId).single()
  if (!profile) {
    const { error } = await supabase.from('business_profiles').insert({
      branch_id: data.branchId,
      msg_fuera_horario: data.msg
    })
    if (error) throw error
  } else {
    const { error } = await supabase.from('business_profiles')
      .update({ msg_fuera_horario: data.msg })
      .eq('branch_id', data.branchId)
    if (error) throw error
  }

  await supabase.from('comercios').update({ onboarding_paso: 5 }).eq('id', data.tenantId)
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
      moneda: 'USD',
      disponible: true
    }))
    const { error } = await supabase.from('price_list').insert(rows)
    if (error) throw error
  }

  await supabase.from('comercios').update({ 
    onboarding_paso: 5,
    onboarding_completado: true 
  }).eq('id', data.tenantId)

  return { success: true }
}
