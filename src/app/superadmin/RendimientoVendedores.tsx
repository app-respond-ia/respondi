'use client'

import { useState } from 'react'
import Link from 'next/link'

type VendedorStats = {
  id: string
  nombre: string
  clientesCaptadosEnRango: number
  clientesHistoricos: number
  comisionesGeneradasEnRango: number
  comisionesPagadasEnRango: number
  comisionesPendientes: number
}

type SortConfig = {
  key: keyof VendedorStats
  direction: 'asc' | 'desc'
}

export default function RendimientoVendedores({ initialData }: { initialData: VendedorStats[] }) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'comisionesGeneradasEnRango', direction: 'desc' })

  if (!initialData || initialData.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center mt-6">
        <p className="text-ink-500 font-500">No hay datos de rendimiento de vendedores en este periodo.</p>
      </div>
    )
  }

  const sortedData = [...initialData].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1
    }
    return 0
  })

  const handleSort = (key: keyof VendedorStats) => {
    let direction: 'asc' | 'desc' = 'desc'
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: keyof VendedorStats) => {
    if (sortConfig.key !== key) return <span className="w-4 h-4 inline-block opacity-0 group-hover:opacity-30 transition">↕</span>
    return sortConfig.direction === 'asc' 
      ? <span className="w-4 h-4 inline-block text-brand-500">↑</span> 
      : <span className="w-4 h-4 inline-block text-brand-500">↓</span>
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mt-6">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-display font-600 text-base text-ink-900">Rendimiento de Vendedores</h2>
      </div>
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider font-600 text-ink-500">
              <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition group select-none" onClick={() => handleSort('nombre')}>
                Vendedor {getSortIcon('nombre')}
              </th>
              <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition group select-none text-right" onClick={() => handleSort('clientesCaptadosEnRango')}>
                Clientes (Rango) {getSortIcon('clientesCaptadosEnRango')}
              </th>
              <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition group select-none text-right" onClick={() => handleSort('clientesHistoricos')}>
                Clientes (Histórico) {getSortIcon('clientesHistoricos')}
              </th>
              <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition group select-none text-right" onClick={() => handleSort('comisionesGeneradasEnRango')}>
                Com. Generadas (Rango) {getSortIcon('comisionesGeneradasEnRango')}
              </th>
              <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition group select-none text-right" onClick={() => handleSort('comisionesPagadasEnRango')}>
                Com. Pagadas (Rango) {getSortIcon('comisionesPagadasEnRango')}
              </th>
              <th className="p-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition group select-none text-right" onClick={() => handleSort('comisionesPendientes')}>
                Com. Pendientes (Total) {getSortIcon('comisionesPendientes')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {sortedData.map(v => (
              <tr key={v.id} className="hover:bg-slate-50/50 transition">
                <td className="p-4 font-600 text-brand-600 hover:underline">
                  <Link href={`/superadmin/vendedores/${v.id}`}>{v.nombre}</Link>
                </td>
                <td className="p-4 text-right">
                  <span className="inline-flex items-center justify-center bg-slate-100 text-ink-700 px-2 py-0.5 rounded-full font-600 text-xs">
                    {v.clientesCaptadosEnRango}
                  </span>
                </td>
                <td className="p-4 text-right text-ink-500">
                  {v.clientesHistoricos}
                </td>
                <td className="p-4 text-right font-600 text-ink-900">
                  {formatCurrency(v.comisionesGeneradasEnRango)}
                </td>
                <td className="p-4 text-right text-emerald-600 font-500">
                  {formatCurrency(v.comisionesPagadasEnRango)}
                </td>
                <td className="p-4 text-right text-amber-600 font-500">
                  {formatCurrency(v.comisionesPendientes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
