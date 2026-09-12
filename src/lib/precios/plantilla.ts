import type { Workbook } from 'exceljs'

// La plantilla de Excel de la lista de precios. Lleva lo que el negocio ya
// tiene y, además, listas desplegables para que no haya que escribir a mano:
// producto/servicio, cómo es el precio, y sus categorías y subcategorías (la
// de subcategorías cambia según la categoría que se elija en cada fila).
//
// Está aquí, fuera de la pantalla, para poder probarla: se generaba dentro del
// componente y no había forma de comprobar que el archivo salía bien.

export interface ItemPrecio {
  nombre: string
  tipo: string
  precio_tipo: string
  precio: number | null
  descripcion?: string | null
  categoria_id?: string | null
}

export interface CategoriaPrecio {
  id: string
  nombre: string
  parent_id?: string | null
}

export const COLUMNAS_PLANTILLA = ['nombre', 'tipo', 'precio_tipo', 'precio', 'categoria', 'subcategoria', 'descripcion'] as const

// Cuántas filas vacías se preparan con sus desplegables por debajo de lo que ya hay
const FILAS_EN_BLANCO = 500

export function nombresDeCategoria(categorias: CategoriaPrecio[], id?: string | null) {
  if (!id) return { cat: '', sub: '' }
  const cat = categorias.find(c => c.id === id)
  if (!cat) return { cat: '', sub: '' }
  if (cat.parent_id) {
    const padre = categorias.find(c => c.id === cat.parent_id)
    return { cat: padre?.nombre || '', sub: cat.nombre }
  }
  return { cat: cat.nombre, sub: '' }
}

export async function construirPlantillaPrecios(items: ItemPrecio[], categorias: CategoriaPrecio[]): Promise<Workbook> {
  // Según quién lo cargue (navegador o Node) la librería llega envuelta o no
  const modulo: any = await import('exceljs')
  const ExcelJS = modulo.default ?? modulo
  const wb: Workbook = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Precios')

  ws.columns = [
    { header: 'nombre', key: 'nombre', width: 30 },
    { header: 'tipo', key: 'tipo', width: 14 },
    { header: 'precio_tipo', key: 'precio_tipo', width: 14 },
    { header: 'precio', key: 'precio', width: 10 },
    { header: 'categoria', key: 'categoria', width: 20 },
    { header: 'subcategoria', key: 'subcategoria', width: 20 },
    { header: 'descripcion', key: 'descripcion', width: 40 }
  ]
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }

  for (const item of items) {
    const { cat, sub } = nombresDeCategoria(categorias, item.categoria_id)
    ws.addRow({
      nombre: item.nombre,
      tipo: item.tipo,
      precio_tipo: item.precio_tipo,
      precio: item.precio ?? '',
      categoria: cat,
      subcategoria: sub,
      descripcion: item.descripcion || ''
    })
  }

  // Una hoja escondida con las categorías: cada columna es una categoría, con
  // su nombre arriba y sus subcategorías debajo. De ahí beben los desplegables.
  const raiz = categorias.filter(c => !c.parent_id)
  const subsDe = (id: string) => categorias.filter(c => c.parent_id === id)
  const oculta = wb.addWorksheet('DatosOcultos', { state: 'hidden' })
  let maxSubs = 0

  raiz.forEach((cat, i) => {
    const columna = oculta.getColumn(i + 1)
    const subs = subsDe(cat.id)
    maxSubs = Math.max(maxSubs, subs.length)
    // El primer valor va a la fila 1 (comprobado): el nombre de la categoría
    // arriba y sus subcategorías justo debajo, que es lo que esperan los rangos
    columna.values = [cat.nombre, ...subs.map(s => s.nombre)] as any
    const letra = columna.letter
    const ultimaFila = subs.length + 1
    wb.definedNames.add(`'DatosOcultos'!$${letra}$2:$${letra}$${Math.max(ultimaFila, 2)}`, `SUBCAT_${i + 1}`)
  })

  const rangoCategorias = raiz.length > 0
    ? `'DatosOcultos'!$A$1:$${oculta.getColumn(raiz.length).letter}$1`
    : null

  const desde = 2
  const hasta = items.length + 1 + FILAS_EN_BLANCO
  for (let fila = desde; fila <= hasta; fila++) {
    ws.getCell(`B${fila}`).dataValidation = {
      type: 'list', allowBlank: false, formulae: ['"producto,servicio"'],
      showErrorMessage: true, errorTitle: 'Valor inválido',
      error: 'Selecciona "producto" o "servicio" de la lista.'
    }
    ws.getCell(`C${fila}`).dataValidation = {
      type: 'list', allowBlank: false, formulae: ['"exacto,desde,consultar"'],
      showErrorMessage: true, errorTitle: 'Valor inválido',
      error: 'Selecciona "exacto", "desde" o "consultar" de la lista.'
    }
    ws.getCell(`D${fila}`).dataValidation = {
      type: 'custom', allowBlank: true, formulae: [`C${fila}<>"consultar"`],
      showErrorMessage: true, errorTitle: 'Valor inválido',
      error: 'No puedes indicar un precio si el tipo es "consultar".'
    }
    if (rangoCategorias) {
      ws.getCell(`E${fila}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [rangoCategorias], showErrorMessage: false
      }
      if (maxSubs > 0) {
        ws.getCell(`F${fila}`).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`INDIRECT("SUBCAT_"&MATCH($E${fila}, ${rangoCategorias}, 0))`],
          showErrorMessage: false
        }
      }
    }
  }

  return wb
}

export interface FilaValida {
  nombre: string
  tipo: string
  precio: number | null
  precio_tipo: string
  categoria: string | null
  subcategoria: string | null
  descripcion: string | null
}

export interface FilaConError { fila: number; nombre: string; error: string }

// Lee las filas de la plantilla (ya sea .xlsx o .csv) y separa lo que vale de
// lo que no, diciendo qué pasa en cada línea. Está fuera de la pantalla para
// poder probarlo: es donde más se equivoca la gente al rellenar el archivo.
export function validarFilasPrecios(filas: any[][]): { validos: FilaValida[]; errores: FilaConError[] } {
  const validos: FilaValida[] = []
  const errores: FilaConError[] = []
  if (!filas || filas.length < 2) {
    return { validos, errores: [{ fila: 1, nombre: '—', error: 'El archivo está vacío o solo tiene encabezados' }] }
  }

  const texto = (v: any) => (v === undefined || v === null ? '' : String(v).trim())
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || []
    const numero = i + 1
    const nombre = texto(f[0])
    const tipo = texto(f[1]).toLowerCase() || 'producto'
    const precioTipo = texto(f[2]).toLowerCase() || 'exacto'
    const precioCrudo = texto(f[3])
    const categoria = texto(f[4]) || null
    const subcategoria = texto(f[5]) || null
    const descripcion = texto(f[6]) || null

    // Una fila del todo vacía no es un error: es el final del archivo o un hueco
    if (!nombre && !precioCrudo && !categoria && !subcategoria && !descripcion && !texto(f[1]) && !texto(f[2])) continue

    if (!nombre) { errores.push({ fila: numero, nombre: '(vacío)', error: 'El nombre es obligatorio' }); continue }
    if (!['producto', 'servicio'].includes(tipo)) {
      errores.push({ fila: numero, nombre, error: `Tipo inválido: "${tipo}". Debe ser "producto" o "servicio"` }); continue
    }
    if (!['exacto', 'desde', 'consultar'].includes(precioTipo)) {
      errores.push({ fila: numero, nombre, error: `precio_tipo inválido: "${precioTipo}". Debe ser "exacto", "desde" o "consultar"` }); continue
    }
    if (subcategoria && !categoria) {
      errores.push({ fila: numero, nombre, error: 'Hay subcategoría pero falta la categoría' }); continue
    }

    let precio: number | null = null
    if (precioTipo !== 'consultar') {
      if (!precioCrudo) {
        errores.push({ fila: numero, nombre, error: 'El precio es obligatorio cuando precio_tipo no es "consultar"' }); continue
      }
      // Admite "12,50", "12.50" y "1.234,50"
      const limpio = precioCrudo.replace(/\s|€/g, '')
      const normalizado = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio
      precio = parseFloat(normalizado)
      if (isNaN(precio) || precio < 0) {
        errores.push({ fila: numero, nombre, error: `Precio inválido: "${precioCrudo}". Debe ser un número positivo` }); continue
      }
    }

    validos.push({ nombre, tipo, precio, precio_tipo: precioTipo, categoria, subcategoria, descripcion })
  }
  return { validos, errores }
}
