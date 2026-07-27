'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'

// Helper privado para resolver y validar tenantId y branchId cuando vienen vacíos desde el cliente
async function resolveAndValidateIds(user: any, inputTenantId?: string, inputBranchId?: string) {
  let tenantId = inputTenantId?.trim() || ''
  let branchId = inputBranchId?.trim() || ''

  if ((!tenantId || !branchId) && user) {
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('tenant_id, branch_id')
      .eq('id', user.id)
      .single()

    if (!tenantId && userData?.tenant_id) {
      tenantId = userData.tenant_id
    }
    if (!branchId && userData?.branch_id) {
      branchId = userData.branch_id
    }
    if (!branchId && tenantId) {
      const { data: branches } = await supabaseAdmin
        .from('sucursales')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (branches && branches.length > 0) {
        branchId = branches[0].id
      }
    }
  }

  if (!branchId || branchId === '') {
    const msg = 'El ID de sucursal no es válido o está vacío. Por favor, regresa al Paso 1 y asegúrate de que la sucursal se haya creado correctamente.'
    console.error('Validation Error en onboarding:', msg)
    return { valid: false as const, error: msg }
  }
  if (!tenantId || tenantId === '') {
    const msg = 'El ID de organización no es válido o está vacío.'
    console.error('Validation Error en onboarding:', msg)
    return { valid: false as const, error: msg }
  }

  return { valid: true as const, tenantId, branchId }
}

export async function getOnboardingState() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'no_session' }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'no_tenant' }

  // Buscar sucursal — primero por branch_id del usuario, luego por tenant_id
  let branchId = userData.branch_id

  if (!branchId) {
    const { data: branch } = await supabaseAdmin
      .from('sucursales')
      .select('id')
      .eq('tenant_id', userData.tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (branch) {
      branchId = branch.id
      // Asignar branch_id al usuario si no lo tenía
      await supabaseAdmin
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

  const { data: sucursal } = await supabaseAdmin
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
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const { data: userData, error: userErr } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (userErr || !userData?.tenant_id) {
      console.error('Error buscando tenant en saveStep1:', userErr, JSON.stringify(userErr))
      throw new Error('No tenant')
    }
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
      if (branchErr) {
        console.error('Error insertando sucursal en saveStep1:', branchErr, JSON.stringify(branchErr))
        throw branchErr
      }
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
      const { error: insErr } = await supabaseAdmin.from('business_profiles').insert({
        branch_id: branch.id,
        servicios: data.servicios,
        politicas: politicasStr
      })
      if (insErr) {
        console.error('Error insertando profile en saveStep1:', insErr, JSON.stringify(insErr))
        throw insErr
      }
    } else {
      const { error: updErr } = await supabaseAdmin.from('business_profiles').update({
        servicios: data.servicios,
        politicas: politicasStr
      }).eq('id', profile.id)
      if (updErr) {
        console.error('Error actualizando profile en saveStep1:', updErr, JSON.stringify(updErr))
        throw updErr
      }
    }

    await supabaseAdmin.from('sucursales').update({ onboarding_paso: 2 }).eq('id', branch.id)
    return { success: true, branchId: branch.id }
  } catch (error: any) {
    console.error('Error en paso Datos Generales (saveStep1):', error, JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    throw error
  }
}

export async function saveStep2(data: {
  branchId: string
  horarios: { dia_semana: number; apertura: string; cierre: string; activo: boolean }[]
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const res = await resolveAndValidateIds(user, '', data.branchId)
    if (!res.valid) return { success: false, error: res.error }
    const { branchId } = res

    const { error: delError } = await supabaseAdmin.from('business_hours').delete().eq('branch_id', branchId)
    if (delError) {
      console.error('Error borrando horarios en paso 2:', delError, JSON.stringify(delError))
      throw delError
    }

    const rows = data.horarios.map(h => ({
      branch_id: branchId,
      dia_semana: h.dia_semana,
      apertura: h.activo ? (h.apertura.length === 5 ? `${h.apertura}:00` : h.apertura) : null,
      cierre: h.activo ? (h.cierre.length === 5 ? `${h.cierre}:00` : h.cierre) : null,
      cerrado: !h.activo,
      orden: 0
    }))

    const { error } = await supabaseAdmin.from('business_hours').insert(rows)
    if (error) {
      console.error('Error insertando horarios en paso 2:', error, JSON.stringify(error))
      throw error
    }

    const { error: updError } = await supabaseAdmin.from('sucursales').update({ onboarding_paso: 3 }).eq('id', branchId)
    if (updError) {
      console.error('Error actualizando sucursal en paso 2:', updError, JSON.stringify(updError))
      throw updError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error en paso Horarios (saveStep2):', error, JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    throw error
  }
}

export async function saveStep3(data: {
  tenantId: string
  branchId: string
  skills: { idName: string, nombre: string, activo: boolean }[]
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const res = await resolveAndValidateIds(user, data.tenantId, data.branchId)
    if (!res.valid) return { success: false, error: res.error }
    const { tenantId, branchId } = res

    const { error: delError } = await supabaseAdmin.from('skills').delete().eq('branch_id', branchId)
    if (delError) {
      console.error('Error borrando skills en paso 3:', delError, JSON.stringify(delError))
      throw delError
    }

    const rows = data.skills.filter(s => s.activo).map((s, idx) => ({
      tenant_id: tenantId,
      branch_id: branchId,
      nombre: s.nombre,
      descripcion: s.nombre,
      activo: true,
      orden: idx
    }))

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('skills').insert(rows)
      if (error) {
        console.error('Error insertando skills en paso 3:', error, JSON.stringify(error))
        throw error
      }
    }

    const { error: updError } = await supabaseAdmin.from('sucursales').update({ onboarding_paso: 4 }).eq('id', branchId)
    if (updError) {
      console.error('Error actualizando sucursal en paso 3:', updError, JSON.stringify(updError))
      throw updError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error en paso Skills de IA (saveStep3):', error, JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    throw error
  }
}

export async function saveStep4(data: { tenantId: string, branchId: string, msg: string }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const res = await resolveAndValidateIds(user, data.tenantId, data.branchId)
    if (!res.valid) return { success: false, error: res.error }
    const { branchId } = res

    const { data: profiles, error: selError } = await supabaseAdmin
      .from('business_profiles')
      .select('id')
      .eq('branch_id', branchId)
      .limit(1)

    if (selError) {
      console.error('Error buscando profile en paso 4:', selError, JSON.stringify(selError))
      throw selError
    }

    const profile = profiles && profiles.length > 0 ? profiles[0] : null

    if (!profile) {
      const { error: insError } = await supabaseAdmin.from('business_profiles').insert({
        branch_id: branchId,
        msg_fuera_horario: data.msg
      })
      if (insError) {
        console.error('Error insertando profile en paso 4:', insError, JSON.stringify(insError))
        throw insError
      }
    } else {
      const { error: updErr } = await supabaseAdmin.from('business_profiles')
        .update({ msg_fuera_horario: data.msg })
        .eq('id', profile.id)
      if (updErr) {
        console.error('Error actualizando profile en paso 4:', updErr, JSON.stringify(updErr))
        throw updErr
      }
    }

    const { error: updError } = await supabaseAdmin.from('sucursales').update({ onboarding_paso: 5 }).eq('id', branchId)
    if (updError) {
      console.error('Error actualizando sucursal en paso 4:', updError, JSON.stringify(updError))
      throw updError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error en paso Mensaje fuera de horario (saveStep4):', error, JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    throw error
  }
}

export async function saveStep5(data: {
  tenantId: string
  branchId: string
  productos: { nombre: string, precio: number }[]
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const res = await resolveAndValidateIds(user, data.tenantId, data.branchId)
    if (!res.valid) return { success: false, error: res.error }
    const { tenantId, branchId } = res

    const { error: delError } = await supabaseAdmin.from('price_list').delete().eq('branch_id', branchId)
    if (delError) {
      console.error('Error borrando productos en paso 5:', delError, JSON.stringify(delError))
      throw delError
    }

    if (data.productos.length > 0) {
      const rows = data.productos.map(p => ({
        tenant_id: tenantId,
        branch_id: branchId,
        nombre: p.nombre,
        precio: p.precio,
        precio_tipo: 'exacto',
        disponible: true
      }))
      const { error } = await supabaseAdmin.from('price_list').insert(rows)
      if (error) {
        console.error('Error insertando productos en paso 5:', error, JSON.stringify(error))
        throw error
      }
    }

    const { error: updError } = await supabaseAdmin.from('sucursales').update({
      onboarding_paso: 5,
      onboarding_completado: true
    }).eq('id', branchId)

    if (updError) {
      console.error('Error actualizando sucursal completado en paso 5:', updError, JSON.stringify(updError))
      throw updError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error en paso Lista de Precios (saveStep5):', error, JSON.stringify(error, Object.getOwnPropertyNames(error || {})))
    throw error
  }
}
