// Comprobador de huso horario basado en Intl (nativo)
export function isFueraDeHorario(timezone: string, horarios: any[]) {
  // Si no hay horario configurado, asumimos abierto 24/7
  if (!horarios || horarios.length === 0) return false 

  try {
    const dateStr = new Date().toLocaleString('en-US', { timeZone: timezone, hour12: false })
    const dateInTz = new Date(dateStr) 
    const dayOfWeek = dateInTz.getDay() // 0 = Domingo, 6 = Sábado
    const currentMinutes = dateInTz.getHours() * 60 + dateInTz.getMinutes()

    const franjasHoy = horarios.filter(h => h.dia_semana === dayOfWeek && !h.cerrado)
    if (franjasHoy.length === 0) return true // Cerrado todo el día

    for (const franja of franjasHoy) {
      if (!franja.apertura || !franja.cierre) continue
      const [apH, apM] = franja.apertura.split(':').map(Number)
      const [ciH, ciM] = franja.cierre.split(':').map(Number)
      const openMin = apH * 60 + apM
      const closeMin = ciH * 60 + ciM
      
      if (currentMinutes >= openMin && currentMinutes <= closeMin) {
        return false // Está abierto
      }
    }
    return true // Fuera de todas las franjas
  } catch (error) {
    console.error('Error calculando timezone:', error)
    return false
  }
}
