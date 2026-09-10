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
