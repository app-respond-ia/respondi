'use client'

import { useState, useEffect } from 'react'
import { getMetricas } from '@/app/actions/metricas'

type Periodo = 'hoy' | 'semana' | 'mes' | 'total'

const CANAL_COLORS: Record<string, string> = {
  whatsapp: 'bg-emerald-500',
  instagram: 'bg-purple-500',
  facebook: 'bg-blue-500',
  desconocido: 'bg-slate-400'
}

const CANAL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  desconocido: 'Desconocido'
}

function StatCard({ label, value, sub, color = 'text-ink-900' }: {
  label: string, value: string | number, sub?: string, color?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-sm text-ink-500 mb-1">{label}</p>
      <p className={`font-display font-700 text-2xl ${color}`}>{value}</p>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-600 text-sm text-ink-500 uppercase tracking-wide mb-3">{children}</h2>
  )
}

function MiniBar({ value, max, color = 'bg-brand-500' }: { value: number, max: number, color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function SimpleBarChart({ data, color = 'bg-brand-500' }: {
  data: { label: string, value: number }[], color?: string
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end" style={{ height: '80px' }}>
              <div
                className={`w-full rounded-t-sm ${color} transition-all duration-500`}
                style={{ height: `${Math.max(pct, 2)}%` }}
                title={`${d.label}: ${d.value}`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function MetricasPage() {
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { cargar() }, [periodo])

  const cargar = async () => {
    setLoading(true)
    setError(null)
    const res = await getMetricas(periodo)
    if (res.success) {
      setData(res.data)
    } else {
      setError(res.error || 'Error al cargar métricas')
    }
    setLoading(false)
  }

  const formatMinutos = (min: number) => {
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }

  const formatHora = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hora = h % 12 || 12
    return `${hora}:00 ${ampm}`
  }

  return (
    <div className="p-6 sm:p-10 max-w-6xl w-full mx-auto pb-20">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Métricas</h1>
          <p className="text-ink-500 mt-1">Análisis completo del rendimiento de tu agente y tu equipo.</p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
          {(['hoy', 'semana', 'mes', 'total'] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`px-4 py-1.5 rounded-lg text-sm transition capitalize ${periodo === p ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500 hover:text-ink-700'}`}>
              {p === 'total' ? 'Todo' : p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-ink-500">Cargando métricas...</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : data && (
        <div className="space-y-10">

          {/* ── CONVERSACIONES ── */}
          <section>
            <SectionTitle>Conversaciones</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total" value={data.conversaciones.total} />
              <StatCard label="Activas" value={data.conversaciones.activas} color="text-emerald-600" />
              <StatCard label="Cerradas" value={data.conversaciones.cerradas} />
              <StatCard label="Tasa de cierre" value={`${data.conversaciones.tasaCierre}%`} color="text-brand-600" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <StatCard
                label="Duración media"
                value={formatMinutos(data.conversaciones.duracionMediaMinutos)}
                sub="Desde apertura hasta cierre"
              />
              <StatCard
                label="Hora pico"
                value={formatHora(data.conversaciones.horaPico)}
                sub="Mayor volumen de conversaciones"
              />
            </div>

            {/* Gráfico convs por día */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-600 text-ink-700 mb-4">Conversaciones — últimos 30 días</p>
              <SimpleBarChart
                data={data.graficos.convsPorDia.map((d: any) => ({
                  label: d.fecha,
                  value: d.total
                }))}
                color="bg-brand-500"
              />
              <div className="flex justify-between mt-2 text-xs text-ink-400">
                <span>{data.graficos.convsPorDia[0]?.fecha}</span>
                <span>{data.graficos.convsPorDia[data.graficos.convsPorDia.length - 1]?.fecha}</span>
              </div>
            </div>

            {/* Por canal */}
            {Object.keys(data.conversaciones.porCanal).length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-4">
                <p className="text-sm font-600 text-ink-700 mb-4">Por canal</p>
                <div className="space-y-3">
                  {Object.entries(data.conversaciones.porCanal).map(([canal, count]: any) => (
                    <div key={canal}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${CANAL_COLORS[canal] || 'bg-slate-400'}`} />
                          <span className="text-sm font-500 text-ink-700">{CANAL_LABELS[canal] || canal}</span>
                        </div>
                        <span className="text-sm font-600 text-ink-900">{count}</span>
                      </div>
                      <MiniBar value={count} max={data.conversaciones.total} color={CANAL_COLORS[canal] || 'bg-slate-400'} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Distribución horaria */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-4">
              <p className="text-sm font-600 text-ink-700 mb-4">Distribución horaria</p>
              <SimpleBarChart
                data={data.graficos.convsPorHora.map((d: any) => ({
                  label: d.hora,
                  value: d.total
                }))}
                color="bg-purple-400"
              />
              <div className="flex justify-between mt-2 text-xs text-ink-400">
                <span>0h</span>
                <span>12h</span>
                <span>23h</span>
              </div>
            </div>
          </section>

          {/* ── MENSAJES ── */}
          <section>
            <SectionTitle>Mensajes</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total mensajes" value={data.mensajes.total} />
              <StatCard label="Enviados por IA" value={data.mensajes.ia} color="text-brand-600" />
              <StatCard label="Enviados por clientes" value={data.mensajes.cliente} />
              <StatCard label="Ratio IA" value={`${data.mensajes.ratioIA}%`} sub="Del total de mensajes" color="text-brand-600" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
              <StatCard
                label="Promedio por conversación"
                value={`${data.mensajes.promedioporConv} mensajes`}
                sub="Media de mensajes por conversación"
              />
            </div>

            {/* Gráfico mensajes por día */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-4">
              <p className="text-sm font-600 text-ink-700 mb-1">Mensajes — últimos 30 días</p>
              <div className="flex items-center gap-4 mb-4 text-xs text-ink-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500"></span>IA</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span>Clientes</span>
              </div>
              <div className="flex items-end gap-1 h-24">
                {data.graficos.msgsPorDia.map((d: any, i: number) => {
                  const max = Math.max(...data.graficos.msgsPorDia.map((x: any) => x.ia + x.cliente), 1)
                  const totalH = d.ia + d.cliente
                  const pct = Math.round((totalH / max) * 100)
                  const iaRatio = totalH > 0 ? Math.round((d.ia / totalH) * 100) : 50
                  return (
                    <div key={i} className="flex-1 flex items-end" style={{ height: '80px' }}>
                      <div className="w-full rounded-t-sm overflow-hidden" style={{ height: `${Math.max(pct, 2)}%` }}>
                        <div className="bg-brand-500 w-full" style={{ height: `${iaRatio}%` }} />
                        <div className="bg-slate-300 w-full" style={{ height: `${100 - iaRatio}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-ink-400">
                <span>{data.graficos.msgsPorDia[0]?.fecha}</span>
                <span>{data.graficos.msgsPorDia[data.graficos.msgsPorDia.length - 1]?.fecha}</span>
              </div>
            </div>
          </section>

          {/* ── CASOS ── */}
          <section>
            <SectionTitle>Casos</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total casos" value={data.casos.total} />
              <StatCard label="Abiertos" value={data.casos.abiertos} color="text-amber-600" />
              <StatCard label="Cerrados" value={data.casos.cerrados} color="text-emerald-600" />
              <StatCard label="Tasa de resolución" value={`${data.casos.tasaResolucion}%`} color="text-emerald-600" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Tiempo medio resolución"
                value={formatMinutos(data.casos.tiempoMedioResolucionMinutos)}
                sub="Casos cerrados"
              />
              <StatCard
                label="Escalados por IA"
                value={data.casos.escaladosIA}
                sub="La IA abrió el caso automáticamente"
              />
              <StatCard
                label="Tasa de escalado"
                value={`${data.casos.tasaEscalado}%`}
                sub="% conversaciones que generaron un caso"
              />
            </div>
          </section>

          {/* ── RENDIMIENTO IA ── */}
          <section>
            <SectionTitle>Rendimiento de la IA</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-sm text-ink-500 mb-1">Resolución sin escalado</p>
                <p className="font-display font-700 text-3xl text-brand-600 mb-3">{data.rendimientoIA.tasaResolucionSinEscalado}%</p>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500 transition-all duration-700"
                    style={{ width: `${data.rendimientoIA.tasaResolucionSinEscalado}%` }} />
                </div>
                <p className="text-xs text-ink-400 mt-2">Conversaciones cerradas sin necesidad de intervención humana</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-sm text-ink-500 mb-1">Tasa de escalado a humano</p>
                <p className="font-display font-700 text-3xl text-amber-600 mb-3">{data.rendimientoIA.tasaEscalado}%</p>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400 transition-all duration-700"
                    style={{ width: `${data.rendimientoIA.tasaEscalado}%` }} />
                </div>
                <p className="text-xs text-ink-400 mt-2">% de conversaciones que requirieron atención humana</p>
              </div>
            </div>
          </section>

          {/* ── CONTACTOS ── */}
          <section>
            <SectionTitle>Contactos</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total contactos" value={data.contactos.total} />
              <StatCard label="Nuevos en período" value={data.contactos.nuevos} color="text-emerald-600" />
              <StatCard label="Recurrentes" value={data.contactos.recurrentes} sub="Más de 1 conversación" />
              <StatCard
                label="Tasa de retorno"
                value={data.contactos.total > 0 ? `${Math.round((data.contactos.recurrentes / data.contactos.total) * 100)}%` : '0%'}
                sub="Contactos que vuelven"
                color="text-brand-600"
              />
            </div>

            {Object.keys(data.contactos.porCanal).length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-sm font-600 text-ink-700 mb-4">Contactos por canal</p>
                <div className="space-y-3">
                  {Object.entries(data.contactos.porCanal).map(([canal, count]: any) => (
                    <div key={canal}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${CANAL_COLORS[canal] || 'bg-slate-400'}`} />
                          <span className="text-sm font-500 text-ink-700">{CANAL_LABELS[canal] || canal}</span>
                        </div>
                        <span className="text-sm font-600 text-ink-900">{count}</span>
                      </div>
                      <MiniBar value={count} max={data.contactos.total} color={CANAL_COLORS[canal] || 'bg-slate-400'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── CRÉDITOS ── */}
          <section>
            <SectionTitle>Créditos</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
                <p className="text-sm text-slate-400 mb-1">Disponibles</p>
                <p className="font-display font-700 text-3xl">{data.creditos.disponibles.toLocaleString()}</p>
                {data.creditos.diasRestantes !== null && (
                  <p className="text-xs text-slate-400 mt-2">
                    ~{data.creditos.diasRestantes} días al ritmo actual
                  </p>
                )}
              </div>
              <StatCard
                label="Consumidos en período"
                value={data.creditos.consumidos.toLocaleString()}
                sub="Mensajes respondidos por la IA"
              />
              <StatCard
                label="Consumo diario promedio"
                value={data.creditos.consumoDiarioPromedio.toLocaleString()}
                sub="Últimos 30 días"
              />
            </div>

            {/* Barra de consumo */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-600 text-ink-700">Uso de créditos</p>
                <p className="text-sm text-ink-500">
                  {data.creditos.consumidos.toLocaleString()} / {(data.creditos.disponibles + data.creditos.consumidos).toLocaleString()}
                </p>
              </div>
              <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-700"
                  style={{
                    width: `${Math.min(Math.round((data.creditos.consumidos / Math.max(data.creditos.disponibles + data.creditos.consumidos, 1)) * 100), 100)}%`
                  }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-ink-400">
                <span>Consumido</span>
                <span>Disponible</span>
              </div>
            </div>
          </section>

          {/* ── USUARIOS ── */}
          <section>
            <SectionTitle>Usuarios</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <StatCard label="Usuarios activos" value={data.usuarios.total} />
              <StatCard label="Novedades publicadas" value={data.novedades.total} sub="En el período seleccionado" />
            </div>

            {data.usuarios.actividad.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <p className="text-sm font-600 text-ink-700">Actividad por usuario</p>
                  <p className="text-xs text-ink-400 mt-0.5">Casos gestionados en el período</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.usuarios.actividad.map((u: any, i: number) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-600 text-sm shrink-0">
                        {u.nombre.substring(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-ink-900 truncate">{u.nombre}</p>
                        <p className="text-xs text-ink-400 truncate">{u.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-600 text-ink-900">{u.casos}</p>
                        <p className="text-xs text-ink-400">casos</p>
                      </div>
                      <div className="w-24 hidden sm:block">
                        <MiniBar
                          value={u.casos}
                          max={Math.max(...data.usuarios.actividad.map((x: any) => x.casos), 1)}
                          color="bg-brand-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  )
}
