'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Loading from '@/components/Loading'
import { useToast } from '@/components/ui/Toast'
import VendedorModal from '@/components/vendedores/VendedorModal'
import { 
  getVendedorDetalle, 
  getClientesDeVendedor, 
  getComisionesDeVendedor 
} from '@/app/actions/superadmin'

export default function VendedorDetallePage() {
  const { id } = useParams()
  const router = useRouter()
  const { showToast } = useToast()

  const [vendedor, setVendedor] = useState<any>(null)
  const [clientes, setClientes] = useState<any[]>([])
  const [comisiones, setComisiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [activeTab, setActiveTab] = useState<'clientes' | 'comisiones'>('clientes')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [resVend, resCli, resCom] = await Promise.all([
      getVendedorDetalle(id as string),
      getClientesDeVendedor(id as string),
      getComisionesDeVendedor(id as string)
    ])

    if (!resVend.success || !resVend.vendedor) {
      showToast('Vendedor no encontrado', 'error')
      router.push('/superadmin/vendedores')
      return
    }

    setVendedor(resVend.vendedor)
    if (resCli.success && resCli.clientes) setClientes(resCli.clientes)
    if (resCom.success && resCom.comisiones) setComisiones(resCom.comisiones)

    setLoading(false)
  }, [id, router, showToast])

  useEffect(() => {
    cargar()
  }, [cargar])

  const formatFecha = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // --- Renderizado de Clientes ---
  const renderClientes = () => {
    const totalClientes = clientes.length
    const clientesActivos = clientes.filter(c => c.estado_seguimiento === 'activo').length
    const clientesTrial = clientes.filter(c => c.estado_seguimiento === 'trial').length

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-ink-500 mb-1">Total Clientes</p>
            <p className="font-display font-700 text-2xl text-ink-900">{totalClientes}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-ink-500 mb-1">En Trial</p>
            <p className="font-display font-700 text-2xl text-amber-600">{clientesTrial}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-ink-500 mb-1">Activos</p>
            <p className="font-display font-700 text-2xl text-emerald-600">{clientesActivos}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          {clientes.length === 0 ? (
            <div className="p-8 text-center text-ink-500">Este vendedor aún no ha referido a ningún cliente.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Organización</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Plan</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Vinculado desde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientes.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3.5">
                        <p className="font-600 text-ink-900">{c.organizaciones?.nombre}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-ink-700 bg-slate-100 px-2 py-1 rounded-md">
                          {c.organizaciones?.plans?.nombre || 'Sin plan'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize 
                          ${c.estado_seguimiento === 'activo' ? 'bg-emerald-100 text-emerald-700' : 
                            c.estado_seguimiento === 'trial' ? 'bg-amber-100 text-amber-700' : 
                            c.estado_seguimiento === 'en_riesgo' ? 'bg-red-100 text-red-700' : 
                            'bg-slate-100 text-slate-700'}`}>
                          {c.estado_seguimiento}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-ink-500">{formatFecha(c.fecha_vinculacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Renderizado de Comisiones ---
  const renderComisiones = () => {
    const totalPendiente = comisiones.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0)
    const totalAprobado = comisiones.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0)
    const totalPagado = comisiones.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0)

    const getEstadoBadge = (estado: string) => {
      if (estado === 'pendiente') return 'bg-amber-100 text-amber-700'
      if (estado === 'aprobada') return 'bg-blue-100 text-blue-700'
      if (estado === 'pagada') return 'bg-emerald-100 text-emerald-700'
      return 'bg-slate-100 text-slate-600'
    }
  
    const getTipoBadge = (tipo: string) => {
      if (tipo === 'conversion') return 'bg-purple-100 text-purple-700'
      if (tipo === 'manual') return 'bg-orange-100 text-orange-700'
      return 'bg-cyan-100 text-cyan-700'
    }

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-ink-500 mb-1">Pendiente</p>
            <p className="font-display font-700 text-2xl text-amber-600">{totalPendiente.toFixed(2)} €</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-ink-500 mb-1">Aprobado (por pagar)</p>
            <p className="font-display font-700 text-2xl text-blue-600">{totalAprobado.toFixed(2)} €</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm text-ink-500 mb-1">Pagado</p>
            <p className="font-display font-700 text-2xl text-emerald-600">{totalPagado.toFixed(2)} €</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          {comisiones.length === 0 ? (
            <div className="p-8 text-center text-ink-500">No hay historial de comisiones.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Importe</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-3 text-xs font-600 text-ink-500 uppercase tracking-wider">Fecha Generada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comisiones.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 transition text-sm">
                      <td className="px-5 py-3.5 font-500 text-ink-900">{c.organizaciones?.nombre || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getTipoBadge(c.tipo)}`}>
                          {c.tipo === 'conversion' ? 'Conversión' : c.tipo === 'manual' ? 'Manual' : 'MRR'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-600 text-ink-900">{Number(c.importe).toFixed(2)} {c.moneda}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getEstadoBadge(c.estado)}`}>
                          {c.estado}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-ink-500">{formatFecha(c.fecha_generacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) return <Loading />
  if (!vendedor) return null

  return (
    <>
      {/* Header con botón atrás */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/superadmin/vendedores" className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-ink-900 hover:bg-slate-50 transition bg-white shadow-sm shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </Link>
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">
            {vendedor.nombre}
          </h1>
          <p className="text-ink-500 mt-1 flex items-center gap-2">
            Detalle de Vendedor
            {!vendedor.activo && (
              <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider">Inactivo</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        {/* Columna Principal: Tabs (Clientes / Comisiones) */}
        <div className="flex-1 w-full min-w-0">
          <div className="flex border-b border-slate-200 mb-6 gap-6">
            <button
              onClick={() => setActiveTab('clientes')}
              className={`pb-3 text-sm font-600 border-b-2 transition ${activeTab === 'clientes' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Clientes Referidos ({clientes.length})
            </button>
            <button
              onClick={() => setActiveTab('comisiones')}
              className={`pb-3 text-sm font-600 border-b-2 transition ${activeTab === 'comisiones' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Historial de Comisiones ({comisiones.length})
            </button>
          </div>

          {activeTab === 'clientes' ? renderClientes() : renderComisiones()}
        </div>

        {/* Panel Lateral Sticky: Ficha del vendedor */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-sm sticky top-0">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-700 text-lg text-ink-900">Ficha del Vendedor</h3>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="text-xs font-600 text-brand-600 hover:text-brand-700 flex items-center gap-1 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Editar
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-ink-400 font-500 mb-1 text-xs uppercase tracking-wide">Email</p>
                <p className="font-500 text-ink-900 break-all">{vendedor.email}</p>
              </div>
              
              <div>
                <p className="text-ink-400 font-500 mb-1 text-xs uppercase tracking-wide">Comisiones Base</p>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-md font-600 text-xs border border-purple-100">Conv. {vendedor.comision_conversion_pct}%</span>
                  <span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-md font-600 text-xs border border-cyan-100">MRR {vendedor.comision_mrr_pct}%</span>
                </div>
              </div>

              <div>
                <p className="text-ink-400 font-500 mb-1 text-xs uppercase tracking-wide">Datos de Facturación</p>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                  <p><span className="font-500">Teléfono:</span> {vendedor.telefono || '—'}</p>
                  <p><span className="font-500">DNI/NIF:</span> {vendedor.dni_nif || '—'}</p>
                  {vendedor.direccion ? (
                    <p className="text-ink-600 mt-2 text-xs">
                      {vendedor.direccion.calle} <br/>
                      {vendedor.direccion.codigo_postal} {vendedor.direccion.ciudad} <br/>
                      {vendedor.direccion.pais}
                    </p>
                  ) : (
                    <p className="text-ink-400 italic text-xs mt-2">Sin dirección registrada</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <VendedorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode="editar"
        vendedor={vendedor}
        onSuccess={cargar}
      />
    </>
  )
}
