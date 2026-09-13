'use client'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'

import { useState, useEffect } from 'react'
import { getVendedorClientes, actualizarClienteSeguimiento, getInvitacionesVendedor, reenviarInvitacionCliente, cancelarInvitacionCliente } from '@/app/actions/vendedor'
import { useToast } from '@/components/ui/Toast'
import PanelInvitaciones from '@/components/invitaciones/PanelInvitaciones'

const ESTADOS = ['trial', 'negociacion', 'activo', 'en_riesgo', 'perdido'] as const
type EstadoSeguimiento = typeof ESTADOS[number]

const ESTADO_CONFIG: Record<EstadoSeguimiento, { label: string, badge: string }> = {
  trial: { label: 'Trial', badge: 'bg-amber-100 text-amber-700' },
  negociacion: { label: 'En negociación', badge: 'bg-blue-100 text-blue-700' },
  activo: { label: 'Activo', badge: 'bg-emerald-100 text-emerald-700' },
  en_riesgo: { label: 'En riesgo', badge: 'bg-orange-100 text-orange-700' },
  perdido: { label: 'Perdido', badge: 'bg-red-100 text-red-700' },
}

export default function VendedorClientesPage() {
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCliente, setSelectedCliente] = useState<any>(null)
  const [editEstado, setEditEstado] = useState<EstadoSeguimiento>('trial')
  const [editNotas, setEditNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [invitaciones, setInvitaciones] = useState<any[]>([])
  const { showToast } = useToast()
  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const [res, resInv] = await Promise.all([getVendedorClientes(), getInvitacionesVendedor()])
    if (res.success && res.clientes) setClientes(res.clientes)
    if (resInv.success && resInv.invitaciones) setInvitaciones(resInv.invitaciones)
    setLoading(false)
  }

  const openModal = (c: any) => {
    setSelectedCliente(c)
    setEditEstado(c.estado_seguimiento)
    setEditNotas(c.notas || '')
  }

  const handleGuardar = async () => {
    if (!selectedCliente) return
    setSaving(true)
    const res = await actualizarClienteSeguimiento(selectedCliente.id, {
      estado_seguimiento: editEstado,
      notas: editNotas
    })
    if (res.success) {
      setSelectedCliente(null)
      showToast('Cliente actualizado ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al actualizar', 'error')
    }
    setSaving(false)
  }

  const formatFecha = (d: string) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
  const confDe = (c: any) => ESTADO_CONFIG[c.estado_seguimiento as EstadoSeguimiento]

  return (
    <div className={`${PAGINA} space-y-6`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Mis clientes</h1>
          <p className="text-ink-500 mt-1">Gestiona el seguimiento de tu cartera.</p>
        </div>
        <a href="/vendedor/nuevo-cliente"
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo cliente
        </a>
      </div>

      {/* Invitaciones enviadas: estado, embudo y acciones */}
      {invitaciones.length > 0 && (
        <PanelInvitaciones
          titulo="Invitaciones enviadas"
          descripcion="Aparecerán abajo como clientes en cuanto se registren."
          invitaciones={invitaciones}
          canWrite
          onReenviar={reenviarInvitacionCliente}
          onCancelar={cancelarInvitacionCliente}
          onCambio={cargar}
        />
      )}

      {/* Lista */}
      <Tabla
        filas={clientes}
        idDe={c => c.id}
        cargando={loading}
        nombre={['cliente', 'clientes']}
        buscar={{ placeholder: 'Buscar por nombre, plan o nota…', en: c => `${c.organizaciones?.nombre || ''} ${c.organizaciones?.plans?.nombre || ''} ${c.notas || ''}` }}
        pestanas={[
          { id: 'todos', etiqueta: 'Todos' },
          ...ESTADOS.map(e => ({ id: e, etiqueta: ESTADO_CONFIG[e].label, filtro: (c: any) => c.estado_seguimiento === e }))
        ]}
        ordenInicial={{ clave: 'alta', direccion: 'desc' }}
        columnas={[
          { clave: 'cliente', titulo: 'Cliente', enMovil: 'titulo', valor: c => c.organizaciones?.nombre || '', render: c => (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-600 text-sm text-slate-600 shrink-0">
                {c.organizaciones?.nombre?.substring(0, 2).toUpperCase() || '??'}
              </div>
              <p className="font-600 text-ink-900 truncate">{c.organizaciones?.nombre || 'Sin nombre'}</p>
            </div>
          ) },
          { clave: 'estado', titulo: 'Estado', valor: c => confDe(c)?.label || c.estado_seguimiento || '', render: c => {
            const conf = confDe(c)
            return conf ? <span className={`text-xs px-2 py-0.5 rounded-full font-600 whitespace-nowrap ${conf.badge}`}>{conf.label}</span> : <span className="text-ink-400">—</span>
          } },
          { clave: 'plan', titulo: 'Plan', valor: c => c.organizaciones?.plans?.nombre || '', render: c => <span className="text-ink-700">{c.organizaciones?.plans?.nombre || <span className="text-ink-400">Sin plan</span>}</span> },
          { clave: 'alta', titulo: 'Alta', valor: c => c.fecha_vinculacion || '', render: c => <span className="text-ink-500 whitespace-nowrap">{formatFecha(c.fecha_vinculacion)}</span> },
          { clave: 'notas', titulo: 'Notas', valor: c => c.notas || '', clase: 'max-w-xs', render: c => <span className="text-ink-500 text-xs line-clamp-2" title={c.notas || ''}>{c.notas || '—'}</span> }
        ]}
        acciones={c => (
          <button onClick={() => openModal(c)}
            className="px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition">
            Actualizar seguimiento
          </button>
        )}
        vacio={<p className="text-ink-500">No hay clientes con este filtro.</p>}
      />

      {/* Modal editar seguimiento */}
      {selectedCliente && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setSelectedCliente(null)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Actualizar seguimiento</h2>
                <button onClick={() => setSelectedCliente(null)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="font-600 text-ink-900">{selectedCliente.organizaciones?.nombre}</p>
                  <p className="text-sm text-ink-500">{selectedCliente.organizaciones?.plans?.nombre}</p>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-2">Estado de seguimiento</label>
                  <div className="grid grid-cols-1 gap-2">
                    {ESTADOS.map(e => (
                      <label key={e} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${editEstado === e ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input type="radio" name="estado" value={e} checked={editEstado === e} onChange={() => setEditEstado(e)} className="sr-only" />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${ESTADO_CONFIG[e].badge}`}>{ESTADO_CONFIG[e].label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Notas <span className="text-ink-400 font-400">· opcional</span></label>
                  <textarea rows={3} value={editNotas} onChange={e => setEditNotas(e.target.value)}
                    placeholder="Observaciones, próximos pasos..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setSelectedCliente(null)} disabled={saving}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
