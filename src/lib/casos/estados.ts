// Única definición de qué estados de un caso cuentan como "terminado" y cuáles
// como "abierto". Antes cada archivo tenía su propia lista (y el índice único
// y la búsqueda de casos existentes solo consideraban terminado 'cerrado',
// estado que la aplicación no pone nunca), así que un caso resuelto se veía
// como abierto en unos sitios y como terminado en otros.
export const ESTADOS_CASO_TERMINADOS = ['resuelto', 'cerrado'] as const
export const ESTADOS_CASO_ABIERTOS = ['pendiente', 'atendiendo'] as const

export function casoTerminado(estatus: string | null | undefined) {
  return !!estatus && (ESTADOS_CASO_TERMINADOS as readonly string[]).includes(estatus)
}

// Descripción con la que nace un caso que abre una persona desde una
// conversación. Las métricas la usan para separar los casos manuales de los
// que abre el sistema, así que tiene que ser la misma en los dos sitios.
export const DESCRIPCION_CASO_MANUAL = 'Caso creado manualmente desde la conversación'
