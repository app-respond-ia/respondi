'use client'

import { useState, useEffect } from 'react'
import { getOrganizaciones } from '@/app/actions/superadmin'


export default function OrganizacionesPage() {
  const [organizaciones, setOrganizaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('Todos')
  const [search, setSearch] = useState('')

  const [modalOrganizacion, setModalOrganizacion] = useState<any>(null)

  useEffect(() => {
    loadOrganizaciones()
  }, [filtro])

  async function loadOrganizaciones() {
    setLoading(true)
    const { success, organizaciones: data } = await getOrganizaciones(filtro)
    if (success && data) {
      setOrganizaciones(data)
    }
    setLoading(false)
  }

  const organizacionesFiltradas = organizaciones.filter(o => 
    o.nombre.toLowerCase().includes(search.toLowerCase()) || 
    (o.vendedores?.nombre || '').toLowerCase().includes(search.toLowerCase())
  )

  const openModal = (organizacion: any) => {
    setModalOrganizacion(organizacion)
    document.body.style.overflow = 'hidden'
  }

  const closeModal = () => {
    setModalOrganizacion(null)
    document.body.style.overflow = ''
  }

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-emerald-100 text-emerald-700 marker:bg-emerald-500'
      case 'trial': return 'bg-blue-100 text-blue-700 marker:bg-blue-500'
      case 'vencido': return 'bg-amber-100 text-amber-700 marker:bg-amber-500'
      case 'suspendido': return 'bg-red-100 text-red-700 marker:bg-red-500'
      default: return 'bg-slate-100 text-slate-700 marker:bg-slate-500'
    }
  }

  const getAvatarColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-brand-100 text-brand-700'
      case 'trial': return 'bg-blue-100 text-blue-700'
      case 'vencido': return 'bg-amber-100 text-amber-700'
      case 'suspendido': return 'bg-slate-200 text-slate-600'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Organizaciones</h1>
        <p className="text-ink-500 mt-1">Todos los negocios que usan Respondi.</p>
      </div>

      {/* Buscador + filtros */}
      <div className="space-y-3 mb-5">
        <div className="relative">
          <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input 
            type="text" 
            placeholder="Buscar organización o vendedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-4 rounded-xl border border-slate-300 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 overflow-x-auto">
            {['Todos', 'Activo', 'Trial', 'Vencido', 'Suspendido'].map(f => (
              <button 
                key={f}
                onClick={() => setFiltro(f)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition ${filtro === f ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de organizaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-ink-500">Cargando organizaciones...</div>
        ) : organizacionesFiltradas.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No se encontraron organizaciones.</div>
        ) : (
          organizacionesFiltradas.map(o => {
            const statusStyle = getStatusColor(o.estado)
            const avatarStyle = getAvatarColor(o.estado)
            const iniciales = o.nombre.substring(0, 2).toUpperCase()
            
            return (
              <button key={o.id} onClick={() => openModal(o)} className="w-full text-left flex items-center gap-3 p-4 hover:bg-slate-50 transition">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-600 shrink-0 ${avatarStyle}`}>{iniciales}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900">{o.nombre}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-600 ${statusStyle.split(' marker:')[0]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.split(' marker:')[1]}`}></span> {o.estado}
                    </span>
                  </div>
                  <p className="text-sm text-ink-500 mt-0.5 truncate">
                    Plan {o.plans?.nombre || 'Ninguno'} · vence el {o.fecha_vencimiento ? new Date(o.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'} · vendedor: {o.vendedores?.nombre || 'Sin vendedor'}
                  </p>
                </div>
                <svg className="w-5 h-5 text-ink-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            )
          })
        )}
      </div>

      {/* MODAL DETALLE ORGANIZACIÓN */}
      {modalOrganizacion && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalOrganizacion.nombre}</h2>
                <button onClick={closeModal} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                
                {/* Estado actual */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${modalOrganizacion.estado === 'activo' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(modalOrganizacion.estado).split(' marker:')[1]}`}></span>
                  <div className="flex-1">
                    <p className="text-sm font-600 text-ink-900">Plan {modalOrganizacion.plans?.nombre} · {modalOrganizacion.estado}</p>
                    <p className="text-xs text-ink-500">Vence el {modalOrganizacion.fecha_vencimiento ? new Date(modalOrganizacion.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</p>
                  </div>
                </div>

                {/* Datos */}
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-ink-500">Alta</dt><dd className="text-ink-900 font-500 text-right">{new Date(modalOrganizacion.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-ink-500">Vendedor</dt><dd className="text-ink-900 font-500 text-right">{modalOrganizacion.vendedores?.nombre || 'Sin vendedor'}</dd></div>
                </dl>

                {/* Acciones de gestión */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-600 text-ink-500 uppercase tracking-wide">Gestión del plan</p>
                  <button disabled title="Próximamente" className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-600 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Registrar pago y renovar
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button title="Próximamente" className="h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition">Cambiar plan</button>
                    <button title="Próximamente" className="h-10 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-sm font-600 text-red-600 transition">Suspender</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
