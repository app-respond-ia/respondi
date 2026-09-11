import { supabaseAdmin } from '@/utils/supabase/admin'
import { normalizar, contienePalabras } from '@/lib/ai/comparar-texto'

// Presupuestos de la IA con los precios reales del catálogo de la sucursal
// (skill "Hacer presupuestos"). La IA solo dice qué productos y cuántos; las
// cuentas las hace esto: un modelo de lenguaje se equivoca multiplicando y
// sumando, y un presupuesto con el total mal calculado es peor que no darlo.
// Lo que no está en el catálogo, lo que es ambiguo y lo que no tiene precio
// fijo se le devuelve aparte para que no se lo invente.

export type LineaPresupuesto = { producto: string; cantidad: number }

type Producto = { id: string; nombre: string; precio: number | null; precio_tipo: string | null; moneda: string | null }

function buscar(catalogo: Producto[], pedido: string): { producto?: Producto; ambiguos?: Producto[] } {
  const buscado = normalizar(pedido)
  if (!buscado) return {}

  const exactos = catalogo.filter(p => normalizar(p.nombre) === buscado)
  if (exactos.length === 1) return { producto: exactos[0] }
  if (exactos.length > 1) return { ambiguos: exactos }

  const contienen = catalogo.filter(p => normalizar(p.nombre).includes(buscado))
  if (contienen.length === 1) return { producto: contienen[0] }
  if (contienen.length > 1) return { ambiguos: contienen }

  // Todas las palabras de lo pedido están en el nombre (con o sin plural)
  const porPalabras = catalogo.filter(p => contienePalabras(p.nombre, pedido))
  if (porPalabras.length === 1) return { producto: porPalabras[0] }
  if (porPalabras.length > 1) return { ambiguos: porPalabras }
  return {}
}

const euros = (n: number, moneda: string) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`

export async function calcularPresupuesto(branchId: string, lineas: LineaPresupuesto[]): Promise<string> {
  if (!Array.isArray(lineas) || lineas.length === 0) return 'Error: indica al menos un producto con su cantidad.'
  if (lineas.length > 30) return 'Error: como mucho 30 productos por presupuesto.'

  const { data: catalogo, error } = await supabaseAdmin
    .from('price_list')
    .select('id, nombre, precio, precio_tipo, moneda')
    .eq('branch_id', branchId)
    .eq('visible_ia', true)
    .eq('disponible', true)
    .limit(2000)
  if (error) return 'Error interno al leer el catálogo. No des un presupuesto ahora; di al cliente que lo confirmará el equipo.'
  if (!catalogo?.length) return 'El catálogo de esta sucursal está vacío: no se puede hacer un presupuesto. No inventes precios.'

  const partidas: string[] = []
  const totales: Record<string, number> = {}
  const conDesde: string[] = []
  const aConsultar: string[] = []
  const noEncontrados: string[] = []
  const dudas: string[] = []

  for (const l of lineas) {
    const cantidad = Number(l?.cantidad)
    const pedido = String(l?.producto || '').trim()
    if (!pedido) continue
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000) {
      dudas.push(`"${pedido}": la cantidad (${l?.cantidad}) no es válida; pregunta al cliente cuántos quiere.`)
      continue
    }

    const { producto, ambiguos } = buscar(catalogo as Producto[], pedido)
    if (ambiguos) {
      dudas.push(`"${pedido}" puede ser: ${ambiguos.slice(0, 5).map(p => p.nombre).join(', ')}. Pregunta al cliente cuál quiere.`)
      continue
    }
    if (!producto) {
      noEncontrados.push(`"${pedido}"`)
      continue
    }

    const moneda = producto.moneda || 'EUR'
    const tipo = producto.precio_tipo || 'fijo'
    if (tipo === 'consultar' || producto.precio === null || producto.precio === undefined) {
      aConsultar.push(producto.nombre)
      continue
    }
    const precio = Number(producto.precio)
    const subtotal = Math.round(precio * cantidad * 100) / 100
    totales[moneda] = Math.round(((totales[moneda] || 0) + subtotal) * 100) / 100
    const desde = tipo === 'desde'
    if (desde) conDesde.push(producto.nombre)
    partidas.push(`- ${cantidad} × ${producto.nombre} a ${desde ? 'desde ' : ''}${euros(precio, moneda)} = ${desde ? 'desde ' : ''}${euros(subtotal, moneda)}`)
  }

  let texto = ''
  if (partidas.length) {
    texto += 'Presupuesto calculado con los precios del catálogo:\n' + partidas.join('\n') + '\n'
    const monedas = Object.keys(totales)
    texto += monedas.length === 1
      ? `TOTAL: ${conDesde.length ? 'desde ' : ''}${euros(totales[monedas[0]], monedas[0])}\n`
      : `TOTALES (hay productos en distintas monedas): ${monedas.map(m => euros(totales[m], m)).join(' + ')}\n`
  } else {
    texto += 'No se ha podido calcular ninguna partida.\n'
  }
  if (conDesde.length) texto += `Ojo: ${conDesde.join(', ')} ${conDesde.length === 1 ? 'tiene' : 'tienen'} precio "desde", así que el total es el mínimo orientativo; el precio final depende de lo que pida el cliente.\n`
  if (aConsultar.length) texto += `Sin precio en el catálogo (a consultar): ${aConsultar.join(', ')}. No los sumes ni inventes su precio; di que el equipo lo confirmará.\n`
  if (noEncontrados.length) texto += `No están en el catálogo: ${noEncontrados.join(', ')}. Díselo al cliente; no inventes su precio.\n`
  if (dudas.length) texto += dudas.join('\n') + '\n'
  texto += 'Da al cliente exactamente estas cifras, sin volver a calcularlas.'
  return texto
}
