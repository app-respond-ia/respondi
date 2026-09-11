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

// Qué lleva una plantilla y qué hace falta para enviarla. Meta permite:
//  - cabecera de TEXTO (con como mucho un hueco), o de FOTO, VÍDEO o
//    DOCUMENTO (hay que mandar el archivo en cada envío)
//  - cuerpo con huecos numerados
//  - pie sin huecos
//  - botones: de respuesta rápida y de teléfono no piden nada; los de enlace
//    con un hueco en la dirección y los de "copiar código" piden un valor
// Lo que Respondi todavía no sabe enviar: cabecera de UBICACIÓN y botones de
// catálogo, formularios o códigos de un solo uso.
export type FormatoCabecera = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION'

export const NOMBRE_ARCHIVO_CABECERA: Record<string, string> = {
  IMAGE: 'foto',
  VIDEO: 'vídeo',
  DOCUMENT: 'documento'
}

export const TIPOS_ARCHIVO_CABECERA: Record<string, string> = {
  IMAGE: 'image/jpeg,image/png',
  VIDEO: 'video/mp4,video/3gpp',
  DOCUMENT: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain'
}

export interface BotonPlantilla {
  indice: number
  tipo: string
  texto: string
  // 'url' → falta el final del enlace; 'copy_code' → falta el código
  necesitaValor: 'url' | 'copy_code' | null
}

export function analizarComponentes(componentes: any[] | null | undefined, cuerpoGuardado?: string) {
  const lista = Array.isArray(componentes) ? componentes : []
  const tipo = (c: any) => String(c?.type || '').toUpperCase()
  const cuerpo = lista.find(c => tipo(c) === 'BODY')?.text ?? cuerpoGuardado ?? ''
  const cab = lista.find(c => tipo(c) === 'HEADER')
  const formatoCabecera = (cab ? String(cab.format || 'TEXT').toUpperCase() : null) as FormatoCabecera | null
  const cabeceraTexto = formatoCabecera === 'TEXT' ? (cab.text || null) : null
  const huecosCabecera = huecosDe(cab?.text || '')
  const pie = lista.find(c => tipo(c) === 'FOOTER')?.text || null
  const crudos: any[] = lista.find(c => tipo(c) === 'BUTTONS')?.buttons || []

  const botones: BotonPlantilla[] = crudos.map((b, indice) => {
    const t = String(b?.type || '').toUpperCase()
    return {
      indice,
      tipo: t,
      texto: String(b?.text || ''),
      necesitaValor: t === 'URL' && /\{\{/.test(String(b?.url || '')) ? 'url' : t === 'COPY_CODE' ? 'copy_code' : null
    }
  })

  // Lo que ni a mano se puede enviar todavía
  let motivo: string | null = null
  if (tieneHuecosConNombre(cuerpo) || tieneHuecosConNombre(cab?.text || '')) motivo = 'Usa huecos con nombre en vez de números'
  else if (formatoCabecera === 'LOCATION') motivo = 'Lleva una ubicación en la cabecera'
  else if (botones.some(b => ['OTP', 'FLOW', 'CATALOG', 'MPM'].includes(b.tipo))) motivo = 'Tiene botones de catálogo, formulario o código de un solo uso'
  else if (huecosCabecera.length > 1) motivo = 'Tiene más de un hueco en la cabecera'

  const archivoCabecera = formatoCabecera && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(formatoCabecera) ? formatoCabecera : null

  return {
    cuerpo,
    // El texto de la cabecera, solo si es de texto
    cabecera: cabeceraTexto,
    cabeceraTexto,
    formatoCabecera,
    // Un archivo que hay que adjuntar en cada envío (foto, vídeo o documento)
    archivoCabecera,
    huecosCabecera,
    pie,
    botones,
    // Solo los nombres, para las vistas previas de siempre
    botonesTexto: botones.map(b => b.texto).filter(Boolean),
    huecos: huecosDe(cuerpo),
    // Se puede enviar a mano desde Chats, pidiendo lo que falte
    enviable: !motivo,
    // Se puede enviar sola (la IA, la reapertura): no pide archivo ni botones
    automatica: !motivo && !archivoCabecera && huecosCabecera.length === 0 && !botones.some(b => b.necesitaValor),
    motivoNoEnviable: motivo
  }
}
