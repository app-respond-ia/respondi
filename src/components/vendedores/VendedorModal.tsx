'use client'

import { useState, useEffect } from 'react'
import { crearVendedor, actualizarVendedor, añadirNotaVendedor } from '@/app/actions/superadmin'
import { useToast } from '@/components/ui/Toast'

interface VendedorModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'crear' | 'editar'
  vendedor: any
  onSuccess: () => void
}

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

export default function VendedorModal({ isOpen, onClose, mode, vendedor, onSuccess }: VendedorModalProps) {
  const { showToast } = useToast()
  
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(defaultForm)
  
  const [nuevaNota, setNuevaNota] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [notasLocales, setNotasLocales] = useState<any[]>([])

  useEffect(() => {
    if (isOpen) {
      if (mode === 'editar' && vendedor) {
        setFormData({
          nombre: vendedor.nombre || '',
          email: vendedor.email || '',
          comision_conversion_pct: vendedor.comision_conversion_pct || 10,
          comision_mrr_pct: vendedor.comision_mrr_pct || 5,
          activo: vendedor.activo ?? true,
          telefono: vendedor.telefono || '',
          dni_nif: vendedor.dni_nif || '',
          direccion: vendedor.direccion || defaultForm.direccion
        })
        setNotasLocales(vendedor.vendedor_notas || [])
      } else {
        setFormData({ ...defaultForm })
        setNotasLocales([])
      }
      setNuevaNota('')
    }
  }, [isOpen, mode, vendedor])

  if (!isOpen) return null

  const handleGuardar = async () => {
    if (!formData.nombre || !formData.email) {
      showToast('Nombre y email son obligatorios', 'error')
      return
    }
    if (mode === 'editar' && formData.activo === false) {
      if (!confirm(`¿Seguro que quieres desactivar al vendedor "${formData.nombre}"? Perderá acceso al panel.`)) {
        return
      }
    }
    
    setSaving(true)
    let res
    if (mode === 'crear') {
      res = await crearVendedor(formData)
    } else {
      res = await actualizarVendedor(vendedor.id, formData)
    }
    
    if (res.success) {
      showToast(mode === 'crear' ? 'Vendedor creado y email de acceso enviado ✓' : 'Vendedor actualizado ✓', 'success')
      onSuccess()
      onClose()
    } else {
      showToast(res.error || 'Error al guardar', 'error')
    }
    setSaving(false)
  }

  const handleAñadirNota = async () => {
    if (!vendedor || !nuevaNota.trim()) return
    setSavingNota(true)
    const res = await añadirNotaVendedor(vendedor.id, nuevaNota)
    if (res.success) {
      showToast('Nota añadida', 'success')
      setNuevaNota('')
      setNotasLocales([res.nota, ...notasLocales])
      onSuccess() // Reload background data
    } else {
      showToast(res.error || 'Error al añadir nota', 'error')
    }
    setSavingNota(false)
  }

  const formatFecha = (d: string) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && onClose()}></div>
      <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <h2 className="font-display font-700 text-lg text-ink-900">
              {mode === 'crear' ? 'Nuevo vendedor' : 'Editar vendedor'}
            </h2>
            <button onClick={() => !saving && onClose()} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition">
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
                    Email {mode === 'editar' && <span className="text-ink-400 font-400">· no editable</span>}
                  </label>
                  <input type="email" placeholder="vendedor@ejemplo.com" value={formData.email}
                    disabled={mode === 'editar'}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400" />
                  {mode === 'crear' && (
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

                {mode === 'editar' && (
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
              {mode === 'editar' && vendedor && (
                <div className="space-y-4 flex flex-col h-full bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h3 className="font-600 text-ink-900 text-sm">Historial de Notas Internas</h3>
                  
                  <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                    {notasLocales.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">No hay notas para este vendedor.</p>
                    ) : (
                      notasLocales.map((n: any) => (
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
              {mode === 'crear' && (
                <div className="space-y-4 flex flex-col h-full bg-slate-50 p-4 rounded-xl border border-slate-200 justify-center items-center text-center">
                  <svg className="w-12 h-12 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  <h3 className="font-500 text-slate-500 text-sm">Historial de notas no disponible</h3>
                  <p className="text-xs text-slate-400">Podrás añadir notas internas una vez creado el vendedor.</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-white rounded-b-2xl">
            <button onClick={() => onClose()} disabled={saving}
              className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={saving}
              className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
              {saving ? 'Guardando...' : mode === 'crear' ? 'Crear y enviar invitación' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
