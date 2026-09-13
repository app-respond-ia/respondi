'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getHuecosPublicos, crearReservaPublica } from '@/app/actions/reservas-publicas'
import { textoHora, textoFechaHora, sumarDias, partesEnZona } from '@/lib/agenda/tiempo'

// El formulario público de reserva, en tres pasos: qué, cuándo, quién.
// Pensado para el móvil (la mayoría llega desde Instagram o un QR).

interface Datos {
  negocio: { nombre: string; direccion: string | null; zona_horaria: string }
  modo: 'servicios' | 'restaurante'
  paso_minutos: number
  antelacion_minima_minutos: number
  antelacion_maxima_dias: number
  cancelacion_horas: number
  grupo_grande_desde: number
  confirmacion: 'automatica' | 'manual'
  turnos: { nombre: string; inicio: string; fin: string; ultima_entrada?: string }[]
  servicios: { id: string; nombre: string; descripcion: string | null; duracion_minutos: number; precio: number | null; precio_tipo: string; moneda: string; precio_por_persona: boolean; aforo: number | null; extras: { nombre: string; precio?: number; minutos?: number }[]; tipo_recurso: string | null }[]
  profesionales: { id: string; nombre: string }[]
  zonas: string[]
  hay_mesas: boolean
  hoy: string
  hasta: string
}

const campo = 'w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-base focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-500'
const boton = 'h-12 px-5 rounded-xl text-base font-600 transition disabled:opacity-50'
const capitalizar = (t: string) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t
const dinero = (n: number | null, moneda: string, tipo: string, porPersona: boolean) => n === null || tipo === 'consultar' ? 'Precio a consultar' : `${tipo === 'desde' ? 'Desde ' : ''}${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}${porPersona ? ' por persona' : ''}`

export default function Reservar({ enlace, datos }: { enlace: string; datos: Datos }) {
  const restaurante = datos.modo === 'restaurante'
  const zona = datos.negocio.zona_horaria
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1)
  const [servicioId, setServicioId] = useState(restaurante ? 'mesa' : (datos.servicios[0]?.id || ''))
  const [personas, setPersonas] = useState(restaurante ? 2 : 1)
  const [profesionalId, setProfesionalId] = useState('')
  const [zonaMesa, setZonaMesa] = useState('')
  const [extras, setExtras] = useState<string[]>([])
  const [fecha, setFecha] = useState(datos.hoy)
  const [huecos, setHuecos] = useState<any[]>([])
  const [motivo, setMotivo] = useState<string | undefined>()
  const [buscando, setBuscando] = useState(false)
  const [inicio, setInicio] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [peticiones, setPeticiones] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [web, setWeb] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecha, setHecha] = useState<any | null>(null)

  const servicio = datos.servicios.find(s => s.id === servicioId)
  const esMesa = servicioId === 'mesa'
  const tituloQue = esMesa ? `Mesa para ${personas}` : servicio?.nombre || ''

  // Buscar huecos al cambiar día, servicio, personas o preferencia
  useEffect(() => {
    if (paso !== 2) return
    let vivo = true
    setBuscando(true); setInicio(null)
    getHuecosPublicos(enlace, { servicio_id: servicioId, fecha, personas, recurso_id: profesionalId || null, zona: zonaMesa || null, extras }).then(r => {
      if (!vivo) return
      if (r.success && r.data) { setHuecos(r.data.huecos); setMotivo(r.data.motivo) } else { setHuecos([]); setMotivo(r.error) }
      setBuscando(false)
    })
    return () => { vivo = false }
  }, [paso, servicioId, fecha, personas, profesionalId, zonaMesa, extras, enlace])

  // Huecos agrupados: mañana / tarde / noche (en la hora del negocio)
  const grupos = useMemo(() => {
    const g: Record<string, any[]> = { 'Mañana': [], 'Tarde': [], 'Noche': [] }
    for (const h of huecos) {
      const p = partesEnZona(new Date(h.inicio), zona)
      const clave = p.hora < 13 ? 'Mañana' : p.hora < 19 ? 'Tarde' : 'Noche'
      g[clave].push(h)
    }
    return Object.entries(g).filter(([, l]) => l.length)
  }, [huecos, zona])

  async function reservar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!inicio) return setError('Elige una hora.')
    setEnviando(true)
    const r = await crearReservaPublica(enlace, { servicio_id: servicioId, inicio, personas, recurso_id: profesionalId || null, zona: zonaMesa || null, extras, nombre, telefono, email, peticiones, acepta, web })
    setEnviando(false)
    if (r.success && r.data) { setHecha(r.data); setPaso(4); window.scrollTo({ top: 0 }) }
    else { setError(r.error || 'No se ha podido hacer la reserva.'); if ((r as any).volver_a_huecos) { setPaso(2); setInicio(null) } }
  }

  const diasSiguientes = Array.from({ length: 7 }, (_, i) => sumarDias(datos.hoy, i)).filter(d => d <= datos.hasta)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-display font-700 text-lg text-ink-900 truncate">{datos.negocio.nombre}</p>
            {datos.negocio.direccion && <p className="text-xs text-ink-500 truncate">{datos.negocio.direccion}</p>}
          </div>
          {paso < 4 && <span className="text-xs font-600 text-ink-500 shrink-0">Paso {paso} de 3</span>}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 pb-16">
        {paso === 4 && hecha ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1 className="font-display font-700 text-2xl text-ink-900 mb-1">{hecha.estado === 'pendiente' ? 'Reserva recibida' : 'Reserva confirmada'}</h1>
            <p className="text-sm text-ink-600 mb-5">{hecha.estado === 'pendiente' ? 'El equipo la confirmará en breve y te avisaremos.' : 'Te esperamos. Te hemos enviado la confirmación.'}</p>
            <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
              <dt className="text-ink-500">Qué</dt><dd className="font-600 text-ink-900">{hecha.servicio}{hecha.con ? ` con ${hecha.con}` : ''}{hecha.zona ? ` · ${hecha.zona}` : ''}</dd>
              <dt className="text-ink-500">Cuándo</dt><dd className="font-600 text-ink-900">{capitalizar(textoFechaHora(hecha.inicio, zona))}</dd>
              {hecha.personas > 1 && <><dt className="text-ink-500">Personas</dt><dd className="font-600 text-ink-900">{hecha.personas}</dd></>}
              {hecha.precio_estimado !== null && hecha.precio_estimado !== undefined && <><dt className="text-ink-500">Precio</dt><dd className="text-ink-900">{Number(hecha.precio_estimado).toLocaleString('es-ES', { minimumFractionDigits: 2 })} {hecha.moneda || ''}</dd></>}
              <dt className="text-ink-500">A nombre de</dt><dd className="text-ink-900">{hecha.nombre}</dd>
            </dl>
            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-ink-700">
              <p className="font-600 text-ink-900 mb-1">¿Necesitas cambiarla o cancelarla?</p>
              <p>Hasta {hecha.cancelacion_horas} horas antes, desde este enlace (guárdalo):</p>
              <Link href={`/reserva/${hecha.token}`} className="block mt-2 text-brand-600 font-600 break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/reserva/{hecha.token}</Link>
            </div>
            <button onClick={() => { setHecha(null); setPaso(1); setInicio(null); setAcepta(false) }} className={`${boton} mt-6 w-full border border-slate-300 bg-white text-ink-700`}>Hacer otra reserva</button>
          </section>
        ) : (
          <form onSubmit={reservar} className="space-y-4">
            {/* Paso 1: qué */}
            <section className={`bg-white rounded-2xl border p-5 ${paso === 1 ? 'border-brand-300' : 'border-slate-200'}`}>
              <button type="button" onClick={() => setPaso(1)} className="w-full text-left flex items-center justify-between">
                <h2 className="font-display font-700 text-lg text-ink-900">{restaurante ? 'Tu mesa' : 'Qué quieres reservar'}</h2>
                {paso > 1 && <span className="text-sm text-brand-600 font-600">{tituloQue}{profesionalId ? ` · ${datos.profesionales.find(p => p.id === profesionalId)?.nombre}` : ''}{zonaMesa ? ` · ${zonaMesa}` : ''} · cambiar</span>}
              </button>
              {paso === 1 && (
                <div className="mt-4 space-y-4">
                  {!restaurante || datos.servicios.length > 0 ? (
                    <div className="space-y-2">
                      {restaurante && (
                        <label className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${esMesa ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                          <input type="radio" name="servicio" className="sr-only" checked={esMesa} onChange={() => { setServicioId('mesa'); setExtras([]) }} />
                          <span className="font-600 text-ink-900">Mesa</span>
                        </label>
                      )}
                      {datos.servicios.map(s => (
                        <label key={s.id} className={`flex items-start justify-between gap-3 p-3 rounded-xl border cursor-pointer ${servicioId === s.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                          <input type="radio" name="servicio" className="sr-only" checked={servicioId === s.id} onChange={() => { setServicioId(s.id); setExtras([]); setProfesionalId('') }} />
                          <span className="min-w-0">
                            <span className="block font-600 text-ink-900">{s.nombre}</span>
                            {s.descripcion && <span className="block text-xs text-ink-500 mt-0.5">{s.descripcion}</span>}
                          </span>
                          <span className="text-xs text-ink-500 text-right shrink-0">{s.duracion_minutos} min<br />{dinero(s.precio, s.moneda, s.precio_tipo, s.precio_por_persona)}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {(esMesa || (servicio && (servicio.aforo || servicio.tipo_recurso === 'mesa' || servicio.tipo_recurso === 'sala'))) && (
                    <div>
                      <label className="block text-sm font-600 text-ink-700 mb-1">¿Cuántas personas?</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setPersonas(Math.max(1, personas - 1))} className="w-12 h-12 rounded-xl border border-slate-300 text-xl">−</button>
                        <input type="number" min={1} max={500} value={personas} onChange={e => setPersonas(Math.max(1, Number(e.target.value || 1)))} className={`${campo} text-center w-24`} />
                        <button type="button" onClick={() => setPersonas(personas + 1)} className="w-12 h-12 rounded-xl border border-slate-300 text-xl">+</button>
                      </div>
                      {personas >= datos.grupo_grande_desde && <p className="text-xs text-amber-700 mt-1">Para {datos.grupo_grande_desde} personas o más, escríbenos y lo organizamos contigo.</p>}
                    </div>
                  )}
                  {esMesa && datos.zonas.length > 0 && (
                    <div>
                      <label className="block text-sm font-600 text-ink-700 mb-1">Zona</label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setZonaMesa('')} className={`px-3 h-10 rounded-xl border text-sm ${!zonaMesa ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300'}`}>Cualquiera</button>
                        {datos.zonas.map(z => <button type="button" key={z} onClick={() => setZonaMesa(z)} className={`px-3 h-10 rounded-xl border text-sm ${zonaMesa === z ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300'}`}>{z}</button>)}
                      </div>
                    </div>
                  )}
                  {!esMesa && servicio?.tipo_recurso === 'persona' && datos.profesionales.length > 1 && (
                    <div>
                      <label className="block text-sm font-600 text-ink-700 mb-1">¿Con quién?</label>
                      <select value={profesionalId} onChange={e => setProfesionalId(e.target.value)} className={campo}>
                        <option value="">Me da igual</option>
                        {datos.profesionales.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </div>
                  )}
                  {!esMesa && servicio && servicio.extras.length > 0 && (
                    <div>
                      <label className="block text-sm font-600 text-ink-700 mb-1">Extras</label>
                      <div className="flex flex-wrap gap-2">
                        {servicio.extras.map(x => (
                          <label key={x.nombre} className={`px-3 h-10 rounded-xl border text-sm flex items-center gap-2 cursor-pointer ${extras.includes(x.nombre) ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300'}`}>
                            <input type="checkbox" className="sr-only" checked={extras.includes(x.nombre)} onChange={e => setExtras(e.target.checked ? [...extras, x.nombre] : extras.filter(n => n !== x.nombre))} />
                            {x.nombre}{x.precio ? ` (+${x.precio})` : ''}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <button type="button" disabled={!servicioId || personas >= datos.grupo_grande_desde} onClick={() => setPaso(2)} className={`${boton} w-full bg-brand-600 text-white`}>Elegir día y hora</button>
                </div>
              )}
            </section>

            {/* Paso 2: cuándo */}
            <section className={`bg-white rounded-2xl border p-5 ${paso === 2 ? 'border-brand-300' : 'border-slate-200'}`}>
              <button type="button" onClick={() => paso > 2 && setPaso(2)} className="w-full text-left flex items-center justify-between">
                <h2 className="font-display font-700 text-lg text-ink-900">Día y hora</h2>
                {paso > 2 && inicio && <span className="text-sm text-brand-600 font-600">{capitalizar(textoFechaHora(inicio, zona))} · cambiar</span>}
              </button>
              {paso === 2 && (
                <div className="mt-4 space-y-4">
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {diasSiguientes.map(d => {
                      const p = new Date(d + 'T12:00:00Z')
                      return (
                        <button type="button" key={d} onClick={() => setFecha(d)} className={`shrink-0 w-16 py-2 rounded-xl border text-center ${fecha === d ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white'}`}>
                          <span className="block text-[11px] uppercase">{new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(p)}</span>
                          <span className="block text-lg font-600">{p.getUTCDate()}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div>
                    <label className="block text-sm font-600 text-ink-700 mb-1">Otro día</label>
                    <input type="date" value={fecha} min={datos.hoy} max={datos.hasta} onChange={e => e.target.value && setFecha(e.target.value)} className={campo} />
                  </div>
                  {buscando ? <p className="text-sm text-ink-500">Buscando huecos…</p> : huecos.length === 0 ? (
                    <p className="text-sm text-ink-600">{motivo || 'No queda hueco ese día.'} Prueba otro día.</p>
                  ) : grupos.map(([nombre, lista]) => (
                    <div key={nombre}>
                      <p className="text-xs font-600 uppercase tracking-wide text-ink-500 mb-1.5">{nombre}</p>
                      <div className="flex flex-wrap gap-2">
                        {lista.map((h: any) => (
                          <button type="button" key={h.inicio} onClick={() => setInicio(h.inicio)} className={`px-3 h-11 rounded-xl border text-sm font-600 ${inicio === h.inicio ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-ink-800'}`}>{textoHora(h.inicio, zona)}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" disabled={!inicio} onClick={() => setPaso(3)} className={`${boton} w-full bg-brand-600 text-white`}>Continuar</button>
                </div>
              )}
            </section>

            {/* Paso 3: quién */}
            <section className={`bg-white rounded-2xl border p-5 ${paso === 3 ? 'border-brand-300' : 'border-slate-200'}`}>
              <h2 className="font-display font-700 text-lg text-ink-900">Tus datos</h2>
              {paso === 3 && (
                <div className="mt-4 space-y-3">
                  <div><label className="block text-sm font-600 text-ink-700 mb-1">Nombre</label><input value={nombre} onChange={e => setNombre(e.target.value)} className={campo} required autoComplete="name" /></div>
                  <div><label className="block text-sm font-600 text-ink-700 mb-1">WhatsApp</label><input value={telefono} onChange={e => setTelefono(e.target.value)} className={campo} placeholder="+34 600 000 000" inputMode="tel" autoComplete="tel" /></div>
                  <div><label className="block text-sm font-600 text-ink-700 mb-1">Correo <span className="font-400 text-ink-400">· si prefieres que te escribamos ahí</span></label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={campo} autoComplete="email" /></div>
                  <div><label className="block text-sm font-600 text-ink-700 mb-1">¿Algo que debamos saber? <span className="font-400 text-ink-400">· opcional</span></label><input value={peticiones} onChange={e => setPeticiones(e.target.value)} className={campo} placeholder={restaurante ? 'Alergias, trona, celebración…' : 'Alergias, preferencias…'} /></div>
                  <div className="hidden" aria-hidden="true"><label>Web<input tabIndex={-1} autoComplete="off" value={web} onChange={e => setWeb(e.target.value)} /></label></div>
                  <label className="flex items-start gap-2 text-sm text-ink-700 cursor-pointer">
                    <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-1 w-4 h-4" required />
                    <span>Acepto que {datos.negocio.nombre} guarde mis datos para gestionar esta reserva y avisarme de ella. <Link href="/privacidad" className="underline" target="_blank">Política de privacidad</Link>.</span>
                  </label>
                  {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
                  <p className="text-xs text-ink-500">{datos.confirmacion === 'manual' ? 'El equipo confirmará la reserva y te avisará.' : 'La reserva queda confirmada al momento.'} Puedes cambiarla o cancelarla hasta {datos.cancelacion_horas} horas antes.</p>
                  <button type="submit" disabled={enviando} className={`${boton} w-full bg-brand-600 text-white`}>{enviando ? 'Reservando…' : restaurante ? 'Reservar mesa' : 'Reservar'}</button>
                </div>
              )}
            </section>
          </form>
        )}
        <p className="text-center text-xs text-ink-400 mt-8">Reservas con <Link href="/" className="font-600">Respondi</Link></p>
      </main>
    </div>
  )
}
