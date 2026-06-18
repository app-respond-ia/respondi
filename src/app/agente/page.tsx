'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getMisCasos } from '@/app/actions/agente-casos'

type FiltroEstado = 'todos' | 'pendiente' | 'atendiendo' | 'resuelto'

const CANAL_CONFIG = {
  instagram: {
    iconBg: 'bg-gradient-to-br from-pink-500 to-purple-500',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0z"/>
      </svg>
    ),
  },
  whatsapp: {
    iconBg: 'bg-emerald-500',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/>
      </svg>
    ),
  },
  facebook: {
    iconBg: 'bg-blue-600',
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
} as const

type CanalConfigKey = keyof typeof CANAL_CONFIG

const TAG_COLORS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  pink: 'bg-pink-100 text-pink-700',
  indigo: 'bg-indigo-100 text-indigo-700',
}

function formatTimeElapsed(diffMs: number) {
  const min = Math.floor(diffMs / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

export default function AgentePage() {
  const [filtro, setFiltro] = useState<FiltroEstado>('todos')
  const [loading, setLoading] = useState(true)
  const [casos, setCasos] = useState<any[]>([])
  const [counts, setCounts] = useState({ todos: 0, pendiente: 0, atendiendo: 0, resuelto: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await getMisCasos(filtro)
      if (res.success && res.data) {
        setCasos(res.data.casos)
        setCounts(res.data.counts)
      } else {
        setError(res.error || 'Error al cargar casos')
      }
      setLoading(false)
    }
    load()
  }, [filtro])

  if (error) {
    return <div className="p-10 text-center text-red-500 font-medium">{error}</div>
  }

  const renderSlaBadge = (caso: any) => {
    const ahora = new Date().getTime()
    const apertura = new Date(caso.fecha_apertura).getTime()
    const diffMs = ahora - apertura
    const timeStr = `hace ${formatTimeElapsed(diffMs)}`

    if (caso.estatus === 'pendiente') {
      const isVencido = caso.sla_horas !== null && (diffMs > caso.sla_horas * 3600000)
      if (isVencido) {
        return (
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-xs font-600 px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">SLA vencido</span>
            <span className="text-xs text-ink-400">{timeStr}</span>
          </div>
        )
      } else {
        return (
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-xs font-600 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">Pendiente</span>
            <span className="text-xs text-ink-400">{timeStr}</span>
          </div>
        )
      }
    }

    if (caso.estatus === 'atendiendo') {
      let slaText = null
      if (caso.sla_horas !== null) {
        const slaMs = caso.sla_horas * 3600000
        const remainingMs = slaMs - diffMs
        if (remainingMs > 0) {
          const remainingH = Math.floor(remainingMs / 3600000)
          if (remainingH >= 1) {
            slaText = `SLA: ${remainingH} h`
          } else {
            slaText = `SLA: ${Math.floor(remainingMs / 60000)} min`
          }
        } else {
          slaText = `SLA vencido`
        }
      }

      return (
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-xs font-600 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">Atendiendo</span>
          {slaText && <span className="text-xs text-amber-600 font-500">{slaText}</span>}
        </div>
      )
    }

    if (caso.estatus === 'resuelto') {
      return (
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-xs font-600 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">Resuelto</span>
          <span className="text-xs text-ink-400">{timeStr}</span>
        </div>
      )
    }

    return null
  }

  return (
    <>
      {/* Encabezado */}
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Mis casos</h1>
        <p className="text-ink-500 mt-1">Los casos que tienes asignados para atender.</p>
      </div>

      {/* Filtros estado */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
          <button 
            onClick={() => setFiltro('todos')}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${filtro === 'todos' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500 hover:bg-slate-50'}`}
          >
            Todos <span className={filtro === 'todos' ? 'opacity-80' : 'opacity-60'}>{counts.todos}</span>
          </button>
          <button 
            onClick={() => setFiltro('pendiente')}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${filtro === 'pendiente' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500 hover:bg-slate-50'}`}
          >
            Pendientes
          </button>
          <button 
            onClick={() => setFiltro('atendiendo')}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${filtro === 'atendiendo' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500 hover:bg-slate-50'}`}
          >
            Atendiendo
          </button>
          <button 
            onClick={() => setFiltro('resuelto')}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${filtro === 'resuelto' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500 hover:bg-slate-50'}`}
          >
            Resueltos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500 font-medium">Cargando casos...</div>
      ) : casos.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <p className="font-600 text-ink-900">¡Todo al día!</p>
          <p className="text-sm text-ink-500 mt-1">
            {filtro === 'atendiendo' ? 'No tienes casos en atención ahora mismo.' : 'No tienes casos pendientes ahora mismo.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {casos.map(caso => {
            const nombre = caso.contacts?.nombre || 'Cliente sin nombre'
            const initials = nombre === 'Cliente sin nombre' 
              ? '?' 
              : nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
            
            const canal = caso.contacts?.canal as CanalConfigKey
            const canalConf = CANAL_CONFIG[canal] || CANAL_CONFIG.instagram // fallback

            let tagClasses = ''
            if (caso.primer_tag) {
              tagClasses = TAG_COLORS[caso.primer_tag.color] || TAG_COLORS.slate
            }

            return (
              <Link 
                key={caso.id} 
                href={`/agente/casos/${caso.id}`}
                className="block bg-white rounded-2xl border border-slate-200 hover:border-brand-300 hover:shadow-sm transition p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center font-600 text-brand-700">
                      {initials}
                    </div>
                    <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${canalConf.iconBg} flex items-center justify-center text-white ring-2 ring-white`}>
                      {canalConf.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-600 text-ink-900">{nombre}</p>
                      {/* Short ID visual ref */}
                      <span className="text-xs text-ink-400">#{caso.id.split('-')[0]}</span>
                      {caso.primer_tag && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-500 ${tagClasses}`}>
                          {caso.primer_tag.nombre}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-500 line-clamp-1">{caso.descripcion || 'Sin descripción'}</p>
                  </div>
                  {renderSlaBadge(caso)}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
