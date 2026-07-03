'use client'

import { useState, useEffect } from 'react'
import { getVendedorDashboard } from '@/app/actions/superadmin'

export default function VendedorDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      const res = await getVendedorDashboard()
      if (res.success) setData(res.data)
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <div className="py-20 text-center text-ink-500">Cargando...</div>
  if (!data) return <div className="py-20 text-center text-red-500">Error al cargar el dashboard.</div>

  const { vendedor, totalClientes, clientesActivos, clientesTrial, mrrCartera, comisionesPendientes, comisionesAprobadas, comisionesPagadas } = data

  return (
    <div className="space-y-8">
      {/* Bienvenida */}
      <div>
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">
          Hola, {vendedor.nombre.split(' ')[0]} 👋
        </h1>
        <p className="text-ink-500 mt-1">Aquí tienes el resumen de tu cartera y comisiones.</p>
      </div>

      {/* Métricas de cartera */}
      <div>
        <h2 className="font-600 text-sm text-ink-500 uppercase tracking-wide mb-3">Tu cartera</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-ink-500 mb-1">Total clientes</p>
            <p className="font-display font-700 text-3xl text-ink-900">{totalClientes}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-ink-500 mb-1">Activos</p>
            <p className="font-display font-700 text-3xl text-emerald-600">{clientesActivos}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-ink-500 mb-1">En trial</p>
            <p className="font-display font-700 text-3xl text-amber-600">{clientesTrial}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-ink-500 mb-1">MRR cartera</p>
            <p className="font-display font-700 text-3xl text-ink-900">{mrrCartera.toFixed(0)}€</p>
          </div>
        </div>
      </div>

      {/* Métricas de comisiones */}
      <div>
        <h2 className="font-600 text-sm text-ink-500 uppercase tracking-wide mb-3">Tus comisiones</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-amber-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <p className="text-sm text-ink-500">Pendiente de aprobar</p>
            </div>
            <p className="font-display font-700 text-2xl text-amber-600">{comisionesPendientes.toFixed(2)} €</p>
          </div>
          <div className="bg-white rounded-2xl border border-blue-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <p className="text-sm text-ink-500">Aprobado, por cobrar</p>
            </div>
            <p className="font-display font-700 text-2xl text-blue-600">{comisionesAprobadas.toFixed(2)} €</p>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <p className="text-sm text-ink-500">Total cobrado</p>
            </div>
            <p className="font-display font-700 text-2xl text-emerald-600">{comisionesPagadas.toFixed(2)} €</p>
          </div>
        </div>
      </div>

      {/* Info comisiones del vendedor */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-600 text-ink-900 mb-4">Tu estructura de comisiones</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
            <p className="text-xs font-600 text-purple-600 uppercase tracking-wide mb-1">Por conversión</p>
            <p className="font-display font-700 text-2xl text-purple-700">{vendedor.comision_conversion_pct}%</p>
            <p className="text-xs text-ink-500 mt-1">Cuando un trial convierte a pago</p>
          </div>
          <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-100">
            <p className="text-xs font-600 text-cyan-600 uppercase tracking-wide mb-1">MRR mensual</p>
            <p className="font-display font-700 text-2xl text-cyan-700">{vendedor.comision_mrr_pct}%</p>
            <p className="text-xs text-ink-500 mt-1">Cada mes que el cliente sigue activo</p>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a href="/vendedor/clientes" className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-brand-300 hover:shadow-sm transition group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center group-hover:bg-brand-100 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p className="font-600 text-ink-900">Ver mis clientes</p>
          </div>
          <p className="text-sm text-ink-500">Gestiona el seguimiento de tu cartera.</p>
        </a>
        <a href="/vendedor/nuevo-cliente" className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-brand-300 hover:shadow-sm transition group">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            </div>
            <p className="font-600 text-ink-900">Registrar nuevo cliente</p>
          </div>
          <p className="text-sm text-ink-500">Crea una cuenta trial para un cliente nuevo.</p>
        </a>
      </div>
    </div>
  )
}
