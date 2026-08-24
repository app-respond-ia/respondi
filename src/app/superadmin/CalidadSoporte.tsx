'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { getCalidadSoporte } from '@/app/actions/superadmin'

type DataPoint = {
  fecha: string
  timestamp: number
  mediaVendedores: number | null
  mediaClientes: number | null
}

type Resumen = {
  vendedores: {
    abiertosEnRango: number
    cerradosEnRango: number
    tiempoMedioResolucionHoras: number
    valoracionMedia: number
  }
  clientes: {
    abiertosEnRango: number
    cerradosEnRango: number
    tiempoMedioResolucionHoras: number
    valoracionMedia: number
  }
}

export default function CalidadSoporte({
  initialData,
  superadmins,
  from,
  to
}: {
  initialData: { grafico: DataPoint[], resumen: Resumen }
  superadmins: any[]
  from?: string
  to?: string
}) {
  const [data, setData] = useState(initialData)
  const [superadminId, setSuperadminId] = useState('todos')
  const [loading, setLoading] = useState(false)
  const [visibleLines, setVisibleLines] = useState({
    mediaVendedores: true,
    mediaClientes: true
  })

  // Refetch when superadmin filter changes
  useEffect(() => {
    // If it's the initial load with 'todos', we already have initialData
    if (superadminId === 'todos' && !loading) {
       // but we might need to refetch if from/to changes, though page.tsx already passes updated initialData.
       // However, page.tsx re-renders this component with new initialData when searchParams change.
       // We should sync state with initialData if from/to changes.
       setData(initialData)
       return
    }

    const fetchData = async () => {
      setLoading(true)
      const res = await getCalidadSoporte(from, to, superadminId)
      if (res.success && res.data) {
        setData(res.data)
      }
      setLoading(false)
    }
    fetchData()
  }, [superadminId, from, to, initialData])

  const handleLegendClick = (e: any) => {
    const key = e.dataKey
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key as keyof typeof visibleLines] }))
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-xl text-sm">
          <p className="font-600 text-ink-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-ink-600">{entry.name}</span>
              </div>
              <span className="font-600 text-ink-900">
                {entry.value !== null ? entry.value.toFixed(1) + ' / 5.0' : 'S/D'}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="mb-6 relative">
      {/* Gráfico */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
            <span className="text-brand-600 font-600">Cargando...</span>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="font-display font-600 text-base text-ink-900">Calidad de Soporte</h2>
            <p className="text-sm text-ink-500 mt-0.5">Valoración media de los tickets (1 a 5 estrellas).</p>
          </div>
          <div>
            <select 
              value={superadminId}
              onChange={(e) => setSuperadminId(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-500 transition text-sm text-ink-700 min-w-[200px]"
            >
              <option value="todos">Todos los superadmins</option>
              {superadmins.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        
        {(!data.grafico || data.grafico.length === 0) ? (
          <div className="flex items-center justify-center text-ink-500 h-[300px]">
            No hay datos disponibles en este rango.
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
                  domain={[0, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                />
                
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  onClick={handleLegendClick} 
                  wrapperStyle={{ paddingTop: '10px', cursor: 'pointer' }}
                  iconType="circle"
                />
                
                <Line 
                  connectNulls={false}
                  type="monotone" 
                  dataKey="mediaVendedores" 
                  name="Soporte a Vendedores"
                  stroke="#8B5CF6" // Purple
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 0, fill: '#8B5CF6' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  hide={!visibleLines.mediaVendedores}
                />
                <Line 
                  connectNulls={false}
                  type="monotone" 
                  dataKey="mediaClientes" 
                  name="Soporte a Clientes"
                  stroke="#F59E0B" // Amber
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 0, fill: '#F59E0B' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  hide={!visibleLines.mediaClientes}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* KPI Vendedores */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-600 text-ink-900 mb-4 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            Soporte a Vendedores
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-500 mb-1">Tickets (Abiertos / Cerrados)</p>
              <p className="font-display font-600 text-xl text-ink-900">
                {data.resumen.vendedores.abiertosEnRango} <span className="text-sm text-ink-400 font-400">/ {data.resumen.vendedores.cerradosEnRango}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-500 mb-1">Valoración Media</p>
              <p className="font-display font-600 text-xl text-ink-900">
                {data.resumen.vendedores.valoracionMedia > 0 ? data.resumen.vendedores.valoracionMedia.toFixed(1) : '-'} <span className="text-sm text-ink-400 font-400">/ 5.0</span>
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-ink-500 mb-1">Tiempo Medio Resolución</p>
              <p className="font-display font-600 text-base text-ink-900">
                {data.resumen.vendedores.tiempoMedioResolucionHoras > 0 ? `${data.resumen.vendedores.tiempoMedioResolucionHoras} horas` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* KPI Clientes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-600 text-ink-900 mb-4 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            Soporte a Clientes
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-500 mb-1">Tickets (Abiertos / Cerrados)</p>
              <p className="font-display font-600 text-xl text-ink-900">
                {data.resumen.clientes.abiertosEnRango} <span className="text-sm text-ink-400 font-400">/ {data.resumen.clientes.cerradosEnRango}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-500 mb-1">Valoración Media</p>
              <p className="font-display font-600 text-xl text-ink-900">
                {data.resumen.clientes.valoracionMedia > 0 ? data.resumen.clientes.valoracionMedia.toFixed(1) : '-'} <span className="text-sm text-ink-400 font-400">/ 5.0</span>
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-ink-500 mb-1">Tiempo Medio Resolución</p>
              <p className="font-display font-600 text-base text-ink-900">
                {data.resumen.clientes.tiempoMedioResolucionHoras > 0 ? `${data.resumen.clientes.tiempoMedioResolucionHoras} horas` : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
