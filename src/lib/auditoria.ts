import { supabaseAdmin } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

interface RegistrarAuditoriaParams {
  tenant_id: string | null
  user_id: string | null
  actuado_como_id?: string | null
  accion: string
  tabla_afectada: string
  registro_id?: string
  valor_anterior?: any
  valor_nuevo?: any
  // Sucursal a la que pertenece el cambio. Si no se indica, se deduce (ver
  // `sucursalDelCambio`); los cambios de toda la organización no llevan.
  branch_id?: string | null
}

// Lo que se registra de estas tablas es de una sucursal concreta. El resto
// (usuarios, roles, organización, plan, tickets de soporte...) es de toda la
// organización.
const DE_SUCURSAL = new Set([
  'cases', 'conversations', 'messages', 'contactos', 'canales', 'whatsapp_templates',
  'precios', 'etiquetas', 'reglas', 'skills', 'novedades', 'tipos_novedad',
  'horarios', 'perfil', 'policy_sources', 'sucursales'
])

// De qué sucursal es un cambio, para que el registro de cambios se pueda
// separar por sucursal como el resto de datos:
//   · la ficha de una sucursal → esa sucursal;
//   · un caso o una conversación → la suya;
//   · el resto de cambios de sucursal → la sucursal activa del usuario, que
//     es sobre la que trabajan todas las acciones.
async function sucursalDelCambio(params: RegistrarAuditoriaParams): Promise<string | null> {
  if (params.branch_id !== undefined) return params.branch_id
  if (!DE_SUCURSAL.has(params.tabla_afectada)) return null

  if ((params.tabla_afectada === 'sucursales' || params.tabla_afectada === 'perfil') && params.registro_id) {
    return params.registro_id
  }

  if ((params.tabla_afectada === 'cases' || params.tabla_afectada === 'conversations') && params.registro_id) {
    const { data } = await supabaseAdmin.from(params.tabla_afectada).select('branch_id').eq('id', params.registro_id).maybeSingle()
    if (data?.branch_id) return data.branch_id
  }

  if (!params.user_id) return null
  const supabase = await createClient()
  return await resolveBranchId(supabase, params.user_id)
}

export async function registrarAuditoria(params: RegistrarAuditoriaParams) {
  try {
    let branchId: string | null = null
    try {
      branchId = await sucursalDelCambio(params)
    } catch {
      // Sin sucursal el cambio queda como de la organización: lo verá solo el
      // propietario o un administrador, nunca alguien de otra sucursal.
      branchId = null
    }

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      actuado_como_id: params.actuado_como_id ?? null,
      accion: params.accion,
      tabla_afectada: params.tabla_afectada,
      registro_id: params.registro_id || null,
      valor_anterior: params.valor_anterior ?? null,
      valor_nuevo: params.valor_nuevo ?? null,
      branch_id: branchId
    })
  } catch (err) {
    // La auditoría nunca debe romper la acción principal si falla.
    console.error('Error al registrar auditoría:', err)
  }
}
