import { DIAS_SEMANA } from '@/lib/dias-semana'

// Una franja "cruza la medianoche" cuando su hora de cierre es anterior a la
// de apertura (22:00 → 02:00): termina ya en el día siguiente.
function minutosDe(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

// ¿Los `minutos` actuales caen dentro de esta franja?
// `esDelDiaAnterior` sirve para la cola de una franja nocturna: a la 01:00 del
// jueves seguimos dentro de la franja "miércoles 22:00 → 02:00".
function dentroDeFranja(franja: any, minutos: number, esDelDiaAnterior: boolean) {
  if (!franja.apertura || !franja.cierre) return false
  const apertura = minutosDe(franja.apertura)
  const cierre = minutosDe(franja.cierre)
  const cruzaMedianoche = cierre < apertura

  if (esDelDiaAnterior) {
    // Del día anterior solo cuentan las franjas que se prolongan pasada la
    // medianoche, y solo hasta su hora de cierre.
    return cruzaMedianoche && minutos <= cierre
  }

  // Si cruza medianoche, hoy está abierta desde la apertura hasta las 24:00.
  return cruzaMedianoche ? minutos >= apertura : (minutos >= apertura && minutos <= cierre)
}

// Comprobador de huso horario basado en Intl (nativo)
export function isFueraDeHorario(timezone: string, horarios: any[]) {
  // Si no hay horario configurado, asumimos abierto 24/7
  if (!horarios || horarios.length === 0) return false

  try {
    const dateStr = new Date().toLocaleString('en-US', { timeZone: timezone, hour12: false })
    const dateInTz = new Date(dateStr)
    const dayOfWeek = dateInTz.getDay() // 0 = Domingo, 6 = Sábado
    const currentMinutes = dateInTz.getHours() * 60 + dateInTz.getMinutes()

    // Primero el día anterior: un negocio nocturno que abrió ayer a las 22:00
    // y cierra a las 02:00 sigue abierto ahora mismo, aunque hoy figure como
    // cerrado o no haya empezado su franja.
    const diaAnterior = (dayOfWeek + 6) % 7
    for (const franja of horarios.filter(h => h.dia_semana === diaAnterior && !h.cerrado)) {
      if (dentroDeFranja(franja, currentMinutes, true)) return false
    }

    const franjasHoy = horarios.filter(h => h.dia_semana === dayOfWeek && !h.cerrado)
    if (franjasHoy.length === 0) return true // Cerrado todo el día

    for (const franja of franjasHoy) {
      if (dentroDeFranja(franja, currentMinutes, false)) return false // Está abierto
    }
    return true // Fuera de todas las franjas
  } catch (error) {
    console.error('Error calculando timezone:', error)
    return false
  }
}

// ============================================================================
// Modelo canónico de horarios (compartido por perfil-sucursal, alta de
// sucursal y onboarding). Agrupado por día y con `cerrado` — nunca `activo`,
// para no arrastrar booleanos invertidos entre implementaciones.
// ============================================================================

export type Franja = {
  apertura: string
  cierre: string
  orden: number
}

export type HorarioDia = {
  dia_semana: number
  cerrado: boolean
  franjas: Franja[]
}

export type RegistroHorario = {
  branch_id: string
  dia_semana: number
  apertura: string | null
  cierre: string | null
  cerrado: boolean
  orden: number
  tipo: 'negocio' | 'ia'
}

export const MAX_FRANJAS_POR_DIA = 4

const FRANJA_POR_DEFECTO = { apertura: '09:00', cierre: '18:00', orden: 0 }

// Estado "día uno" único para toda la app: lun-vie abierto 09:00-18:00,
// sáb-dom cerrado.
export function horariosPorDefecto(): HorarioDia[] {
  return DIAS_SEMANA.map(d => ({
    dia_semana: d.id,
    cerrado: d.id === 6 || d.id === 0,
    franjas: [{ ...FRANJA_POR_DEFECTO }]
  }))
}

// Validación estricta compartida por los tres caminos de guardado.
// Devuelve el mensaje de error, o null si todo es válido.
export function validarHorarios(horarios: HorarioDia[]): string | null {
  for (const dia of horarios) {
    if (dia.cerrado) continue

    const nombreDia = DIAS_SEMANA.find(d => d.id === dia.dia_semana)?.label ?? `día ${dia.dia_semana}`

    if (!dia.franjas || dia.franjas.length === 0) {
      return `${nombreDia} está abierto pero no tiene ninguna franja horaria.`
    }
    if (dia.franjas.length > MAX_FRANJAS_POR_DIA) {
      return `${nombreDia} supera el máximo de ${MAX_FRANJAS_POR_DIA} franjas.`
    }

    const ordenadas = [...dia.franjas].sort((a, b) => a.apertura.localeCompare(b.apertura))
    let yaHayFranjaNocturna = false

    for (let i = 0; i < ordenadas.length; i++) {
      const f = ordenadas[i]
      if (!f.apertura || !f.cierre) {
        return `Falta una hora de apertura o cierre en ${nombreDia}.`
      }
      if (f.apertura === f.cierre) {
        return `En ${nombreDia}, la apertura y el cierre no pueden ser la misma hora.`
      }

      // Cierre anterior a la apertura = el negocio cierra ya de madrugada
      // (22:00 → 02:00). Se permite, con dos condiciones para que el horario
      // siga siendo interpretable: solo una por día y siempre la última.
      const cruzaMedianoche = f.cierre < f.apertura
      if (cruzaMedianoche) {
        if (yaHayFranjaNocturna) {
          return `En ${nombreDia} solo puede haber una franja que termine después de medianoche.`
        }
        if (i !== ordenadas.length - 1) {
          return `En ${nombreDia}, la franja que termina después de medianoche tiene que ser la última del día.`
        }
        yaHayFranjaNocturna = true
      }

      if (i > 0 && f.apertura < ordenadas[i - 1].cierre) {
        return `En ${nombreDia} hay franjas que se solapan.`
      }
    }
  }
  return null
}

// Postgres guarda `time` como HH:MM:SS; los inputs del navegador dan HH:MM.
function normalizarHora(hora: string): string {
  return hora.length === 5 ? `${hora}:00` : hora
}

// Forma canónica -> filas de business_hours (una por franja; los días
// cerrados generan una sola fila con horas nulas).
export function horariosARegistros(
  horarios: HorarioDia[],
  branchId: string,
  tipo: 'negocio' | 'ia' = 'negocio'
): RegistroHorario[] {
  const registros: RegistroHorario[] = []

  for (const dia of horarios) {
    if (dia.cerrado) {
      registros.push({
        branch_id: branchId,
        dia_semana: dia.dia_semana,
        apertura: null,
        cierre: null,
        cerrado: true,
        orden: 0,
        tipo
      })
      continue
    }

    const ordenadas = [...dia.franjas].sort((a, b) => a.apertura.localeCompare(b.apertura))
    ordenadas.forEach((f, idx) => {
      registros.push({
        branch_id: branchId,
        dia_semana: dia.dia_semana,
        apertura: normalizarHora(f.apertura),
        cierre: normalizarHora(f.cierre),
        cerrado: false,
        orden: idx,
        tipo
      })
    })
  }

  return registros
}

// Filas de business_hours -> forma canónica, con todos los días presentes
// y en el orden de DIAS_SEMANA. Los días sin filas se devuelven cerrados.
export function registrosAHorarios(filas: any[] | null | undefined): HorarioDia[] {
  if (!filas || filas.length === 0) return horariosPorDefecto()

  return DIAS_SEMANA.map(d => {
    const delDia = filas
      .filter(f => f.dia_semana === d.id)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

    if (delDia.length === 0 || delDia[0].cerrado) {
      return { dia_semana: d.id, cerrado: true, franjas: [{ ...FRANJA_POR_DEFECTO }] }
    }

    return {
      dia_semana: d.id,
      cerrado: false,
      franjas: delDia.map((f, idx) => ({
        apertura: f.apertura ? f.apertura.substring(0, 5) : FRANJA_POR_DEFECTO.apertura,
        cierre: f.cierre ? f.cierre.substring(0, 5) : FRANJA_POR_DEFECTO.cierre,
        orden: idx
      }))
    }
  })
}
