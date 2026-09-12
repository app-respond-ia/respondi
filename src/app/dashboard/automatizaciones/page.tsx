'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Loading from '@/components/Loading'
import { ErrorCarga } from '@/components/ui/ErrorCarga'
import { useToast } from '@/components/ui/Toast'
import { getAutomatizaciones, cambiarAutomatizacion, getHistorialAutomatizaciones, enviarPlantillaPredisenada, restablecerReceta, borrarAutomatizacionPropia } from '@/app/actions/automatizaciones'
import { getMisPermisos } from '@/app/actions/permisos'
import { CANALES_SALIDA, type Receta } from '@/lib/automatizaciones/tipos'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { EditorReceta } from './EditorReceta'

// La receta con la que nace una automatización propia nueva
const RECETA_NUEVA: Receta = {
  disparador: { tipo: 'evento_tienda', evento: 'orders/create' },
  pasos: [{ tipo: 'avisar_equipo', texto: 'Ha entrado el pedido {{pedido}} de {{cliente}} por {{total}}.' }]
}

// Las automatizaciones que trae Respondi hechas, ordenadas por categorías.
// Todas nacen apagadas: el cliente enciende una a una las que quiera y ajusta
// cada una a su gusto.

interface CampoAjuste {
  clave: string
  etiqueta: string
  tipo: string
  ayuda?: string
  porDefecto: any
  min?: number
  max?: number
  sufijo?: string
}

interface Fila {
  clave: string
  nombre: string
  descripcion: string
  detalle: string
  categoria: string
  estado: 'lista' | 'en_camino'
  requiereTienda: boolean
  escribeAlCliente: boolean
  marketing: boolean
  campos: CampoAjuste[]
  activa: boolean
  ajustes: Record<string, any>
  ultima_ejecucion: string | null
  falta_tienda: boolean
  falta_agenda?: boolean
  faltan_permisos: string[]
  // El workflow contado paso a paso
  pasos: { tipo: string; titulo: string; detalle?: string; indice?: number }[]
  // ¿La creó el cliente? ¿La ha moldeado? Y su receta, para el editor
  propia: boolean
  moldeada: boolean
  receta: Receta
  plantilla_predisenada: {
    nombre: string
    categoria: 'utilidad' | 'marketing'
    cuerpo: string
    ejemplo: string
    estado: 'no_enviada' | 'pendiente' | 'aprobada' | 'rechazada' | 'pausada' | 'desactivada'
    motivo_rechazo: string | null
    id: string | null
    en_uso: boolean
  } | null
}

const TEXTO_PLANTILLA: Record<string, { texto: string; color: string }> = {
  no_enviada: { texto: 'Sin enviar a Meta', color: 'bg-slate-100 text-slate-600' },
  pendiente: { texto: 'Meta la está revisando', color: 'bg-amber-50 text-amber-700' },
  aprobada: { texto: 'Aprobada por Meta', color: 'bg-emerald-50 text-emerald-700' },
  rechazada: { texto: 'Rechazada por Meta', color: 'bg-red-50 text-red-700' },
  pausada: { texto: 'Pausada por Meta', color: 'bg-red-50 text-red-700' },
  desactivada: { texto: 'Desactivada por Meta', color: 'bg-red-50 text-red-700' }
}

interface Categoria { clave: string; nombre: string; descripcion: string }
interface Plantilla { id: string; nombre: string; idioma: string }
interface Movimiento { id: string; clave: string; nombre: string; referencia: string | null; estado: string; detalle: string | null; created_at: string }

const TEXTO_ESTADO: Record<string, string> = {
  hecha: 'Hecho',
  omitida: 'No hacía falta',
  programada: 'Esperando',
  cancelada: 'Cancelada',
  error: 'Con error'
}

const COLOR_ESTADO: Record<string, string> = {
  hecha: 'bg-emerald-50 text-emerald-700',
  omitida: 'bg-slate-100 text-slate-600',
  programada: 'bg-amber-50 text-amber-700',
  cancelada: 'bg-slate-100 text-slate-600',
  error: 'bg-red-50 text-red-700'
}

const caja = 'h-10 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'

export default function AutomatizacionesPage() {
  const { showToast } = useToast()
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [tienda, setTienda] = useState<{ dominio: string; nombre: string | null; estado: string } | null>(null)
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [canales, setCanales] = useState<string[]>([])
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [maximoPropias, setMaximoPropias] = useState(20)
  const [creando, setCreando] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState<Fila | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  const puedeEscribir = nivelPermiso === 'escritura'

  async function cargar() {
    setErrorCarga(false)
    const [r, permisos] = await Promise.all([getAutomatizaciones(), getMisPermisos()])
    if (permisos.success) {
      const nivel = (permisos as any).esAdmin
        ? 'escritura'
        : ((permisos.data || []).find((p: any) => p.seccion === 'canales')?.nivel || 'ninguno')
      setNivelPermiso(nivel as any)
    }
    if (!r.success) {
      setErrorCarga(true)
      setCargando(false)
      return
    }
    const d = r.data as any
    setCategorias(d.categorias)
    setFilas(d.automatizaciones)
    setPlantillas(d.plantillas || [])
    setCanales(d.canales || [])
    setEtiquetas(d.etiquetas || [])
    setMaximoPropias(d.maximo_propias || 20)
    setTienda(d.tienda)
    setCargando(false)

    const historial = await getHistorialAutomatizaciones(15)
    if (historial.success) setMovimientos((historial.data as Movimiento[]) || [])
  }

  useEffect(() => { cargar() }, [])

  async function alternar(fila: Fila) {
    setGuardando(fila.clave)
    const r = await cambiarAutomatizacion(fila.clave, { activa: !fila.activa })
    setGuardando(null)
    if (r.success) {
      setFilas(f => f.map(x => x.clave === fila.clave ? { ...x, activa: !fila.activa } : x))
      showToast(!fila.activa ? `"${fila.nombre}" encendida` : `"${fila.nombre}" apagada`, 'success')
    } else {
      showToast(r.error || 'No se ha podido cambiar', 'error')
    }
  }

  async function guardarAjustes(fila: Fila, ajustes: Record<string, any>) {
    setGuardando(fila.clave)
    const r = await cambiarAutomatizacion(fila.clave, { ajustes })
    setGuardando(null)
    if (r.success) {
      setFilas(f => f.map(x => x.clave === fila.clave ? { ...x, ajustes: (r.data as any).ajustes } : x))
      showToast('Ajustes guardados', 'success')
      setAbierta(null)
    } else {
      showToast(r.error || 'No se han podido guardar los ajustes', 'error')
    }
  }

  async function restablecer(fila: Fila) {
    setGuardando(fila.clave)
    const r = await restablecerReceta(fila.clave)
    setGuardando(null)
    if (r.success) { showToast('Vuelve a ser la receta de Respondi', 'success'); cargar() }
    else showToast(r.error || 'No se ha podido restablecer', 'error')
  }

  async function borrar() {
    if (!confirmarBorrar) return
    const fila = confirmarBorrar
    setConfirmarBorrar(null)
    const r = await borrarAutomatizacionPropia(fila.clave)
    if (r.success) { showToast(`"${fila.nombre}" borrada`, 'success'); cargar() }
    else showToast(r.error || 'No se ha podido borrar', 'error')
  }

  if (cargando) return <Loading />
  if (errorCarga) return <ErrorCarga onReintentar={cargar} />
  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto">
        <p className="text-ink-500">No tienes permiso para ver esta sección.</p>
      </div>
    )
  }

  const encendidas = filas.filter(f => f.activa).length
  const listas = filas.filter(f => f.estado === 'lista').length
  const propias = filas.filter(f => f.propia).length

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      <div className="mb-6">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Automatizaciones</h1>
        <p className="text-ink-500 mt-1">Cosas que Respondi hace solo. Enciende las que quieras: todas empiezan apagadas.</p>
      </div>

      {!tienda || tienda.estado !== 'activo' ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.73-3l-7-12a2 2 0 00-3.46 0l-7 12A2 2 0 005 19z"/></svg>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-amber-900">Conecta tu tienda para usar casi todas</p>
            <p className="text-sm text-amber-800 mt-0.5">
              La mayoría necesitan saber de tus productos y pedidos.{' '}
              <Link href="/dashboard/tienda" className="font-600 underline underline-offset-2">Conectar tienda online</Link>
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 p-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-600 text-ink-900">{encendidas} {encendidas === 1 ? 'encendida' : 'encendidas'} de {listas} disponibles</p>
              <p className="text-sm text-ink-600">Conectado a {tienda.nombre || tienda.dominio}.</p>
            </div>
          </div>
        </div>
      )}

      {categorias.map(categoria => {
        const deLaCategoria = filas.filter(f => f.categoria === categoria.clave)
        const esPropias = categoria.clave === 'propias'
        if (!deLaCategoria.length && !esPropias) return null
        return (
          <section key={categoria.clave} className="mb-8">
            <div className="mb-3 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h2 className="font-display font-700 text-lg text-ink-900">{categoria.nombre}</h2>
                <p className="text-sm text-ink-500">{categoria.descripcion}</p>
              </div>
              {esPropias && (
                <button
                  onClick={() => setCreando(true)}
                  disabled={!puedeEscribir || creando || propias >= maximoPropias}
                  className="px-4 h-10 rounded-xl bg-brand-600 text-white text-sm font-600 hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Crear automatización
                </button>
              )}
            </div>
            {esPropias && creando && (
              <article className="bg-white rounded-2xl border border-brand-200 shadow-sm p-4 sm:p-5 mb-3">
                <h3 className="font-600 text-ink-900">Nueva automatización</h3>
                <p className="text-sm text-ink-500">Elige cuándo se dispara, si hay condiciones, y qué hace. Nace apagada.</p>
                <EditorReceta
                  clave={null}
                  esPropia
                  inicial={RECETA_NUEVA}
                  ajustes={{}}
                  etiquetas={etiquetas}
                  onGuardado={() => { setCreando(false); cargar() }}
                  onCancelar={() => setCreando(false)}
                />
              </article>
            )}
            {esPropias && !deLaCategoria.length && !creando && (
              <p className="text-sm text-ink-400 mb-3">Todavía no has creado ninguna. Puedes tener hasta {maximoPropias} por sucursal.</p>
            )}
            <div className="space-y-3">
              {deLaCategoria.map(fila => (
                <TarjetaAutomatizacion
                  key={fila.clave}
                  fila={fila}
                  abierta={abierta === fila.clave}
                  onAbrir={() => setAbierta(abierta === fila.clave ? null : fila.clave)}
                  onAlternar={() => alternar(fila)}
                  onGuardar={ajustes => guardarAjustes(fila, ajustes)}
                  puedeEscribir={puedeEscribir}
                  ocupada={guardando === fila.clave}
                  plantillas={plantillas}
                  canales={canales}
                  etiquetas={etiquetas}
                  onRecargar={cargar}
                  onRestablecer={() => restablecer(fila)}
                  onBorrar={() => setConfirmarBorrar(fila)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <ConfirmModal
        isOpen={!!confirmarBorrar}
        onClose={() => setConfirmarBorrar(null)}
        onConfirm={borrar}
        title={`¿Borrar "${confirmarBorrar?.nombre}"?`}
        message="Se borra la automatización y su registro. Lo que estuviera esperando no se hará."
        confirmText="Borrar"
        type="danger"
      />

      {!!movimientos.length && (
        <section className="mb-8">
          <div className="mb-3">
            <h2 className="font-display font-700 text-lg text-ink-900">Últimos movimientos</h2>
            <p className="text-sm text-ink-500">Lo que han hecho tus automatizaciones, y por qué a veces no hacen nada.</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {movimientos.map(m => (
              <div key={m.id} className="p-4 flex items-start gap-3">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-600 shrink-0 ${COLOR_ESTADO[m.estado] || 'bg-slate-100 text-slate-600'}`}>
                  {TEXTO_ESTADO[m.estado] || m.estado}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-ink-800">
                    {m.nombre}{m.referencia ? <span className="font-400 text-ink-500"> · {m.referencia}</span> : null}
                  </p>
                  {m.detalle && <p className="text-xs text-ink-500 mt-0.5">{m.detalle}</p>}
                </div>
                <span className="text-xs text-ink-400 shrink-0">
                  {new Date(m.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function TarjetaAutomatizacion({ fila, abierta, onAbrir, onAlternar, onGuardar, puedeEscribir, ocupada, plantillas, canales, etiquetas, onRecargar, onRestablecer, onBorrar }: {
  fila: Fila
  abierta: boolean
  onAbrir: () => void
  onAlternar: () => void
  onGuardar: (ajustes: Record<string, any>) => void
  puedeEscribir: boolean
  ocupada: boolean
  plantillas: Plantilla[]
  canales: string[]
  etiquetas: string[]
  onRecargar: () => void
  onRestablecer: () => void
  onBorrar: () => void
}) {
  const { showToast } = useToast()
  const [ajustes, setAjustes] = useState<Record<string, any>>(fila.ajustes)
  const [enviandoPlantilla, setEnviandoPlantilla] = useState(false)
  const [otraPlantilla, setOtraPlantilla] = useState(false)
  const [editando, setEditando] = useState(false)
  useEffect(() => { setAjustes(fila.ajustes) }, [fila.ajustes])

  async function enviarPlantilla() {
    setEnviandoPlantilla(true)
    const r = await enviarPlantillaPredisenada(fila.clave)
    setEnviandoPlantilla(false)
    if (r.success) {
      const estado = (r.data as any)?.estado
      showToast(estado === 'aprobada' ? 'La plantilla ya estaba aprobada: se usará sola' : 'Plantilla enviada a Meta. Te avisaremos aquí cuando la aprueben', 'success')
      onRecargar()
    } else {
      showToast(r.error || 'No se ha podido enviar la plantilla', 'error')
    }
  }

  const enCamino = fila.estado !== 'lista'
  const bloqueada = enCamino || !puedeEscribir || fila.falta_tienda || !!fila.falta_agenda || !!fila.faltan_permisos.length

  return (
    <article className={`bg-white rounded-2xl border transition ${fila.activa ? 'border-brand-200 shadow-sm' : 'border-slate-200'}`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-600 text-ink-900">{fila.nombre}</h3>
              {enCamino && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-600">En preparación</span>
              )}
              {fila.propia && (
                <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-600">Tuya</span>
              )}
              {fila.moldeada && (
                <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-600">Moldeada por ti</span>
              )}
              {fila.marketing && (
                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-600">Promoción</span>
              )}
              {fila.escribeAlCliente && (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-600">Escribe al cliente</span>
              )}
            </div>
            <p className="text-sm text-ink-500">{fila.descripcion}</p>
          </div>

          <button
            role="switch"
            aria-checked={fila.activa}
            aria-label={`${fila.activa ? 'Apagar' : 'Encender'} ${fila.nombre}`}
            onClick={onAlternar}
            disabled={bloqueada || ocupada}
            className={`shrink-0 w-11 h-6 rounded-full transition relative ${fila.activa ? 'bg-brand-600' : 'bg-slate-300'} ${bloqueada || ocupada ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${fila.activa ? 'left-[22px]' : 'left-0.5'}`}></span>
          </button>
        </div>

        {fila.falta_tienda && !enCamino && (
          <p className="text-xs text-amber-700 mt-2">Necesita la tienda conectada.</p>
        )}
        {fila.falta_agenda && !enCamino && (
          <p className="text-xs text-amber-700 mt-2">Necesita la agenda activada (Agenda → Ajustes).</p>
        )}
        {!!fila.faltan_permisos.length && (
          <p className="text-xs text-amber-700 mt-2">A tu app de Shopify le faltan permisos: {fila.faltan_permisos.join(', ')}.</p>
        )}

        <button onClick={onAbrir} className="text-sm font-600 text-brand-600 hover:text-brand-700 transition mt-3">
          {abierta ? 'Ocultar detalles' : 'Ver detalles y ajustes'}
        </button>

        {abierta && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-ink-600 leading-relaxed">{fila.detalle}</p>

            {fila.escribeAlCliente && (
              <p className="text-xs text-ink-400 mt-2">
                Los mensajes que empieza tu negocio los cobra Meta por separado{fila.marketing ? ' (los de promoción, más caros)' : ''}. Las respuestas de la IA gastan tus créditos de Respondi.
              </p>
            )}

            {/* El workflow, paso a paso, y el editor para moldearlo */}
            {editando ? (
              <EditorReceta
                clave={fila.clave}
                esPropia={fila.propia}
                inicial={fila.receta}
                ajustes={fila.ajustes}
                nombre={fila.nombre}
                descripcion={fila.propia ? fila.descripcion : undefined}
                marketing={fila.propia ? fila.marketing : undefined}
                etiquetas={etiquetas}
                onGuardado={() => { setEditando(false); onRecargar() }}
                onCancelar={() => setEditando(false)}
              />
            ) : !!fila.pasos?.length && (
              <div className="mt-4">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <p className="text-xs uppercase tracking-wider text-ink-400 font-600">Cómo funciona</p>
                  {puedeEscribir && !enCamino && (
                    <button type="button" onClick={() => setEditando(true)} className="text-xs font-600 text-brand-600 hover:text-brand-700 transition">
                      {fila.propia ? 'Editar' : 'Moldear a mi gusto'}
                    </button>
                  )}
                  {fila.moldeada && puedeEscribir && (
                    <button type="button" onClick={onRestablecer} disabled={ocupada} className="text-xs font-600 text-ink-500 hover:text-ink-800 transition disabled:opacity-50">
                      Volver a la de Respondi
                    </button>
                  )}
                  {fila.propia && puedeEscribir && (
                    <button type="button" onClick={onBorrar} className="text-xs font-600 text-red-600 hover:text-red-700 transition">
                      Borrar
                    </button>
                  )}
                </div>
                <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
                  {fila.pasos.map((p, i) => (
                    <li key={i} className="pl-4 relative">
                      <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${p.tipo === 'disparador' ? 'bg-brand-600' : p.tipo === 'condicion' || p.tipo === 'comprobar' ? 'bg-amber-400' : p.tipo === 'esperar' ? 'bg-slate-300' : 'bg-emerald-500'}`}></span>
                      <p className="text-sm text-ink-800">{p.titulo}</p>
                      {p.detalle && <p className="text-xs text-ink-500 mt-0.5 italic">«{p.detalle}»</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {!!fila.campos.length && (
              <div className="mt-4 space-y-3">
                {fila.campos.map(campo => (
                  <div key={campo.clave}>
                    <label htmlFor={`${fila.clave}-${campo.clave}`} className="block text-sm font-600 text-ink-800 mb-1.5">{campo.etiqueta}</label>
                    {campo.tipo === 'interruptor' ? (
                      <label className="inline-flex items-center gap-2 text-sm text-ink-600">
                        <input
                          id={`${fila.clave}-${campo.clave}`}
                          type="checkbox"
                          checked={!!ajustes[campo.clave]}
                          onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.checked }))}
                          disabled={!puedeEscribir}
                          className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
                        />
                        {ajustes[campo.clave] ? 'Sí' : 'No'}
                      </label>
                    ) : campo.tipo === 'canal' ? (
                      <div>
                        <select
                          id={`${fila.clave}-${campo.clave}`}
                          value={ajustes[campo.clave] ?? 'auto'}
                          onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.value }))}
                          disabled={!puedeEscribir}
                          className={`w-full ${caja} bg-white`}
                        >
                          {CANALES_SALIDA.map(c => {
                            const faltan = c.necesita.filter(n => !canales.includes(n))
                            return (
                              <option key={c.valor} value={c.valor}>
                                {c.etiqueta}{faltan.length ? ` (${faltan.map(n => n === 'whatsapp' ? 'WhatsApp' : 'correo').join(' y ')} sin conectar)` : ''}
                              </option>
                            )
                          })}
                        </select>
                        {!canales.length && (
                          <p className="text-xs text-amber-700 mt-1">
                            No tienes WhatsApp ni correo conectados: sin uno de los dos no se puede escribir a nadie. <Link href="/dashboard/canales" className="underline underline-offset-2 font-600">Ir a Canales</Link>.
                          </p>
                        )}
                      </div>
                    ) : campo.tipo === 'plantilla' && fila.plantilla_predisenada ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-600 ${TEXTO_PLANTILLA[fila.plantilla_predisenada.estado]?.color || 'bg-slate-100 text-slate-600'}`}>
                            {TEXTO_PLANTILLA[fila.plantilla_predisenada.estado]?.texto || fila.plantilla_predisenada.estado}
                          </span>
                          <span className="text-[11px] text-ink-400">Plantilla de {fila.plantilla_predisenada.categoria === 'marketing' ? 'promoción' : 'utilidad'} · escrita por Respondi para que Meta la apruebe</span>
                        </div>
                        {/* Como la vería el cliente, con datos de ejemplo */}
                        <div className="bg-[#e7ffdb] rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-ink-800 max-w-md shadow-sm">
                          {fila.plantilla_predisenada.ejemplo}
                        </div>
                        {fila.plantilla_predisenada.estado === 'rechazada' && fila.plantilla_predisenada.motivo_rechazo && (
                          <p className="text-xs text-red-700 mt-2">Meta la ha rechazado: {fila.plantilla_predisenada.motivo_rechazo}. Avísanos y la revisamos.</p>
                        )}
                        {fila.plantilla_predisenada.estado === 'aprobada' && (
                          <p className="text-xs text-emerald-700 mt-2">{fila.plantilla_predisenada.en_uso ? 'Lista: la automatización la usa sola.' : 'Aprobada. Pulsa el botón para que la automatización la use.'}</p>
                        )}
                        {fila.plantilla_predisenada.estado === 'pendiente' && (
                          <p className="text-xs text-amber-700 mt-2">Meta suele tardar de unos minutos a un día. En cuanto la apruebe, se usará sola.</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap mt-3">
                          {(fila.plantilla_predisenada.estado === 'no_enviada' || fila.plantilla_predisenada.estado === 'rechazada' || (fila.plantilla_predisenada.estado === 'aprobada' && !fila.plantilla_predisenada.en_uso)) && (
                            <button
                              type="button"
                              onClick={enviarPlantilla}
                              disabled={!puedeEscribir || enviandoPlantilla || !canales.includes('whatsapp')}
                              className="px-4 h-9 rounded-xl bg-ink-900 text-white text-sm font-600 transition hover:bg-ink-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {enviandoPlantilla ? 'Enviando…' : fila.plantilla_predisenada.estado === 'aprobada' ? 'Usar esta plantilla' : 'Enviar a Meta para que la apruebe'}
                            </button>
                          )}
                          {!canales.includes('whatsapp') && (
                            <span className="text-xs text-amber-700">Necesitas WhatsApp conectado con Meta.</span>
                          )}
                          <button type="button" onClick={() => setOtraPlantilla(v => !v)} className="text-xs font-600 text-ink-500 hover:text-ink-800 transition">
                            {otraPlantilla ? 'Ocultar' : 'Usar otra plantilla mía'}
                          </button>
                        </div>
                        {otraPlantilla && (
                          <select
                            id={`${fila.clave}-${campo.clave}`}
                            value={ajustes[campo.clave] ?? ''}
                            onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.value || null }))}
                            disabled={!puedeEscribir}
                            className={`w-full ${caja} bg-white mt-3`}
                          >
                            <option value="">Sin plantilla (solo a quien te haya escrito en las últimas 24 h)</option>
                            {plantillas.map(p => (
                              <option key={p.id} value={p.id}>{p.nombre} · {p.idioma}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : campo.tipo === 'plantilla' ? (
                      <div>
                        <select
                          id={`${fila.clave}-${campo.clave}`}
                          value={ajustes[campo.clave] ?? ''}
                          onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.value || null }))}
                          disabled={!puedeEscribir}
                          className={`w-full ${caja} bg-white`}
                        >
                          <option value="">Sin plantilla (solo a quien te haya escrito en las últimas 24 h)</option>
                          {plantillas.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre} · {p.idioma}</option>
                          ))}
                        </select>
                        {!plantillas.length && (
                          <p className="text-xs text-amber-700 mt-1">
                            No tienes ninguna plantilla aprobada. Créala en <Link href="/dashboard/canales/whatsapp-plantillas" className="underline underline-offset-2 font-600">Canales → Plantillas</Link>.
                          </p>
                        )}
                      </div>
                    ) : campo.tipo === 'texto_largo' ? (
                      <textarea
                        id={`${fila.clave}-${campo.clave}`}
                        value={ajustes[campo.clave] ?? ''}
                        onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.value }))}
                        disabled={!puedeEscribir}
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
                      />
                    ) : campo.tipo === 'numero' || campo.tipo === 'horas' || campo.tipo === 'dias' || campo.tipo === 'hora' ? (
                      <div className="flex items-center gap-2">
                        <input
                          id={`${fila.clave}-${campo.clave}`}
                          type="number"
                          value={ajustes[campo.clave] ?? ''}
                          min={campo.min}
                          max={campo.max}
                          onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.value }))}
                          disabled={!puedeEscribir}
                          className={`${caja} w-28`}
                        />
                        <span className="text-sm text-ink-500">
                          {campo.sufijo || (campo.tipo === 'horas' ? 'horas' : campo.tipo === 'dias' ? 'días' : campo.tipo === 'hora' ? 'h' : '')}
                        </span>
                      </div>
                    ) : (
                      <input
                        id={`${fila.clave}-${campo.clave}`}
                        value={ajustes[campo.clave] ?? ''}
                        onChange={e => setAjustes(a => ({ ...a, [campo.clave]: e.target.value }))}
                        disabled={!puedeEscribir}
                        className={`w-full ${caja}`}
                      />
                    )}
                    {campo.ayuda && <p className="text-xs text-ink-400 mt-1">{campo.ayuda}</p>}
                  </div>
                ))}

                <button
                  onClick={() => onGuardar(ajustes)}
                  disabled={!puedeEscribir || ocupada}
                  className="px-4 h-10 rounded-xl bg-brand-600 text-white text-sm font-600 transition hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ocupada ? 'Guardando…' : 'Guardar ajustes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
