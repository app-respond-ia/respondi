'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'

// LA TABLA DEL PANEL (estilo Shopify, decidido con Jorge el 13-09-2026):
// buscador, pestañas por estado con recuento, columnas ordenables,
// selección con acciones en bloque, paginación y, en el móvil, tarjetas en
// vez de filas. Las páginas solo describen sus columnas y sus filas.

export interface ColumnaTabla<T> {
  clave: string
  titulo: ReactNode
  // Cómo se pinta la celda (si no, el valor)
  render?: (fila: T) => ReactNode
  // El valor "plano": sirve para ordenar y para la tarjeta del móvil
  valor?: (fila: T) => string | number | null | undefined
  ordenable?: boolean
  alinear?: 'izquierda' | 'derecha' | 'centro'
  // Clases extra de la celda (anchura, truncado…)
  clase?: string
  // En el móvil: título de la tarjeta, oculta, o una línea etiqueta·valor
  enMovil?: 'titulo' | 'oculta' | 'normal'
}

export interface PestanaTabla<T> {
  id: string
  etiqueta: string
  // Sin filtro = todas
  filtro?: (fila: T) => boolean
}

export interface AccionEnBloque {
  id: string
  etiqueta: string
  peligrosa?: boolean
  onClick: (ids: string[]) => void | Promise<void>
}

export interface TablaProps<T> {
  filas: T[]
  columnas: ColumnaTabla<T>[]
  idDe: (fila: T) => string
  cargando?: boolean
  buscar?: { placeholder?: string; en: (fila: T) => string }
  pestanas?: PestanaTabla<T>[]
  pestanaInicial?: string
  onPestana?: (id: string) => void
  ordenInicial?: { clave: string; direccion: 'asc' | 'desc' }
  seleccionable?: boolean
  accionesEnBloque?: AccionEnBloque[]
  tamanoPagina?: number
  onFilaClick?: (fila: T) => void
  // Botones de cada fila (última columna en la tabla, pie de la tarjeta)
  acciones?: (fila: T) => ReactNode
  vacio?: ReactNode
  // La tarjeta del móvil a medida; si no, se monta con las columnas
  tarjeta?: (fila: T) => ReactNode
  // Filtros propios de la página, junto al buscador
  herramientas?: ReactNode
  // Texto en singular/plural para los recuentos ("contacto", "contactos")
  nombre?: [string, string]
  // Clases extra de cada fila/tarjeta (por ejemplo, un borde de color)
  claseFila?: (fila: T) => string
}

const TAMANOS = [25, 50, 100]

export function normalizarTexto(t: unknown) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Tabla<T>({ filas, columnas, idDe, cargando, buscar, pestanas, pestanaInicial, onPestana, ordenInicial, seleccionable, accionesEnBloque, tamanoPagina = 25, onFilaClick, acciones, vacio, tarjeta, herramientas, nombre = ['elemento', 'elementos'], claseFila }: TablaProps<T>) {
  const [texto, setTexto] = useState('')
  const [textoAplicado, setTextoAplicado] = useState('')
  const [pestana, setPestana] = useState(pestanaInicial || pestanas?.[0]?.id || '')
  const [orden, setOrden] = useState<{ clave: string; direccion: 'asc' | 'desc' } | null>(ordenInicial || null)
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(tamanoPagina)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ejecutando, setEjecutando] = useState<string | null>(null)

  // El buscador espera un poco a que se termine de escribir
  useEffect(() => {
    const t = setTimeout(() => setTextoAplicado(texto), 200)
    return () => clearTimeout(t)
  }, [texto])
  // Al cambiar el filtro se vuelve a la primera página
  useEffect(() => { setPagina(1) }, [textoAplicado, pestana, tamano, filas.length])

  const recuentos = useMemo(() => {
    const r: Record<string, number> = {}
    for (const p of pestanas || []) r[p.id] = p.filtro ? filas.filter(p.filtro).length : filas.length
    return r
  }, [filas, pestanas])

  const filtradas = useMemo(() => {
    let lista = filas
    const p = (pestanas || []).find(x => x.id === pestana)
    if (p?.filtro) lista = lista.filter(p.filtro)
    if (buscar && textoAplicado.trim()) {
      const q = normalizarTexto(textoAplicado)
      lista = lista.filter(f => normalizarTexto(buscar.en(f)).includes(q))
    }
    if (orden) {
      const col = columnas.find(c => c.clave === orden.clave)
      if (col?.valor) {
        const v = col.valor
        lista = [...lista].sort((a, b) => {
          const x = v(a), y = v(b)
          if (x === y) return 0
          if (x === null || x === undefined || x === '') return 1
          if (y === null || y === undefined || y === '') return -1
          const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' })
          return orden.direccion === 'asc' ? r : -r
        })
      }
    }
    return lista
  }, [filas, pestanas, pestana, buscar, textoAplicado, orden, columnas])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamano))
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = filtradas.slice((paginaActual - 1) * tamano, paginaActual * tamano)
  const idsVisibles = visibles.map(idDe)
  const todasMarcadas = idsVisibles.length > 0 && idsVisibles.every(id => seleccion.has(id))

  const cambiarOrden = (col: ColumnaTabla<T>) => {
    if (!col.valor || col.ordenable === false) return
    setOrden(o => (o?.clave === col.clave ? (o.direccion === 'asc' ? { clave: col.clave, direccion: 'desc' } : null) : { clave: col.clave, direccion: 'asc' }))
  }
  const alternar = (id: string) => setSeleccion(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const alternarTodas = () => setSeleccion(s => {
    const n = new Set(s)
    if (todasMarcadas) idsVisibles.forEach(id => n.delete(id)); else idsVisibles.forEach(id => n.add(id))
    return n
  })
  const ejecutar = async (a: AccionEnBloque) => {
    setEjecutando(a.id)
    try { await a.onClick([...seleccion]) } finally { setEjecutando(null); setSeleccion(new Set()) }
  }

  const alineacion = (c: ColumnaTabla<T>) => c.alinear === 'derecha' ? 'text-right' : c.alinear === 'centro' ? 'text-center' : 'text-left'
  const celda = (c: ColumnaTabla<T>, f: T) => c.render ? c.render(f) : (c.valor ? c.valor(f) ?? '' : '')
  const columnaTitulo = columnas.find(c => c.enMovil === 'titulo') || columnas[0]
  const desde = filtradas.length ? (paginaActual - 1) * tamano + 1 : 0
  const hasta = Math.min(paginaActual * tamano, filtradas.length)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Pestañas */}
      {pestanas && pestanas.length > 0 && (
        <div className="flex gap-1 px-3 sm:px-4 pt-3 overflow-x-auto border-b border-slate-100 scrollbar-hide">
          {pestanas.map(p => (
            <button key={p.id} type="button" onClick={() => { setPestana(p.id); onPestana?.(p.id) }}
              className={`shrink-0 px-3 h-9 rounded-t-lg text-sm font-600 transition border-b-2 -mb-px ${pestana === p.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
              {p.etiqueta} <span className={`ml-1 text-[11px] font-600 px-1.5 py-0.5 rounded-full ${pestana === p.id ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{recuentos[p.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Buscador y herramientas */}
      {(buscar || herramientas) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-100">
          {buscar && (
            <div className="relative flex-1 min-w-0">
              <svg className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
              <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={buscar.placeholder || 'Buscar…'} aria-label="Buscar en la tabla"
                className="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
              {texto && <button type="button" onClick={() => setTexto('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-slate-100">✕</button>}
            </div>
          )}
          {herramientas && <div className="flex items-center gap-2 flex-wrap">{herramientas}</div>}
        </div>
      )}

      {/* Acciones en bloque */}
      {seleccionable && seleccion.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 sm:px-4 py-2 bg-brand-50 border-b border-brand-100 text-sm">
          <span className="font-600 text-brand-900">{seleccion.size} {seleccion.size === 1 ? 'seleccionado' : 'seleccionados'}</span>
          {(accionesEnBloque || []).map(a => (
            <button key={a.id} type="button" disabled={!!ejecutando} onClick={() => ejecutar(a)}
              className={`h-8 px-3 rounded-lg text-xs font-600 border transition disabled:opacity-50 ${a.peligrosa ? 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50' : 'border-slate-300 bg-white text-ink-700 hover:bg-slate-50'}`}>
              {ejecutando === a.id ? 'Un momento…' : a.etiqueta}
            </button>
          ))}
          <button type="button" onClick={() => setSeleccion(new Set())} className="ml-auto text-xs font-600 text-ink-500 hover:text-ink-900">Quitar selección</button>
        </div>
      )}

      {filtradas.length === 0 ? (
        <div className="p-10 text-center">
          {cargando ? <p className="text-sm text-ink-400">Cargando…</p> : (vacio || <p className="text-sm text-ink-500">{textoAplicado || (pestanas && pestana !== pestanas[0]?.id) ? 'Nada coincide con esta búsqueda o filtro.' : `Aún no hay ${nombre[1]}.`}</p>)}
        </div>
      ) : (
        <>
          {/* Tabla (tablet y escritorio) */}
          <div className={`hidden md:block overflow-x-auto transition-opacity ${cargando ? 'opacity-50 pointer-events-none' : ''}`}>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-600">
                  {seleccionable && (
                    <th className="w-10 pl-4 py-3"><input type="checkbox" aria-label="Seleccionar todo" checked={todasMarcadas} onChange={alternarTodas} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /></th>
                  )}
                  {columnas.map(c => {
                    const ordenable = !!c.valor && c.ordenable !== false
                    const activa = orden?.clave === c.clave
                    return (
                      <th key={c.clave} className={`px-3 py-3 first:pl-4 last:pr-4 ${alineacion(c)} ${c.clase || ''}`}>
                        {ordenable ? (
                          <button type="button" onClick={() => cambiarOrden(c)} className={`inline-flex items-center gap-1 hover:text-ink-900 ${activa ? 'text-ink-900' : ''}`}>
                            {c.titulo}
                            <span className="text-[10px]">{activa ? (orden!.direccion === 'asc' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        ) : c.titulo}
                      </th>
                    )
                  })}
                  {acciones && <th className="px-3 py-3 pr-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map(f => {
                  const id = idDe(f)
                  return (
                    <tr key={id} onClick={onFilaClick ? () => onFilaClick(f) : undefined} className={`transition ${onFilaClick ? 'cursor-pointer hover:bg-slate-50' : ''} ${seleccion.has(id) ? 'bg-brand-50/40' : ''} ${claseFila ? claseFila(f) : ''}`}>
                      {seleccionable && (
                        <td className="pl-4 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(id)} onChange={() => alternar(id)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" /></td>
                      )}
                      {columnas.map(c => (
                        <td key={c.clave} className={`px-3 py-3 first:pl-4 last:pr-4 align-middle ${alineacion(c)} ${c.clase || ''}`}>{celda(c, f)}</td>
                      ))}
                      {acciones && <td className="px-3 py-3 pr-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>{acciones(f)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (móvil) */}
          <ul className={`md:hidden divide-y divide-slate-100 transition-opacity ${cargando ? 'opacity-50 pointer-events-none' : ''}`}>
            {visibles.map(f => {
              const id = idDe(f)
              return (
                <li key={id} className={`p-4 ${seleccion.has(id) ? 'bg-brand-50/40' : ''} ${claseFila ? claseFila(f) : ''}`}>
                  {tarjeta ? tarjeta(f) : (
                    <div className="flex gap-3">
                      {seleccionable && <input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(id)} onChange={() => alternar(id)} className="mt-1 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0" />}
                      <div className="flex-1 min-w-0" onClick={onFilaClick ? () => onFilaClick(f) : undefined}>
                        <div className="font-600 text-ink-900 break-words">{celda(columnaTitulo, f)}</div>
                        <dl className="mt-1.5 space-y-1">
                          {columnas.filter(c => c !== columnaTitulo && c.enMovil !== 'oculta').map(c => (
                            <div key={c.clave} className="flex justify-between gap-3 text-sm">
                              <dt className="text-ink-500 shrink-0">{c.titulo}</dt>
                              <dd className="text-ink-800 text-right min-w-0 break-words">{celda(c, f)}</dd>
                            </div>
                          ))}
                        </dl>
                        {acciones && <div className="mt-3 flex flex-wrap gap-2 justify-end" onClick={e => e.stopPropagation()}>{acciones(f)}</div>}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Paginación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-slate-100 text-sm text-ink-500">
            <p>{desde}–{hasta} de {filtradas.length} {filtradas.length === 1 ? nombre[0] : nombre[1]}</p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <span>Por página</span>
                <select value={tamano} onChange={e => setTamano(Number(e.target.value))} className="h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:border-brand-500">
                  {TAMANOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <button type="button" disabled={paginaActual <= 1} onClick={() => setPagina(p => p - 1)} className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-600 text-ink-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Página anterior">‹ Anterior</button>
              <span className="text-xs tabular-nums">{paginaActual} / {totalPaginas}</span>
              <button type="button" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(p => p + 1)} className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-600 text-ink-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Página siguiente">Siguiente ›</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
