// Fechas y horas en la zona horaria de la sucursal, sin librerías.
//
// Todo lo que se guarda va en UTC (timestamptz). Todo lo que se enseña o se
// calcula (huecos, "el jueves a las 10") va en la zona de la sucursal. Estas
// funciones hacen el puente con Intl, que es nativo.

const ZONA_POR_DEFECTO = 'Europe/Madrid'

export interface PartesFecha {
  anio: number
  mes: number // 1-12
  dia: number // 1-31
  hora: number
  minuto: number
  diaSemana: number // 0 = domingo, 6 = sábado
}

const formateadores = new Map<string, Intl.DateTimeFormat>()
function formateador(zona: string) {
  let f = formateadores.get(zona)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    })
    formateadores.set(zona, f)
  }
  return f
}

export function zonaValida(zona: string | null | undefined) {
  if (!zona) return ZONA_POR_DEFECTO
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona })
    return zona
  } catch {
    return ZONA_POR_DEFECTO
  }
}

// Qué día y hora es este instante en esa zona
export function partesEnZona(instante: Date, zona: string): PartesFecha {
  const partes = formateador(zona).formatToParts(instante)
  const v = (t: string) => partes.find(p => p.type === t)?.value || '0'
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    anio: Number(v('year')),
    mes: Number(v('month')),
    dia: Number(v('day')),
    hora: Number(v('hour')) % 24,
    minuto: Number(v('minute')),
    diaSemana: dias[v('weekday')] ?? 0
  }
}

// Desfase (minutos) de la zona respecto a UTC en ese instante
function desfaseMinutos(instante: Date, zona: string) {
  const p = partesEnZona(instante, zona)
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto)
  const truncado = Math.floor(instante.getTime() / 60000) * 60000
  return Math.round((comoUtc - truncado) / 60000)
}

// El instante (UTC) que corresponde a "ese día a esa hora" en esa zona.
// Se calcula dos veces por los cambios de hora (marzo/octubre).
export function instanteLocal(zona: string, anio: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const supuesto = Date.UTC(anio, mes - 1, dia, hora, minuto)
  let desfase = desfaseMinutos(new Date(supuesto), zona)
  let instante = supuesto - desfase * 60000
  const desfase2 = desfaseMinutos(new Date(instante), zona)
  if (desfase2 !== desfase) instante = supuesto - desfase2 * 60000
  return new Date(instante)
}

// "2026-09-14" → { anio, mes, dia }
export function leerFecha(texto: string): { anio: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || '').trim())
  if (!m) return null
  const anio = Number(m[1]), mes = Number(m[2]), dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return { anio, mes, dia }
}

// "10:30" → minutos desde medianoche
export function minutosDeHora(hora: string): number {
  const [h, m] = String(hora || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fechaIso(p: { anio: number; mes: number; dia: number }) {
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

// El día (YYYY-MM-DD) de un instante en esa zona
export function diaEnZona(instante: Date, zona: string) {
  return fechaIso(partesEnZona(instante, zona))
}

// Sumar días a una fecha YYYY-MM-DD (sin zona: es solo calendario)
export function sumarDias(fecha: string, dias: number) {
  const p = leerFecha(fecha)
  if (!p) return fecha
  const d = new Date(Date.UTC(p.anio, p.mes - 1, p.dia + dias))
  return fechaIso({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() })
}

// Para enseñar: "jueves 14 de septiembre, 10:30"
export function textoFechaHora(instante: Date | string, zona: string, opciones: { conHora?: boolean; conAnio?: boolean } = {}) {
  const d = typeof instante === 'string' ? new Date(instante) : instante
  const conHora = opciones.conHora !== false
  try {
    const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long', ...(opciones.conAnio ? { year: 'numeric' } : {}) }).format(d)
    if (!conHora) return fecha
    return `${fecha}, ${textoHora(d, zona)}`
  } catch {
    return d.toISOString()
  }
}

export function textoHora(instante: Date | string, zona: string) {
  const d = typeof instante === 'string' ? new Date(instante) : instante
  return new Intl.DateTimeFormat('es-ES', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

export function textoFecha(instante: Date | string, zona: string) {
  return textoFechaHora(instante, zona, { conHora: false })
}

// ¿Se solapan dos intervalos? (medio abiertos: [a, b) y [c, d))
export function seSolapan(a: number, b: number, c: number, d: number) {
  return a < d && c < b
}
