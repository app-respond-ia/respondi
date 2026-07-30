import { supabaseAdmin } from '@/utils/supabase/admin'

interface RegistrarAuditoriaParams {
  tenant_id: string
  user_id: string
  accion: string
  tabla_afectada: string
  registro_id?: string
  valor_anterior?: any
  valor_nuevo?: any
}

export async function registrarAuditoria(params: RegistrarAuditoriaParams) {
  try {
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      accion: params.accion,
      tabla_afectada: params.tabla_afectada,
      registro_id: params.registro_id || null,
      valor_anterior: params.valor_anterior ?? null,
      valor_nuevo: params.valor_nuevo ?? null
    })
  } catch (err) {
    // La auditoría nunca debe romper la acción principal si falla.
    console.error('Error al registrar auditoría:', err)
  }
}
