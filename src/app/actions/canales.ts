'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

import { getAuthContext } from '@/lib/auth-context'

export async function getCanales() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: canales, error } = await supabase
    .from('channels')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('plan_id, plans(canales_max)')
    .eq('id', auth.tenant_id)
    .single()
  const plan = Array.isArray(organizacion?.plans) ? organizacion.plans[0] : organizacion?.plans
  const canales_max = plan?.canales_max ?? null
  const canales_activos_count = (canales || []).filter((c: any) => c.estado === 'activo').length

  return { success: true, data: { canales, canales_max, canales_activos_count } }
}

export async function conectarCanal(dataOrTipo: any, argMetodo?: any) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const data = typeof dataOrTipo === 'string'
    ? { tipo: dataOrTipo, metodo: argMetodo }
    : dataOrTipo

  const { data: newCanal, error: canalError } = await supabase
    .from('channels')
    .insert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      tipo: data.tipo,
      metodo: data.metodo || argMetodo || 'whaticket',
      estado: data.estado || 'pendiente'
    })
    .select()
    .single()

  if (canalError || !newCanal) {
    return { success: false, error: canalError?.message || 'Error al conectar el canal. Inténtalo de nuevo.' }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `solicitó conectar el canal "${newCanal.tipo}" (método: ${newCanal.metodo})`,
    tabla_afectada: 'canales',
    registro_id: newCanal.id,
    valor_nuevo: newCanal
  })

  return { success: true, canal: newCanal, data: newCanal }
}

export async function desconectarCanal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('channels')
    .select('*')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('channels')
    .update({ estado: 'desconectado' })
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `desconectó el canal "${data.tipo}"`,
    tabla_afectada: 'canales',
    registro_id: id,
    valor_anterior: anterior,
    valor_nuevo: data
  })

  return { success: true, data }
}
