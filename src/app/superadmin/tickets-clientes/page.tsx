'use client'

import { useState, useEffect } from 'react'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'
import { getTicketsClientesSoporte, getCategoriasTicketsClientes } from '@/app/actions/superadmin'
import { toggleFijarTicket } from '@/app/actions/soporte-fijar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'

export default function TicketsClientesPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros (la búsqueda y el estado los lleva la tabla)
  const [filtroOrganizacion, setFiltroOrganizacion] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState('')

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('soporte_clientes', 'escritura')

  useEffect(() => {
    cargar()
  }, [])

  const cargar = async () => {
    setLoading(true)
    const [resTickets, resCats] = await Promise.all([
      getTicketsClientesSoporte(),
      getCategoriasTicketsClientes()
    ])
    if (resTickets.success && resTickets.data) {
      setTickets(resTickets.data)
    }
    if (resCats.success && resCats.data) {
      setCategorias(resCats.data)
    }
    setLoading(false)
  }

  const formatFecha = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getEstadoBadge = (estado: string) => {
    if (estado === 'abierto') return 'bg-amber-100 text-amber-700'
    if (estado === 'cerrado') return 'bg-slate-100 text-slate-600'
    return 'bg-slate-100 text-slate-600'
  }

  const getPrioridadBadge = (prio: string) => {
    if (prio === 'alta') return 'bg-red-100 text-red-700'
    if (prio === 'normal') return 'bg-blue-100 text-blue-700'
    if (prio === 'baja') return 'bg-slate-100 text-slate-600'
    return 'bg-slate-100 text-slate-600'
  }

  const toggleFijar = async (id: string, currentlyPinned: boolean) => {
    // optimistic update
    setTickets(prev => prev.map(t => t.id === id ? { ...t, fijado: !currentlyPinned } : t))
    const res = await toggleFijarTicket(id, 'cliente', !currentlyPinned)
    if (!res.success) {
      // revert on fail
      setTickets(prev => prev.map(t => t.id === id ? { ...t, fijado: currentlyPinned } : t))
    }
  }

  const getSortDate = (t: any) => t.ultimo_mensaje ? new Date(t.ultimo_mensaje.timestamp).getTime() : new Date(t.fecha_apertura).getTime()
  const ultimaActividad = (t: any) => t.ultimo_mensaje ? t.ultimo_mensaje.timestamp : t.fecha_apertura

  const organizacionesUnicas = Array.from(new Set(tickets.map(t => t.organizacion?.nombre).filter(Boolean)))

  const abiertos = tickets.filter(t => t.estatus === 'abierto').length
  const sinCategorizar = tickets.filter(t => !t.categoria_id && t.estatus === 'abierto').length
  const cerrados = tickets.filter(t => t.estatus === 'cerrado').length

  // Los fijados van primero y después por actividad reciente; la tabla
  // respeta este orden mientras no se pulse una columna.
  const filtrados = tickets.filter(t => {
    if (filtroOrganizacion && t.organizacion?.nombre !== filtroOrganizacion) return false
    if (filtroCategoria && t.categoria_id !== filtroCategoria) return false
    if (filtroPrioridad && t.prioridad !== filtroPrioridad) return false
    return true
  }).sort((a, b) => {
    if (a.fijado && !b.fijado) return -1
    if (!a.fijado && b.fijado) return 1
    return getSortDate(b) - getSortDate(a)
  })

  const iconoPin = <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16 11V6a4 4 0 00-8 0v5l-2 3v2h5.5v5h1v-5H18v-2l-2-3z"/></svg>

  return (
    <div className={PAGINA}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Tickets de Clientes</h1>
          <p className="text-ink-500 mt-1">Gestiona y responde las solicitudes de soporte de los clientes finales.</p>
        </div>
        {canWrite && (
          <Link 
            href="/superadmin/tickets-clientes/categorias"
            className="h-11 px-5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-ink-700 font-600 text-sm transition shadow-sm hover:shadow flex items-center gap-2"
          >
            <svg className="w-5 h-5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
            Gestionar categorías
          </Link>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Tickets abiertos</p>
          <p className="font-display font-700 text-2xl text-amber-600">{abiertos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Sin categorizar (abiertos)</p>
          <p className="font-display font-700 text-2xl text-red-600">{sinCategorizar}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Tickets cerrados</p>
          <p className="font-display font-700 text-2xl text-slate-600">{cerrados}</p>
        </div>
      </div>

      {/* Tabla */}
      <Tabla
        filas={filtrados}
        idDe={t => t.id}
        cargando={loading}
        nombre={['ticket', 'tickets']}
        buscar={{ placeholder: 'Buscar por asunto o cliente…', en: t => `${t.asunto || ''} ${t.organizacion?.nombre || ''} ${t.sucursal?.nombre || ''}` }}
        pestanas={[
          { id: 'todos', etiqueta: 'Todos' },
          { id: 'abierto', etiqueta: 'Abiertos', filtro: t => t.estatus === 'abierto' },
          { id: 'cerrado', etiqueta: 'Cerrados', filtro: t => t.estatus === 'cerrado' }
        ]}
        herramientas={
          <>
            <select value={filtroOrganizacion} onChange={e => setFiltroOrganizacion(e.target.value)} aria-label="Organización"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
              <option value="">Todas las organizaciones</option>
              {organizacionesUnicas.map(org => (
                <option key={org as string} value={org as string}>{org as string}</option>
              ))}
            </select>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} aria-label="Categoría"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
              <option value="">Todas las categorías</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <select value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)} aria-label="Prioridad"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
              <option value="">Todas las prioridades</option>
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
              <option value="baja">Baja</option>
            </select>
          </>
        }
        onFilaClick={t => router.push(`/superadmin/tickets-clientes/${t.id}`)}
        columnas={[
          { clave: 'asunto', titulo: 'Asunto', enMovil: 'titulo', valor: t => t.asunto || '', clase: 'max-w-[220px] 2xl:max-w-[320px]', render: t => (
            <div className="flex items-center gap-2 min-w-0">
              {canWrite && (
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleFijar(t.id, t.fijado) }}
                  className={`p-1 rounded hover:bg-slate-200 transition shrink-0 ${t.fijado ? 'text-amber-500' : 'text-slate-300'}`}
                  title={t.fijado ? 'Desfijar' : 'Fijar'}
                  aria-label={t.fijado ? 'Desfijar' : 'Fijar'}
                >
                  {iconoPin}
                </button>
              )}
              {!canWrite && t.fijado && (
                <span className="text-amber-500 p-1 shrink-0">{iconoPin}</span>
              )}
              <span title={t.asunto} className={`truncate font-500 ${t.fijado ? 'text-amber-900' : 'text-ink-900'}`}>{t.asunto}</span>
            </div>
          ) },
          { clave: 'cliente', titulo: 'Cliente', valor: t => t.organizacion?.nombre || '', render: t => (
            <div className="flex flex-col">
              <span className="text-ink-600 whitespace-nowrap">{t.organizacion?.nombre || '—'}</span>
              {t.sucursal?.nombre && (
                <span className="text-[11px] text-ink-400">{t.sucursal.nombre}</span>
              )}
            </div>
          ) },
          { clave: 'categoria', titulo: 'Categoría', valor: t => t.categoria?.nombre || '', render: t => t.categoria ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-600 border whitespace-nowrap" style={{ backgroundColor: `${t.categoria.color}15`, color: t.categoria.color, borderColor: `${t.categoria.color}30` }}>
              {t.categoria.nombre}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-600 bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">Sin asignar</span>
          ) },
          { clave: 'prioridad', titulo: 'Prioridad', valor: t => t.prioridad || '', render: t => <span className={`text-[10px] px-1.5 py-0.5 rounded font-600 capitalize ${getPrioridadBadge(t.prioridad)}`}>{t.prioridad}</span> },
          { clave: 'estado', titulo: 'Estado', valor: t => t.estatus || '', render: t => <span className={`text-[10px] px-1.5 py-0.5 rounded font-600 capitalize ${getEstadoBadge(t.estatus)}`}>{t.estatus}</span> },
          { clave: 'valoracion', titulo: 'Valoración', valor: t => Number(t.calificacion || 0), render: t => t.calificacion ? (
            <div className="flex gap-0.5" title={t.comentario_calificacion || ''}>
              {[1,2,3,4,5].map(star => (
                <svg key={star} className={`w-3.5 h-3.5 ${star <= t.calificacion ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-slate-400">—</span>
          ) },
          { clave: 'asignado', titulo: 'Asignado a', valor: t => t.asignado_a_user?.nombre || '', render: t => t.asignado_a_user ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-[10px] font-bold shrink-0">
                {t.asignado_a_user.nombre.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-ink-700 font-500 whitespace-nowrap">{t.asignado_a_user.nombre}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-500">—</span>
          ) },
          { clave: 'actividad', titulo: 'Última actividad', valor: t => ultimaActividad(t) || '', render: t => <span className="text-ink-500 whitespace-nowrap text-xs">{formatFecha(ultimaActividad(t))}</span> }
        ]}
        acciones={t => (
          <Link href={`/superadmin/tickets-clientes/${t.id}`}
            className="inline-flex items-center justify-center px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-ink-700 text-xs font-600 transition">
            Ver
          </Link>
        )}
        vacio={<p className="text-ink-500">No hay tickets con estos filtros.</p>}
      />
    </div>
  )
}
