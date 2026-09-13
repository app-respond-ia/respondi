// El color de los créditos, igual en el servidor y en las pantallas.
// Decidido con Jorge (13-09-2026): verde por encima del 30 % del plan,
// amarillo entre el 10 % y el 30 %, rojo por debajo del 10 % o agotados.
// Se avisa (campana y correo) al llegar al 20 % y al agotarse.

export type NivelCreditos = 'verde' | 'amarillo' | 'rojo' | 'agotado'

export const AVISO_AL_PORCENTAJE = 20

export function nivelCreditos(saldo: number, max: number): { nivel: NivelCreditos; pct: number } {
  const s = Number(saldo) || 0
  const m = Number(max) || 0
  if (s <= 0) return { nivel: 'agotado', pct: 0 }
  // Sin tope conocido (el plan no dice cuántos da), solo importa si queda saldo
  if (m <= 0) return { nivel: 'verde', pct: 100 }
  const pct = Math.max(0, Math.min(100, (s / m) * 100))
  if (pct < 10) return { nivel: 'rojo', pct }
  if (pct <= 30) return { nivel: 'amarillo', pct }
  return { nivel: 'verde', pct }
}

export const CLASES_NIVEL: Record<NivelCreditos, { fondo: string; punto: string; barra: string; texto: string }> = {
  verde: { fondo: 'bg-emerald-50 text-emerald-800', punto: 'bg-emerald-500', barra: 'bg-emerald-500', texto: 'text-emerald-700' },
  amarillo: { fondo: 'bg-amber-50 text-amber-800', punto: 'bg-amber-500', barra: 'bg-amber-500', texto: 'text-amber-700' },
  rojo: { fondo: 'bg-rose-50 text-rose-700', punto: 'bg-rose-500', barra: 'bg-rose-500', texto: 'text-rose-700' },
  agotado: { fondo: 'bg-rose-100 text-rose-800', punto: 'bg-rose-600', barra: 'bg-rose-600', texto: 'text-rose-700' }
}

export function textoNivel(nivel: NivelCreditos) {
  switch (nivel) {
    case 'agotado': return 'Sin créditos: la IA ha dejado de contestar. Amplía tu plan para seguir.'
    case 'rojo': return 'Quedan muy pocos créditos. Amplía tu plan antes de que se agoten.'
    case 'amarillo': return 'Los créditos van bajando. Si necesitas más, amplía tu plan.'
    default: return ''
  }
}
