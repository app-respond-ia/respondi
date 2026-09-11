// Reglas de las plantillas de WhatsApp que valen igual en el servidor y en
// las pantallas (sin nada del servidor dentro).
//
// Una plantilla es un texto aprobado por Meta con huecos numerados: "Hola
// {{1}}, tu pedido {{2}} ya está listo". Al enviarla se rellena cada hueco.

export const ETIQUETA_ESTADO_PLANTILLA: Record<string, string> = {
  aprobada: 'Aprobada',
  pendiente: 'En revisión',
  rechazada: 'Rechazada',
  pausada: 'Pausada por Meta',
  desactivada: 'Desactivada por Meta'
}

export const ETIQUETA_CATEGORIA_PLANTILLA: Record<string, string> = {
  utilidad: 'Utilidad',
  marketing: 'Marketing',
  autenticacion: 'Autenticación'
}

// Los huecos del texto, en orden: "{{1}} y {{2}}" → [1, 2]
export function huecosDe(texto: string): number[] {
  const numeros = [...(texto || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]))
  return [...new Set(numeros)].sort((a, b) => a - b)
}

// Hay huecos con nombre ({{nombre}}) en vez de números: Respondi aún no los
// sabe rellenar
export function tieneHuecosConNombre(texto: string) {
  return /\{\{\s*[a-zA-Z_][\w]*\s*\}\}/.test(texto || '')
}

export function rellenar(texto: string, valores: string[]) {
  return (texto || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (todo, n) => {
    const v = valores[Number(n) - 1]
    return v !== undefined && v !== '' ? v : todo
  })
}

// Lo que Meta exige a un cuerpo nuevo. Devuelve el problema o null.
export function problemaDelCuerpo(texto: string): string | null {
  const t = (texto || '').trim()
  if (!t) return 'Escribe el texto de la plantilla.'
  if (t.length > 1024) return 'El texto no puede pasar de 1024 caracteres.'
  if (tieneHuecosConNombre(t)) return 'Los huecos se escriben con números: {{1}}, {{2}}...'
  const huecos = huecosDe(t)
  if (huecos.some((n, i) => n !== i + 1)) return 'Los huecos tienen que ir seguidos empezando por {{1}}: {{1}}, {{2}}, {{3}}...'
  // Un punto o una palabra después del último hueco basta ("…mañana, {{1}}.")
  if (/^\{\{\s*\d+\s*\}\}/.test(t) || /\{\{\s*\d+\s*\}\}$/.test(t)) return 'Meta no acepta que el texto empiece o termine con un hueco. Añade algo antes o después (basta un punto al final).'
  if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(t)) return 'Pon alguna palabra entre dos huecos seguidos.'
  return null
}

// El texto del cuerpo y si Respondi la puede enviar tal cual. Se envían las
// que solo tienen huecos en el cuerpo; una cabecera con foto, vídeo o
// documento, o botones con partes que cambian, necesitan datos que Respondi
// todavía no pide.
export function analizarComponentes(componentes: any[] | null | undefined, cuerpoGuardado?: string) {
  const lista = Array.isArray(componentes) ? componentes : []
  const tipo = (c: any) => String(c?.type || '').toUpperCase()
  const cuerpo = lista.find(c => tipo(c) === 'BODY')?.text ?? cuerpoGuardado ?? ''
  const cabecera = lista.find(c => tipo(c) === 'HEADER')
  const pie = lista.find(c => tipo(c) === 'FOOTER')?.text || null
  const botones: any[] = lista.find(c => tipo(c) === 'BUTTONS')?.buttons || []

  let motivo: string | null = null
  if (tieneHuecosConNombre(cuerpo)) motivo = 'Usa huecos con nombre en vez de números'
  else if (cabecera && String(cabecera.format || 'TEXT').toUpperCase() !== 'TEXT') motivo = 'Lleva foto, vídeo o documento en la cabecera'
  else if (cabecera && huecosDe(cabecera.text || '').length) motivo = 'Tiene huecos en la cabecera'
  else if (botones.some(b => /\{\{/.test(b?.url || '') || ['OTP', 'COPY_CODE', 'FLOW', 'CATALOG', 'MPM'].includes(String(b?.type || '').toUpperCase()))) motivo = 'Tiene botones que cambian en cada envío'

  return {
    cuerpo,
    cabecera: cabecera && String(cabecera.format || 'TEXT').toUpperCase() === 'TEXT' ? (cabecera.text || null) : null,
    pie,
    botones: botones.map(b => String(b?.text || '')).filter(Boolean),
    huecos: huecosDe(cuerpo),
    enviable: !motivo,
    motivoNoEnviable: motivo
  }
}
