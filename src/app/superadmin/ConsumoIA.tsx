'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getConsumoIA } from '@/app/actions/superadmin'

type DataPoint = {
  fecha: string
  timestamp: number
  coste_usd: number
}

type Resumen = {
  tokens_totales: number
  costo_total_usd: number
  costo_medio_mensaje_usd: number
}

type TopOrg = {
  nombre: string
  tokens_totales: number
  costo_usd: number
}

type Modelo = {
  modelo_ia: string
  porcentaje_tokens: number
  costo_usd: number
}

export default function ConsumoIA({
  initialData,
  from,
  to
}: {
  initialData: {
    grafico: DataPoint[]
    resumen: Resumen
    top_organizaciones: TopOrg[]
    desglose_modelos: Modelo[]
  }
  from?: string
  to?: string
}) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If it's the first mount with same searchParams, we have initialData already
    // but in case from/to changes, page.tsx will provide new initialData.
    setData(initialData)
  }, [initialData, from, to])

  const formatUSD = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3 }).format(val)
  }

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('es-ES').format(val)
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-xl text-sm">
          <p className="font-600 text-ink-900 mb-2">{label}</p>
          <div className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span className="text-ink-600">Coste (USD)</span>
            </div>
            <span className="font-600 text-ink-900">
              {formatUSD(payload[0].value)}
            </span>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="mb-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
        <div>
          <h2 className="font-display font-600 text-lg text-ink-900">Consumo y Costes de IA</h2>
          <p className="text-sm text-ink-500 mt-0.5">Evolución del gasto y desglose por modelo y organización.</p>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-ink-500 mb-1">Tokens Totales</p>
          <p className="font-display font-600 text-2xl text-ink-900">
            {formatNumber(data.resumen.tokens_totales)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-ink-500 mb-1">Coste Total (USD)</p>
          <p className="font-display font-600 text-2xl text-ink-900">
            {formatUSD(data.resumen.costo_total_usd)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-ink-500 mb-1">Coste Medio por Mensaje</p>
          <p className="font-display font-600 text-2xl text-ink-900">
            {formatUSD(data.resumen.costo_medio_mensaje_usd)}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 relative">
        <h3 className="font-600 text-ink-900 mb-6">Evolución de Costes (USD)</h3>
        {data.resumen.costo_total_usd === 0 ? (
          <div className="flex flex-col items-center justify-center text-ink-500 h-[300px] bg-slate-50 rounded-xl border border-slate-100">
            <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p>Aún no hay datos de consumo en este periodo.</p>
          </div>
        ) : (
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.grafico}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis 
                  dataKey="fecha" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748B' }}
                  tickFormatter={(val) => '$' + val.toFixed(2)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="coste_usd" 
                  name="Coste USD"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 0, fill: '#3B82F6' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Organizaciones */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-hidden flex flex-col">
          <h3 className="font-600 text-ink-900 mb-4">Top 10 Organizaciones (Consumo)</h3>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 text-ink-500">
                  <th className="pb-3 font-500 pl-2">Organización</th>
                  <th className="pb-3 font-500 px-3 text-right">Tokens Totales</th>
                  <th className="pb-3 font-500 pr-2 text-right">Coste USD</th>
                </tr>
              </thead>
              <tbody>
                {data.top_organizaciones.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-ink-400">
                      No se han registrado consumos en este rango temporal.
                    </td>
                  </tr>
                ) : (
                  data.top_organizaciones.map((org, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                      <td className="py-3 pl-2 font-500 text-ink-900">{org.nombre}</td>
                      <td className="py-3 px-3 text-right text-ink-600">{formatNumber(org.tokens_totales)}</td>
                      <td className="py-3 pr-2 text-right font-500 text-ink-900">{formatUSD(org.costo_usd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Desglose de Modelos */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-hidden flex flex-col">
          <h3 className="font-600 text-ink-900 mb-4">Desglose por Modelo</h3>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 text-ink-500">
                  <th className="pb-3 font-500 pl-2">Modelo de IA</th>
                  <th className="pb-3 font-500 px-3 text-right">% Uso (Tokens)</th>
                  <th className="pb-3 font-500 pr-2 text-right">Coste USD</th>
                </tr>
              </thead>
              <tbody>
                {data.desglose_modelos.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-ink-400">
                      No se han registrado consumos en este rango temporal.
                    </td>
                  </tr>
                ) : (
                  data.desglose_modelos.map((mod, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
                      <td className="py-3 pl-2 font-500 text-ink-900">
                        <span className="inline-block px-2 py-1 bg-brand-50 text-brand-700 rounded text-xs">
                          {mod.modelo_ia}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-ink-600">{mod.porcentaje_tokens.toFixed(1)}%</td>
                      <td className="py-3 pr-2 text-right font-500 text-ink-900">{formatUSD(mod.costo_usd)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
