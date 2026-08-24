'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { getVendedores } from '@/app/actions/superadmin'
import Link from 'next/link'
import VendedorModal from '@/components/vendedores/VendedorModal'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Búsqueda, Filtro y Ordenamiento
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos') // todos, activos, inactivos
  const [orden, setOrden] = useState('fecha') // fecha, nombre, clientes, comision
  const [ordenDesc, setOrdenDesc] = useState(true)

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedVendedor, setSelectedVendedor] = useState<any>(null)

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('vendedores', 'escritura')

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const res = await getVendedores()
    if (res.success && res.vendedores) setVendedores(res.vendedores)
    setLoading(false)
  }

  const openCrear = () => {
    setModalMode('crear')
    setSelectedVendedor(null)
    setIsModalOpen(true)
  }

  const openEditar = (v: any, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModalMode('editar')
    setSelectedVendedor(v)
    setIsModalOpen(true)
  }

  const totalClientes = vendedores.reduce((acc, v) => acc + (v.vendedor_clientes?.length || 0), 0)
  const totalActivos = vendedores.filter(v => v.activo).length

  // Filtrado y Ordenamiento
  let vendedoresProcesados = [...vendedores]

  if (search.trim()) {
    const s = search.toLowerCase()
    vendedoresProcesados = vendedoresProcesados.filter(v => 
      v.nombre?.toLowerCase().includes(s) || v.email?.toLowerCase().includes(s)
    )
  }

  if (filtroEstado === 'activos') {
    vendedoresProcesados = vendedoresProcesados.filter(v => v.activo)
  } else if (filtroEstado === 'inactivos') {
    vendedoresProcesados = vendedoresProcesados.filter(v => !v.activo)
  }

  vendedoresProcesados.sort((a, b) => {
    let diff = 0
    if (orden === 'fecha') diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (orden === 'nombre') diff = a.nombre.localeCompare(b.nombre)
    if (orden === 'clientes') {
      const ca = a.vendedor_clientes?.length || 0
      const cb = b.vendedor_clientes?.length || 0
      diff = ca - cb
    }
    if (orden === 'comision') diff = a.comision_conversion_pct - b.comision_conversion_pct
    
    return ordenDesc ? -diff : diff
  })

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Vendedores</h1>
          <p className="text-ink-500 mt-1">Afiliados externos que traen clientes a Respondi.</p>
        </div>
        {canWrite && (
          <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo vendedor
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Vendedores activos</p>
          <p className="font-display font-700 text-2xl text-ink-900">{totalActivos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total registrados</p>
          <p className="font-display font-700 text-2xl text-ink-900">{vendedores.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Clientes en cartera</p>
          <p className="font-display font-700 text-2xl text-ink-900">{totalClientes}</p>
        </div>
      </div>

      {/* Controles de Búsqueda y Filtro */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <input type="text" placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 h-10 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition" />
        </div>
        
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="todos">Todos los estados</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-500">Ordenar por:</span>
          <div className="flex items-center gap-1">
            <select value={orden} onChange={e => setOrden(e.target.value)}
              className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
              <option value="fecha">Fecha de registro</option>
              <option value="nombre">Nombre</option>
              <option value="clientes">Clientes referidos</option>
              <option value="comision">Comisión</option>
            </select>
            <button onClick={() => setOrdenDesc(!ordenDesc)}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-ink-500 hover:bg-slate-50 transition"
              title={ordenDesc ? 'Descendente' : 'Ascendente'}>
              {ordenDesc ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <Loading />
        ) : vendedoresProcesados.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay vendedores que coincidan con los filtros.</div>
        ) : (
          vendedoresProcesados.map((v, i) => {
            const avatarColors = ['bg-brand-100 text-brand-700', 'bg-blue-100 text-blue-700', 'bg-orange-100 text-orange-700', 'bg-purple-100 text-purple-700']
            const color = avatarColors[i % avatarColors.length]
            const iniciales = v.nombre.substring(0, 2).toUpperCase()
            const numClientes = v.vendedor_clientes?.length || 0
            const clientesActivos = v.vendedor_clientes?.filter((c: any) => c.estado_seguimiento === 'activo').length || 0

            return (
              <Link href={`/superadmin/vendedores/${v.id}`} key={v.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition cursor-pointer group">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-600 shrink-0 ${color} ${!v.activo ? 'opacity-40' : ''}`}>
                  {iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900 group-hover:text-brand-600 transition">{v.nombre}</p>
                    {!v.activo && (
                      <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Inactivo</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-500 truncate">{v.email}</p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-600">
                      Conv. {v.comision_conversion_pct}%
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-600">
                      MRR {v.comision_mrr_pct}%
                    </span>
                  </div>
                  <p className="text-xs text-ink-400">{numClientes} clientes · {clientesActivos} activos</p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {canWrite && (
                    <button onClick={(e) => openEditar(v, e)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-200 transition shrink-0" title="Editar vendedor">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  )}
                  <div className="text-ink-300 group-hover:text-brand-600 transition">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>

      <VendedorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
        vendedor={selectedVendedor}
        onSuccess={cargar}
      />
    </>
  )
}
