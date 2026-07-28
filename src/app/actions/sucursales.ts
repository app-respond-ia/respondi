'use server'

import { createClient } from '@/utils/supabase/server'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización', user_id: user.id }
  }

  return { tenant_id: userData.tenant_id, branch_id: userData.branch_id, user_id: user.id }
}

export async function getSucursales() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: sucursales, error } = await supabase
    .from('sucursales')
    .select('id, nombre, direccion, activa, created_at')
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('plan_id, plans(sucursales_max)')
    .eq('id', auth.tenant_id)
    .single()
  const plan = Array.isArray(organizacion?.plans) ? organizacion.plans[0] : organizacion?.plans
  const sucursales_max = plan?.sucursales_max ?? null
  const sucursales_activas_count = (sucursales || []).filter((s: any) => s.activa).length

  return { success: true, data: { sucursales, sucursales_max, sucursales_activas_count } }
}

export async function crearSucursal(nombre: string, direccion?: string, copiarDesdeId?: string) {
  if (!nombre || nombre.trim().length === 0) {
    return { success: false, error: 'El nombre es obligatorio' }
  }

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const sucRes = await getSucursales()
  if (sucRes.success && sucRes.data) {
    const { sucursales_max, sucursales_activas_count } = sucRes.data
    if (sucursales_max !== null && sucursales_activas_count >= sucursales_max) {
      return { success: false, error: 'Has alcanzado el límite de sucursales de tu plan' }
    }
  }

  const { data: nuevaSucursal, error } = await supabase
    .from('sucursales')
    .insert({
      tenant_id: auth.tenant_id,
      nombre: nombre.trim(),
      direccion: direccion?.trim() || null,
      activa: true
    })
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  // Si hay copiarDesdeId, procedemos a copiar (best-effort)
  if (copiarDesdeId) {
    // 1. business_profiles
    const { data: bp } = await supabase
      .from('business_profiles')
      .select('descripcion, politicas, servicios, idioma_base, tono, disclaimer_texto, msg_fuera_horario, msg_cuota_agotada, msg_pausa_automatica')
      .eq('branch_id', copiarDesdeId)
      .single()
    if (bp) {
      await supabase.from('business_profiles').insert({
        branch_id: nuevaSucursal.id,
        ...bp
      })
    }

    // 2. business_hours
    const { data: bh } = await supabase
      .from('business_hours')
      .select('dia_semana, apertura, cierre, cerrado')
      .eq('branch_id', copiarDesdeId)
      .limit(7)
    if (bh && bh.length > 0) {
      const inserts = bh.map((h: any) => ({ branch_id: nuevaSucursal.id, ...h }))
      await supabase.from('business_hours').insert(inserts)
    }

    // 3. case_rules
    const { data: cr } = await supabase
      .from('case_rules')
      .select('nombre, descripcion_intencion, tipo_caso, activa, es_plantilla')
      .eq('branch_id', copiarDesdeId)
      .eq('tenant_id', auth.tenant_id)
    if (cr && cr.length > 0) {
      const inserts = cr.map((r: any) => ({ tenant_id: auth.tenant_id, branch_id: nuevaSucursal.id, ...r }))
      await supabase.from('case_rules').insert(inserts)
    }

    // 4. price_list
    const { data: pl } = await supabase
      .from('price_list')
      .select('nombre, precio, precio_tipo, moneda, descripcion, disponible')
      .eq('branch_id', copiarDesdeId)
      .eq('tenant_id', auth.tenant_id)
    if (pl && pl.length > 0) {
      const inserts = pl.map((p: any) => ({ tenant_id: auth.tenant_id, branch_id: nuevaSucursal.id, ...p }))
      await supabase.from('price_list').insert(inserts)
    }

    // 5. message_categories
    const { data: mc } = await supabase
      .from('message_categories')
      .select('nombre, descripcion_intencion, color, activa, es_plantilla, orden')
      .eq('branch_id', copiarDesdeId)
      .eq('tenant_id', auth.tenant_id)
    if (mc && mc.length > 0) {
      const inserts = mc.map((c: any) => ({ tenant_id: auth.tenant_id, branch_id: nuevaSucursal.id, ...c }))
      await supabase.from('message_categories').insert(inserts)
    }

    // 6. skills
    const { data: sk } = await supabase
      .from('skills')
      .select('nombre, descripcion, activo, orden')
      .eq('branch_id', copiarDesdeId)
      .eq('tenant_id', auth.tenant_id)
    if (sk && sk.length > 0) {
      const inserts = sk.map((s: any) => ({ tenant_id: auth.tenant_id, branch_id: nuevaSucursal.id, ...s }))
      await supabase.from('skills').insert(inserts)
    }
  }

  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', auth.tenant_id)
    .eq('rol', 'admin')
  if (admins && admins.length > 0) {
    await supabase.from('user_branches').insert(
      admins.map((a: any) => ({
        user_id: a.id,
        branch_id: nuevaSucursal.id
      }))
    )
  }

  return { success: true, data: nuevaSucursal }
}

export async function desactivarSucursal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Verificar que no es la única sucursal activa
  const { count } = await supabase
    .from('sucursales')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenant_id)
    .eq('activa', true)
    .neq('id', id)

  if (!count || count === 0) {
    return { success: false, error: 'No puedes desactivar la única sucursal activa de la organización.' }
  }

  const { data, error } = await supabase
    .from('sucursales')
    .update({ activa: false })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function reactivarSucursal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const sucRes = await getSucursales()
  if (sucRes.success && sucRes.data) {
    const { sucursales_max, sucursales_activas_count } = sucRes.data
    if (sucursales_max !== null && sucursales_activas_count >= sucursales_max) {
      return { success: false, error: 'Has alcanzado el límite de sucursales de tu plan' }
    }
  }

  const { data, error } = await supabase
    .from('sucursales')
    .update({ activa: true })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getDatosSucursalParaCopiar(branchIdOrigen: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'Sin organización' }

  // Verificar que la sucursal origen pertenece al mismo tenant
  const { data: sucursal } = await supabase
    .from('sucursales')
    .select('id, nombre, direccion, timezone')
    .eq('id', branchIdOrigen)
    .eq('tenant_id', userData.tenant_id)
    .single()

  if (!sucursal) return { success: false, error: 'Sucursal no encontrada' }

  // Etiquetas
  const { data: etiquetas } = await supabase
    .from('message_categories')
    .select('nombre, descripcion_intencion, color, activa, es_plantilla, orden')
    .eq('branch_id', branchIdOrigen)
    .eq('tenant_id', userData.tenant_id)

  // Reglas
  const { data: reglas } = await supabase
    .from('case_rules')
    .select('nombre, descripcion_intencion, tipo_caso, activa, es_plantilla')
    .eq('branch_id', branchIdOrigen)
    .eq('tenant_id', userData.tenant_id)

  // Horarios
  const { data: horarios } = await supabase
    .from('business_hours')
    .select('dia_semana, apertura, cierre, cerrado, orden')
    .eq('branch_id', branchIdOrigen)
    .order('dia_semana', { ascending: true })
    .order('orden', { ascending: true })

  // Skills
  const { data: skills } = await supabase
    .from('skills')
    .select('nombre, activo')
    .eq('branch_id', branchIdOrigen)

  // Precios
  const { data: precios } = await supabase
    .from('price_list')
    .select('nombre, tipo, precio, precio_tipo, descripcion')
    .eq('branch_id', branchIdOrigen)
    .eq('activo', true)

  return {
    success: true,
    data: {
      sucursal,
      horarios: horarios || [],
      skills: skills || [],
      precios: precios || [],
      etiquetas: etiquetas || [],
      reglas: reglas || []
    }
  }
}

export async function crearSucursalConDatos(data: {
  nombre: string
  direccion?: string
  timezone: string
  servicios?: string
  politicas?: string
  idioma_base?: string
  tono?: string
  msg_fuera_horario?: string
  ia_activa_fuera_horario?: boolean
  caso_fuera_horario?: boolean
  horarios?: { dia_semana: number, apertura: string | null, cierre: string | null, cerrado: boolean, orden: number }[]
  skills?: { nombre: string, activo: boolean }[]
  precios?: { nombre: string, tipo: string, precio: number | null, precio_tipo: string, descripcion?: string }[]
  etiquetas?: { nombre: string, descripcion_intencion?: string | null, color: string, activa: boolean, es_plantilla: boolean, orden: number }[]
  reglas?: { nombre: string, descripcion_intencion?: string | null, tipo_caso: string, activa: boolean, es_plantilla: boolean }[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'Sin organización' }
  if (userData.rol !== 'admin') return { success: false, error: 'Solo el administrador puede crear sucursales' }

  // Crear sucursal
  const { data: newBranch, error: branchErr } = await supabase
    .from('sucursales')
    .insert({
      tenant_id: userData.tenant_id,
      nombre: data.nombre,
      direccion: data.direccion || null,
      timezone: data.timezone,
      activa: true,
      onboarding_completado: true
    })
    .select()
    .single()

  if (branchErr || !newBranch) return { success: false, error: branchErr?.message || 'Error al crear sucursal' }

  // Business profile
  if (data.servicios || data.politicas || data.msg_fuera_horario) {
    await supabase.from('business_profiles').insert({
      branch_id: newBranch.id,
      servicios: data.servicios || null,
      politicas: data.politicas || null,
      idioma_base: data.idioma_base || 'es',
      tono: data.tono || 'cercano',
      msg_fuera_horario: data.msg_fuera_horario || null,
      ia_activa_fuera_horario: data.ia_activa_fuera_horario ?? false,
      caso_fuera_horario: data.caso_fuera_horario ?? false
    })
  }

  // Horarios
  if (data.horarios && data.horarios.length > 0) {
    await supabase.from('business_hours').insert(
      data.horarios.map(h => ({ ...h, branch_id: newBranch.id }))
    )
  }

  // Skills
  if (data.skills && data.skills.length > 0) {
    await supabase.from('skills').insert(
      data.skills.map((s, idx) => ({
        branch_id: newBranch.id,
        tenant_id: userData.tenant_id,
        nombre: s.nombre,
        activo: s.activo,
        orden: idx
      }))
    )
  }

  // Precios
  if (data.precios && data.precios.length > 0) {
    await supabase.from('price_list').insert(
      data.precios.map(p => ({
        branch_id: newBranch.id,
        tenant_id: userData.tenant_id,
        nombre: p.nombre,
        tipo: p.tipo || 'producto',
        precio: p.precio,
        precio_tipo: p.precio_tipo || 'exacto',
        descripcion: p.descripcion || null,
        activo: true
      }))
    )
  }

  // Etiquetas
  if (data.etiquetas && data.etiquetas.length > 0) {
    await supabase.from('message_categories').insert(
      data.etiquetas.map((e, idx) => ({
        ...e,
        branch_id: newBranch.id,
        tenant_id: userData.tenant_id,
        orden: idx
      }))
    )
  }

  // Reglas
  if (data.reglas && data.reglas.length > 0) {
    await supabase.from('case_rules').insert(
      data.reglas.map(r => ({
        ...r,
        branch_id: newBranch.id,
        tenant_id: userData.tenant_id
      }))
    )
  }

  return { success: true, sucursal: newBranch }
}
