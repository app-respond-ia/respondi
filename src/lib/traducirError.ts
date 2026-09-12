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
// Las reglas de la base de datos que tienen nombre propio: se dice qué se ha
// intentado hacer, no cómo se llama la tabla. El orden importa: gana la
// primera que encaje.
const POR_RESTRICCION: [RegExp, string][] = [
  [/contacts_tenant_canal_id_key/i, 'Ya tienes un contacto con ese teléfono o esa dirección en este canal.'],
  [/channels_tenant_branch_tipo_key/i, 'Esta sucursal ya tiene un canal de ese tipo conectado.'],
  [/whatsapp_templates_channel_nombre_idioma_key/i, 'Ya tienes una plantilla con ese nombre en ese idioma.'],
  [/whatsapp_templates_nombre_check/i, 'El nombre de la plantilla solo admite minúsculas, números y guiones bajos.'],
  [/messages_identificador_externo_key/i, 'Ese mensaje ya estaba guardado.'],
  [/roles_personalizados_tenant_id_nombre_key/i, 'Ya existe un rol con ese nombre.'],
  [/skills_branch_id_skill_global_id_key/i, 'Esa habilidad ya está añadida en esta sucursal.'],
  [/users_email_unique/i, 'Ya hay un usuario con ese correo.'],
  [/fk_organizaciones_plan_id|fk_billing_plan_id/i, 'No puedes borrar un plan que tienen contratado organizaciones.'],
  [/fk_comisiones_vendedor_id/i, 'No puedes borrar un vendedor que tiene comisiones registradas.'],
  [/conversations_.*activa|conversaciones_activa/i, 'Ese cliente ya tiene una conversación abierta en este canal.']
]

export function traducirError(error: any): string {
  if (!error) return GENERICO

  const esTexto = typeof error === 'string'
  const original = esTexto ? error : (error.message || error.toString() || "")
  const message = original.toLowerCase()
  const code = esTexto ? "" : (error.code || "")

  // Errores de la base de datos con nombre conocido: se explican con palabras
  // del negocio (la regla que se ha saltado, no la tabla que la guarda)
  const porRestriccion = POR_RESTRICCION.find(([re]) => re.test(original))
  if (porRestriccion) return porRestriccion[1]

  if (code === '23505' || message.includes('unique_violation') || message.includes('duplicate key')) {
    return "Ya existe un registro con estos datos.";
  }
  if (code === '23503' || message.includes('foreign_key_violation') || message.includes('violates foreign key constraint')) {
    // Al borrar: algo lo está usando. Al guardar: apunta a algo que ya no está.
    return message.includes('still referenced') || message.includes('update or delete')
      ? "No se puede borrar porque hay cosas que dependen de esto."
      : "No se puede guardar: apunta a algo que ya no existe (quizá se ha borrado en otra pantalla).";
  }
  if (code === '23502' || message.includes('not_null_violation') || message.includes('null value')) {
    return "Falta un dato obligatorio.";
  }
  if (code === '23514' || message.includes('check constraint')) {
    return "Alguno de los datos no es válido.";
  }
  if (code === '22P02' || message.includes('invalid input syntax')) {
    return "Alguno de los datos tiene un formato que no se entiende.";
  }
  if (code === '22001' || message.includes('value too long')) {
    return "Un texto es demasiado largo.";
  }
  if (code === '57014' || message.includes('canceling statement due to statement timeout')) {
    return "La consulta ha tardado demasiado. Prueba con menos datos o inténtalo de nuevo.";
  }
  if (code === '53300' || message.includes('too many connections')) {
    return "El servidor está saturado ahora mismo. Inténtalo en un momento.";
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
  if (message.includes('user already registered') || message.includes('already been registered')) {
    return "Ya existe un usuario con este correo.";
  }
  if (message.includes('email rate limit exceeded') || message.includes('over_email_send_rate_limit') || message.includes('request this after')) {
    return "Se han hecho demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  }
  if (message.includes('email not confirmed')) {
    return "Tienes que confirmar tu correo antes de entrar.";
  }
  if (message.includes('weak_password') || message.includes('password should be at least')) {
    return "La contraseña es demasiado corta: usa al menos 8 caracteres.";
  }
  if (message.includes('signups not allowed') || message.includes('signup_disabled')) {
    return "Ahora mismo no se pueden crear cuentas nuevas.";
  }

  // No lo reconocemos. Si es un texto que la app decidió mostrar y no parece
  // técnico, se respeta: casi siempre es un mensaje mejor que el genérico.
  if (esTexto && original.trim() !== "" && !RASTROS_TECNICOS.test(original)) {
    return original
  }

  return GENERICO
}
