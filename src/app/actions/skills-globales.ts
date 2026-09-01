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

export async function getSkillsGlobalesBase() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skills_globales')
    .select('id, slug, nombre, descripcion, activa_por_defecto, cliente_puede_toggle, orden')
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

  // Obtener nombre de la skill antes de eliminar
  const { data: skill } = await supabase
    .from('skills_globales')
    .select('nombre')
    .eq('id', id)
    .single()

  if (!skill) return { success: false, error: 'Skill no encontrada' }

  // Eliminar toggles de clientes que referencian esta skill
  await supabase
    .from('skills')
    .delete()
    .eq('skill_global_id', id)

  // Eliminar la skill global
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
    .select('skill_global_id, activo')
    .eq('branch_id', branchId)

  // Combinar: para cada skill global, ver si el cliente la tiene activada
  const resultado = (globales || []).map(g => {
    const clienteSkill = (clienteSkills || []).find(s => s.skill_global_id === g.id)
    return {
      ...g,
      // For compatibility with the frontend that expects 'idName' which doesn't exist on skills_globales
      idName: g.slug, 
      fija: !g.cliente_puede_toggle,
      activo: clienteSkill ? clienteSkill.activo : g.activa_por_defecto
    }
  })

  return { success: true, data: resultado }
}

export async function toggleSkillCliente(branchId: string, tenantId: string, skillGlobalId: string, activo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Verificar que el cliente puede togglear esta skill
  const { data: skillGlobal } = await supabase
    .from('skills_globales')
    .select('id, cliente_puede_toggle')
    .eq('id', skillGlobalId)
    .single()

  if (!skillGlobal?.cliente_puede_toggle) {
    return { success: false, error: 'Esta skill no se puede modificar' }
  }

  // Actualizar tabla skills del cliente
  const { error } = await supabase
    .from('skills')
    .update({ activo })
    .eq('branch_id', branchId)
    .eq('skill_global_id', skillGlobalId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
