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

export function traducirError(error: any): string {
  if (!error) return "Ha ocurrido un error inesperado. Si persiste, contacta con soporte.";

  const message = (error.message || error.toString() || "").toLowerCase();
  const code = error.code || "";

  if (code === '23505' || message.includes('unique_violation') || message.includes('duplicate key')) {
    return "Ya existe un registro con estos datos.";
  }
  if (code === '23503' || message.includes('foreign_key_violation')) {
    return "No se puede completar la acción porque hay datos relacionados.";
  }
  if (code === '23502' || message.includes('not_null_violation') || message.includes('null value')) {
    return "Falta un dato obligatorio.";
  }
  if (code === '42501' || message.includes('new row violates row-level security policy') || message.includes('policy') || message.includes('permission denied')) {
    return "No tienes permiso para realizar esta acción.";
  }
  if (message.includes('timeout') || message.includes('fetch failed') || message.includes('network error')) {
    return "El servidor tardó demasiado en responder, inténtalo de nuevo.";
  }
  
  // Mensajes comunes de Supabase Auth
  if (message.includes('invalid login credentials')) {
    return "Correo o contraseña incorrectos.";
  }
  if (message.includes('user already registered')) {
    return "Ya existe un usuario con este correo.";
  }

  // Devolver error genérico para no filtrar detalles técnicos a la UI
  return "Ha ocurrido un error inesperado. Si persiste, contacta con soporte.";
}
