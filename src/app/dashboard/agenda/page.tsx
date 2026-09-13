'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Loading from '@/components/Loading'
import { ErrorCarga } from '@/components/ui/ErrorCarga'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { getAgenda, guardarAjustesAgenda, guardarRecurso, borrarRecurso, crearBloqueo, borrarBloqueo, getCitas, getHuecos, crearCitaPanel, moverCitaPanel, cancelarCitaPanel, cambiarEstadoCitaPanel, getHistorialCita, guardarCombinacion, borrarCombinacion } from '@/app/actions/agenda'
import { ESTADOS_CITA, TIPOS_RECURSO, PASOS_AGENDA, ID_MESA, type AjustesAgenda, type Recurso, type Servicio, type HorarioRecurso, type Combinacion } from '@/lib/agenda/tipos'
import { partesEnZona, instanteLocal, leerFecha, sumarDias, textoHora, textoFechaHora, diaEnZona, fechaIso } from '@/lib/agenda/tiempo'
import { DIAS_SEMANA } from '@/lib/dias-semana'

// LA AGENDA: el calendario del negocio, sus recursos (personas, mesas, salas)
// y los ajustes de reserva. Lo que reserva la IA, el enlace o el equipo
// aparece aquí, en la zona horaria de la sucursal.

const caja = 'h-11 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
const campo = `w-full ${caja}`
const boton = 'h-10 px-4 rounded-xl text-sm font-600 transition disabled:opacity-50'
const botonPrimario = `${boton} bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/20`
const botonSecundario = `${boton} border border-slate-300 bg-white hover:bg-slate-50 text-ink-700`

// "sábado, 12 de septiembre" → "Sábado, 12 de septiembre" (solo la primera letra)
const capitalizar = (t: string) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t

const COLOR_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-100 border-amber-300 text-amber-900',
  confirmada: 'bg-emerald-100 border-emerald-300 text-emerald-900',
  en_curso: 'bg-sky-100 border-sky-300 text-sky-900',
  completada: 'bg-slate-100 border-slate-300 text-slate-600',
  no_presentado: 'bg-rose-100 border-rose-300 text-rose-900',
  cancelada_cliente: 'bg-slate-50 border-slate-200 text-slate-400 line-through',
  cancelada_negocio: 'bg-slate-50 border-slate-200 text-slate-400 line-through'
}

interface Datos {
  ajustes: AjustesAgenda
  zona: string
  negocio: { nombre: string; direccion: string | null; moneda: string }
  recursos: Recurso[]
  servicios: Servicio[]
  lista: any[]
  vinculos: Record<string, string[]>
  vinculos_por_recurso: Record<string, string[]>
  combinaciones: Combinacion[]
  horario_sucursal: HorarioRecurso[]
  bloqueos: any[]
  nivel_permiso: 'ninguno' | 'lectura' | 'escritura'
}

type Pestana = 'calendario' | 'sala' | 'recursos' | 'ajustes'

export default function AgendaPage() {
  const { showToast } = useToast()
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [pestana, setPestana] = useState<Pestana>('calendario')

  async function cargar() {
    setErrorCarga(false)
    const r = await getAgenda()
    if (!r.success || !r.data) { setErrorCarga(true); setCargando(false); return }
    setDatos(r.data as Datos)
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  if (cargando) return <Loading />
  if (errorCarga || !datos) return <ErrorCarga onReintentar={cargar} />
  const puedeEscribir = datos.nivel_permiso === 'escritura'

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink-900">Agenda</h1>
          <p className="text-sm text-ink-500 mt-1">Citas y reservas de {datos.negocio.nombre}. Hora local: {datos.zona}.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
          {([['calendario', 'Calendario'], ...(datos.ajustes.modo === 'restaurante' ? [['sala', 'Sala']] : []), ['recursos', 'Recursos'], ['ajustes', 'Ajustes']] as [Pestana, string][]).map(([k, n]) => (
            <button key={k} onClick={() => setPestana(k)} className={`px-4 h-9 rounded-lg text-sm font-600 transition ${pestana === k ? 'bg-white shadow text-ink-900' : 'text-ink-500 hover:text-ink-800'}`}>{n}</button>
          ))}
        </div>
      </div>

      {!datos.ajustes.activa && (
        <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <strong>La agenda está apagada.</strong> La IA y el enlace de reservas no reservarán hasta que la actives en <button onClick={() => setPestana('ajustes')} className="underline font-600">Ajustes</button>. El equipo sí puede apuntar citas a mano.
        </div>
      )}
      {datos.ajustes.activa && datos.ajustes.modo !== 'restaurante' && !datos.servicios.length && (
        <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <strong>No hay nada que reservar todavía.</strong> Marca "Se reserva en la agenda" en los servicios de tu <Link href="/dashboard/precios" className="underline font-600">lista de precios</Link>.
        </div>
      )}
      {datos.ajustes.activa && datos.ajustes.modo !== 'restaurante' && datos.servicios.length > 0 && !datos.recursos.some(r => r.activo) && (
        <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <strong>Falta quién atiende.</strong> Añade al menos un recurso (una persona, una sala, una mesa) en <button onClick={() => setPestana('recursos')} className="underline font-600">Recursos</button>.
        </div>
      )}
      {datos.ajustes.activa && datos.ajustes.modo === 'restaurante' && !datos.recursos.some(r => r.activo && r.tipo === 'mesa') && (
        <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <strong>Faltan las mesas.</strong> Añade cada mesa con sus comensales en <button onClick={() => setPestana('recursos')} className="underline font-600">Recursos</button>, y los turnos en <button onClick={() => setPestana('ajustes')} className="underline font-600">Ajustes</button>.
        </div>
      )}

      {pestana === 'calendario' && <Calendario datos={datos} puedeEscribir={puedeEscribir} recargar={cargar} />}
      {pestana === 'sala' && <Sala datos={datos} puedeEscribir={puedeEscribir} recargar={cargar} />}
      {pestana === 'recursos' && <Recursos datos={datos} puedeEscribir={puedeEscribir} recargar={cargar} />}
      {pestana === 'ajustes' && <Ajustes datos={datos} puedeEscribir={puedeEscribir} recargar={cargar} />}
    </div>
  )
}

// ===========================================================================
// Calendario
// ===========================================================================
function Calendario({ datos, puedeEscribir, recargar }: { datos: Datos; puedeEscribir: boolean; recargar: () => Promise<void> }) {
  const { showToast } = useToast()
  const zona = datos.zona
  const [fecha, setFecha] = useState(() => diaEnZona(new Date(), zona))
  const [vista, setVista] = useState<'dia' | 'semana'>('dia')
  const [citas, setCitas] = useState<any[]>([])
  const [bloqueos, setBloqueos] = useState<any[]>([])
  const [cargandoCitas, setCargandoCitas] = useState(false)
  const [filtroRecurso, setFiltroRecurso] = useState<string>('')
  const [citaAbierta, setCitaAbierta] = useState<any | null>(null)
  const [nuevaCita, setNuevaCita] = useState<{ recurso_id?: string | null; inicio?: string } | null>(null)
  const [nuevoBloqueo, setNuevoBloqueo] = useState(false)
  const [mover, setMover] = useState<any | null>(null)
  const [sentar, setSentar] = useState(false)
  const restaurante = datos.ajustes.modo === 'restaurante'

  const recursosActivos = datos.recursos.filter(r => r.activo)
  const recursosVisibles = filtroRecurso ? recursosActivos.filter(r => r.id === filtroRecurso) : recursosActivos

  async function cargarCitas() {
    setCargandoCitas(true)
    const p = leerFecha(fecha)!
    const desde = instanteLocal(zona, p.anio, p.mes, p.dia, 0, 0)
    const dias = vista === 'dia' ? 1 : 7
    const hasta = new Date(desde.getTime() + dias * 24 * 3600 * 1000)
    const r = await getCitas(desde.toISOString(), hasta.toISOString())
    if (r.success && r.data) { setCitas(r.data.citas); setBloqueos(r.data.bloqueos) }
    setCargandoCitas(false)
  }
  useEffect(() => { cargarCitas() }, [fecha, vista])

  // Horas que enseña la rejilla: del horario del negocio (o de los recursos), con margen
  const { desdeMin, hastaMin } = useMemo(() => {
    const p = leerFecha(fecha)!
    const diaSemana = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay()
    const franjas = [...datos.horario_sucursal, ...datos.recursos.flatMap(r => r.horarios || [])].filter(h => h.dia_semana === diaSemana)
    const min = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }
    let d = franjas.length ? Math.min(...franjas.map(f => min(f.apertura))) : 8 * 60
    let h = franjas.length ? Math.max(...franjas.map(f => min(f.cierre))) : 20 * 60
    for (const c of citas) {
      const pi = partesEnZona(new Date(c.inicio), zona), pf = partesEnZona(new Date(c.fin), zona)
      if (fechaIso(pi) === fecha) d = Math.min(d, pi.hora * 60 + pi.minuto)
      if (fechaIso(pf) === fecha) h = Math.max(h, pf.hora * 60 + pf.minuto)
    }
    return { desdeMin: Math.max(0, Math.floor(d / 60) * 60), hastaMin: Math.min(24 * 60, Math.ceil(h / 60) * 60) }
  }, [fecha, datos, citas])

  const PX_MIN = 1.4
  const alto = (hastaMin - desdeMin) * PX_MIN
  const inicioDia = useMemo(() => { const p = leerFecha(fecha)!; return instanteLocal(zona, p.anio, p.mes, p.dia, 0, 0) }, [fecha])
  const posicion = (iso: string) => {
    const p = partesEnZona(new Date(iso), zona)
    const minutos = fechaIso(p) === fecha ? p.hora * 60 + p.minuto : (new Date(iso) < inicioDia ? 0 : 24 * 60)
    return (minutos - desdeMin) * PX_MIN
  }
  const citasDelDia = citas.filter(c => fechaIso(partesEnZona(new Date(c.inicio), zona)) === fecha)
  const activas = (c: any) => !['cancelada_cliente', 'cancelada_negocio'].includes(c.estado)

  const clickHueco = (recursoId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!puedeEscribir) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const minutos = desdeMin + Math.floor(y / PX_MIN / datos.ajustes.paso_minutos) * datos.ajustes.paso_minutos
    const p = leerFecha(fecha)!
    setNuevaCita({ recurso_id: recursoId, inicio: instanteLocal(zona, p.anio, p.mes, p.dia, Math.floor(minutos / 60), minutos % 60).toISOString() })
  }

  const hoy = diaEnZona(new Date(), zona)
  const tituloFecha = textoFechaHora(instanteLocal(zona, ...(Object.values(leerFecha(fecha)!) as [number, number, number]), 12, 0), zona, { conHora: false, conAnio: true })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => setFecha(sumarDias(fecha, vista === 'dia' ? -1 : -7))} className={`${botonSecundario} px-3`} aria-label="Anterior">‹</button>
          <button onClick={() => setFecha(hoy)} className={botonSecundario}>Hoy</button>
          <button onClick={() => setFecha(sumarDias(fecha, vista === 'dia' ? 1 : 7))} className={`${botonSecundario} px-3`} aria-label="Siguiente">›</button>
        </div>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className={`${caja} h-10`} />
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
          <button onClick={() => setVista('dia')} className={`px-3 h-8 rounded-lg text-sm font-600 ${vista === 'dia' ? 'bg-white shadow text-ink-900' : 'text-ink-500'}`}>Día</button>
          <button onClick={() => setVista('semana')} className={`px-3 h-8 rounded-lg text-sm font-600 ${vista === 'semana' ? 'bg-white shadow text-ink-900' : 'text-ink-500'}`}>Semana</button>
        </div>
        {recursosActivos.length > 1 && (
          <select value={filtroRecurso} onChange={e => setFiltroRecurso(e.target.value)} className={`${caja} h-10`}>
            <option value="">Todos los recursos</option>
            {recursosActivos.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        )}
        <div className="flex-1" />
        {puedeEscribir && (
          <>
            <button onClick={() => setNuevoBloqueo(true)} className={botonSecundario}>Bloquear</button>
            {restaurante && <button onClick={() => setSentar(true)} className={botonSecundario}>Sentar sin reserva</button>}
            <button onClick={() => setNuevaCita({})} className={botonPrimario}>{restaurante ? '+ Nueva reserva' : '+ Nueva cita'}</button>
          </>
        )}
      </div>

      <p className="text-sm font-600 text-ink-800 mb-3">{capitalizar(tituloFecha)}{cargandoCitas ? ' · cargando…' : ''}</p>

      {vista === 'semana' ? (
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, i) => sumarDias(fecha, i)).map(dia => {
            const delDia = citas.filter(c => fechaIso(partesEnZona(new Date(c.inicio), zona)) === dia && activas(c))
            const p = leerFecha(dia)!
            return (
              <div key={dia} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className={`px-4 py-2 text-sm font-600 flex items-center justify-between ${dia === hoy ? 'bg-brand-50 text-brand-800' : 'bg-slate-50 text-ink-700'}`}>
                  <span>{capitalizar(textoFechaHora(instanteLocal(zona, p.anio, p.mes, p.dia, 12, 0), zona, { conHora: false }))}</span>
                  <span className="text-xs font-500 text-ink-500">{delDia.length} {delDia.length === 1 ? 'cita' : 'citas'}</span>
                </div>
                {delDia.length === 0 ? <p className="px-4 py-3 text-sm text-ink-400">Sin citas.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {delDia.map(c => <li key={c.id}><TarjetaCita cita={c} datos={datos} onClick={() => setCitaAbierta(c)} /></li>)}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ) : recursosVisibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-ink-500">No hay recursos activos. Añade personas, mesas o salas en la pestaña Recursos.</div>
      ) : (
        <>
          {/* Rejilla (ordenador) */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <div className="flex min-w-[640px]">
              <div className="w-14 shrink-0 border-r border-slate-100">
                <div className="h-10 border-b border-slate-100" />
                <div className="relative" style={{ height: alto }}>
                  {Array.from({ length: (hastaMin - desdeMin) / 60 + 1 }, (_, i) => desdeMin + i * 60).map(m => (
                    <div key={m} className="absolute left-0 right-0 text-[11px] text-ink-400 text-right pr-1.5 -translate-y-1/2" style={{ top: (m - desdeMin) * PX_MIN }}>{String(m / 60).padStart(2, '0')}:00</div>
                  ))}
                </div>
              </div>
              {recursosVisibles.map(r => {
                const suyas = citasDelDia.filter(c => (c.recurso_ids || []).includes(r.id))
                const bloqueosSuyos = bloqueos.filter(b => (!b.recurso_id || b.recurso_id === r.id))
                return (
                  <div key={r.id} className="flex-1 min-w-[160px] border-r border-slate-100 last:border-r-0">
                    <div className="h-10 border-b border-slate-100 px-2 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || '#6366f1' }} />
                      <span className="text-sm font-600 text-ink-800 truncate">{r.nombre}</span>
                      <span className="text-[11px] text-ink-400 ml-auto">{TIPOS_RECURSO.find(t => t.valor === r.tipo)?.etiqueta}</span>
                    </div>
                    <div className="relative cursor-pointer" style={{ height: alto }} onClick={e => clickHueco(r.id, e)}>
                      {Array.from({ length: (hastaMin - desdeMin) / 60 }, (_, i) => desdeMin + i * 60).map(m => (
                        <div key={m} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: (m - desdeMin) * PX_MIN }} />
                      ))}
                      {bloqueosSuyos.map(b => {
                        const top = Math.max(0, posicion(b.desde)), bottom = Math.min(alto, posicion(b.hasta))
                        if (bottom <= top) return null
                        return <div key={b.id} className="absolute left-0 right-0 bg-slate-200/60 border-y border-slate-300 text-[11px] text-slate-500 px-1 overflow-hidden" style={{ top, height: bottom - top }} title={b.motivo || 'Bloqueado'}>{b.motivo || 'Bloqueado'}</div>
                      })}
                      {suyas.map(c => {
                        const top = Math.max(0, posicion(c.inicio)), bottom = Math.min(alto, posicion(c.fin))
                        if (bottom <= top) return null
                        return (
                          <button key={c.id} onClick={e => { e.stopPropagation(); setCitaAbierta(c) }} className={`absolute left-1 right-1 rounded-lg border px-1.5 py-0.5 text-left overflow-hidden shadow-sm ${COLOR_ESTADO[c.estado] || ''}`} style={{ top, height: Math.max(bottom - top, 18) }}>
                            <span className="block text-[11px] font-600 truncate">{textoHora(c.inicio, zona)} {c.nombre_cliente || 'Cliente'}</span>
                            <span className="block text-[11px] truncate">{c.servicio_nombre}{c.personas > 1 ? ` · ${c.personas} p.` : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Lista (móvil) */}
          <div className="md:hidden rounded-xl border border-slate-200 bg-white overflow-hidden">
            {citasDelDia.filter(activas).length === 0 ? <p className="p-4 text-sm text-ink-400">Sin citas este día.</p> : (
              <ul className="divide-y divide-slate-100">
                {citasDelDia.filter(activas).map(c => <li key={c.id}><TarjetaCita cita={c} datos={datos} onClick={() => setCitaAbierta(c)} /></li>)}
              </ul>
            )}
          </div>
        </>
      )}

      {citaAbierta && (
        <DetalleCita cita={citaAbierta} datos={datos} puedeEscribir={puedeEscribir} onClose={() => setCitaAbierta(null)} onCambio={async () => { await cargarCitas(); setCitaAbierta(null) }} onMover={() => { setMover(citaAbierta); setCitaAbierta(null) }} />
      )}
      {nuevaCita && (
        <ModalNuevaCita datos={datos} inicial={nuevaCita} fechaInicial={fecha} onClose={() => setNuevaCita(null)} onCreada={async () => { setNuevaCita(null); await cargarCitas() }} />
      )}
      {mover && (
        <ModalMover cita={mover} datos={datos} onClose={() => setMover(null)} onMovida={async () => { setMover(null); await cargarCitas() }} />
      )}
      {nuevoBloqueo && (
        <ModalBloqueo datos={datos} fechaInicial={fecha} onClose={() => setNuevoBloqueo(false)} onCreado={async () => { setNuevoBloqueo(false); await cargarCitas(); await recargar() }} />
      )}
      {sentar && (
        <ModalSentar datos={datos} onClose={() => setSentar(false)} onSentado={async () => { setSentar(false); setFecha(hoy); await cargarCitas() }} />
      )}
    </div>
  )
}

function TarjetaCita({ cita, datos, onClick }: { cita: any; datos: Datos; onClick: () => void }) {
  const quien = (cita.recurso_ids || []).map((id: string) => datos.recursos.find(r => r.id === id)?.nombre).filter(Boolean).join(', ')
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-center gap-3">
      <div className="w-14 shrink-0 text-sm font-600 text-ink-800">{textoHora(cita.inicio, datos.zona)}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-600 text-ink-900 truncate">{cita.nombre_cliente || 'Cliente'} · {cita.servicio_nombre}{cita.personas > 1 ? ` · ${cita.personas} personas` : ''}</p>
        <p className="text-xs text-ink-500 truncate">{quien || 'Sin recurso'}{cita.telefono ? ` · ${cita.telefono}` : cita.email ? ` · ${cita.email}` : ''}</p>
      </div>
      <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${COLOR_ESTADO[cita.estado] || ''}`}>{ESTADOS_CITA[cita.estado as keyof typeof ESTADOS_CITA]?.etiqueta || cita.estado}</span>
    </button>
  )
}

function Modal({ titulo, onClose, children, ancho = 'max-w-lg' }: { titulo: string; onClose: () => void; children: React.ReactNode; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
        <div className={`w-full ${ancho} bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <h2 className="font-display font-700 text-lg text-ink-900">{titulo}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition" aria-label="Cerrar">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

function DetalleCita({ cita, datos, puedeEscribir, onClose, onCambio, onMover }: { cita: any; datos: Datos; puedeEscribir: boolean; onClose: () => void; onCambio: () => Promise<void>; onMover: () => void }) {
  const { showToast } = useToast()
  const [historial, setHistorial] = useState<any[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  useEffect(() => { getHistorialCita(cita.id).then(r => { if (r.success) setHistorial(r.data || []) }) }, [cita.id])
  const quien = (cita.recurso_ids || []).map((id: string) => datos.recursos.find(r => r.id === id)?.nombre).filter(Boolean).join(', ')
  const estado = cita.estado as string

  async function cambiar(nuevo: 'confirmada' | 'en_curso' | 'completada' | 'no_presentado') {
    setOcupado(true)
    const r = await cambiarEstadoCitaPanel(cita.id, nuevo)
    setOcupado(false)
    if (r.success) { showToast('Cita actualizada', 'success'); await onCambio() } else showToast(r.error || 'No se ha podido cambiar', 'error')
  }
  async function cancelar() {
    setOcupado(true)
    const r = await cancelarCitaPanel(cita.id)
    setOcupado(false)
    setConfirmarCancelar(false)
    if (r.success) { showToast('Cita cancelada', 'success'); await onCambio() } else showToast(r.error || 'No se ha podido cancelar', 'error')
  }
  const activa = ['pendiente', 'confirmada', 'en_curso'].includes(estado)

  return (
    <Modal titulo={cita.servicio_nombre} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-600 text-ink-900">{capitalizar(textoFechaHora(cita.inicio, datos.zona))} – {textoHora(cita.fin, datos.zona)}</span>
          <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${COLOR_ESTADO[estado] || ''}`}>{ESTADOS_CITA[estado as keyof typeof ESTADOS_CITA]?.etiqueta || estado}</span>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-ink-700">
          <dt className="text-ink-500">Cliente</dt><dd className="font-500">{cita.nombre_cliente || '—'}{cita.telefono ? ` · ${cita.telefono}` : ''}{cita.email ? ` · ${cita.email}` : ''}</dd>
          <dt className="text-ink-500">Con</dt><dd>{quien || '—'}</dd>
          <dt className="text-ink-500">Personas</dt><dd>{cita.personas}</dd>
          {cita.precio_estimado !== null && cita.precio_estimado !== undefined && <><dt className="text-ink-500">Precio</dt><dd>{Number(cita.precio_estimado).toLocaleString('es-ES', { minimumFractionDigits: 2 })} {cita.moneda || ''}</dd></>}
          {Array.isArray(cita.extras) && cita.extras.length > 0 && <><dt className="text-ink-500">Extras</dt><dd>{cita.extras.join(', ')}</dd></>}
          {cita.peticiones && <><dt className="text-ink-500">Peticiones</dt><dd>{cita.peticiones}</dd></>}
          {cita.notas && <><dt className="text-ink-500">Notas</dt><dd>{cita.notas}</dd></>}
          <dt className="text-ink-500">Origen</dt><dd>{cita.origen === 'ia' ? 'La IA, en el chat' : cita.origen === 'enlace' ? 'Enlace de reservas' : 'El equipo, desde el panel'}</dd>
        </dl>
        {puedeEscribir && activa && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {estado === 'pendiente' && <button disabled={ocupado} onClick={() => cambiar('confirmada')} className={botonPrimario}>Confirmar</button>}
            {estado !== 'en_curso' && <button disabled={ocupado} onClick={() => cambiar('en_curso')} className={botonSecundario}>Ha llegado</button>}
            <button disabled={ocupado} onClick={() => cambiar('completada')} className={botonSecundario}>Terminada</button>
            {estado !== 'en_curso' && <button disabled={ocupado} onClick={() => cambiar('no_presentado')} className={botonSecundario}>No ha venido</button>}
            <button disabled={ocupado} onClick={onMover} className={botonSecundario}>Mover</button>
            <button disabled={ocupado} onClick={() => setConfirmarCancelar(true)} className={`${boton} border border-rose-200 text-rose-700 bg-white hover:bg-rose-50`}>Cancelar cita</button>
          </div>
        )}
        {historial.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-600 text-ink-500 uppercase tracking-wide mb-1.5">Historial</p>
            <ul className="space-y-1 text-xs text-ink-600">
              {historial.map((h, i) => <li key={i}>{new Date(h.created_at).toLocaleString('es-ES', { timeZone: datos.zona, dateStyle: 'short', timeStyle: 'short' })} · {h.cambio.replace('_', ' ')} · {h.origen === 'ia' ? 'IA' : h.origen === 'enlace' ? 'enlace' : h.origen === 'panel' ? 'equipo' : 'sistema'}</li>)}
            </ul>
          </div>
        )}
      </div>
      <ConfirmModal isOpen={confirmarCancelar} title="Cancelar la cita" message="Se libera el hueco y, si tienes la automatización encendida, se avisa al cliente y a la lista de espera." confirmText="Cancelar la cita" cancelText="Volver" type="danger" onConfirm={cancelar} onClose={() => setConfirmarCancelar(false)} isLoading={ocupado} />
    </Modal>
  )
}

function SelectorHuecos({ datos, servicioId, fecha, personas, recursoId, ignorarCitaId, elegido, onElegir, zona }: { datos: Datos; servicioId: string; fecha: string; personas: number; recursoId: string | null; ignorarCitaId?: string | null; elegido: string | null; onElegir: (inicio: string, recursos: string[]) => void; zona?: string | null }) {
  const [huecos, setHuecos] = useState<any[]>([])
  const [motivo, setMotivo] = useState<string | undefined>()
  const [sinReglas, setSinReglas] = useState(false)
  const [cargando, setCargando] = useState(false)
  useEffect(() => {
    if (!servicioId || !leerFecha(fecha)) { setHuecos([]); return }
    setCargando(true)
    getHuecos({ servicio_id: servicioId, fecha, personas, recurso_id: recursoId, sin_reglas: sinReglas, ignorar_cita_id: ignorarCitaId, zona: zona || null }).then(r => {
      if (r.success && r.data) { setHuecos(r.data.huecos); setMotivo(r.data.motivo) } else { setHuecos([]); setMotivo(r.error) }
      setCargando(false)
    })
  }, [servicioId, fecha, personas, recursoId, sinReglas, ignorarCitaId, zona])
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-600 text-ink-700">Hora {cargando ? '· buscando…' : `· ${huecos.length} huecos`}</label>
        <label className="flex items-center gap-1.5 text-xs text-ink-500 cursor-pointer"><input type="checkbox" checked={sinReglas} onChange={e => setSinReglas(e.target.checked)} className="w-3.5 h-3.5" /> Fuera de horario y sin antelación</label>
      </div>
      {!cargando && huecos.length === 0 && <p className="text-sm text-ink-400">{motivo || 'No hay huecos ese día.'}</p>}
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        {huecos.map(h => (
          <button type="button" key={h.inicio} onClick={() => onElegir(h.inicio, h.recursos)} className={`px-2.5 h-8 rounded-lg border text-sm ${elegido === h.inicio ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300 text-ink-700 hover:border-brand-400'}`}>
            {textoHora(h.inicio, datos.zona)}{h.plazas !== undefined ? ` (${h.plazas})` : ''}{h.turno ? ` · ${h.turno}` : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

function ModalNuevaCita({ datos, inicial, fechaInicial, onClose, onCreada }: { datos: Datos; inicial: { recurso_id?: string | null; inicio?: string }; fechaInicial: string; onClose: () => void; onCreada: () => Promise<void> }) {
  const { showToast } = useToast()
  const restaurante = datos.ajustes.modo === 'restaurante'
  const [servicioId, setServicioId] = useState(restaurante ? ID_MESA : (datos.servicios[0]?.id || ''))
  const [fecha, setFecha] = useState(inicial.inicio ? diaEnZona(new Date(inicial.inicio), datos.zona) : fechaInicial)
  const [personas, setPersonas] = useState(restaurante ? 2 : 1)
  const [zona, setZona] = useState('')
  const zonas = [...new Set(datos.recursos.filter(r => r.activo && r.tipo === 'mesa').map(r => (r.zona || '').trim()).filter(Boolean))]
  const [recursoId, setRecursoId] = useState<string | null>(inicial.recurso_id || null)
  const [inicio, setInicio] = useState<string | null>(inicial.inicio || null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [peticiones, setPeticiones] = useState('')
  const [estado, setEstado] = useState<'confirmada' | 'pendiente'>('confirmada')
  const [extras, setExtras] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const esMesa = servicioId === ID_MESA
  const servicio = datos.servicios.find(s => s.id === servicioId)
  const candidatos = esMesa
    ? datos.recursos.filter(r => r.activo && r.tipo === 'mesa' && (!zona || (r.zona || '').toLowerCase().includes(zona.toLowerCase())))
    : datos.recursos.filter(r => r.activo && (!servicio?.tipo_recurso || r.tipo === servicio.tipo_recurso) && (!(datos.vinculos_por_recurso[r.id] || []).length || (datos.vinculos_por_recurso[r.id] || []).includes(servicioId)))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!servicioId) return showToast('Elige un servicio', 'error')
    if (!inicio) return showToast('Elige una hora', 'error')
    if (!nombre.trim() && !telefono.trim() && !email.trim()) return showToast('Pon al menos el nombre o el teléfono del cliente', 'error')
    setGuardando(true)
    const r = await crearCitaPanel({ servicio_id: servicioId, inicio, personas, recurso_id: recursoId, extras, nombre, telefono, email, notas, peticiones, estado, zona: esMesa && zona ? zona : null })
    setGuardando(false)
    if (r.success) { showToast('Cita creada', 'success'); await onCreada() } else showToast(r.error || 'No se ha podido crear', 'error')
  }

  if (!datos.servicios.length && !restaurante) return (
    <Modal titulo="Nueva cita" onClose={onClose}>
      <p className="text-sm text-ink-600">No hay ningún servicio reservable. Márcalos en la <Link href="/dashboard/precios" className="underline font-600">lista de precios</Link>.</p>
    </Modal>
  )

  return (
    <Modal titulo={restaurante ? 'Nueva reserva' : 'Nueva cita'} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(!restaurante || datos.servicios.length > 0) && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-600 text-ink-700 mb-1">{restaurante ? 'Qué se reserva' : 'Servicio'}</label>
              <select value={servicioId} onChange={e => { setServicioId(e.target.value); setInicio(null); setExtras([]); setRecursoId(null) }} className={campo}>
                {restaurante && <option value={ID_MESA}>Mesa</option>}
                {datos.servicios.map(s => <option key={s.id} value={s.id}>{s.nombre} · {s.duracion_minutos || 30} min</option>)}
              </select>
            </div>
          )}
          {esMesa && zonas.length > 0 && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-600 text-ink-700 mb-1">Zona</label>
              <select value={zona} onChange={e => { setZona(e.target.value); setInicio(null); setRecursoId(null) }} className={campo}>
                <option value="">Cualquiera</option>
                {zonas.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-600 text-ink-700 mb-1">Día</label>
            <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setInicio(null) }} className={campo} required />
          </div>
          <div>
            <label className="block text-xs font-600 text-ink-700 mb-1">Personas</label>
            <input type="number" min={1} max={500} value={personas} onChange={e => { setPersonas(Math.max(1, Number(e.target.value || 1))); setInicio(null) }} className={campo} />
          </div>
          {candidatos.length > 1 && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-600 text-ink-700 mb-1">{esMesa ? 'Mesa' : 'Con'}</label>
              <select value={recursoId || ''} onChange={e => { setRecursoId(e.target.value || null); setInicio(null) }} className={campo}>
                <option value="">{esMesa ? 'La que mejor encaje' : 'Quien esté libre'}</option>
                {candidatos.map(r => <option key={r.id} value={r.id}>{r.nombre}{esMesa ? ` · ${r.capacidad_min === r.capacidad_max ? r.capacidad_max : `${r.capacidad_min}–${r.capacidad_max}`} personas` : ''}</option>)}
              </select>
            </div>
          )}
          {servicio && servicio.extras.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap gap-3">
              {servicio.extras.map(x => (
                <label key={x.nombre} className="flex items-center gap-1.5 text-sm text-ink-700 cursor-pointer">
                  <input type="checkbox" checked={extras.includes(x.nombre)} onChange={e => { setExtras(e.target.checked ? [...extras, x.nombre] : extras.filter(n => n !== x.nombre)); setInicio(null) }} className="w-4 h-4" />
                  {x.nombre}{x.precio ? ` (+${x.precio})` : ''}
                </label>
              ))}
            </div>
          )}
        </div>
        {servicioId && <SelectorHuecos datos={datos} servicioId={servicioId} fecha={fecha} personas={personas} recursoId={recursoId} elegido={inicio} onElegir={(i) => setInicio(i)} zona={esMesa ? zona : null} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <div className="sm:col-span-2"><label className="block text-xs font-600 text-ink-700 mb-1">Nombre del cliente</label><input value={nombre} onChange={e => setNombre(e.target.value)} className={campo} placeholder="Laura García" /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Teléfono (WhatsApp)</label><input value={telefono} onChange={e => setTelefono(e.target.value)} className={campo} placeholder="+34 600 000 000" /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Correo</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={campo} placeholder="laura@correo.com" /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-600 text-ink-700 mb-1">Peticiones del cliente</label><input value={peticiones} onChange={e => setPeticiones(e.target.value)} className={campo} placeholder="Alergias, trona, aparcamiento…" /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-600 text-ink-700 mb-1">Notas internas</label><input value={notas} onChange={e => setNotas(e.target.value)} className={campo} /></div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-600 text-ink-700 mb-1">Estado</label>
            <select value={estado} onChange={e => setEstado(e.target.value as any)} className={campo}>
              <option value="confirmada">Confirmada</option>
              <option value="pendiente">Pendiente de confirmar</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={botonSecundario}>Cancelar</button>
          <button type="submit" disabled={guardando} className={botonPrimario}>{guardando ? 'Guardando…' : 'Guardar cita'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ModalMover({ cita, datos, onClose, onMovida }: { cita: any; datos: Datos; onClose: () => void; onMovida: () => Promise<void> }) {
  const { showToast } = useToast()
  const [fecha, setFecha] = useState(diaEnZona(new Date(cita.inicio), datos.zona))
  const [inicio, setInicio] = useState<string | null>(null)
  const [recursoId, setRecursoId] = useState<string | null>((cita.recurso_ids || [])[0] || null)
  const [guardando, setGuardando] = useState(false)
  const servicio = datos.servicios.find(s => s.id === cita.servicio_id)
  const candidatos = datos.recursos.filter(r => r.activo && (!servicio?.tipo_recurso || r.tipo === servicio.tipo_recurso))
  async function guardar() {
    if (!inicio) return showToast('Elige una hora', 'error')
    setGuardando(true)
    const r = await moverCitaPanel(cita.id, { inicio, recurso_id: recursoId })
    setGuardando(false)
    if (r.success) { showToast('Cita movida', 'success'); await onMovida() } else showToast(r.error || 'No se ha podido mover', 'error')
  }
  if (!servicio) return <Modal titulo="Mover cita" onClose={onClose}><p className="text-sm text-ink-600">El servicio de esta cita ya no está en la lista de precios; no se puede recalcular.</p></Modal>
  return (
    <Modal titulo={`Mover: ${cita.servicio_nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Ahora: <span className="font-600">{capitalizar(textoFechaHora(cita.inicio, datos.zona))}</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Nuevo día</label><input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setInicio(null) }} className={campo} /></div>
          {candidatos.length > 1 && (
            <div><label className="block text-xs font-600 text-ink-700 mb-1">Con</label>
              <select value={recursoId || ''} onChange={e => { setRecursoId(e.target.value || null); setInicio(null) }} className={campo}>
                <option value="">Quien esté libre</option>
                {candidatos.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <SelectorHuecos datos={datos} servicioId={servicio.id} fecha={fecha} personas={cita.personas} recursoId={recursoId} ignorarCitaId={cita.id} elegido={inicio} onElegir={i => setInicio(i)} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={botonSecundario}>Volver</button>
          <button type="button" disabled={guardando} onClick={guardar} className={botonPrimario}>{guardando ? 'Moviendo…' : 'Mover cita'}</button>
        </div>
      </div>
    </Modal>
  )
}

function ModalBloqueo({ datos, fechaInicial, onClose, onCreado }: { datos: Datos; fechaInicial: string; onClose: () => void; onCreado: () => Promise<void> }) {
  const { showToast } = useToast()
  const [recursoId, setRecursoId] = useState('')
  const [desdeFecha, setDesdeFecha] = useState(fechaInicial)
  const [desdeHora, setDesdeHora] = useState('09:00')
  const [hastaFecha, setHastaFecha] = useState(fechaInicial)
  const [hastaHora, setHastaHora] = useState('18:00')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const aInstante = (f: string, h: string) => { const p = leerFecha(f); const [hh, mm] = h.split(':').map(Number); return p ? instanteLocal(datos.zona, p.anio, p.mes, p.dia, hh, mm).toISOString() : '' }
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const r = await crearBloqueo({ recurso_id: recursoId || null, desde: aInstante(desdeFecha, desdeHora), hasta: aInstante(hastaFecha, hastaHora), motivo })
    setGuardando(false)
    if (r.success) { showToast('Bloqueo creado', 'success'); await onCreado() } else showToast(r.error || 'No se ha podido bloquear', 'error')
  }
  return (
    <Modal titulo="Bloquear la agenda" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-3">
        <div><label className="block text-xs font-600 text-ink-700 mb-1">A quién afecta</label>
          <select value={recursoId} onChange={e => setRecursoId(e.target.value)} className={campo}>
            <option value="">A todo el negocio</option>
            {datos.recursos.filter(r => r.activo).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Desde</label><input type="date" value={desdeFecha} onChange={e => setDesdeFecha(e.target.value)} className={campo} required /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Hora</label><input type="time" value={desdeHora} onChange={e => setDesdeHora(e.target.value)} className={campo} required /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Hasta</label><input type="date" value={hastaFecha} onChange={e => setHastaFecha(e.target.value)} className={campo} required /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Hora</label><input type="time" value={hastaHora} onChange={e => setHastaHora(e.target.value)} className={campo} required /></div>
        </div>
        <div><label className="block text-xs font-600 text-ink-700 mb-1">Motivo</label><input value={motivo} onChange={e => setMotivo(e.target.value)} className={campo} placeholder="Vacaciones, festivo, avería…" /></div>
        {datos.bloqueos.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-600 text-ink-500 uppercase tracking-wide mb-1.5">Bloqueos próximos</p>
            <ul className="space-y-1 text-xs text-ink-600 max-h-32 overflow-y-auto">
              {datos.bloqueos.map(b => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span>{capitalizar(textoFechaHora(b.desde, datos.zona))} → {textoFechaHora(b.hasta, datos.zona)}{b.motivo ? ` · ${b.motivo}` : ''}{b.recurso_id ? ` · ${datos.recursos.find(r => r.id === b.recurso_id)?.nombre || ''}` : ' · todos'}</span>
                  <button type="button" onClick={async () => { const r = await borrarBloqueo(b.id); if (r.success) { showToast('Bloqueo quitado', 'success'); await onCreado() } else showToast(r.error || 'No se ha podido quitar', 'error') }} className="text-rose-600 hover:underline shrink-0">Quitar</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={botonSecundario}>Cerrar</button>
          <button type="submit" disabled={guardando} className={botonPrimario}>{guardando ? 'Guardando…' : 'Bloquear'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Recursos
// ===========================================================================
function Recursos({ datos, puedeEscribir, recargar }: { datos: Datos; puedeEscribir: boolean; recargar: () => Promise<void> }) {
  const { showToast } = useToast()
  const [editando, setEditando] = useState<Partial<Recurso> & { servicios?: string[] } | null>(null)
  const [aBorrar, setABorrar] = useState<Recurso | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function borrar() {
    if (!aBorrar) return
    setOcupado(true)
    const r = await borrarRecurso(aBorrar.id)
    setOcupado(false)
    setABorrar(null)
    if (r.success) { showToast('Recurso borrado', 'success'); await recargar() } else showToast(r.error || 'No se ha podido borrar', 'error')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-600">Lo que se ocupa al reservar: personas, mesas, salas, equipos. Cada uno con su horario y lo que sabe hacer.</p>
        {puedeEscribir && <button onClick={() => setEditando({ tipo: 'persona', capacidad_min: 1, capacidad_max: 1, activo: true, usa_horario_sucursal: true, elegible: true, servicios: [] })} className={botonPrimario}>+ Añadir recurso</button>}
      </div>
      {datos.recursos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-ink-500">Todavía no hay recursos. Empieza por quién atiende: un profesional, una mesa, una sala.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {datos.recursos.map(r => (
            <div key={r.id} className={`rounded-xl border bg-white p-4 ${r.activo ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color || '#6366f1' }} />
                  <div className="min-w-0">
                    <p className="font-600 text-ink-900 truncate">{r.nombre}</p>
                    <p className="text-xs text-ink-500">{TIPOS_RECURSO.find(t => t.valor === r.tipo)?.etiqueta}{r.capacidad_max > 1 ? ` · ${r.capacidad_min === r.capacidad_max ? r.capacidad_max : `${r.capacidad_min}–${r.capacidad_max}`} personas` : ''}{r.zona ? ` · ${r.zona}` : ''}{!r.activo ? ' · desactivado' : ''}</p>
                  </div>
                </div>
                {puedeEscribir && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditando({ ...r, servicios: datos.vinculos_por_recurso?.[r.id] || [] })} className="text-xs font-600 text-brand-600 hover:underline">Editar</button>
                    <button onClick={() => setABorrar(r)} className="text-xs font-600 text-rose-600 hover:underline ml-2">Borrar</button>
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-500 mt-2">{r.usa_horario_sucursal || !(r.horarios || []).length ? 'Horario del negocio' : `Horario propio (${(r.horarios || []).length} franjas)`}{!r.elegible ? ' · no se elige (se asigna solo)' : ''}</p>
            </div>
          ))}
        </div>
      )}
      {datos.ajustes.modo === 'restaurante' && <Combinaciones datos={datos} puedeEscribir={puedeEscribir} recargar={recargar} />}
      {editando && <ModalRecurso datos={datos} inicial={editando} onClose={() => setEditando(null)} onGuardado={async () => { setEditando(null); await recargar() }} />}
      <ConfirmModal isOpen={!!aBorrar} title={`Borrar "${aBorrar?.nombre || ''}"`} message="Si tiene citas futuras no se podrá borrar; desactívalo en su lugar." confirmText="Borrar" cancelText="Volver" type="danger" onConfirm={borrar} onClose={() => setABorrar(null)} isLoading={ocupado} />
    </div>
  )
}

function ModalRecurso({ datos, inicial, onClose, onGuardado }: { datos: Datos; inicial: Partial<Recurso> & { servicios?: string[] }; onClose: () => void; onGuardado: () => Promise<void> }) {
  const { showToast } = useToast()
  const [f, setF] = useState<any>({ nombre: '', tipo: 'persona', capacidad_min: 1, capacidad_max: 1, zona: '', color: '#6366f1', activo: true, usa_horario_sucursal: true, elegible: true, notas: '', servicios: [], ...inicial, horarios: inicial.horarios || [] })
  const [guardando, setGuardando] = useState(false)
  const horarioDe = (dia: number) => (f.horarios as HorarioRecurso[]).find(h => h.dia_semana === dia)
  const ponerHorario = (dia: number, valor: HorarioRecurso | null) => {
    const resto = (f.horarios as HorarioRecurso[]).filter(h => h.dia_semana !== dia)
    setF({ ...f, horarios: valor ? [...resto, valor] : resto })
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const r = await guardarRecurso({ id: f.id, nombre: f.nombre, tipo: f.tipo, capacidad_min: Number(f.capacidad_min), capacidad_max: Number(f.capacidad_max), zona: f.zona, color: f.color, activo: !!f.activo, usa_horario_sucursal: !!f.usa_horario_sucursal, elegible: !!f.elegible, notas: f.notas, horarios: f.usa_horario_sucursal ? [] : f.horarios, servicios: f.servicios })
    setGuardando(false)
    if (r.success) { showToast('Recurso guardado', 'success'); await onGuardado() } else showToast(r.error || 'No se ha podido guardar', 'error')
  }
  const serviciosPosibles = datos.servicios.filter(s => !s.tipo_recurso || s.tipo_recurso === f.tipo)
  return (
    <Modal titulo={f.id ? `Editar ${f.nombre}` : 'Nuevo recurso'} onClose={onClose} ancho="max-w-xl">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="block text-xs font-600 text-ink-700 mb-1">Nombre</label><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} className={campo} required placeholder="Ana, Mesa 3, Sala 1…" /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Tipo</label>
            <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value, capacidad_min: e.target.value === 'persona' ? 1 : f.capacidad_min, capacidad_max: e.target.value === 'persona' ? 1 : Math.max(f.capacidad_max, 2) })} className={campo}>
              {TIPOS_RECURSO.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            </select>
            <p className="text-[11px] text-ink-400 mt-1">{TIPOS_RECURSO.find(t => t.valor === f.tipo)?.ayuda}</p>
          </div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Color</label><input type="color" value={f.color || '#6366f1'} onChange={e => setF({ ...f, color: e.target.value })} className="h-11 w-full rounded-xl border border-slate-300 p-1" /></div>
          {f.tipo !== 'persona' && (
            <>
              <div><label className="block text-xs font-600 text-ink-700 mb-1">Personas mínimo</label><input type="number" min={1} value={f.capacidad_min} onChange={e => setF({ ...f, capacidad_min: Number(e.target.value || 1) })} className={campo} /></div>
              <div><label className="block text-xs font-600 text-ink-700 mb-1">Personas máximo</label><input type="number" min={1} value={f.capacidad_max} onChange={e => setF({ ...f, capacidad_max: Number(e.target.value || 1) })} className={campo} /></div>
            </>
          )}
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Zona <span className="font-400 text-ink-400">· opcional</span></label><input value={f.zona || ''} onChange={e => setF({ ...f, zona: e.target.value })} className={campo} placeholder="Terraza, planta 1…" /></div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer"><input type="checkbox" checked={!!f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} className="w-4 h-4" /> Activo</label>
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer"><input type="checkbox" checked={!!f.elegible} onChange={e => setF({ ...f, elegible: e.target.checked })} className="w-4 h-4" /> El cliente puede elegirlo por su nombre</label>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-600 text-ink-800 cursor-pointer"><input type="checkbox" checked={!!f.usa_horario_sucursal} onChange={e => setF({ ...f, usa_horario_sucursal: e.target.checked })} className="w-4 h-4" /> Usa el horario del negocio</label>
          {!f.usa_horario_sucursal && (
            <div className="mt-2 space-y-1.5">
              {DIAS_SEMANA.map(d => {
                const h = horarioDe(d.id)
                return (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <label className="w-24 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={!!h} onChange={e => ponerHorario(d.id, e.target.checked ? { dia_semana: d.id, apertura: '09:00', cierre: '18:00' } : null)} className="w-4 h-4" /> {d.label}</label>
                    {h && (<>
                      <input type="time" value={h.apertura} onChange={e => ponerHorario(d.id, { ...h, apertura: e.target.value })} className={`${caja} h-9`} />
                      <span className="text-ink-400">a</span>
                      <input type="time" value={h.cierre} onChange={e => ponerHorario(d.id, { ...h, cierre: e.target.value })} className={`${caja} h-9`} />
                    </>)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {serviciosPosibles.length > 0 && (
          <div>
            <p className="text-xs font-600 text-ink-700 mb-1">Qué servicios hace <span className="font-400 text-ink-400">· sin marcar ninguno, hace todos los de su tipo</span></p>
            <div className="flex flex-wrap gap-2">
              {serviciosPosibles.map(s => (
                <label key={s.id} className={`px-2.5 h-8 rounded-lg border text-sm cursor-pointer flex items-center gap-1.5 ${(f.servicios || []).includes(s.id) ? 'bg-brand-50 border-brand-300 text-brand-800' : 'bg-white border-slate-300 text-ink-700'}`}>
                  <input type="checkbox" className="sr-only" checked={(f.servicios || []).includes(s.id)} onChange={e => setF({ ...f, servicios: e.target.checked ? [...(f.servicios || []), s.id] : (f.servicios || []).filter((x: string) => x !== s.id) })} />
                  {s.nombre}
                </label>
              ))}
            </div>
          </div>
        )}
        <div><label className="block text-xs font-600 text-ink-700 mb-1">Notas internas</label><input value={f.notas || ''} onChange={e => setF({ ...f, notas: e.target.value })} className={campo} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={botonSecundario}>Cancelar</button>
          <button type="submit" disabled={guardando} className={botonPrimario}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ===========================================================================
// Ajustes
// ===========================================================================
function Ajustes({ datos, puedeEscribir, recargar }: { datos: Datos; puedeEscribir: boolean; recargar: () => Promise<void> }) {
  const { showToast } = useToast()
  const [f, setF] = useState<any>({ ...datos.ajustes })
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { setF({ ...datos.ajustes }) }, [datos.ajustes])
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const r = await guardarAjustesAgenda(f)
    setGuardando(false)
    if (r.success) { showToast('Ajustes guardados', 'success'); await recargar() } else showToast(r.error || 'No se han podido guardar', 'error')
  }
  const num = (k: string, min: number, max: number) => (
    <input type="number" min={min} max={max} value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) })} className={campo} disabled={!puedeEscribir} />
  )
  return (
    <form onSubmit={guardar} className="max-w-2xl space-y-5">
      <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white cursor-pointer">
        <div>
          <span className="block text-sm font-600 text-ink-900">Agenda activada</span>
          <span className="block text-xs text-ink-500 mt-0.5">Con esto encendido, la IA reserva en el chat y el enlace público funciona. Apagada, solo el equipo apunta citas.</span>
        </div>
        <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0" style={{ backgroundColor: f.activa ? '#10b981' : '#e2e8f0' }}>
          <input type="checkbox" className="sr-only" checked={!!f.activa} disabled={!puedeEscribir} onChange={e => setF({ ...f, activa: e.target.checked })} />
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${f.activa ? 'translate-x-6' : 'translate-x-1'}`} />
        </div>
      </label>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <p className="text-sm font-600 text-ink-900">Reglas de reserva</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Tipo de negocio</label>
            <select value={f.modo} onChange={e => setF({ ...f, modo: e.target.value })} className={campo} disabled={!puedeEscribir}>
              <option value="servicios">Servicios con cita (peluquería, clínica, taller, academia…)</option>
              <option value="restaurante">Restaurante (mesas y turnos)</option>
            </select>
          </div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Los huecos empiezan cada</label>
            <select value={f.paso_minutos} onChange={e => setF({ ...f, paso_minutos: Number(e.target.value) })} className={campo} disabled={!puedeEscribir}>
              {PASOS_AGENDA.map(p => <option key={p} value={p}>{p} minutos</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Antelación mínima (minutos)</label>{num('antelacion_minima_minutos', 0, 10080)}</div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Se puede reservar hasta (días antes)</label>{num('antelacion_maxima_dias', 1, 365)}</div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Cancelar o mover hasta (horas antes)</label>{num('cancelacion_horas', 0, 720)}</div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Máximo de reservas activas por cliente</label>{num('max_citas_activas_por_cliente', 1, 50)}</div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Es grupo grande a partir de (personas)</label>{num('grupo_grande_desde', 2, 500)}</div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Cómo se confirman</label>
            <select value={f.confirmacion} onChange={e => setF({ ...f, confirmacion: e.target.value })} className={campo} disabled={!puedeEscribir}>
              <option value="automatica">Se confirman solas (la IA y el enlace)</option>
              <option value="manual">Quedan pendientes hasta que alguien del equipo confirme</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-ink-500">Los grupos grandes, lo que se sale de plazo y lo que supera el máximo por cliente no lo confirma la IA: abre un caso y lo mira una persona.</p>
      </div>

      {f.modo === 'restaurante' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <p className="text-sm font-600 text-ink-900">Restaurante</p>
          <div>
            <label className="block text-xs font-600 text-ink-700 mb-1">Turnos</label>
            {(f.turnos || []).map((t: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
                <input value={t.nombre} onChange={e => { const l = [...f.turnos]; l[i] = { ...t, nombre: e.target.value }; setF({ ...f, turnos: l }) }} className={`${caja} h-9 w-28`} placeholder="Comida" disabled={!puedeEscribir} />
                <input type="time" value={t.inicio} onChange={e => { const l = [...f.turnos]; l[i] = { ...t, inicio: e.target.value }; setF({ ...f, turnos: l }) }} className={`${caja} h-9`} disabled={!puedeEscribir} />
                <span className="text-xs text-ink-400">a</span>
                <input type="time" value={t.fin} onChange={e => { const l = [...f.turnos]; l[i] = { ...t, fin: e.target.value }; setF({ ...f, turnos: l }) }} className={`${caja} h-9`} disabled={!puedeEscribir} />
                <span className="text-xs text-ink-400">última entrada</span>
                <input type="time" value={t.ultima_entrada || ''} onChange={e => { const l = [...f.turnos]; l[i] = { ...t, ultima_entrada: e.target.value }; setF({ ...f, turnos: l }) }} className={`${caja} h-9`} disabled={!puedeEscribir} />
                {puedeEscribir && <button type="button" onClick={() => setF({ ...f, turnos: f.turnos.filter((_: any, j: number) => j !== i) })} className="text-slate-400 hover:text-rose-500 text-lg leading-none">&times;</button>}
              </div>
            ))}
            {puedeEscribir && (f.turnos || []).length < 6 && <button type="button" onClick={() => setF({ ...f, turnos: [...(f.turnos || []), { nombre: (f.turnos || []).length ? 'Cena' : 'Comida', inicio: (f.turnos || []).length ? '20:00' : '13:00', fin: (f.turnos || []).length ? '23:30' : '16:00', ultima_entrada: (f.turnos || []).length ? '22:30' : '15:00' }] })} className="text-sm font-600 text-brand-600">+ Añadir turno</button>}
          </div>
          <div>
            <label className="block text-xs font-600 text-ink-700 mb-1">Cuánto dura una mesa según comensales</label>
            {(f.duracion_por_comensales || []).map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 mb-2 text-sm">
                <span className="text-xs text-ink-500">Hasta</span>
                <input type="number" min={1} value={d.hasta_personas} onChange={e => { const l = [...f.duracion_por_comensales]; l[i] = { ...d, hasta_personas: Number(e.target.value || 1) }; setF({ ...f, duracion_por_comensales: l }) }} className={`${caja} h-9 w-20`} disabled={!puedeEscribir} />
                <span className="text-xs text-ink-500">personas:</span>
                <input type="number" min={15} value={d.minutos} onChange={e => { const l = [...f.duracion_por_comensales]; l[i] = { ...d, minutos: Number(e.target.value || 60) }; setF({ ...f, duracion_por_comensales: l }) }} className={`${caja} h-9 w-24`} disabled={!puedeEscribir} />
                <span className="text-xs text-ink-500">minutos</span>
                {puedeEscribir && <button type="button" onClick={() => setF({ ...f, duracion_por_comensales: f.duracion_por_comensales.filter((_: any, j: number) => j !== i) })} className="text-slate-400 hover:text-rose-500 text-lg leading-none">&times;</button>}
              </div>
            ))}
            {puedeEscribir && (f.duracion_por_comensales || []).length < 10 && <button type="button" onClick={() => setF({ ...f, duracion_por_comensales: [...(f.duracion_por_comensales || []), { hasta_personas: (f.duracion_por_comensales || []).length ? 6 : 2, minutos: (f.duracion_por_comensales || []).length ? 120 : 75 }] })} className="text-sm font-600 text-brand-600">+ Añadir tramo</button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs font-600 text-ink-700 mb-1">Aforo por turno <span className="font-400 text-ink-400">· vacío = sin tope</span></label>{num('aforo_por_turno', 1, 5000)}</div>
            <div><label className="block text-xs font-600 text-ink-700 mb-1">Cortesía antes de dar la mesa por libre (min)</label>{num('tiempo_cortesia_minutos', 0, 120)}</div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer h-11"><input type="checkbox" checked={!!f.combinar_mesas} disabled={!puedeEscribir} onChange={e => setF({ ...f, combinar_mesas: e.target.checked })} className="w-4 h-4" /> Juntar mesas para grupos</label></div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-600 text-ink-900">Enlace público de reservas</p>
        <p className="text-xs text-ink-500">Para tu web, la bio de Instagram o un código QR en el mostrador. El cliente reserva sin registrarse: deja su WhatsApp o su correo y recibe la confirmación con un enlace para cambiar o cancelar.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden">
            <span className="px-3 text-sm text-ink-400 whitespace-nowrap">{typeof window !== 'undefined' ? window.location.host : ''}/r/</span>
            <input value={f.enlace_publico || ''} onChange={e => setF({ ...f, enlace_publico: e.target.value })} className="flex-1 h-11 px-1 text-sm focus:outline-none" placeholder="mi-negocio" disabled={!puedeEscribir} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer h-11 px-1">
            <input type="checkbox" checked={!!f.enlace_activo} disabled={!puedeEscribir} onChange={e => setF({ ...f, enlace_activo: e.target.checked })} className="w-4 h-4" /> Enlace activo
          </label>
        </div>
        {datos.ajustes.enlace_publico && (
          <div className="flex flex-col sm:flex-row gap-4 items-start pt-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-500 mb-1">Tu enlace{!datos.ajustes.enlace_activo ? ' (ahora mismo apagado)' : ''}:</p>
              <a href={`/r/${datos.ajustes.enlace_publico}`} target="_blank" rel="noreferrer" className="text-sm font-600 text-brand-600 break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/r/{datos.ajustes.enlace_publico}</a>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => { try { navigator.clipboard.writeText(`${window.location.origin}/r/${datos.ajustes.enlace_publico}`); showToast('Enlace copiado', 'success') } catch { showToast('No se ha podido copiar', 'error') } }} className={botonSecundario}>Copiar enlace</button>
                <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/r/${datos.ajustes.enlace_publico}`)}`} target="_blank" rel="noreferrer" className={botonSecundario + ' inline-flex items-center'}>Descargar QR</a>
              </div>
              <p className="text-[11px] text-ink-400 mt-2">Solo se reservan por aquí los servicios con "se puede reservar desde el enlace público" y, en restaurantes, las mesas.</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Código QR del enlace de reservas" width={120} height={120} className="rounded-lg border border-slate-200 shrink-0" src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://respondi.vercel.app'}/r/${datos.ajustes.enlace_publico}`)}`} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-600 text-ink-900">Lo que la IA debe saber al reservar</p>
        <textarea value={f.instrucciones_ia || ''} onChange={e => setF({ ...f, instrucciones_ia: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-brand-500" placeholder="Por ejemplo: los tintes solo por la mañana; los sábados no se reservan clases; pregunta si tiene alergias." disabled={!puedeEscribir} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-600 text-ink-900 mb-1">Servicios que se reservan</p>
        {datos.servicios.length === 0 ? <p className="text-sm text-ink-500">Ninguno. Márcalos en la <Link href="/dashboard/precios" className="underline font-600 text-brand-600">lista de precios</Link>.</p> : (
          <ul className="text-sm text-ink-700 space-y-0.5">
            {datos.servicios.map(s => <li key={s.id}>{s.nombre} · {s.duracion_minutos || 30} min{s.aforo ? ` · ${s.aforo} plazas` : ''}{!s.disponible ? ' · no disponible' : ''}</li>)}
          </ul>
        )}
        <Link href="/dashboard/precios" className="inline-block mt-2 text-sm font-600 text-brand-600 hover:underline">Ir a la lista de precios →</Link>
      </div>

      {puedeEscribir && <div className="flex justify-end"><button type="submit" disabled={guardando} className={botonPrimario}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</button></div>}
    </form>
  )
}

// ===========================================================================
// Restaurante: la sala por turnos, sentar sin reserva y mesas que se juntan
// ===========================================================================
function ventanaTurno(datos: Datos, fecha: string, turno: { inicio: string; fin: string } | null) {
  const p = leerFecha(fecha)!
  if (!turno) return { desde: instanteLocal(datos.zona, p.anio, p.mes, p.dia, 0, 0), hasta: instanteLocal(datos.zona, p.anio, p.mes, p.dia, 23, 59) }
  const [hi, mi] = turno.inicio.split(':').map(Number), [hf, mf] = turno.fin.split(':').map(Number)
  const desde = instanteLocal(datos.zona, p.anio, p.mes, p.dia, hi, mi)
  let hasta = instanteLocal(datos.zona, p.anio, p.mes, p.dia, hf, mf)
  if (hasta <= desde) hasta = new Date(hasta.getTime() + 24 * 3600 * 1000)
  return { desde, hasta }
}

function Sala({ datos, puedeEscribir, recargar }: { datos: Datos; puedeEscribir: boolean; recargar: () => Promise<void> }) {
  const zona = datos.zona
  const [fecha, setFecha] = useState(() => diaEnZona(new Date(), zona))
  const [turnoIdx, setTurnoIdx] = useState<number>(datos.ajustes.turnos.length ? 0 : -1)
  const [citas, setCitas] = useState<any[]>([])
  const [citaAbierta, setCitaAbierta] = useState<any | null>(null)
  const [nuevaCita, setNuevaCita] = useState<{ recurso_id?: string | null; inicio?: string } | null>(null)
  const [sentar, setSentar] = useState(false)
  const [mover, setMover] = useState<any | null>(null)
  const turno = turnoIdx >= 0 ? datos.ajustes.turnos[turnoIdx] : null
  const mesas = datos.recursos.filter(r => r.activo && r.tipo === 'mesa')
  const zonas = [...new Set(mesas.map(m => (m.zona || '').trim() || 'Sin zona'))]

  async function cargarCitas() {
    const p = leerFecha(fecha)!
    const desde = instanteLocal(zona, p.anio, p.mes, p.dia, 0, 0)
    const r = await getCitas(desde.toISOString(), new Date(desde.getTime() + 36 * 3600 * 1000).toISOString())
    if (r.success && r.data) setCitas(r.data.citas)
  }
  useEffect(() => { cargarCitas() }, [fecha])

  const { desde, hasta } = ventanaTurno(datos, fecha, turno)
  const activas = (c: any) => ['pendiente', 'confirmada', 'en_curso'].includes(c.estado)
  const deMesa = (id: string) => citas.filter(c => activas(c) && (c.recurso_ids || []).includes(id) && new Date(c.inicio) >= desde && new Date(c.inicio) < hasta).sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
  const hoy = diaEnZona(new Date(), zona)
  const comensales = mesas.reduce((n, m) => n + deMesa(m.id).reduce((k, c) => k + Number(c.personas || 1), 0), 0)
  // Cada reserva cuenta una vez aunque ocupe varias mesas
  const reservasTurno = [...new Map(mesas.flatMap(m => deMesa(m.id)).map(c => [c.id, c])).values()]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <button onClick={() => setFecha(sumarDias(fecha, -1))} className={`${botonSecundario} px-3`} aria-label="Anterior">‹</button>
          <button onClick={() => setFecha(hoy)} className={botonSecundario}>Hoy</button>
          <button onClick={() => setFecha(sumarDias(fecha, 1))} className={`${botonSecundario} px-3`} aria-label="Siguiente">›</button>
        </div>
        <input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className={`${caja} h-10`} />
        {datos.ajustes.turnos.length > 0 && (
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
            {datos.ajustes.turnos.map((t, i) => <button key={i} onClick={() => setTurnoIdx(i)} className={`px-3 h-8 rounded-lg text-sm font-600 ${turnoIdx === i ? 'bg-white shadow text-ink-900' : 'text-ink-500'}`}>{t.nombre}</button>)}
            <button onClick={() => setTurnoIdx(-1)} className={`px-3 h-8 rounded-lg text-sm font-600 ${turnoIdx === -1 ? 'bg-white shadow text-ink-900' : 'text-ink-500'}`}>Todo el día</button>
          </div>
        )}
        <div className="flex-1" />
        {puedeEscribir && (
          <>
            <button onClick={() => setSentar(true)} className={botonSecundario}>Sentar sin reserva</button>
            <button onClick={() => setNuevaCita({ inicio: turno ? desde.toISOString() : undefined })} className={botonPrimario}>+ Nueva reserva</button>
          </>
        )}
      </div>
      <p className="text-sm text-ink-600 mb-3">{reservasTurno.length} {reservasTurno.length === 1 ? 'reserva' : 'reservas'} · {comensales} comensales{datos.ajustes.aforo_por_turno ? ` de ${datos.ajustes.aforo_por_turno}` : ''} · {mesas.length} mesas</p>
      {mesas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-ink-500">No hay mesas. Añádelas en Recursos, con su número de comensales y su zona.</div>
      ) : zonas.map(z => (
        <div key={z} className="mb-5">
          <p className="text-xs font-600 uppercase tracking-wide text-ink-500 mb-2">{z}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {mesas.filter(m => ((m.zona || '').trim() || 'Sin zona') === z).map(m => {
              const suyas = deMesa(m.id)
              const enCurso = suyas.find(c => c.estado === 'en_curso')
              const proxima = suyas.find(c => c.estado !== 'en_curso')
              const estado = enCurso ? 'ocupada' : suyas.length ? (suyas.every(c => c.estado === 'pendiente') ? 'pendiente' : 'reservada') : 'libre'
              const color = estado === 'ocupada' ? 'bg-sky-50 border-sky-300' : estado === 'reservada' ? 'bg-emerald-50 border-emerald-300' : estado === 'pendiente' ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-brand-400'
              return (
                <button key={m.id} onClick={() => { if (suyas.length) setCitaAbierta(enCurso || proxima); else if (puedeEscribir) setNuevaCita({ recurso_id: m.id, inicio: turno ? desde.toISOString() : undefined }) }} className={`text-left rounded-xl border p-3 transition ${color}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-600 text-ink-900 truncate">{m.nombre}</span>
                    <span className="text-[11px] text-ink-500 shrink-0">{m.capacidad_min === m.capacidad_max ? m.capacidad_max : `${m.capacidad_min}–${m.capacidad_max}`} p.</span>
                  </div>
                  {suyas.length === 0 ? <p className="text-xs text-ink-400 mt-1">Libre</p> : suyas.slice(0, 3).map(c => (
                    <p key={c.id} className="text-xs text-ink-700 mt-1 truncate">{textoHora(c.inicio, zona)} · {c.nombre_cliente || 'Cliente'} · {c.personas} p.{c.estado === 'en_curso' ? ' · sentados' : c.estado === 'pendiente' ? ' · por confirmar' : ''}</p>
                  ))}
                  {suyas.length > 3 && <p className="text-[11px] text-ink-400 mt-1">y {suyas.length - 3} más</p>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {citaAbierta && <DetalleCita cita={citaAbierta} datos={datos} puedeEscribir={puedeEscribir} onClose={() => setCitaAbierta(null)} onCambio={async () => { await cargarCitas(); setCitaAbierta(null) }} onMover={() => { setMover(citaAbierta); setCitaAbierta(null) }} />}
      {nuevaCita && <ModalNuevaCita datos={datos} inicial={nuevaCita} fechaInicial={fecha} onClose={() => setNuevaCita(null)} onCreada={async () => { setNuevaCita(null); await cargarCitas() }} />}
      {mover && <ModalMover cita={mover} datos={datos} onClose={() => setMover(null)} onMovida={async () => { setMover(null); await cargarCitas() }} />}
      {sentar && <ModalSentar datos={datos} onClose={() => setSentar(false)} onSentado={async () => { setSentar(false); setFecha(hoy); await cargarCitas() }} />}
    </div>
  )
}

function ModalSentar({ datos, onClose, onSentado }: { datos: Datos; onClose: () => void; onSentado: () => Promise<void> }) {
  const { showToast } = useToast()
  const [personas, setPersonas] = useState(2)
  const [nombre, setNombre] = useState('')
  const [mesaId, setMesaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const mesas = datos.recursos.filter(r => r.activo && r.tipo === 'mesa' && personas >= r.capacidad_min && personas <= r.capacidad_max)
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const paso = Math.max(5, datos.ajustes.paso_minutos || 15) * 60000
    const ahora = new Date(Math.floor(Date.now() / paso) * paso).toISOString()
    const r = await crearCitaPanel({ servicio_id: ID_MESA, inicio: ahora, personas, recurso_id: mesaId || null, nombre: nombre || 'Sin reserva', estado: 'en_curso', forzar: true })
    setGuardando(false)
    if (r.success) { showToast('Mesa ocupada', 'success'); await onSentado() } else showToast(r.error || 'No se ha podido sentar', 'error')
  }
  return (
    <Modal titulo="Sentar sin reserva" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-3">
        <p className="text-sm text-ink-600">Alguien acaba de entrar: la mesa queda ocupada desde ahora, sin pasar por las reglas de reserva.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Personas</label><input type="number" min={1} max={100} value={personas} onChange={e => { setPersonas(Math.max(1, Number(e.target.value || 1))); setMesaId('') }} className={campo} /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Mesa</label>
            <select value={mesaId} onChange={e => setMesaId(e.target.value)} className={campo}>
              <option value="">La que mejor encaje</option>
              {mesas.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.zona ? ` · ${m.zona}` : ''}</option>)}
            </select>
          </div>
        </div>
        <div><label className="block text-xs font-600 text-ink-700 mb-1">Nombre <span className="font-400 text-ink-400">· opcional</span></label><input value={nombre} onChange={e => setNombre(e.target.value)} className={campo} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={botonSecundario}>Cancelar</button>
          <button type="submit" disabled={guardando} className={botonPrimario}>{guardando ? 'Sentando…' : 'Sentar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Combinaciones({ datos, puedeEscribir, recargar }: { datos: Datos; puedeEscribir: boolean; recargar: () => Promise<void> }) {
  const { showToast } = useToast()
  const [editando, setEditando] = useState<Partial<Combinacion> | null>(null)
  const [aBorrar, setABorrar] = useState<Combinacion | null>(null)
  const mesas = datos.recursos.filter(r => r.tipo === 'mesa')
  const nombreDe = (id: string) => mesas.find(m => m.id === id)?.nombre || '?'
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-600 text-ink-900">Mesas que se juntan</p>
          <p className="text-xs text-ink-500">Para los grupos: si no cabe en una mesa sola, se reserva la combinación entera.</p>
        </div>
        {puedeEscribir && mesas.length >= 2 && <button onClick={() => setEditando({ recurso_ids: [], capacidad_min: 1, capacidad_max: 8, activa: true })} className={botonSecundario}>+ Añadir combinación</button>}
      </div>
      {datos.combinaciones.length === 0 ? <p className="text-sm text-ink-400">Ninguna todavía.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {datos.combinaciones.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-600 text-ink-900 truncate">{c.nombre}{!c.activa ? ' · desactivada' : ''}</p>
                <p className="text-xs text-ink-500 truncate">{c.recurso_ids.map(nombreDe).join(' + ')} · {c.capacidad_min}–{c.capacidad_max} personas</p>
              </div>
              {puedeEscribir && <div className="shrink-0 flex gap-3"><button onClick={() => setEditando(c)} className="text-xs font-600 text-brand-600 hover:underline">Editar</button><button onClick={() => setABorrar(c)} className="text-xs font-600 text-rose-600 hover:underline">Borrar</button></div>}
            </li>
          ))}
        </ul>
      )}
      {editando && <ModalCombinacion datos={datos} inicial={editando} onClose={() => setEditando(null)} onGuardado={async () => { setEditando(null); await recargar() }} />}
      <ConfirmModal isOpen={!!aBorrar} title={`Borrar "${aBorrar?.nombre || ''}"`} message="Las reservas ya hechas con esta combinación no cambian." confirmText="Borrar" cancelText="Volver" type="danger" onConfirm={async () => { if (!aBorrar) return; const r = await borrarCombinacion(aBorrar.id); setABorrar(null); if (r.success) { showToast('Combinación borrada', 'success'); await recargar() } else showToast(r.error || 'No se ha podido borrar', 'error') }} onClose={() => setABorrar(null)} />
    </div>
  )
}

function ModalCombinacion({ datos, inicial, onClose, onGuardado }: { datos: Datos; inicial: Partial<Combinacion>; onClose: () => void; onGuardado: () => Promise<void> }) {
  const { showToast } = useToast()
  const [f, setF] = useState<any>({ nombre: '', recurso_ids: [], capacidad_min: 1, capacidad_max: 8, activa: true, ...inicial })
  const [guardando, setGuardando] = useState(false)
  const mesas = datos.recursos.filter(r => r.activo && r.tipo === 'mesa')
  const alternar = (id: string) => {
    const ids = (f.recurso_ids as string[]).includes(id) ? (f.recurso_ids as string[]).filter(x => x !== id) : [...f.recurso_ids, id]
    const suma = ids.reduce((n, x) => n + (mesas.find(m => m.id === x)?.capacidad_max || 0), 0)
    setF({ ...f, recurso_ids: ids, capacidad_max: suma || f.capacidad_max, capacidad_min: Math.min(f.capacidad_min, suma || f.capacidad_min) })
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const r = await guardarCombinacion({ id: f.id, nombre: f.nombre, recurso_ids: f.recurso_ids, capacidad_min: Number(f.capacidad_min), capacidad_max: Number(f.capacidad_max), activa: !!f.activa })
    setGuardando(false)
    if (r.success) { showToast('Combinación guardada', 'success'); await onGuardado() } else showToast(r.error || 'No se ha podido guardar', 'error')
  }
  return (
    <Modal titulo={f.id ? 'Editar combinación' : 'Nueva combinación de mesas'} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-3">
        <div><label className="block text-xs font-600 text-ink-700 mb-1">Nombre <span className="font-400 text-ink-400">· opcional</span></label><input value={f.nombre || ''} onChange={e => setF({ ...f, nombre: e.target.value })} className={campo} placeholder="Mesas 3 y 4" /></div>
        <div>
          <p className="text-xs font-600 text-ink-700 mb-1">Mesas que se juntan</p>
          <div className="flex flex-wrap gap-2">
            {mesas.map(m => (
              <label key={m.id} className={`px-2.5 h-8 rounded-lg border text-sm cursor-pointer flex items-center gap-1.5 ${(f.recurso_ids || []).includes(m.id) ? 'bg-brand-50 border-brand-300 text-brand-800' : 'bg-white border-slate-300 text-ink-700'}`}>
                <input type="checkbox" className="sr-only" checked={(f.recurso_ids || []).includes(m.id)} onChange={() => alternar(m.id)} />
                {m.nombre} · {m.capacidad_max}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Personas mínimo</label><input type="number" min={1} value={f.capacidad_min} onChange={e => setF({ ...f, capacidad_min: Number(e.target.value || 1) })} className={campo} /></div>
          <div><label className="block text-xs font-600 text-ink-700 mb-1">Personas máximo</label><input type="number" min={1} value={f.capacidad_max} onChange={e => setF({ ...f, capacidad_max: Number(e.target.value || 1) })} className={campo} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer"><input type="checkbox" checked={!!f.activa} onChange={e => setF({ ...f, activa: e.target.checked })} className="w-4 h-4" /> Activa</label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={botonSecundario}>Cancelar</button>
          <button type="submit" disabled={guardando || (f.recurso_ids || []).length < 2} className={botonPrimario}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}
