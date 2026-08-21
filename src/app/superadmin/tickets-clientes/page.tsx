'use client'

import { useState, useEffect } from 'react'
import Loading from '@/components/Loading'
import { getTicketsClientesSoporte, getCategoriasTicketsClientes } from '@/app/actions/superadmin'
import Link from 'next/link'

export default function TicketsClientesPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroEstatus, setFiltroEstatus] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState('')

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

  const abiertos = tickets.filter(t => t.estatus === 'abierto').length
  const sinCategorizar = tickets.filter(t => !t.categoria_id && t.estatus === 'abierto').length
  const cerrados = tickets.filter(t => t.estatus === 'cerrado').length

  const filtrados = tickets.filter(t => {
    if (filtroEstatus && t.estatus !== filtroEstatus) return false
    if (filtroCategoria && t.categoria_id !== filtroCategoria) return false
    if (filtroPrioridad && t.prioridad !== filtroPrioridad) return false
    return true
  })

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Tickets de Clientes</h1>
          <p className="text-ink-500 mt-1">Gestiona y responde las solicitudes de soporte de los clientes finales.</p>
        </div>
        <Link 
          href="/superadmin/tickets-clientes/categorias"
          className="h-11 px-5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-ink-700 font-600 text-sm transition shadow-sm hover:shadow flex items-center gap-2"
        >
          <svg className="w-5 h-5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
          Gestionar categorías
        </Link>
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

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={filtroEstatus} onChange={e => setFiltroEstatus(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todos los estados</option>
          <option value="abierto">Abierto</option>
          <option value="cerrado">Cerrado</option>
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <select value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todas las prioridades</option>
          <option value="alta">Alta</option>
          <option value="normal">Normal</option>
          <option value="baja">Baja</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <Loading />
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay tickets con estos filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-ink-500">
                  <th className="font-600 px-5 py-3">Asunto</th>
                  <th className="font-600 px-5 py-3">Cliente</th>
                  <th className="font-600 px-5 py-3">Sucursal</th>
                  <th className="font-600 px-5 py-3">Categoría</th>
                  <th className="font-600 px-5 py-3">Prioridad</th>
                  <th className="font-600 px-5 py-3">Estado</th>
                  <th className="font-600 px-5 py-3">Asignado a</th>
                  <th className="font-600 px-5 py-3">Última actividad</th>
                  <th className="font-600 px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5 font-500 text-ink-900 max-w-[200px] truncate" title={t.asunto}>{t.asunto}</td>
                    <td className="px-5 py-3.5 text-ink-600">{t.organizacion?.nombre || '—'}</td>
                    <td className="px-5 py-3.5 text-ink-600">{t.sucursal?.nombre || '—'}</td>
                    <td className="px-5 py-3.5">
                      {t.categoria ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-600" style={{ backgroundColor: `${t.categoria.color}15`, color: t.categoria.color, border: `1px solid ${t.categoria.color}30` }}>
                          {t.categoria.nombre}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-600 bg-slate-100 text-slate-500">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getPrioridadBadge(t.prioridad)}`}>
                        {t.prioridad}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getEstadoBadge(t.estatus)}`}>
                        {t.estatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {t.asignado_a_user ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-[10px] font-bold">
                            {t.asignado_a_user.nombre.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-ink-700 font-500">{t.asignado_a_user.nombre}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-ink-500">
                      {t.ultimo_mensaje ? formatFecha(t.ultimo_mensaje.timestamp) : formatFecha(t.fecha_apertura)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/superadmin/tickets-clientes/${t.id}`}
                        className="inline-flex items-center justify-center px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-ink-700 text-xs font-600 transition">
                        Ver detalles
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
