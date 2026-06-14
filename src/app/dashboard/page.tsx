'use client'

import { useState, useEffect } from 'react'
import { getDashboardData } from '@/app/actions/dashboard'

export default function DashboardPage() {
  const [period, setPeriod] = useState<'hoy' | 'semana' | 'mes'>('semana')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const res = await getDashboardData(period)
      if (res.success && res.data) {
        setData(res.data)
      } else {
        setError(res.error || 'Error al cargar datos')
      }
      setLoading(false)
    }
    loadData()
  }, [period])

  if (error) {
    return <div className="p-10 text-center text-red-500 font-medium">{error}</div>
  }

  if (loading || !data) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando dashboard...</div>
  }

  const { trial, creditos_disponibles, periodo, evolucion, temas_frecuentes } = data

  const formatTime = (min: number) => {
    if (min < 60) return `${Math.round(min)} min`
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }

  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)} s`
    return formatTime(sec / 60)
  }

  // Badge %
  const prev = periodo.tiempo_recuperado_min_anterior
  const curr = periodo.tiempo_recuperado_min
  let pctBadge = null
  if (prev > 0) {
    const pct = Math.round(((curr - prev) / prev) * 100)
    const isPos = pct >= 0
    pctBadge = (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-600 ${isPos ? 'bg-white/15' : 'bg-red-500/20 text-white'}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          {isPos ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
          )}
        </svg>
        {isPos ? '+' : ''}{pct}% vs periodo anterior
      </div>
    )
  }

  // Evolucion
  const maxMinutos = Math.max(...evolucion.map((e: any) => e.minutos))
  const allZeros = maxMinutos === 0
  const daysMap: Record<number, string> = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' }

  return (
    <div className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl w-full mx-auto pb-20">

      {/* Banner de trial */}
      {trial.activo && trial.dias_restantes !== null && (
        <div className="flex items-start sm:items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-amber-900 text-sm">
              {trial.dias_restantes > 1 ? `Tu prueba gratuita termina en ${trial.dias_restantes} días` : trial.dias_restantes === 1 ? 'Tu prueba gratuita termina mañana' : 'Tu prueba gratuita termina hoy'}
            </p>
            <p className="text-sm text-amber-700">Activa un plan para que tu agente siga atendiendo sin interrupciones.</p>
          </div>
        </div>
      )}

      {/* Encabezado + selector de periodo */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Dashboard</h1>
          <p className="text-ink-500 mt-1">Así trabaja tu agente de IA.</p>
        </div>
        
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
          {(['hoy', 'semana', 'mes'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-sm transition capitalize ${period === p ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI PROTAGONISTA: Tiempo recuperado */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white p-6 sm:p-7 mb-5 shadow-xl shadow-brand-900/20">
        <div className="absolute -right-10 -top-12 w-52 h-52 rounded-full bg-white/10 blur-sm"></div>
        <div className="absolute right-20 -bottom-20 w-44 h-44 rounded-full bg-brand-400/30"></div>
        <div className="relative flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-brand-200 text-sm font-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Tiempo recuperado {period === 'hoy' ? 'hoy' : period === 'semana' ? 'esta semana' : 'este mes'}
            </div>
            <p className="font-display font-700 text-4xl sm:text-5xl mt-2">
              {formatTime(periodo.tiempo_recuperado_min)}
            </p>
            <p className="text-brand-100 text-sm mt-2">
              {periodo.mensajes_resueltos_ia === 0 ? (
                'Aún no hay mensajes respondidos por tu IA. En cuanto empiece a funcionar, verás aquí cuánto tiempo te ahorra.'
              ) : (
                <>Tu agente respondió <span className="font-600 text-white">{periodo.mensajes_resueltos_ia} mensajes</span> · estimado en 3 min por mensaje.</>
              )}
            </p>
          </div>
          {pctBadge}
        </div>
      </div>

      {/* Fila de KPIs secundarios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {/* Mensajes IA */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">{periodo.mensajes_resueltos_ia}</p>
          <p className="text-sm text-ink-500 mt-0.5">Mensajes resueltos por IA</p>
          <p className="text-xs text-ink-400 mt-1.5">{periodo.mensajes_escalados} escalaron a un agente</p>
        </div>

        {/* Tasa resolución */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">
            {periodo.tasa_resolucion === null ? '—' : `${periodo.tasa_resolucion.toFixed(0)}%`}
          </p>
          <p className="text-sm text-ink-500 mt-0.5">Resolución automática</p>
          <p className={`text-xs mt-1.5 ${periodo.tasa_resolucion === null ? 'text-ink-400' : 'text-emerald-600 font-500'}`}>
            {periodo.tasa_resolucion === null ? 'Sin datos aún' : 'Sin intervención humana'}
          </p>
        </div>

        {/* Tiempo respuesta */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">
            {periodo.tiempo_respuesta_ia_seg === null ? '—' : formatSeconds(periodo.tiempo_respuesta_ia_seg)}
          </p>
          <p className="text-sm text-ink-500 mt-0.5">Tiempo de respuesta IA</p>
          <p className="text-xs text-ink-400 mt-1.5">Promedio por mensaje</p>
        </div>

        {/* Tiempo cierre casos */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">
            {periodo.tiempo_cierre_casos_min === null ? '—' : formatTime(periodo.tiempo_cierre_casos_min)}
          </p>
          <p className="text-sm text-ink-500 mt-0.5">Cierre de casos</p>
          <p className="text-xs text-ink-400 mt-1.5">Promedio de los agentes</p>
        </div>
      </div>

      {/* NUEVO: Tarjetas de actividad (Casos/Conversaciones) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-2xl font-display font-700 text-ink-900">{periodo.casos_abiertos}</p>
          <p className="text-sm text-ink-500 mt-0.5">Casos abiertos</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-2xl font-display font-700 text-ink-900">{periodo.casos_resueltos}</p>
          <p className="text-sm text-ink-500 mt-0.5">Casos resueltos</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-2xl font-display font-700 text-ink-900">{periodo.conversaciones_activas}</p>
          <p className="text-sm text-ink-500 mt-0.5">Conversaciones activas</p>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-2xl font-display font-700 text-ink-900">{periodo.conversaciones_totales}</p>
          <p className="text-sm text-ink-500 mt-0.5">Conversaciones totales</p>
        </div>
      </div>

      {/* Fila: gráfico + temas */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Gráfico de evolución */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display font-600 text-ink-900">Evolución del tiempo recuperado</h2>
              <p className="text-sm text-ink-500">Minutos ahorrados por día</p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 sm:gap-3 h-44">
            {evolucion.map((e: any, idx: number) => {
              const hPct = allZeros ? 4 : Math.max(4, (e.minutos / maxMinutos) * 100)
              const date = new Date(e.fecha)
              const dayStr = daysMap[date.getUTCDay()]
              const isLast = idx === evolucion.length - 1
              return (
                <div key={e.fecha} className="flex-1 flex flex-col items-center gap-2">
                  <div className={`w-full rounded-t-lg transition-all ${isLast ? 'bg-brand-600' : 'bg-brand-200'}`} style={{ height: `${hPct}%` }}></div>
                  <span className={`text-xs ${isLast ? 'font-600 text-brand-700' : 'text-ink-400'}`}>{dayStr}</span>
                </div>
              )
            })}
          </div>
          {allZeros && (
            <p className="text-xs text-ink-400 text-center mt-4">Aún no hay actividad esta semana — el gráfico se llenará cuando tu IA empiece a responder.</p>
          )}
        </div>

        {/* Temas más frecuentes */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <h2 className="font-display font-600 text-ink-900 mb-1">Temas más frecuentes</h2>
          <p className="text-sm text-ink-500 mb-4">Etiquetas que asignó la IA</p>
          
          {temas_frecuentes.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-6">Aún no hay temas etiquetados por la IA.</p>
          ) : (
            <div className="space-y-3.5">
              {temas_frecuentes.map((tema: any, i: number) => {
                const colors = ['bg-brand-600', 'bg-brand-500', 'bg-brand-400', 'bg-brand-300', 'bg-brand-200']
                return (
                  <div key={tema.nombre}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-500 text-ink-700">{tema.nombre}</span>
                      <span className="text-ink-400">{Math.round(tema.porcentaje)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${tema.porcentaje}%` }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Consumo de cuota */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display font-600 text-ink-900">Créditos disponibles: {creditos_disponibles}</h2>
            <p className="text-sm text-ink-500 mt-1">Se consumen cuando tu agente de IA responde mensajes.</p>
          </div>
        </div>
      </div>

    </div>
  )
}
