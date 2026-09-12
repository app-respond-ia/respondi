// El idioma en el que se escriben las automatizaciones.
//
// Una automatización es una RECETA: qué la dispara, qué condiciones tienen
// que cumplirse y qué pasos se dan (con esperas por medio). Las 37 que
// vienen hechas son recetas escritas por nosotros; el día que haya editor
// visual, el cliente guardará una receta con esta misma forma y el motor la
// ejecutará igual, sin tocar nada más.

export type ClaveCategoria =
  | 'pedidos'
  | 'recuperar'
  | 'vender'
  | 'posventa'
  | 'devoluciones'
  | 'equipo'
  | 'mantenimiento'

export interface Categoria {
  clave: ClaveCategoria
  nombre: string
  descripcion: string
}

export const CATEGORIAS: Categoria[] = [
  { clave: 'pedidos', nombre: 'Pedidos y envíos', descripcion: 'Mantener al cliente informado de su pedido sin que tengas que escribir tú.' },
  { clave: 'recuperar', nombre: 'Recuperar ventas', descripcion: 'Volver a por las ventas que se quedaron a medias.' },
  { clave: 'vender', nombre: 'Vender desde el chat', descripcion: 'Que la IA venda de verdad: busca, recomienda y manda el enlace de compra.' },
  { clave: 'posventa', nombre: 'Posventa y fidelización', descripcion: 'Lo que pasa después de la compra: reseñas, consejos y clientes que repiten.' },
  { clave: 'devoluciones', nombre: 'Devoluciones e incidencias', descripcion: 'Cuando algo sale mal, que se atienda rápido y acabe en manos de una persona.' },
  { clave: 'equipo', nombre: 'Para tu equipo', descripcion: 'Avisos internos: nadie mira el panel todo el día.' },
  { clave: 'mantenimiento', nombre: 'Mantenimiento', descripcion: 'Trabajo de fondo. No manda ningún mensaje a nadie.' }
]

// ---------------------------------------------------------------------------
// El disparador: qué hace que la automatización se ponga en marcha
// ---------------------------------------------------------------------------
export type Disparador =
  // Algo que pasa en la tienda (Shopify nos avisa, o lo vemos al repasar)
  | { tipo: 'evento_tienda'; evento: string }
  // Un repaso cada tanto (lo lanza el reloj, no la tienda)
  | { tipo: 'programado'; cada: 'hora' | 'dia' | 'semana'; hora?: number }
  // Algo que dice el cliente en el chat
  | { tipo: 'mensaje_cliente'; intencion: string }
  // Algo que pasa dentro de Respondi
  | { tipo: 'evento_interno'; evento: string }

// ---------------------------------------------------------------------------
// Las condiciones: cuándo sí y cuándo no
// ---------------------------------------------------------------------------
// `campo` es un dato del caso que se está tratando ('pedido.total',
// 'cliente.acepta_marketing', 'pedido.pais'...). `ajuste` toma el valor de lo
// que el cliente haya puesto en los ajustes de esa automatización, en vez de
// llevarlo escrito a fuego.
export interface Condicion {
  campo: string
  operador: 'mayor' | 'menor' | 'igual' | 'distinto' | 'contiene' | 'es_cierto' | 'es_falso' | 'existe' | 'no_existe'
  valor?: any
  ajuste?: string
}

// ---------------------------------------------------------------------------
// Los pasos: qué se hace, en orden
// ---------------------------------------------------------------------------
export type Paso =
  // Esperar antes de seguir. El motor guarda por dónde iba y vuelve luego.
  | { tipo: 'esperar'; minutos?: number; horas?: number; dias?: number; ajuste?: string }
  // Si no se cumple, la automatización se para aquí (queda "omitida")
  | { tipo: 'comprobar'; condiciones: Condicion[] }
  // Escribir al cliente. Si han pasado más de 24 h desde su último mensaje,
  // Meta obliga a usar una plantilla aprobada: por eso `plantilla`.
  | { tipo: 'mensaje'; texto: string; ajuste_texto?: string; plantilla?: string }
  // Dejar que conteste la IA con una instrucción concreta
  | { tipo: 'ia_responde'; instruccion: string }
  | { tipo: 'etiquetar'; etiqueta: string }
  | { tipo: 'abrir_caso'; asunto: string; prioridad?: 'baja' | 'normal' | 'alta' }
  | { tipo: 'avisar_equipo'; texto: string }
  | { tipo: 'crear_descuento'; ajuste_porcentaje?: string; porcentaje?: number; dias_validez?: number }
  | { tipo: 'enlace_compra' }
  | { tipo: 'etiquetar_en_tienda'; etiqueta: string }
  | { tipo: 'importar_catalogo' }
  | { tipo: 'importar_politicas' }

export interface Receta {
  disparador: Disparador
  condiciones?: Condicion[]
  pasos: Paso[]
}

// ---------------------------------------------------------------------------
// Los ajustes que el cliente puede tocar en cada automatización
// ---------------------------------------------------------------------------
export interface CampoAjuste {
  clave: string
  etiqueta: string
  tipo: 'texto' | 'texto_largo' | 'numero' | 'horas' | 'dias' | 'interruptor' | 'plantilla' | 'hora'
  ayuda?: string
  porDefecto: any
  min?: number
  max?: number
  sufijo?: string
}

export interface Automatizacion {
  clave: string
  nombre: string
  // Una frase, en cristiano, de lo que hace
  descripcion: string
  // Cómo se le cuenta al cliente lo que va a pasar exactamente
  detalle: string
  categoria: ClaveCategoria
  // ¿Ya está construida y probada, o está en camino?
  estado: 'lista' | 'en_camino'
  // ¿Necesita la tienda conectada?
  requiereTienda: boolean
  // Permisos de Shopify sin los que no puede funcionar
  permisos?: string[]
  // ¿Escribe al cliente por su cuenta? (entonces puede costar dinero en Meta)
  escribeAlCliente: boolean
  // ¿Es promoción? Solo a quien lo haya aceptado, y Meta la cobra más cara.
  marketing: boolean
  campos: CampoAjuste[]
  receta: Receta
}

// Los ajustes de una automatización: los que haya guardado el cliente, y
// para lo que no haya tocado, los de fábrica.
export function ajustesConDefectos(automatizacion: Automatizacion, guardados: Record<string, any> | null | undefined) {
  const salida: Record<string, any> = {}
  for (const campo of automatizacion.campos) {
    const valor = guardados?.[campo.clave]
    salida[campo.clave] = valor === undefined || valor === null || valor === '' ? campo.porDefecto : valor
  }
  return salida
}
