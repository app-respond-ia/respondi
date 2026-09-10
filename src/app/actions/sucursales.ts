'use server'

import { createClient } from '@/utils/supabase/server'
import { canManageRole } from './roles'
import { registrarAuditoria } from '@/lib/auditoria'
import { getAuthContext } from '@/lib/auth-context'
import { registrarError } from '@/lib/errores'
import { validarHorarios, horariosARegistros, registrosAHorarios, type HorarioDia } from '@/lib/horarios'

async function vincularPropietariosASucursal(supabase: any, tenantId: string, sucursalId: string) {
  const { data: propietarios, error } = await supabase
    .from('users')
    .select('id, roles_personalizados!inner(es_propietario)')
    .eq('tenant_id', tenantId)
    .eq('roles_personalizados.es_propietario', true)

  if (error) {
    // Antes esto era un console.error, que en producción se pierde: nadie lo
    // lee nunca. Si falla, los propietarios no quedan vinculados a la
    // sucursal nueva y no pueden entrar en ella.
    await registrarError({
      origen: 'app',
      descripcion: 'Fallo al buscar propietarios para vincular a la sucursal nueva',
      stacktrace: JSON.stringify(error),
      tenant_id: tenantId
    })
    return
  }

  if (propietarios && propietarios.length > 0) {
    const { error: errVinculo } = await supabase.from('user_branches').insert(
      propietarios.map((p: any) => ({
        user_id: p.id,
        branch_id: sucursalId
      }))
    )

    if (errVinculo) {
      await registrarError({
        origen: 'app',
        descripcion: 'Fallo al vincular a los propietarios con la sucursal nueva (no podrán acceder a ella)',
        stacktrace: JSON.stringify({ sucursalId, error: errVinculo }),
        tenant_id: tenantId
      })
    }
  }
}

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
    .select('plan_id, plans!plan_id(sucursales_max)')
    .eq('id', auth.tenant_id)
    .single()
  const plan = Array.isArray(organizacion?.plans) ? organizacion.plans[0] : organizacion?.plans
  const sucursales_max = plan?.sucursales_max ?? null
  const sucursales_activas_count = (sucursales || []).filter((s: any) => s.activa).length
  return { success: true, data: { sucursales, sucursales_max, sucursales_activas_count } }
}

import { getMisPermisos } from './permisos'

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

  // Lanzar todas las lecturas en paralelo
  const [
    { data: sucursal },
    { data: etiquetas },
    { data: reglas },
    { data: horarios },
    { data: skills },
    { data: precios },
    { data: tiposNovedad },
    { data: businessProfile },
    { data: horariosIA }
  ] = await Promise.all([
    supabase.from('sucursales').select('id, nombre, direccion, timezone').eq('id', branchIdOrigen).eq('tenant_id', userData.tenant_id).single(),
    supabase.from('message_categories').select('nombre, descripcion_intencion, color, activa, es_plantilla, orden, es_fallback, es_protegida').eq('branch_id', branchIdOrigen).eq('tenant_id', userData.tenant_id),
    supabase.from('case_rules').select('nombre, descripcion_intencion, tipo_caso, activa, es_plantilla, es_protegida').eq('branch_id', branchIdOrigen).eq('tenant_id', userData.tenant_id),
    supabase.from('business_hours').select('dia_semana, apertura, cierre, cerrado, orden').eq('branch_id', branchIdOrigen).eq('tipo', 'negocio').order('dia_semana', { ascending: true }).order('orden', { ascending: true }),
    supabase.from('skills').select('nombre, activo, skill_global_id').eq('branch_id', branchIdOrigen),
    supabase.from('price_list').select('nombre, tipo, precio, precio_tipo, descripcion').eq('branch_id', branchIdOrigen).eq('disponible', true),
    supabase.from('tipos_novedad').select('nombre, icono, color').eq('branch_id', branchIdOrigen).eq('tenant_id', userData.tenant_id),
    supabase.from('business_profiles').select('servicios, politicas, msg_fuera_horario, idioma_base, tono, abrir_caso_fuera_horario, modo_horario_ia').eq('branch_id', branchIdOrigen).maybeSingle(),
    supabase.from('business_hours').select('dia_semana, apertura, cierre, cerrado, orden').eq('branch_id', branchIdOrigen).eq('tipo', 'ia').order('dia_semana', { ascending: true }).order('orden', { ascending: true })
  ])

  if (!sucursal) return { success: false, error: 'Sucursal no encontrada' }

  return {
    success: true,
    data: {
      sucursal,
      horarios: horarios || [],
      horarios_ia: horariosIA || [],
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
      abrir_caso_fuera_horario: businessProfile?.abrir_caso_fuera_horario ?? false,
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
  abrir_caso_fuera_horario?: boolean
  modo_horario_ia?: string
  horarios?: HorarioDia[]
  horarios_ia?: HorarioDia[]
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

  if (data.horarios && data.horarios.length > 0) {
    const errorValidacion = validarHorarios(data.horarios)
    if (errorValidacion) return { success: false, error: errorValidacion }
  }

  if (data.horarios_ia && data.horarios_ia.length > 0) {
    const errorValidacionIA = validarHorarios(data.horarios_ia)
    if (errorValidacionIA) return { success: false, error: `Horario de la IA: ${errorValidacionIA}` }
  }

  // DEFENSA: Comprobar idempotencia por nombre en los últimos 10 segundos
  const hace10Segundos = new Date(Date.now() - 10000).toISOString()
  const { data: sucursalReciente } = await supabase
    .from('sucursales')
    .select('*')
    .eq('tenant_id', userData!.tenant_id)
    .eq('nombre', data.nombre.trim())
    .gte('created_at', hace10Segundos)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (sucursalReciente) {
    return { success: true, sucursal: sucursalReciente }
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

  // Recopilar promesas de inserción para ejecutarlas en paralelo
  const insertPromises: PromiseLike<any>[] = []

  // Business profile
  if (data.servicios || data.politicas || data.msg_fuera_horario) {
    insertPromises.push(
      supabase.from('business_profiles').insert({
        branch_id: newBranch.id,
        servicios: data.servicios || null,
        politicas: data.politicas || null,
        idioma_base: data.idioma_base || 'es',
        tono: data.tono || 'cercano',
        msg_fuera_horario: data.msg_fuera_horario || null,
        abrir_caso_fuera_horario: data.abrir_caso_fuera_horario ?? false,
        modo_horario_ia: data.modo_horario_ia || 'mismo_negocio'
      }).then(({ error }) => {
        if (error) return registrarError({ origen: 'app', descripcion: 'Fallo al crear business_profiles durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
      })
    )
  }

  // Horarios
  if (data.horarios && data.horarios!.length > 0) {
    insertPromises.push(
      supabase.from('business_hours').insert(
        horariosARegistros(data.horarios!, newBranch.id, 'negocio')
      ).then(({ error }) => {
        if (error) return registrarError({ origen: 'app', descripcion: 'Fallo al crear business_hours durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
      })
    )
  }

  // Horario personalizado de la IA (solo si el modo lo usa)
  if (data.modo_horario_ia === 'personalizado' && data.horarios_ia && data.horarios_ia.length > 0) {
    insertPromises.push(
      supabase.from('business_hours').insert(
        horariosARegistros(data.horarios_ia!, newBranch.id, 'ia')
      ).then(({ error }) => {
        if (error) return registrarError({ origen: 'app', descripcion: 'Fallo al crear business_hours (IA) durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
      })
    )
  }

  // Skills
  if (data.skills && data.skills!.length > 0) {
    insertPromises.push(
      supabase.from('skills').insert(
        data.skills!.map((s, idx) => ({
          branch_id: newBranch.id,
          tenant_id: userData!.tenant_id,
          skill_global_id: s.skill_global_id,
          nombre: s.nombre,
          activo: s.activo,
          orden: idx
        }))
      ).then(({ error }) => {
        if (error) return registrarError({ origen: 'app', descripcion: 'Fallo al crear skills durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
      })
    )
  }

  // Precios
  if (data.precios && data.precios!.length > 0) {
    insertPromises.push(
      supabase.from('price_list').insert(
        data.precios!.map(p => ({
          branch_id: newBranch.id,
          tenant_id: userData!.tenant_id,
          nombre: p.nombre,
          tipo: p.tipo || 'producto',
          precio: p.precio,
          precio_tipo: p.precio_tipo || 'exacto',
          descripcion: p.descripcion || null,
          // La columna se llama `disponible`, no `activo`. Con el nombre mal
          // TODA la inserción fallaba ("column activo does not exist"), así que
          // al crear una sucursal copiando precios no se copiaba ninguno. La
          // sucursal se creaba igual y nadie se enteraba de que faltaban.
          disponible: true
        }))
      ).then(({ error }) => {
        if (error) return registrarError({ origen: 'app', descripcion: 'Fallo al crear price_list durante alta de sucursal', stacktrace: error.message, tenant_id: userData!.tenant_id })
      })
    )
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

  await vincularPropietariosASucursal(supabase, userData!.tenant_id, newBranch.id)

  return { success: true, sucursal: newBranch }
}
