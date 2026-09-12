'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { crearAutomatizacionPropia, guardarReceta, simularAutomatizacion } from '@/app/actions/automatizaciones'
import { DISPARADORES_EDITOR, CAMPOS_CONDICION, OPERADORES_POR_TIPO, PASOS_EDITOR } from '@/lib/automatizaciones/definiciones'
import { describirDisparador } from '@/lib/automatizaciones/describir'
import type { Condicion, Paso, Receta } from '@/lib/automatizaciones/tipos'

// El editor de recetas (la versión 1 del "mapa"): una lista de pasos que se
// pueden cambiar, quitar, añadir y ordenar, con el disparador y las
// condiciones arriba, y un botón para probar con un pedido de ejemplo sin
// enviar nada. Sirve para moldear las automatizaciones de Respondi y para
// crear las propias. Todo lo que se elige sale de listas cerradas: el motor
// solo ejecuta lo que sabe hacer.

interface Props {
  // null = se está creando una propia nueva
  clave: string | null
  esPropia: boolean
  inicial: Receta
  ajustes: Record<string, any>
  nombre?: string
  descripcion?: string
  marketing?: boolean
  etiquetas: string[]
  onGuardado: () => void
  onCancelar: () => void
}

const caja = 'h-10 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
const area = 'w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none'

type PasoEditable = Paso & { _id: number }
let contador = 1

// Los pasos que vienen con ajustes (texto, espera, porcentaje...) se pasan a
// valores escritos: lo que el cliente ve en el editor es lo que se guarda.
function materializar(receta: Receta, ajustes: Record<string, any>): { condiciones: Condicion[]; pasos: PasoEditable[] } {
  const cond = (c: Condicion): Condicion => c.ajuste !== undefined ? { campo: c.campo, operador: c.operador, valor: ajustes[c.ajuste] } : { ...c }
  const pasos: PasoEditable[] = receta.pasos.map(p => {
    const id = contador++
    if (p.tipo === 'esperar' && p.ajuste) {
      const v = Number(ajustes[p.ajuste]) || 0
      const base = /minuto/.test(p.ajuste) ? { minutos: v } : /dia/.test(p.ajuste) ? { dias: v } : { horas: v }
      return { tipo: 'esperar', ...base, _id: id }
    }
    if (p.tipo === 'mensaje' && p.ajuste_texto) return { tipo: 'mensaje', texto: String(ajustes[p.ajuste_texto] || ''), plantilla: 'plantilla', _id: id }
    if (p.tipo === 'comprobar') return { tipo: 'comprobar', condiciones: p.condiciones.map(cond), _id: id }
    if (p.tipo === 'crear_descuento' && p.ajuste_porcentaje) return { tipo: 'crear_descuento', porcentaje: Number(ajustes[p.ajuste_porcentaje]) || 10, _id: id }
    return { ...p, _id: id } as PasoEditable
  })
  return { condiciones: (receta.condiciones || []).map(cond), pasos }
}

function sinIds(pasos: PasoEditable[]): Paso[] {
  return pasos.map(({ _id, ...p }) => p as Paso)
}

const NOMBRE_TIPO: Record<string, string> = Object.fromEntries(PASOS_EDITOR.map(p => [p.tipo, p.etiqueta]))
const NO_EDITABLES: Record<string, string> = {
  ia_responde: 'La IA contesta',
  crear_descuento: 'Crear un código de descuento en la tienda',
  enlace_compra: 'Preparar el carrito y mandar el enlace para pagar',
  etiquetar_en_tienda: 'Poner una etiqueta al cliente en Shopify',
  importar_catalogo: 'Traer los productos de la tienda',
  importar_politicas: 'Traer las políticas de la tienda'
}

export function EditorReceta({ clave, esPropia, inicial, ajustes, nombre: nombreInicial, descripcion: descripcionInicial, marketing: marketingInicial, etiquetas, onGuardado, onCancelar }: Props) {
  const { showToast } = useToast()
  const inicio = materializar(inicial, ajustes)
  const [nombre, setNombre] = useState(nombreInicial || '')
  const [descripcion, setDescripcion] = useState(descripcionInicial || '')
  const [marketing, setMarketing] = useState(!!marketingInicial)
  const [disparador, setDisparador] = useState(inicial.disparador)
  const [condiciones, setCondiciones] = useState<Condicion[]>(inicio.condiciones)
  const [pasos, setPasos] = useState<PasoEditable[]>(inicio.pasos)
  const [nuevoTipo, setNuevoTipo] = useState<string>('mensaje')
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [simulacion, setSimulacion] = useState<{ titulo: string; resultado: string; detalle?: string }[] | null>(null)

  const disparadorEditable = esPropia
  const valorDisparador = DISPARADORES_EDITOR.find(d => {
    const x: any = d.disparador, y: any = disparador
    return x.tipo === y.tipo && (x.evento === y.evento) && (x.cada === y.cada)
  })?.valor || ''

  function recetaActual(): Receta {
    return { disparador, ...(condiciones.length ? { condiciones } : {}), pasos: sinIds(pasos) }
  }

  function cambiarPaso(id: number, cambios: Partial<Paso>) {
    setPasos(ps => ps.map(p => p._id === id ? ({ ...p, ...cambios } as PasoEditable) : p))
  }
  function mover(id: number, direccion: -1 | 1) {
    setPasos(ps => {
      const i = ps.findIndex(p => p._id === id)
      const j = i + direccion
      if (i < 0 || j < 0 || j >= ps.length) return ps
      const copia = [...ps]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }
  function quitar(id: number) {
    setPasos(ps => ps.filter(p => p._id !== id))
  }
  function anadir() {
    const id = contador++
    const nuevo: PasoEditable =
      nuevoTipo === 'mensaje' ? { tipo: 'mensaje', texto: 'Hola {{cliente}}, ', plantilla: 'plantilla', _id: id }
      : nuevoTipo === 'esperar' ? { tipo: 'esperar', horas: 1, _id: id }
      : nuevoTipo === 'comprobar' ? { tipo: 'comprobar', condiciones: [{ campo: 'pedido.total', operador: 'mayor', valor: 100 }], _id: id }
      : nuevoTipo === 'avisar_equipo' ? { tipo: 'avisar_equipo', texto: 'Pedido {{pedido}} de {{cliente}}', _id: id }
      : nuevoTipo === 'abrir_caso' ? { tipo: 'abrir_caso', asunto: 'Revisar el pedido {{pedido}}', prioridad: 'normal', _id: id }
      : { tipo: 'etiquetar', etiqueta: etiquetas[0] || '', _id: id }
    setPasos(ps => [...ps, nuevo])
  }

  async function probar() {
    setProbando(true)
    setSimulacion(null)
    const r = await simularAutomatizacion(clave || 'propia_borrador', { receta: recetaActual(), nombre: nombre || undefined, marketing: esPropia ? marketing : undefined })
    setProbando(false)
    if (r.success) setSimulacion(r.data as any)
    else showToast(r.error || 'No se ha podido probar', 'error')
  }

  async function guardar() {
    setGuardando(true)
    const receta = recetaActual()
    const r = clave
      ? await guardarReceta(clave, esPropia ? { receta, nombre, descripcion, marketing } : { receta })
      : await crearAutomatizacionPropia({ nombre, descripcion, marketing, receta })
    setGuardando(false)
    if (r.success) {
      showToast(clave ? 'Receta guardada' : 'Automatización creada (apagada: enciéndela cuando quieras)', 'success')
      onGuardado()
    } else {
      showToast(r.error || 'No se ha podido guardar', 'error')
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200 space-y-5">
      {esPropia && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="receta-nombre" className="block text-sm font-600 text-ink-800 mb-1.5">Nombre</label>
            <input id="receta-nombre" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} placeholder="Por ejemplo: Aviso de pedidos grandes al jefe" className={`w-full ${caja}`} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="receta-descripcion" className="block text-sm font-600 text-ink-800 mb-1.5">Qué hace <span className="font-400 text-ink-400">(opcional)</span></label>
            <input id="receta-descripcion" value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={500} className={`w-full ${caja}`} />
          </div>
          <label className="sm:col-span-2 inline-flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600" />
            <span>Es promoción. Solo se escribirá a quien haya aceptado recibirlas, y en WhatsApp la plantilla tendrá que ser de marketing.</span>
          </label>
        </div>
      )}

      {/* Disparador */}
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-400 font-600 mb-2">Cuándo se dispara</p>
        {disparadorEditable ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={valorDisparador}
              onChange={e => { const d = DISPARADORES_EDITOR.find(x => x.valor === e.target.value); if (d) setDisparador({ ...d.disparador }) }}
              className={caja}
            >
              {DISPARADORES_EDITOR.map(d => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
            </select>
            {disparador.tipo === 'programado' && disparador.cada === 'dia' && (
              <label className="inline-flex items-center gap-2 text-sm text-ink-600">
                a las
                <input type="number" min={0} max={23} value={disparador.hora ?? 9} onChange={e => setDisparador({ ...disparador, hora: Number(e.target.value) })} className={`${caja} w-20`} />
                h
              </label>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-800 bg-slate-50 rounded-xl px-3 py-2">{describirDisparador(disparador)} <span className="text-ink-400">(fijo en esta automatización)</span></p>
        )}
      </div>

      {/* Condiciones de entrada */}
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-400 font-600 mb-2">Solo si… <span className="normal-case font-400 tracking-normal">(opcional)</span></p>
        <EditorCondiciones condiciones={condiciones} onChange={setCondiciones} />
      </div>

      {/* Pasos */}
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-400 font-600 mb-2">Qué hace, en orden</p>
        <div className="space-y-2">
          {pasos.map((p, i) => (
            <div key={p._id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-600 flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-sm font-600 text-ink-800 flex-1">{NOMBRE_TIPO[p.tipo] || NO_EDITABLES[p.tipo] || p.tipo}</span>
                <button type="button" onClick={() => mover(p._id, -1)} disabled={i === 0} className="text-ink-400 hover:text-ink-800 disabled:opacity-30 px-1" aria-label="Subir">↑</button>
                <button type="button" onClick={() => mover(p._id, 1)} disabled={i === pasos.length - 1} className="text-ink-400 hover:text-ink-800 disabled:opacity-30 px-1" aria-label="Bajar">↓</button>
                <button type="button" onClick={() => quitar(p._id)} className="text-red-500 hover:text-red-700 px-1" aria-label="Quitar paso">✕</button>
              </div>
              <EditorPaso paso={p} etiquetas={etiquetas} onChange={cambios => cambiarPaso(p._id, cambios)} />
            </div>
          ))}
          {!pasos.length && <p className="text-sm text-ink-400">Sin pasos todavía. Añade el primero.</p>}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <select value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)} className={caja}>
            {PASOS_EDITOR.map(p => <option key={p.tipo} value={p.tipo}>{p.etiqueta}</option>)}
          </select>
          <button type="button" onClick={anadir} className="px-4 h-10 rounded-xl border border-slate-300 text-sm font-600 text-ink-700 hover:bg-slate-50 transition">+ Añadir paso</button>
        </div>
        <p className="text-xs text-ink-400 mt-2">Huecos que puedes usar en los textos: {'{{cliente}}'}, {'{{pedido}}'}, {'{{total}}'}, {'{{producto}}'}, {'{{seguimiento}}'}, {'{{negocio}}'}.</p>
      </div>

      {/* Probar */}
      {simulacion && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wider text-ink-400 font-600 mb-2">Con un pedido de ejemplo (sin enviar nada)</p>
          <ol className="space-y-2">
            {simulacion.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-600 shrink-0 ${s.resultado === 'haria' ? 'bg-emerald-100 text-emerald-700' : s.resultado === 'pararia' ? 'bg-red-100 text-red-700' : s.resultado === 'aviso' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                  {s.resultado === 'haria' ? 'Haría' : s.resultado === 'pararia' ? 'Se pararía' : s.resultado === 'aviso' ? 'Ojo' : 'Saltaría'}
                </span>
                <span className="text-ink-800">
                  {s.titulo}
                  {s.detalle && <span className="block text-xs text-ink-500 mt-0.5">{s.detalle}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={guardar} disabled={guardando} className="px-5 h-10 rounded-xl bg-brand-600 text-white text-sm font-600 hover:bg-brand-700 transition disabled:opacity-50">
          {guardando ? 'Guardando…' : clave ? 'Guardar receta' : 'Crear automatización'}
        </button>
        <button type="button" onClick={probar} disabled={probando} className="px-4 h-10 rounded-xl border border-slate-300 text-sm font-600 text-ink-700 hover:bg-slate-50 transition disabled:opacity-50">
          {probando ? 'Probando…' : 'Probar con un pedido de ejemplo'}
        </button>
        <button type="button" onClick={onCancelar} className="text-sm font-600 text-ink-500 hover:text-ink-800 transition">Cancelar</button>
      </div>
    </div>
  )
}

function EditorCondiciones({ condiciones, onChange }: { condiciones: Condicion[]; onChange: (c: Condicion[]) => void }) {
  function cambiar(i: number, cambios: Partial<Condicion>) {
    onChange(condiciones.map((c, j) => j === i ? { ...c, ...cambios } : c))
  }
  return (
    <div className="space-y-2">
      {condiciones.map((c, i) => {
        const def = CAMPOS_CONDICION.find(x => x.campo === c.campo)
        const tipo = def?.tipo || 'texto'
        const operadores = OPERADORES_POR_TIPO[tipo]
        return (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <select value={c.campo} onChange={e => {
              const nuevo = CAMPOS_CONDICION.find(x => x.campo === e.target.value)
              const op = nuevo ? OPERADORES_POR_TIPO[nuevo.tipo][0].valor : 'igual'
              cambiar(i, { campo: e.target.value, operador: op, valor: nuevo?.tipo === 'numero' ? 0 : nuevo?.tipo === 'si_no' ? undefined : '' })
            }} className={caja}>
              {!def && <option value={c.campo}>{c.campo}</option>}
              {CAMPOS_CONDICION.map(x => <option key={x.campo} value={x.campo}>{x.etiqueta}</option>)}
            </select>
            <select value={c.operador} onChange={e => cambiar(i, { operador: e.target.value as any })} className={caja}>
              {!operadores.some(o => o.valor === c.operador) && <option value={c.operador}>{c.operador}</option>}
              {operadores.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
            {tipo !== 'si_no' && (
              <input
                type={tipo === 'numero' ? 'number' : 'text'}
                value={c.valor ?? ''}
                onChange={e => cambiar(i, { valor: tipo === 'numero' ? Number(e.target.value) : e.target.value })}
                className={`${caja} w-36`}
              />
            )}
            <button type="button" onClick={() => onChange(condiciones.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 px-1" aria-label="Quitar condición">✕</button>
          </div>
        )
      })}
      <button type="button" onClick={() => onChange([...condiciones, { campo: 'pedido.total', operador: 'mayor', valor: 100 }])} className="text-sm font-600 text-brand-600 hover:text-brand-700 transition">
        + Añadir condición
      </button>
    </div>
  )
}

function EditorPaso({ paso, etiquetas, onChange }: { paso: PasoEditable; etiquetas: string[]; onChange: (cambios: Partial<Paso>) => void }) {
  switch (paso.tipo) {
    case 'mensaje':
      return (
        <div>
          <textarea value={paso.texto} onChange={e => onChange({ texto: e.target.value } as any)} rows={3} maxLength={1000} className={area} />
          <p className="text-xs text-ink-400 mt-1">Por dónde sale (WhatsApp o correo) y la plantilla se eligen en los ajustes de la automatización.</p>
        </div>
      )
    case 'esperar': {
      const unidad = paso.dias ? 'dias' : paso.minutos ? 'minutos' : 'horas'
      const valor = paso.dias || paso.minutos || paso.horas || 0
      return (
        <div className="flex items-center gap-2">
          <input type="number" min={1} value={valor} onChange={e => onChange({ dias: undefined, horas: undefined, minutos: undefined, [unidad]: Number(e.target.value) } as any)} className={`${caja} w-24`} />
          <select value={unidad} onChange={e => onChange({ dias: undefined, horas: undefined, minutos: undefined, [e.target.value]: valor } as any)} className={caja}>
            <option value="minutos">minutos</option>
            <option value="horas">horas</option>
            <option value="dias">días</option>
          </select>
        </div>
      )
    }
    case 'comprobar':
      return <EditorCondiciones condiciones={paso.condiciones} onChange={c => onChange({ condiciones: c } as any)} />
    case 'avisar_equipo':
      return <textarea value={paso.texto} onChange={e => onChange({ texto: e.target.value } as any)} rows={2} maxLength={500} className={area} />
    case 'abrir_caso':
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <input value={paso.asunto} onChange={e => onChange({ asunto: e.target.value } as any)} maxLength={200} placeholder="Asunto del caso" className={`${caja} flex-1 min-w-[200px]`} />
          <select value={paso.prioridad || 'normal'} onChange={e => onChange({ prioridad: e.target.value } as any)} className={caja}>
            <option value="baja">Prioridad baja</option>
            <option value="normal">Prioridad normal</option>
            <option value="alta">Prioridad alta</option>
          </select>
        </div>
      )
    case 'etiquetar':
      return (
        <div>
          <select value={paso.etiqueta} onChange={e => onChange({ etiqueta: e.target.value } as any)} className={caja}>
            {!etiquetas.includes(paso.etiqueta) && <option value={paso.etiqueta}>{paso.etiqueta || '— elige —'}</option>}
            {etiquetas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          {!etiquetas.length && <p className="text-xs text-amber-700 mt-1">No tienes etiquetas creadas: créalas en Etiquetas.</p>}
        </div>
      )
    default:
      return <p className="text-xs text-ink-400">Este paso viene de Respondi y todavía no se puede editar; sí quitarlo o moverlo.</p>
  }
}
