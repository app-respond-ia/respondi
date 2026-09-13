'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHuecosPorToken, moverReservaPorToken, cancelarReservaPorToken } from '@/app/actions/reservas-publicas'
import { textoHora, textoFechaHora, sumarDias, diaEnZona } from '@/lib/agenda/tiempo'

const boton = 'h-12 px-5 rounded-xl text-base font-600 transition disabled:opacity-50'
const capitalizar = (t: string) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t

const ESTADO: Record<string, string> = {
  pendiente: 'Pendiente de confirmar por el negocio',
  confirmada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Ya pasó',
  no_presentado: 'No se presentó',
  cancelada_cliente: 'Cancelada',
  cancelada_negocio: 'Cancelada por el negocio'
}

export default function GestionarReserva({ token, inicial }: { token: string; inicial: any }) {
  const [reserva, setReserva] = useState<any>(inicial)
  const [modo, setModo] = useState<'ver' | 'cambiar' | 'cancelar'>('ver')
  const zona = reserva.zona_horaria
  const [fecha, setFecha] = useState(() => diaEnZona(new Date(reserva.inicio), zona))
  const [huecos, setHuecos] = useState<any[]>([])
  const [motivo, setMotivo] = useState<string | undefined>()
  const [buscando, setBuscando] = useState(false)
  const [inicio, setInicio] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (modo !== 'cambiar') return
    let vivo = true
    setBuscando(true); setInicio(null)
    getHuecosPorToken(token, fecha).then(r => {
      if (!vivo) return
      if (r.success && r.data) { setHuecos(r.data.huecos); setMotivo(r.data.motivo) } else { setHuecos([]); setMotivo(r.error) }
      setBuscando(false)
    })
    return () => { vivo = false }
  }, [modo, fecha, token])

  async function mover() {
    if (!inicio) return
    setOcupado(true); setError(null)
    const r = await moverReservaPorToken(token, inicio)
    setOcupado(false)
    if (r.success && r.data) { setReserva({ ...reserva, ...r.data }); setModo('ver'); setAviso('Reserva cambiada.') } else setError(r.error || 'No se ha podido cambiar.')
  }
  async function cancelar() {
    setOcupado(true); setError(null)
    const r = await cancelarReservaPorToken(token)
    setOcupado(false)
    if (r.success && r.data) { setReserva({ ...reserva, ...r.data, activa: false }); setModo('ver'); setAviso('Reserva cancelada.') } else setError(r.error || 'No se ha podido cancelar.')
  }

  const activa = ['pendiente', 'confirmada', 'en_curso'].includes(reserva.estado)
  const enPlazo = new Date(reserva.inicio).getTime() - Date.now() >= (reserva.cancelacion_horas || 0) * 3600 * 1000
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(reserva.hoy || diaEnZona(new Date(), zona), i))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center">
          <div className="min-w-0">
            <p className="font-display font-700 text-lg text-ink-900 truncate">{reserva.negocio}</p>
            {reserva.direccion && <p className="text-xs text-ink-500 truncate">{reserva.direccion}</p>}
          </div>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-6 pb-16">
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-xs font-600 uppercase tracking-wide text-ink-500 mb-1">Tu reserva</p>
          <h1 className="font-display font-700 text-2xl text-ink-900">{reserva.servicio}{reserva.con ? ` con ${reserva.con}` : ''}{reserva.zona ? ` · ${reserva.zona}` : ''}</h1>
          <p className="text-lg text-ink-800 mt-1">{capitalizar(textoFechaHora(reserva.inicio, zona))}</p>
          <p className={`text-sm mt-2 font-600 ${activa ? 'text-emerald-700' : 'text-ink-500'}`}>{ESTADO[reserva.estado] || reserva.estado}</p>
          <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm mt-4 text-ink-700">
            {reserva.personas > 1 && <><dt className="text-ink-500">Personas</dt><dd>{reserva.personas}</dd></>}
            <dt className="text-ink-500">A nombre de</dt><dd>{reserva.nombre}</dd>
            {reserva.peticiones && <><dt className="text-ink-500">Peticiones</dt><dd>{reserva.peticiones}</dd></>}
          </dl>
          {aviso && <p className="mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{aviso}</p>}
          {error && <p className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}

          {activa && modo === 'ver' && (
            <div className="mt-6 space-y-2">
              {enPlazo ? (
                <>
                  <button onClick={() => setModo('cambiar')} className={`${boton} w-full bg-brand-600 text-white`}>Cambiar de día u hora</button>
                  <button onClick={() => setModo('cancelar')} className={`${boton} w-full border border-slate-300 bg-white text-ink-700`}>Cancelar la reserva</button>
                  <p className="text-xs text-ink-500 text-center">Puedes hacerlo hasta {reserva.cancelacion_horas} horas antes.</p>
                </>
              ) : (
                <p className="text-sm text-ink-600 bg-slate-50 border border-slate-200 rounded-xl p-3">Ya no se puede cambiar ni cancelar por aquí (hay que avisar con {reserva.cancelacion_horas} horas). Escríbenos y lo vemos contigo.</p>
              )}
            </div>
          )}

          {modo === 'cambiar' && (
            <div className="mt-6 space-y-4">
              <p className="font-600 text-ink-900">Elige otro día u hora</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {dias.map(d => {
                  const p = new Date(d + 'T12:00:00Z')
                  return (
                    <button type="button" key={d} onClick={() => setFecha(d)} className={`shrink-0 w-16 py-2 rounded-xl border text-center ${fecha === d ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white'}`}>
                      <span className="block text-[11px] uppercase">{new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(p)}</span>
                      <span className="block text-lg font-600">{p.getUTCDate()}</span>
                    </button>
                  )
                })}
              </div>
              <input type="date" value={fecha} min={reserva.hoy} max={reserva.hasta} onChange={e => e.target.value && setFecha(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-base" />
              {buscando ? <p className="text-sm text-ink-500">Buscando huecos…</p> : huecos.length === 0 ? <p className="text-sm text-ink-600">{motivo || 'No queda hueco ese día.'}</p> : (
                <div className="flex flex-wrap gap-2">
                  {huecos.map((h: any) => <button type="button" key={h.inicio} onClick={() => setInicio(h.inicio)} className={`px-3 h-11 rounded-xl border text-sm font-600 ${inicio === h.inicio ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-ink-800'}`}>{textoHora(h.inicio, zona)}</button>)}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo('ver')} className={`${boton} flex-1 border border-slate-300 bg-white text-ink-700`}>Volver</button>
                <button type="button" disabled={!inicio || ocupado} onClick={mover} className={`${boton} flex-1 bg-brand-600 text-white`}>{ocupado ? 'Cambiando…' : 'Confirmar cambio'}</button>
              </div>
            </div>
          )}

          {modo === 'cancelar' && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-ink-700">¿Seguro que quieres cancelar la reserva del {textoFechaHora(reserva.inicio, zona)}?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModo('ver')} className={`${boton} flex-1 border border-slate-300 bg-white text-ink-700`}>No, volver</button>
                <button type="button" disabled={ocupado} onClick={cancelar} className={`${boton} flex-1 bg-rose-600 text-white`}>{ocupado ? 'Cancelando…' : 'Sí, cancelar'}</button>
              </div>
            </div>
          )}
        </section>
        <p className="text-center text-xs text-ink-400 mt-8">Reservas con <Link href="/" className="font-600">Respondi</Link></p>
      </main>
    </div>
  )
}
