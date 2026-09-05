import { supabaseAdmin } from '@/utils/supabase/admin'

interface RegistrarErrorParams {
  origen: 'n8n' | 'api_meta' | 'llm' | 'db' | 'cron' | 'app'
  descripcion: string
  stacktrace?: string
  tenant_id?: string | null
}

export async function registrarError(params: RegistrarErrorParams) {
  try {
    await supabaseAdmin.from('error_logs').insert({
      tenant_id: params.tenant_id || null,
      origen: params.origen,
      descripcion: params.descripcion,
      stacktrace: params.stacktrace || null
    })
  } catch (err) {
    // El registro de errores nunca debe romper la acción principal si falla.
    console.error('Error al registrar en error_logs:', err)
  }
}
