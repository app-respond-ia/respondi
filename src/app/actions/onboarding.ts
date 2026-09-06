'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'

// Helper privado para resolver y validar tenantId y branchId asegurando la propiedad (prevención de IDOR)
async function resolveAndValidateIds(user: any, inputTenantId?: string, inputBranchId?: string) {
  if (!user?.id) {
    return { valid: false as const, error: 'Usuario no autenticado.' }
  }

  // 1. Obtener SIEMPRE el tenant_id real e inviolable del usuario en la base de datos
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  const realTenantId = userData?.tenant_id
  let branchId = inputBranchId?.trim() || ''

  if (!realTenantId) {
    const msg = 'El usuario no tiene una organización asignada.'
    console.error('Security Error en onboarding:', msg)
    return { valid: false as const, error: msg }
  }

  // 2. Si se mandó un branchId desde el cliente, verificar rigurosamente que pertenece a SU tenant real
  if (branchId) {
    const { data: branchCheck } = await supabaseAdmin
      .from('sucursales')
      .select('id')
      .eq('id', branchId)
      .eq('tenant_id', realTenantId)
      .limit(1)
      
    // Si no pertenece a su tenant (o no existe), descartamos el ID malicioso/inválido
    if (!branchCheck || branchCheck.length === 0) {
      console.warn(`Intento de uso de branch_id inválido o ajeno (${branchId}) por usuario ${user.id}. Forzando resolución automática.`)
      branchId = ''
    }
  }

  // 3. Resolución automática segura (si vino vacío o si se descartó por seguridad)
  if (!branchId) {
    if (userData?.branch_id) {
      // Verificar que el branch asignado en perfil sigue siendo válido y propio
      const { data: userBranchCheck } = await supabaseAdmin
        .from('sucursales')
        .select('id')
        .eq('id', userData.branch_id)
        .eq('tenant_id', realTenantId)
        .limit(1)
        
      if (userBranchCheck && userBranchCheck.length > 0) {
        branchId = userBranchCheck[0].id
      }
    }

    // Si aún no tenemos, cogemos la primera sucursal de SU tenant real
    if (!branchId) {
      const { data: branches } = await supabaseAdmin
        .from('sucursales')
        .select('id')
        .eq('tenant_id', realTenantId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (branches && branches.length > 0) {
        branchId = branches[0].id
      }
    }
  }

  // 4. Si después de todo sigue sin haber sucursal, bloqueamos la ejecución
  if (!branchId || branchId === '') {
    const msg = 'El ID de sucursal no es válido o está vacío. Por favor, regresa al Paso 1 y asegúrate de que la sucursal se haya creado correctamente.'
    console.error('Validation Error en onboarding:', msg)
    return { valid: false as const, error: msg }
  }

  // Devolvemos SIEMPRE el tenantId verificado en el backend, ignorando inputTenantId
  return { valid: true as const, tenantId: realTenantId, branchId }
}

export async function getOnboardingState() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'no_session' }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('nombre, telefono, avatar_url, tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'no_tenant' }

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
      await supabaseAdmin
        .from('users')
        .update({ branch_id: branchId })
        .eq('id', user.id)
    }
  }

  let dataState: any = {
    paso: 1,
    completado: false,
    s0: { 
      nombrePersona: userData?.nombre || '',
      telefono: userData?.telefono || '',
      avatar_url: userData?.avatar_url || ''
    },
    s1: { }
  }

  if (branchId) {
    const [orgData, branchData, profileData, hoursData, skillsData, priceData] = await Promise.all([
      supabaseAdmin.from('organizaciones').select('nombre, direccion_fiscal').eq('id', userData.tenant_id).single(),
      supabaseAdmin.from('sucursales').select('nombre, direccion, timezone, moneda, onboarding_paso, onboarding_completado').eq('id', branchId).single(),
      supabaseAdmin.from('business_profiles').select('servicios, politicas, msg_fuera_horario, abrir_caso_fuera_horario, modo_horario_ia').eq('branch_id', branchId).limit(1).single(),
      supabaseAdmin.from('business_hours').select('dia_semana, apertura, cierre, cerrado, orden').eq('branch_id', branchId).order('orden', { ascending: true }),
      supabaseAdmin.from('skills').select('skill_global_id, nombre, activo').eq('branch_id', branchId),
      supabaseAdmin.from('price_list').select('nombre, precio').eq('branch_id', branchId)
    ])

    dataState.paso = branchData?.data?.onboarding_paso ?? 1
    dataState.completado = branchData?.data?.onboarding_completado ?? false

    dataState.s1 = {
      nombreNegocio: orgData?.data?.nombre || '',
      direccionFiscal: orgData?.data?.direccion_fiscal || '',
      nombreSucursal: branchData?.data?.nombre || '',
      direccionSucursal: branchData?.data?.direccion || '',
      timezone: branchData?.data?.timezone || 'America/Caracas',
      moneda: branchData?.data?.moneda || 'USD',
      servicios: profileData?.data?.servicios || '',
      politicas: profileData?.data?.politicas || []
    }

    if (hoursData?.data && hoursData.data.length > 0) {
      const daysMap: Record<number, { dia_semana: number, activo: boolean, franjas: any[] }> = {}
      hoursData.data.forEach(row => {
        if (!daysMap[row.dia_semana]) {
          daysMap[row.dia_semana] = { dia_semana: row.dia_semana, activo: !row.cerrado, franjas: [] }
        }
        if (!row.cerrado) {
          daysMap[row.dia_semana].franjas.push({ apertura: row.apertura.substring(0, 5), cierre: row.cierre.substring(0, 5) })
        }
      })
      dataState.s2 = daysMap
    }

    if (skillsData?.data && skillsData.data.length > 0) {
      dataState.s3 = skillsData.data
    }

    if (profileData?.data?.msg_fuera_horario !== undefined && profileData?.data?.msg_fuera_horario !== null) {
      dataState.s4 = profileData.data.msg_fuera_horario
    }
    if (profileData?.data) {
      dataState.s4_ia_activa = profileData.data.modo_horario_ia === 'siempre_activa'
      dataState.s4_abrir_caso = profileData.data.abrir_caso_fuera_horario || false
      dataState.s4_modo_horario_ia = profileData.data.modo_horario_ia || 'mismo_negocio'
    }

    if (priceData?.data && priceData.data.length > 0) {
      dataState.s5 = priceData.data
    }
  }

  return {
    success: true,
    tenantId: userData.tenant_id,
    branchId: branchId || null,
    data: dataState
  }
}

export async function saveStep0(data: {
  nombre: string
  telefono: string
  avatar_url: string
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        nombre: data.nombre,
        telefono: data.telefono,
        avatar_url: data.avatar_url
      })
      .eq('id', user.id)

    if (error) {
      console.error('Error actualizando usuario en saveStep0:', error)
      throw error
    }

    return { success: true }
  } catch (err: any) {
    console.error('saveStep0 error:', err.message)
    return { success: false, error: err.message }
  }
}

export async function saveStep1(data: {
  nombreNegocio: string
  direccionFiscal: string
  nombreSucursal: string
  direccionSucursal: string
  timezone: string
  moneda: string
  servicios: string
  politicas: { titulo: string, descripcion: string }[]
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

    if (userErr && userErr.code !== 'PGRST116') {
      await registrarError({ origen: 'app', descripcion: 'Fallo al leer usuario en Paso 1 de onboarding', stacktrace: userErr.message, tenant_id: null })
    }

    if (userErr || !userData?.tenant_id) {
      throw new Error('No tenant')
    }
    const tenantId = userData.tenant_id

    const { error: updOrgErr } = await supabaseAdmin
      .from('organizaciones')
      .update({ nombre: data.nombreNegocio, direccion_fiscal: data.direccionFiscal })
      .eq('id', tenantId)

    if (updOrgErr) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al actualizar organización en Paso 1 de onboarding', stacktrace: updOrgErr.message, tenant_id: tenantId })
    }

    const { data: branches, error: errSelBr } = await supabaseAdmin
      .from('sucursales')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(1)

    if (errSelBr) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al leer sucursales en Paso 1 de onboarding', stacktrace: errSelBr.message, tenant_id: tenantId })
    }

    let branch = branches && branches.length > 0 ? branches[0] : null

    if (!branch) {
      const { data: newBranch, error: branchErr } = await supabaseAdmin
        .from('sucursales')
        .insert({
          tenant_id: tenantId,
          nombre: data.nombreSucursal,
          direccion: data.direccionSucursal,
          timezone: data.timezone,
          moneda: data.moneda,
          activa: true,
          onboarding_completado: false,
          onboarding_paso: 1
        })
        .select('id')
        .single()
      if (branchErr) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al insertar sucursal en Paso 1 de onboarding', stacktrace: branchErr.message, tenant_id: tenantId })
        throw branchErr
      }
      branch = newBranch
    } else {
      const { error: errUpdBr } = await supabaseAdmin
        .from('sucursales')
        .update({
          nombre: data.nombreSucursal,
          direccion: data.direccionSucursal,
          timezone: data.timezone,
          moneda: data.moneda
        })
        .eq('id', branch.id)
        
      if (errUpdBr) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al actualizar sucursal en Paso 1 de onboarding', stacktrace: errUpdBr.message, tenant_id: tenantId })
      }
    }

    const { error: errUpdUsr } = await supabaseAdmin
      .from('users')
      .update({ branch_id: branch.id })
      .eq('id', user.id)

    if (errUpdUsr) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al actualizar branch_id del usuario en Paso 1 de onboarding', stacktrace: errUpdUsr.message, tenant_id: tenantId })
    }

    const { data: profiles, error: errSelProf } = await supabaseAdmin
      .from('business_profiles')
      .select('id')
      .eq('branch_id', branch.id)
      .limit(1)

    if (errSelProf) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al leer business_profiles en Paso 1 de onboarding', stacktrace: errSelProf.message, tenant_id: tenantId })
    }

    const profile = profiles && profiles.length > 0 ? profiles[0] : null

    if (!profile) {
      const { error: insErr } = await supabaseAdmin.from('business_profiles').insert({
        branch_id: branch.id,
        servicios: data.servicios,
        politicas: data.politicas
      })
      if (insErr) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al insertar business_profiles en Paso 1 de onboarding', stacktrace: insErr.message, tenant_id: tenantId })
        throw insErr
      }
    } else {
      const { error: updErr } = await supabaseAdmin.from('business_profiles').update({
        servicios: data.servicios,
        politicas: data.politicas
      }).eq('id', profile.id)
      if (updErr) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al actualizar business_profiles en Paso 1 de onboarding', stacktrace: updErr.message, tenant_id: tenantId })
        throw updErr
      }
    }

    const { error: errUpdStep } = await supabaseAdmin.from('sucursales').update({ onboarding_paso: 2 }).eq('id', branch.id)
    if (errUpdStep) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al actualizar onboarding_paso en Paso 1 de onboarding', stacktrace: errUpdStep.message, tenant_id: tenantId })
    }
    
    return { success: true, branchId: branch.id }
  } catch (error: any) {
    await registrarError({ origen: 'app', descripcion: 'Excepción general en Paso 1 de onboarding', stacktrace: error.message, tenant_id: null })
    throw error
  }
}

export async function saveStep2(data: {
  branchId: string
  horarios: { 
    dia_semana: number; 
    activo: boolean; 
    franjas: { apertura: string; cierre: string }[] 
  }[]
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')

    const res = await resolveAndValidateIds(user, '', data.branchId)
    if (!res.valid) return { success: false, error: res.error }
    const { branchId } = res

    // 1. VALIDACIÓN BACKEND (Doble chequeo)
    for (const d of data.horarios) {
      if (!d.activo) continue;
      if (!d.franjas || d.franjas.length === 0) {
        return { success: false, error: `El día ${d.dia_semana} está activo pero no tiene franjas.` }
      }
      if (d.franjas.length > 4) {
        return { success: false, error: `El día ${d.dia_semana} excede el máximo de 4 franjas.` }
      }
      
      const sorted = [...d.franjas].sort((a, b) => a.apertura.localeCompare(b.apertura))
      for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i]
        if (!f.apertura || !f.cierre || f.apertura >= f.cierre) {
          return { success: false, error: `Horas inválidas en el día ${d.dia_semana}.` }
        }
        if (i > 0 && f.apertura < sorted[i-1].cierre) {
          return { success: false, error: `Solapamiento detectado en el día ${d.dia_semana}.` }
        }
      }
    }

    // 2. BORRAR HORARIOS ANTERIORES
    const { error: delError } = await supabaseAdmin.from('business_hours').delete().eq('branch_id', branchId)
    if (delError) {
      console.error('Error borrando horarios en paso 2:', delError, JSON.stringify(delError))
      throw delError
    }

    // 3. GENERAR FILAS (Una por cada franja de cada día)
    const rows: any[] = []
    data.horarios.forEach(h => {
      if (!h.activo) {
        // Día cerrado: 1 sola fila con apertura/cierre en null
        rows.push({
          branch_id: branchId,
          dia_semana: h.dia_semana,
          apertura: null,
          cierre: null,
          cerrado: true,
          orden: 0
        })
      } else {
        // Día activo: N filas, ordenadas
        const sorted = [...h.franjas].sort((a, b) => a.apertura.localeCompare(b.apertura))
        sorted.forEach((f, idx) => {
          rows.push({
            branch_id: branchId,
            dia_semana: h.dia_semana,
            apertura: f.apertura.length === 5 ? `${f.apertura}:00` : f.apertura,
            cierre: f.cierre.length === 5 ? `${f.cierre}:00` : f.cierre,
            cerrado: false,
            orden: idx
          })
        })
      }
    })

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
  skills: { idName?: string, skill_global_id: string, nombre: string, activo: boolean }[]
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
      await registrarError({ origen: 'app', descripcion: 'Fallo al borrar skills en Paso 3 de onboarding', stacktrace: delError.message, tenant_id: tenantId })
      throw delError
    }

    const rows = data.skills.map((s, idx) => ({
      tenant_id: tenantId,
      branch_id: branchId,
      skill_global_id: s.skill_global_id,
      nombre: s.nombre,
      descripcion: s.nombre,
      activo: s.activo,
      orden: idx
    }))

    if (rows.length > 0) {
      const { error: insError } = await supabaseAdmin.from('skills').insert(rows)
      if (insError) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al insertar skills en Paso 3 de onboarding', stacktrace: insError.message, tenant_id: tenantId })
        throw insError
      }
    }

    // --- Siembra Protegida ---
    const { data: existingTags, error: errSelTags } = await supabaseAdmin.from('message_categories')
      .select('id').eq('branch_id', branchId).eq('es_fallback', true)
    
    if (errSelTags) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al leer message_categories en Paso 3 de onboarding', stacktrace: errSelTags.message, tenant_id: tenantId })
    }

    if (!existingTags || existingTags.length === 0) {
      const { error: errInsTag } = await supabaseAdmin.from('message_categories').insert({
        tenant_id: tenantId,
        branch_id: branchId,
        nombre: "Otros",
        descripcion_intencion: "El mensaje no encaja claramente en ninguna otra categoría.",
        color: "slate-d",
        es_plantilla: true,
        es_fallback: true,
        activa: true,
        es_protegida: true,
        orden: 0
      })
      if (errInsTag) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al insertar message_categories en Paso 3 de onboarding', stacktrace: errInsTag.message, tenant_id: tenantId })
      }
    }

    const { data: existingRules, error: errSelRules } = await supabaseAdmin.from('case_rules')
      .select('tipo_caso').eq('branch_id', branchId).in('tipo_caso', ['documento_no_procesable', 'derivacion_solicitada'])
    
    if (errSelRules) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al leer case_rules en Paso 3 de onboarding', stacktrace: errSelRules.message, tenant_id: tenantId })
    }

    const existingRuleTypes = existingRules?.map(r => r.tipo_caso) || []
    const rulesToInsert = []
    
    if (!existingRuleTypes.includes('documento_no_procesable')) {
      rulesToInsert.push({
        tenant_id: tenantId, branch_id: branchId,
        nombre: "Documento no procesable",
        descripcion_intencion: "El cliente envía un archivo PDF, Word, o documento similar que no podemos procesar automáticamente.",
        tipo_caso: "documento_no_procesable",
        es_plantilla: true, activa: true, es_protegida: true
      })
    }
    
    if (!existingRuleTypes.includes('derivacion_solicitada')) {
      rulesToInsert.push({
        tenant_id: tenantId, branch_id: branchId,
        nombre: "Cliente quiere hablar con un humano",
        descripcion_intencion: "El cliente solicita explícitamente ser atendido por un humano o que le pasen con un agente.",
        tipo_caso: "derivacion_solicitada",
        es_plantilla: true, activa: true, es_protegida: true
      })
    }
    
    if (rulesToInsert.length > 0) {
      const { error: errInsRules } = await supabaseAdmin.from('case_rules').insert(rulesToInsert)
      if (errInsRules) {
        await registrarError({ origen: 'app', descripcion: 'Fallo al insertar case_rules en Paso 3 de onboarding', stacktrace: errInsRules.message, tenant_id: tenantId })
      }
    }
    // --- Fin Siembra Protegida ---


    const { error: updError } = await supabaseAdmin.from('sucursales').update({ onboarding_paso: 4 }).eq('id', branchId)
    if (updError) {
      await registrarError({ origen: 'app', descripcion: 'Fallo al actualizar onboarding_paso en Paso 3 de onboarding', stacktrace: updError.message, tenant_id: tenantId })
      throw updError
    }

    return { success: true }
  } catch (error: any) {
    await registrarError({ origen: 'app', descripcion: 'Excepción general en Paso 3 de onboarding', stacktrace: error.message, tenant_id: null })
    throw error
  }
}

export async function saveStep4(data: { tenantId: string, branchId: string, msg: string, iaActiva: boolean, abrirCaso: boolean, modoHorarioIa?: string }) {
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
        msg_fuera_horario: data.msg,
        abrir_caso_fuera_horario: data.abrirCaso,
        modo_horario_ia: data.iaActiva ? 'siempre_activa' : 'mismo_negocio'
      })
      if (insError) {
        console.error('Error insertando profile en paso 4:', insError, JSON.stringify(insError))
        throw insError
      }
    } else {
      const { error: updErr } = await supabaseAdmin.from('business_profiles')
        .update({ 
          msg_fuera_horario: data.msg,
          abrir_caso_fuera_horario: data.abrirCaso,
          modo_horario_ia: data.iaActiva ? 'siempre_activa' : 'mismo_negocio'
        })
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
