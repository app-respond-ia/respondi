'use server'

import { createClient } from '@/utils/supabase/server'

// Para el superadmin — gestión de skills globales
export async function getSkillsGlobales() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skills_globales')
    .select('*')
    .order('orden', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearSkillGlobal(data: {
  nombre: string
  descripcion?: string
  cliente_puede_toggle: boolean
  activa_por_defecto: boolean
  orden: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (userData?.rol !== 'super_admin') return { success: false, error: 'No autorizado' }

  const { data: result, error } = await supabase
    .from('skills_globales')
    .insert([data])
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: result }
}

export async function actualizarSkillGlobal(id: string, data: Partial<{
  nombre: string
  descripcion: string
  cliente_puede_toggle: boolean
  activa_por_defecto: boolean
  orden: number
}>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (userData?.rol !== 'super_admin') return { success: false, error: 'No autorizado' }

  const { data: result, error } = await supabase
    .from('skills_globales')
    .update(data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: result }
}

export async function eliminarSkillGlobal(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (userData?.rol !== 'super_admin') return { success: false, error: 'No autorizado' }

  const { error } = await supabase.from('skills_globales').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// Para el dashboard del cliente — leer skills globales y sus toggles
export async function getSkillsParaCliente(branchId: string) {
  const supabase = await createClient()

  // Leer skills globales
  const { data: globales, error } = await supabase
    .from('skills_globales')
    .select('*')
    .order('orden', { ascending: true })

  if (error) return { success: false, error: error.message }

  // Leer toggles del cliente (tabla skills existente)
  const { data: clienteSkills } = await supabase
    .from('skills')
    .select('nombre, activo')
    .eq('branch_id', branchId)

  // Combinar: para cada skill global, ver si el cliente la tiene activada
  const resultado = (globales || []).map(g => {
    const clienteSkill = (clienteSkills || []).find(s => s.nombre === g.nombre)
    return {
      ...g,
      activo: clienteSkill ? clienteSkill.activo : g.activa_por_defecto
    }
  })

  return { success: true, data: resultado }
}

export async function toggleSkillCliente(branchId: string, tenantId: string, nombreSkill: string, activo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Verificar que el cliente puede togglear esta skill
  const { data: skillGlobal } = await supabase
    .from('skills_globales')
    .select('cliente_puede_toggle')
    .eq('nombre', nombreSkill)
    .single()

  if (!skillGlobal?.cliente_puede_toggle) {
    return { success: false, error: 'Esta skill no se puede modificar' }
  }

  // Upsert en tabla skills del cliente
  const { error } = await supabase
    .from('skills')
    .upsert({
      branch_id: branchId,
      tenant_id: tenantId,
      nombre: nombreSkill,
      activo,
      orden: 0
    }, { onConflict: 'branch_id,nombre' })

  if (error) return { success: false, error: error.message }
  return { success: true }
}
