'use client'

import { useState, useEffect } from 'react'
import { getPrecios, crearPrecio, actualizarPrecio, eliminarPrecio, PrecioData } from '@/app/actions/precios'
import { getMisPermisos } from '@/app/actions/permisos'

export default function ListaPreciosPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'producto' | 'servicio'>('todos')
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [formData, setFormData] = useState<PrecioData>({
    nombre: '',
    tipo: 'producto',
    precio: null,
    precio_tipo: 'exacto',
    moneda: 'USD',
    descripcion: '',
    disponible: true
  })

  const cargar = async () => {
    setLoading(true)
    const res = await getPrecios()
    if (res.success && res.data) {
      setItems(res.data)
    }

    const permisosRes = await getMisPermisos()
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'precios')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const itemsFiltrados = items.filter(item => {
    if (filtroTipo === 'todos') return true
    return item.tipo === filtroTipo
  })

  const openAñadir = () => {
    setModalMode('añadir')
    setEditingId(null)
    setFormData({
      nombre: '',
      tipo: 'producto',
      precio: null,
      precio_tipo: 'exacto',
      moneda: 'USD',
      descripcion: '',
      disponible: true
    })
    setIsModalOpen(true)
  }

  const openEditar = (item: any) => {
    setModalMode('editar')
    setEditingId(item.id)
    setFormData({
      nombre: item.nombre,
      tipo: item.tipo,
      precio: item.precio,
      precio_tipo: item.precio_tipo,
      moneda: item.moneda,
      descripcion: item.descripcion || '',
      disponible: item.disponible
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este ítem?')) return
    
    const res = await eliminarPrecio(id)
    if (res.success) {
      setItems(prev => prev.filter(it => it.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Ítem eliminado correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar el ítem' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    // Preparar los datos y sanitizar según precio_tipo
    const dataToSave: PrecioData = { ...formData }
    if (dataToSave.precio_tipo === 'consultar') {
      dataToSave.precio = null
      dataToSave.moneda = 'USD'
    } else {
      // Si el precio viene como string desde el input, convertirlo a number
      if (typeof dataToSave.precio === 'string') {
        dataToSave.precio = dataToSave.precio ? parseFloat(dataToSave.precio) : null
      }
    }

    let res
    if (modalMode === 'añadir') {
      res = await crearPrecio(dataToSave)
    } else {
      res = await actualizarPrecio(editingId!, dataToSave)
    }

    if (res.success) {
      if (modalMode === 'añadir') {
        setItems(prev => [res.data, ...prev])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? res.data : it))
      }
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'añadir' ? 'Ítem añadido correctamente ✓' : 'Ítem actualizado correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar el ítem' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  const formatearPrecio = (item: any) => {
    if (item.precio_tipo === 'consultar') return 'A consultar'
    
    const numeroStr = item.precio != null ? Number(item.precio).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'
    const monedaStr = item.moneda

    if (item.precio_tipo === 'desde') return `Desde ${numeroStr} ${monedaStr}`
    return `${numeroStr} ${monedaStr}`
  }

  if (loading || nivelPermiso === null) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando lista de precios...</div>
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-500 font-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-6xl w-full mx-auto pb-20">
      
      {mensaje && (
        <div className={`mb-6 text-sm font-semibold px-4 py-3 rounded-xl ${mensaje.tipo === 'exito' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Encabezado + acciones */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Lista de precios</h1>
          <p className="text-ink-500 mt-1">Productos y servicios que tu agente de IA usa para responder.</p>
        </div>
        <div className="flex gap-2">
          {/* El botón de importar excel está fuera de esta fase, se omite por ahora */}
          <button onClick={openAñadir} disabled={nivelPermiso !== 'escritura'} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Añadir ítem
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p className="font-semibold text-ink-900 text-lg mb-1">Aún no tienes ítems en tu lista de precios.</p>
          <p className="text-ink-500 text-sm">Añade el primero para que tu asistente IA pueda informar sobre tus productos y servicios.</p>
        </div>
      ) : (
        <>
          {/* Filtros: tipo */}
          <div className="flex items-center gap-3 flex-wrap mb-5">
            <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
              <button onClick={() => setFiltroTipo('todos')} className={`px-4 py-1.5 rounded-lg text-sm transition ${filtroTipo === 'todos' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>Todos</button>
              <button onClick={() => setFiltroTipo('producto')} className={`px-4 py-1.5 rounded-lg text-sm transition ${filtroTipo === 'producto' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>Productos</button>
              <button onClick={() => setFiltroTipo('servicio')} className={`px-4 py-1.5 rounded-lg text-sm transition ${filtroTipo === 'servicio' ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}>Servicios</button>
            </div>
          </div>

          {/* ===== TABLA ===== */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-ink-500">
                    <th className="font-600 px-5 py-3">Ítem</th>
                    <th className="font-600 px-5 py-3">Tipo</th>
                    <th className="font-600 px-5 py-3">Precio</th>
                    <th className="font-600 px-5 py-3">Disponibilidad</th>
                    <th className="font-600 px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsFiltrados.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3.5">
                        <p className="font-600 text-ink-900">{item.nombre}</p>
                        {item.descripcion && <p className="text-xs text-ink-400 mt-0.5">{item.descripcion}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${item.tipo === 'producto' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {item.tipo === 'producto' ? 'Producto' : 'Servicio'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-600 text-ink-900">
                        {formatearPrecio(item)}
                      </td>
                      <td className="px-5 py-3.5">
                        {item.disponible ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-500 text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Disponible</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-500 text-ink-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>No disponible</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditar(item)} disabled={nivelPermiso !== 'escritura'} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Editar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                          <button onClick={() => handleDelete(item.id)} disabled={nivelPermiso !== 'escritura'} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Eliminar"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {itemsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-ink-500 text-sm">
                        No hay ítems que coincidan con este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           POPUP · Añadir / Editar ítem
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          {/* fondo oscuro */}
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          {/* caja del popup */}
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                {/* Cabecera */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar ítem' : 'Añadir ítem'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                {/* Formulario */}
                <div className="flex-1 min-h-0 px-6 py-5 space-y-4 overflow-y-auto">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre del ítem</label>
                    <input type="text" required placeholder="Ej. Torta de chocolate"
                      value={formData.nombre}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                    />
                  </div>
        
                  {/* Tipo: producto / servicio */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo</label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${formData.tipo === 'producto' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="tipo" value="producto" checked={formData.tipo === 'producto'} onChange={() => setFormData({...formData, tipo: 'producto'})} className="w-4 h-4 text-brand-600 focus:ring-brand-400" />
                        <span className="text-sm font-500 text-ink-800">Producto</span>
                      </label>
                      <label className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition ${formData.tipo === 'servicio' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="tipo" value="servicio" checked={formData.tipo === 'servicio'} onChange={() => setFormData({...formData, tipo: 'servicio'})} className="w-4 h-4 text-brand-600 focus:ring-brand-400" />
                        <span className="text-sm font-500 text-ink-800">Servicio</span>
                      </label>
                    </div>
                  </div>
        
                  {/* Tipo de precio: exacto / desde / a consultar */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo de precio</label>
                    <div className="grid grid-cols-3 gap-2">
                      <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition ${formData.precio_tipo === 'exacto' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="precio_tipo" value="exacto" checked={formData.precio_tipo === 'exacto'} onChange={() => setFormData({...formData, precio_tipo: 'exacto'})} className="peer sr-only" />
                        <span className="text-xs font-500 text-ink-800">Exacto</span>
                      </label>
                      <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition ${formData.precio_tipo === 'desde' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="precio_tipo" value="desde" checked={formData.precio_tipo === 'desde'} onChange={() => setFormData({...formData, precio_tipo: 'desde'})} className="peer sr-only" />
                        <span className="text-xs font-500 text-ink-800">Desde</span>
                      </label>
                      <label className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition ${formData.precio_tipo === 'consultar' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="precio_tipo" value="consultar" checked={formData.precio_tipo === 'consultar'} onChange={() => setFormData({...formData, precio_tipo: 'consultar'})} className="peer sr-only" />
                        <span className="text-xs font-500 text-ink-800">A consultar</span>
                      </label>
                    </div>
                    <p className="text-xs text-ink-400 mt-1.5">
                      {formData.precio_tipo === 'exacto' && 'Precio fijo del ítem.'}
                      {formData.precio_tipo === 'desde' && 'Se mostrará como "Desde X". Útil para servicios con precio variable.'}
                      {formData.precio_tipo === 'consultar' && 'No se muestra precio. Se indica "A consultar" al cliente.'}
                    </p>
                  </div>
        
                  {/* Precio + moneda */}
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Precio</label>
                      <input type="number" step="0.01" min="0" placeholder="0.00"
                        required={formData.precio_tipo !== 'consultar'}
                        disabled={formData.precio_tipo === 'consultar'}
                        value={formData.precio_tipo === 'consultar' ? '' : (formData.precio || '')}
                        onChange={e => setFormData({...formData, precio: parseFloat(e.target.value) || null})}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400 disabled:border-slate-200" 
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Moneda</label>
                      <select 
                        disabled={formData.precio_tipo === 'consultar'}
                        value={formData.precio_tipo === 'consultar' ? 'USD' : formData.moneda}
                        onChange={e => setFormData({...formData, moneda: e.target.value})}
                        className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400 disabled:border-slate-200">
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="VES">VES</option>
                      </select>
                    </div>
                  </div>
        
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción</label>
                    <textarea rows={3} placeholder="Describe el ítem para que la IA lo use al responder..."
                      value={formData.descripcion || ''}
                      onChange={e => setFormData({...formData, descripcion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                  </div>
        
                  {/* Disponibilidad */}
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-700">Disponible</span>
                    <input type="checkbox" 
                      checked={formData.disponible} 
                      onChange={e => setFormData({...formData, disponible: e.target.checked})}
                      className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400" 
                    />
                  </label>
                </div>
        
                {/* Pie con botones */}
                <div className="flex justify-end gap-3 px-6 pt-5 pb-6 border-t border-slate-100 shrink-0">
                  <button type="button" disabled={saving} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:bg-brand-400">
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Guardando...
                      </>
                    ) : 'Guardar ítem'}
                  </button>
                </div>
              </form>
        
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
