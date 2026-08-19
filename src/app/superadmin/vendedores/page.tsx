'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { getVendedores, crearVendedor, actualizarVendedor, añadirNotaVendedor } from '@/app/actions/superadmin'
import { useToast } from '@/components/ui/Toast'

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  // Búsqueda, Filtro y Ordenamiento
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos') // todos, activos, inactivos
  const [orden, setOrden] = useState('fecha_desc') // fecha_desc, fecha_asc, nombre_asc, clientes_desc, comision_desc

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedVendedor, setSelectedVendedor] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  
  // Notas
  const [nuevaNota, setNuevaNota] = useState('')
  const [savingNota, setSavingNota] = useState(false)

  const defaultForm = {
    nombre: '',
    email: '',
    comision_conversion_pct: 10,
    comision_mrr_pct: 5,
    activo: true,
    telefono: '',
    dni_nif: '',
    direccion: {
      calle: '',
      ciudad: '',
      codigo_postal: '',
      pais: ''
    }
  }
  const [formData, setFormData] = useState(defaultForm)

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
    setFormData({ ...defaultForm })
    setIsModalOpen(true)
    setNuevaNota('')
  }

  const openEditar = (v: any) => {
    setModalMode('editar')
    setSelectedVendedor(v)
    setFormData({
      nombre: v.nombre || '',
      email: v.email || '',
      comision_conversion_pct: v.comision_conversion_pct || 10,
      comision_mrr_pct: v.comision_mrr_pct || 5,
      activo: v.activo ?? true,
      telefono: v.telefono || '',
      dni_nif: v.dni_nif || '',
      direccion: v.direccion || defaultForm.direccion
    })
    setIsModalOpen(true)
    setNuevaNota('')
  }

  const handleGuardar = async () => {
    if (!formData.nombre || !formData.email) {
      showToast('Nombre y email son obligatorios', 'error')
      return
    }
    if (modalMode === 'editar' && formData.activo === false) {
      if (!confirm(`¿Seguro que quieres desactivar al vendedor "${formData.nombre}"? Perderá acceso al panel.`)) {
        setSaving(false)
        return
      }
    }
    setSaving(true)
    let res
    if (modalMode === 'crear') {
      res = await crearVendedor(formData)
    } else {
      res = await actualizarVendedor(selectedVendedor.id, {
        nombre: formData.nombre,
        comision_conversion_pct: formData.comision_conversion_pct,
        comision_mrr_pct: formData.comision_mrr_pct,
        activo: formData.activo,
        telefono: formData.telefono,
        dni_nif: formData.dni_nif,
        direccion: formData.direccion
      })
    }
    if (res.success) {
      setIsModalOpen(false)
      showToast(modalMode === 'crear' ? 'Vendedor creado y email de acceso enviado ✓' : 'Vendedor actualizado ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al guardar', 'error')
    }
    setSaving(false)
  }

  const handleAñadirNota = async () => {
    if (!selectedVendedor || !nuevaNota.trim()) return
    setSavingNota(true)
    const res = await añadirNotaVendedor(selectedVendedor.id, nuevaNota)
    if (res.success) {
      showToast('Nota añadida', 'success')
      setNuevaNota('')
      // Update local state without full reload
      setSelectedVendedor({
        ...selectedVendedor,
        vendedor_notas: [res.nota, ...(selectedVendedor.vendedor_notas || [])]
      })
      cargar() // async reload in background
    } else {
      showToast(res.error || 'Error al añadir nota', 'error')
    }
    setSavingNota(false)
  }

  const formatFecha = (d: string) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
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
    if (orden === 'fecha_desc') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (orden === 'fecha_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (orden === 'nombre_asc') return a.nombre.localeCompare(b.nombre)
    if (orden === 'clientes_desc') {
      const ca = a.vendedor_clientes?.length || 0
      const cb = b.vendedor_clientes?.length || 0
      return cb - ca
    }
    if (orden === 'comision_desc') return b.comision_conversion_pct - a.comision_conversion_pct
    return 0
  })

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Vendedores</h1>
          <p className="text-ink-500 mt-1">Afiliados externos que traen clientes a Respondi.</p>
        </div>
        <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo vendedor
        </button>
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
          <select value={orden} onChange={e => setOrden(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
            <option value="fecha_desc">Más recientes primero</option>
            <option value="fecha_asc">Más antiguos primero</option>
            <option value="nombre_asc">Nombre (A-Z)</option>
            <option value="clientes_desc">Más clientes referidos</option>
            <option value="comision_desc">Mayor comisión</option>
          </select>
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
              <div key={v.id} className="flex items-center gap-4 p-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-600 shrink-0 ${color} ${!v.activo ? 'opacity-40' : ''}`}>
                  {iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900">{v.nombre}</p>
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
                <button onClick={() => openEditar(v)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="font-display font-700 text-lg text-ink-900">
                  {modalMode === 'crear' ? 'Nuevo vendedor' : 'Editar vendedor'}
                </h2>
                <button onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              
              <div className="overflow-y-auto p-6 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Columna Izquierda: Datos del vendedor */}
                  <div className="space-y-5">
                    <h3 className="font-600 text-ink-900 text-sm border-b pb-2">Datos Básicos</h3>
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                      <input type="text" placeholder="Nombre completo" value={formData.nombre}
                        onChange={e => setFormData({...formData, nombre: e.target.value})}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">
                        Email {modalMode === 'editar' && <span className="text-ink-400 font-400">· no editable</span>}
                      </label>
                      <input type="email" placeholder="vendedor@ejemplo.com" value={formData.email}
                        disabled={modalMode === 'editar'}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400" />
                      {modalMode === 'crear' && (
                        <p className="text-xs text-ink-400 mt-1.5">Se enviará un email de invitación con acceso al panel de vendedor.</p>
                      )}
                    </div>
                    
                    <h3 className="font-600 text-ink-900 text-sm border-b pb-2 pt-2">Comisiones</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-500 text-ink-700 mb-1.5">Conversión (%)</label>
                        <input type="number" min="0" max="100" step="0.5" value={formData.comision_conversion_pct}
                          onChange={e => setFormData({...formData, comision_conversion_pct: parseFloat(e.target.value)})}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                      </div>
                      <div>
                        <label className="block text-xs font-500 text-ink-700 mb-1.5">MRR (%)</label>
                        <input type="number" min="0" max="100" step="0.5" value={formData.comision_mrr_pct}
                          onChange={e => setFormData({...formData, comision_mrr_pct: parseFloat(e.target.value)})}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                      </div>
                    </div>

                    <h3 className="font-600 text-ink-900 text-sm border-b pb-2 pt-2">Datos de Facturación / Contacto</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-500 text-ink-700 mb-1.5">Teléfono</label>
                        <input type="text" placeholder="+34..." value={formData.telefono}
                          onChange={e => setFormData({...formData, telefono: e.target.value})}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                      </div>
                      <div>
                        <label className="block text-xs font-500 text-ink-700 mb-1.5">DNI / NIF</label>
                        <input type="text" placeholder="12345678A" value={formData.dni_nif}
                          onChange={e => setFormData({...formData, dni_nif: e.target.value})}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-700 mb-1.5">Dirección (Calle)</label>
                      <input type="text" placeholder="C/ Ejemplo, 1" value={formData.direccion.calle}
                        onChange={e => setFormData({...formData, direccion: {...formData.direccion, calle: e.target.value}})}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <label className="block text-xs font-500 text-ink-700 mb-1.5">C.P.</label>
                        <input type="text" placeholder="28001" value={formData.direccion.codigo_postal}
                          onChange={e => setFormData({...formData, direccion: {...formData.direccion, codigo_postal: e.target.value}})}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-500 text-ink-700 mb-1.5">Ciudad</label>
                        <input type="text" placeholder="Madrid" value={formData.direccion.ciudad}
                          onChange={e => setFormData({...formData, direccion: {...formData.direccion, ciudad: e.target.value}})}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-700 mb-1.5">País</label>
                      <input type="text" placeholder="España" value={formData.direccion.pais}
                        onChange={e => setFormData({...formData, direccion: {...formData.direccion, pais: e.target.value}})}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition" />
                    </div>

                    {modalMode === 'editar' && (
                      <div className="pt-2">
                        <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                          <span className="text-sm font-500 text-ink-700">Vendedor activo</span>
                          <input type="checkbox" checked={formData.activo}
                            onChange={e => setFormData({...formData, activo: e.target.checked})}
                            className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400" />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Columna Derecha: Historial de Notas */}
                  {modalMode === 'editar' && selectedVendedor && (
                    <div className="space-y-4 flex flex-col h-full bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <h3 className="font-600 text-ink-900 text-sm">Historial de Notas Internas</h3>
                      
                      <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                        {(!selectedVendedor.vendedor_notas || selectedVendedor.vendedor_notas.length === 0) ? (
                          <p className="text-sm text-slate-500 italic">No hay notas para este vendedor.</p>
                        ) : (
                          selectedVendedor.vendedor_notas.map((n: any) => (
                            <div key={n.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm">
                              <p className="text-slate-800 whitespace-pre-wrap">{n.nota}</p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                                <span className="font-500">{n.users?.nombre || 'Admin'}</span>
                                <span>&bull;</span>
                                <span>{formatFecha(n.created_at)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-200 shrink-0">
                        <textarea rows={2} placeholder="Escribir una nueva nota..."
                          value={nuevaNota}
                          onChange={e => setNuevaNota(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition mb-2" />
                        <button onClick={handleAñadirNota} disabled={savingNota || !nuevaNota.trim()}
                          className="w-full h-9 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-600 transition disabled:opacity-50">
                          {savingNota ? 'Añadiendo...' : 'Añadir nota'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Placeholder si es crear */}
                  {modalMode === 'crear' && (
                    <div className="space-y-4 flex flex-col h-full bg-slate-50 p-4 rounded-xl border border-slate-200 justify-center items-center text-center">
                      <svg className="w-12 h-12 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      <h3 className="font-500 text-slate-500 text-sm">Historial de notas no disponible</h3>
                      <p className="text-xs text-slate-400">Podrás añadir notas internas una vez creado el vendedor.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-white rounded-b-2xl">
                <button onClick={() => setIsModalOpen(false)} disabled={saving}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : modalMode === 'crear' ? 'Crear y enviar invitación' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
