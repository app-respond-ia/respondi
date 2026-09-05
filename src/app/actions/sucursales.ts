'use server'

import { createClient } from '@/utils/supabase/server'
import { canManageRole } from './roles'
import { registrarAuditoria } from '@/lib/auditoria'
import { getAuthContext } from '@/lib/auth-context'
import { registrarError } from '@/lib/errores'


export async function getSucursales() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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

import { getMisPermisos } from './permisos'

export async function crearSucursal(nombre: string, direccion?: string, copiarDesdeId?: string, pais?: string) {
  if (!nombre || nombre.trim().length === 0) {
    return { success: false, error: 'El nombre es obligatorio' }
  }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const sucRes = await getSucursales()
  const misPermisos = await getMisPermisos()
  if (!misPermisos.success) return { success: false, error: 'Error verificando permisos' }
  const tienePermiso = (misPermisos as any).esAdmin || 
                       (misPermisos.data || []).some((p: any) => p.seccion === 'sucursales' && p.nivel === 'escritura')
  
  if (!tienePermiso) {
    return { success: false, error: 'No tienes permisos para crear sucursales' }
  }
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
      pais: pais || null,
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
      .select('nombre, descripcion, activo, orden, skill_global_id')
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

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó la sucursal "${nuevaSucursal.nombre}"`,
    tabla_afectada: 'sucursales',
    registro_id: nuevaSucursal.id,
    valor_nuevo: nuevaSucursal
  })

  return { success: true, data: nuevaSucursal }
}

export async function desactivarSucursal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `desactivó la sucursal "${data.nombre}"`,
    tabla_afectada: 'sucursales',
    registro_id: id,
    valor_anterior: { activa: true },
    valor_nuevo: { activa: false }
  })

  return { success: true, data }
}

export async function reactivarSucursal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `reactivó la sucursal "${data.nombre}"`,
    tabla_afectada: 'sucursales',
    registro_id: id,
    valor_anterior: { activa: false },
    valor_nuevo: { activa: true }
  })

  return { success: true, data }
}

export async function getDatosSucursalParaCopiar(branchIdOrigen: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const userData = { tenant_id: auth.tenant_id }

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
    .select('nombre, descripcion_intencion, color, activa, es_plantilla, orden, es_fallback, es_protegida')
    .eq('branch_id', branchIdOrigen)
    .eq('tenant_id', userData.tenant_id)

  // Reglas
  const { data: reglas } = await supabase
    .from('case_rules')
    .select('nombre, descripcion_intencion, tipo_caso, activa, es_plantilla, es_protegida')
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
    .select('nombre, activo, skill_global_id')
    .eq('branch_id', branchIdOrigen)

  // Precios
  const { data: precios } = await supabase
    .from('price_list')
    .select('nombre, tipo, precio, precio_tipo, descripcion')
    .eq('branch_id', branchIdOrigen)
    .eq('activo', true)

  // Tipos de novedad
  const { data: tiposNovedad } = await supabase
    .from('tipos_novedad')
    .select('nombre, icono, color')
    .eq('branch_id', branchIdOrigen)
    .eq('tenant_id', userData.tenant_id)

  // Business profile (servicios, políticas, configuración IA)
  const { data: businessProfile } = await supabase
    .from('business_profiles')
    .select('servicios, politicas, msg_fuera_horario, idioma_base, tono, caso_fuera_horario, modo_horario_ia')
    .eq('branch_id', branchIdOrigen)
    .maybeSingle()

  return {
    success: true,
    data: {
      sucursal,
      horarios: horarios || [],
      skills: skills || [],
      precios: precios || [],
      etiquetas: etiquetas || [],
      reglas: reglas || [],
      tipos_novedad: tiposNovedad || [],
      servicios: businessProfile?.servicios ?? null,
      politicas: businessProfile?.politicas ?? null,
      msg_fuera_horario: businessProfile?.msg_fuera_horario ?? null,
      idioma_base: businessProfile?.idioma_base ?? null,
      tono: businessProfile?.tono ?? null,
      caso_fuera_horario: businessProfile?.caso_fuera_horario ?? false,
      modo_horario_ia: businessProfile?.modo_horario_ia ?? 'mismo_negocio'
    }
  }
}

export async function crearSucursalConDatos(data: {
  nombre: string
  direccion?: string
  pais?: string
  timezone: string
  servicios?: string
  politicas?: { titulo: string, descripcion: string }[]
  idioma_base?: string
  tono?: string
  msg_fuera_horario?: string
  caso_fuera_horario?: boolean
  modo_horario_ia?: string
  horarios?: { dia_semana: number, apertura: string | null, cierre: string | null, cerrado: boolean, orden: number }[]
  skills?: { idName?: string, skill_global_id: string, nombre: string, activo: boolean }[]
  precios?: { nombre: string, tipo: string, precio: number | null, precio_tipo: string, descripcion?: string }[]
  etiquetas?: { nombre: string, descripcion_intencion?: string | null, color: string, activa: boolean, es_plantilla: boolean, orden: number, es_fallback?: boolean, es_protegida?: boolean }[]
  reglas?: { nombre: string, descripcion_intencion?: string | null, tipo_caso: string, activa: boolean, es_plantilla: boolean, es_protegida?: boolean }[]
  tipos_novedad?: { nombre: string, icono: string, color: string }[]
}) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  
  const misPermisos = await getMisPermisos()
  if (!misPermisos.success) return { success: false, error: 'Error verificando permisos' }
  const tienePermiso = (misPermisos as any).esAdmin || 
                       (misPermisos.data || []).some((p: any) => p.seccion === 'sucursales' && p.nivel === 'escritura')

  if (!tienePermiso) {
    return { success: false, error: 'No tienes permisos para crear sucursales' }
  }

  // Crear sucursal
  const { data: newBranch, error: branchErr } = await supabase
    .from('sucursales')
    .insert({
      tenant_id: userData!.tenant_id,
      nombre: data.nombre,
      direccion: data.direccion || null,
      pais: data.pais || null,
      timezone: data.timezone,
      activa: true,
      onboarding_completado: true
    })
    .select()
    .single()

  if (branchErr || !newBranch) return { success: false, error: branchErr?.message || 'Error al crear sucursal' }

  // Business profile
  if (data.servicios || data.politicas || data.msg_fuera_horario) {
    const { error } = await supabase.from('business_profiles').insert({
      branch_id: newBranch.id,
      servicios: data.servicios || null,
      politicas: data.politicas || null,
      idioma_base: data.idioma_base || 'es',
      tono: data.tono || 'cercano',
      msg_fuera_horario: data.msg_fuera_horario || null,
      caso_fuera_horario: data.caso_fuera_horario ?? false,
      modo_horario_ia: data.modo_horario_ia || 'mismo_negocio'
    })
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear business_profiles durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  // Horarios
  if (data.horarios && data.horarios!.length > 0) {
    const { error } = await supabase.from('business_hours').insert(
      data.horarios!.map(h => ({ ...h, branch_id: newBranch.id }))
    )
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear business_hours durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  // Skills
  if (data.skills && data.skills!.length > 0) {
    const { error } = await supabase.from('skills').insert(
      data.skills!.map((s, idx) => ({
        branch_id: newBranch.id,
        tenant_id: userData!.tenant_id,
        skill_global_id: s.skill_global_id,
        nombre: s.nombre,
        activo: s.activo,
        orden: idx
      }))
    )
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear skills durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  // Precios
  if (data.precios && data.precios!.length > 0) {
    const { error } = await supabase.from('price_list').insert(
      data.precios!.map(p => ({
        branch_id: newBranch.id,
        tenant_id: userData!.tenant_id,
        nombre: p.nombre,
        tipo: p.tipo || 'producto',
        precio: p.precio,
        precio_tipo: p.precio_tipo || 'exacto',
        descripcion: p.descripcion || null,
        activo: true
      }))
    )
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear price_list durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  // Etiquetas
  let finalEtiquetas = data.etiquetas ? [...data.etiquetas] : []
  const hasFallback = finalEtiquetas.some(e => e.es_fallback)
  
  if (!hasFallback) {
    finalEtiquetas.push({
      nombre: "Otros",
      descripcion_intencion: "El mensaje no encaja claramente en ninguna otra categoría.",
      color: "slate-d",
      es_plantilla: true,
      es_fallback: true,
      activa: true,
      es_protegida: true
    } as any)
  } else {
    const fb = finalEtiquetas.find(e => e.es_fallback)
    if (fb) fb.es_protegida = true
  }

  if (finalEtiquetas.length > 0) {
    const { error } = await supabase.from('message_categories').insert(
      finalEtiquetas.map((e, idx) => ({
        ...e,
        branch_id: newBranch.id,
        tenant_id: userData!.tenant_id,
        orden: idx
      }))
    )
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear message_categories durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  // Reglas
  let finalReglas = data.reglas ? [...data.reglas] : []
  
  const hasDocRule = finalReglas.some(r => r.tipo_caso === 'documento_no_procesable')
  const hasHumanoRule = finalReglas.some(r => r.tipo_caso === 'derivacion_solicitada')
  
  if (!hasDocRule) {
    finalReglas.push({
      nombre: "Documento no procesable",
      descripcion_intencion: "El cliente envía un archivo PDF, Word, o documento similar que no podemos procesar automáticamente.",
      tipo_caso: "documento_no_procesable",
      es_plantilla: true,
      activa: true,
      es_protegida: true
    } as any)
  } else {
    const r = finalReglas.find(r => r.tipo_caso === 'documento_no_procesable')
    if (r) r.es_protegida = true
  }

  if (!hasHumanoRule) {
    finalReglas.push({
      nombre: "Cliente quiere hablar con un humano",
      descripcion_intencion: "El cliente solicita explícitamente ser atendido por un humano o que le pasen con un agente.",
      tipo_caso: "derivacion_solicitada",
      es_plantilla: true,
      activa: true,
      es_protegida: true
    } as any)
  } else {
    const r = finalReglas.find(r => r.tipo_caso === 'derivacion_solicitada')
    if (r) r.es_protegida = true
  }

  if (finalReglas.length > 0) {
    const { error } = await supabase.from('case_rules').insert(
      finalReglas.map(r => ({
        ...r,
        branch_id: newBranch.id,
        tenant_id: userData!.tenant_id
      }))
    )
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear case_rules durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  // Tipos de novedad
  if (data.tipos_novedad && data.tipos_novedad!.length > 0) {
    const { error } = await supabase.from('tipos_novedad').insert(
      data.tipos_novedad!.map(t => ({
        ...t,
        branch_id: newBranch.id,
        tenant_id: userData!.tenant_id
      }))
    )
    if (error) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al crear tipos_novedad durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
    }
  }

  await registrarAuditoria({
    tenant_id: userData!.tenant_id,
    user_id: user.id,
    accion: `creó la sucursal "${newBranch.nombre}" con configuración inicial`,
    tabla_afectada: 'sucursales',
    registro_id: newBranch.id,
    valor_nuevo: newBranch
  })

  return { success: true, sucursal: newBranch }
}
