// Utilidades compartidas del sistema de invitaciones.
//
// Una invitación vive en `invitaciones_pendientes` hasta que la persona se
// registra con ese email; solo entonces aparece la fila en `vendedores` o
// `organizaciones`. Hasta hoy ninguna pantalla consultaba esa tabla, así que
// quien invitaba no tenía forma de ver el estado, reenviar, cancelar ni
// detectar un email mal escrito.

export type TipoInvitacion = 'vendedor' | 'admin_trial' | 'usuario_organizacion'

export type EstadoInvitacion = 'aceptada' | 'pendiente' | 'caducada'

// Días tras los cuales una invitación sin aceptar se considera caducada.
// Es solo una lectura del estado: no se borra nada ni se bloquea el alta,
// para no romper invitaciones antiguas que sigan siendo válidas.
export const DIAS_CADUCIDAD_INVITACION = 14

export function estadoInvitacion(inv: { aceptada: boolean; created_at: string }): EstadoInvitacion {
  if (inv.aceptada) return 'aceptada'
  const dias = (Date.now() - new Date(inv.created_at).getTime()) / 86400000
  return dias > DIAS_CADUCIDAD_INVITACION ? 'caducada' : 'pendiente'
}

// Validación de email deliberadamente simple: comprueba la forma
// (algo@algo.tld) sin intentar validar el estándar completo, que en la
// práctica rechaza direcciones válidas. Se añadió porque sin ella se
// colaron invitaciones reales con el email "mmm" y con un dominio mal
// escrito que nadie detectó hasta revisar la base de datos.
export function emailValido(email: string): boolean {
  const limpio = (email || '').trim()
  if (limpio.length < 5 || limpio.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio)
}

export function normalizarEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}

// Distancia de edición (Levenshtein): cuántos caracteres hay que cambiar
// para pasar de un texto a otro.
function distanciaEdicion(a: string, b: string): number {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 99  // corte rápido: no nos interesa
  let fila = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const nueva = [i]
    for (let j = 1; j <= n; j++) {
      nueva[j] = Math.min(
        fila[j] + 1,
        nueva[j - 1] + 1,
        fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    fila = nueva
  }
  return fila[n]
}

// Busca, entre los emails de cuentas que ya existen, uno que se parezca
// tanto al de la invitación que casi seguro sea una errata al teclear.
//
// Nace de un caso real: se invitó a "n8n@propulsesytem.com" (falta una
// "s") y la invitación se quedó pendiente para siempre, mientras la
// cuenta buena se daba de alta con el email correcto. A simple vista las
// dos líneas parecían la misma y costó entender por qué una seguía
// pendiente.
export function posibleErrata(email: string, emailsExistentes: string[]): string | null {
  const e = normalizarEmail(email)
  for (const otro of emailsExistentes) {
    const o = normalizarEmail(otro)
    if (o === e) continue
    if (distanciaEdicion(e, o) <= 2) return otro
  }
  return null
}

// Embudo de captación de un vendedor.
export type EmbudoVendedor = {
  enviadas: number
  pendientes: number
  caducadas: number
  registradas: number
  activas: number
  tasaRegistro: number    // % de invitaciones que acabaron en alta
  tasaConversion: number  // % de altas que pasaron a cliente activo
}

export function calcularEmbudo(
  invitaciones: { aceptada: boolean; created_at: string }[],
  clientes: { estado_seguimiento?: string | null; organizaciones?: any }[]
): EmbudoVendedor {
  const enviadas = invitaciones.length
  let pendientes = 0
  let caducadas = 0
  for (const inv of invitaciones) {
    const e = estadoInvitacion(inv)
    if (e === 'pendiente') pendientes++
    else if (e === 'caducada') caducadas++
  }

  const registradas = clientes.length
  const activas = clientes.filter(c => {
    const org = Array.isArray(c.organizaciones) ? c.organizaciones[0] : c.organizaciones
    return org?.estado === 'activo'
  }).length

  return {
    enviadas,
    pendientes,
    caducadas,
    registradas,
    activas,
    tasaRegistro: enviadas > 0 ? Math.round((registradas / enviadas) * 100) : 0,
    tasaConversion: registradas > 0 ? Math.round((activas / registradas) * 100) : 0
  }
}
