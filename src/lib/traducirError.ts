const GENERICO = "Ha ocurrido un error inesperado. Si persiste, contacta con soporte."

// Rastros de que un texto es un error técnico crudo (Postgres, PostgREST,
// Supabase Auth) y no un mensaje que la app haya escrito para el usuario.
// Sirven de red: si no reconocemos el error pero huele a técnico, se sustituye
// por el genérico en vez de enseñárselo tal cual a alguien.
const RASTROS_TECNICOS = /violates|constraint|does not exist|syntax error|invalid input|relation ["']|column ["']|schema cache|PGRST|JWT|fetch failed|duplicate key|unexpected token|internal server error|econnrefused|at line \d|\bstack\b/i

/**
 * Convierte un error en algo que una persona pueda entender.
 *
 * IMPORTANTE — el porqué de la distinción entre objeto y texto:
 * esta función recibe dos cosas muy distintas según quién la llame.
 *
 *  - Un **objeto de error** de Postgres/Supabase (con `.code`/`.message`):
 *    es ruido técnico. Si no lo reconocemos, se devuelve el genérico para no
 *    filtrar detalles internos a la interfaz.
 *
 *  - Un **texto** que ya viene elegido por la app (`res.error`, un literal
 *    escrito a mano...): normalmente es un mensaje humano y correcto. Antes
 *    también acababa en el genérico si no coincidía con ningún patrón, y eso
 *    destruía mensajes buenos por toda la aplicación. Caso real:
 *    `actualizarRegla` bloquea editar una regla del sistema con el mensaje
 *    "Esta regla es del sistema y no se puede editar ni desactivar.", pero en
 *    pantalla solo se veía "Ha ocurrido un error inesperado".
 *    Ahora un texto no reconocido se devuelve tal cual, salvo que tenga
 *    rastros técnicos evidentes.
 */
export function traducirError(error: any): string {
  if (!error) return GENERICO

  const esTexto = typeof error === 'string'
  const original = esTexto ? error : (error.message || error.toString() || "")
  const message = original.toLowerCase()
  const code = esTexto ? "" : (error.code || "")

  if (code === '23505' || message.includes('unique_violation') || message.includes('duplicate key')) {
    return "Ya existe un registro con estos datos.";
  }
  if (code === '23503' || message.includes('foreign_key_violation')) {
    return "No se puede completar la acción porque hay datos relacionados.";
  }
  if (code === '23502' || message.includes('not_null_violation') || message.includes('null value')) {
    return "Falta un dato obligatorio.";
  }
  if (code === '42501' || message.includes('new row violates row-level security policy') || message.includes('row-level security') || message.includes('permission denied')) {
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

  // No lo reconocemos. Si es un texto que la app decidió mostrar y no parece
  // técnico, se respeta: casi siempre es un mensaje mejor que el genérico.
  if (esTexto && original.trim() !== "" && !RASTROS_TECNICOS.test(original)) {
    return original
  }

  return GENERICO
}
