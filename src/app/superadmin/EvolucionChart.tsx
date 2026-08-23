'use client'

import { useState } from 'react'
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

interface DataPoint {
  fecha: string
  timestamp: number
  nuevasOrganizaciones: number
  bajas: number
  mrr: number
}

export default function EvolucionChart({ data }: { data: DataPoint[] }) {
  // Use state to track which lines are visible
  const [visibleLines, setVisibleLines] = useState({
    nuevasOrganizaciones: true,
    bajas: true,
    mrr: true
  })

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center text-ink-500 h-[400px]">
        No hay datos disponibles en este rango.
      </div>
    )
  }

  const handleLegendClick = (e: any) => {
    const key = e.dataKey
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key as keyof typeof visibleLines] }))
  }

  // Determine max values for scaling the secondary Y axis (Nuevas/Bajas usually lower than MRR)
  const maxNuevas = Math.max(...data.map(d => d.nuevasOrganizaciones), 1)
  const maxBajas = Math.max(...data.map(d => d.bajas), 1)
  const maxLeft = Math.max(maxNuevas, maxBajas)
  
  // Custom tooltip to format MRR nicely
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
                {entry.dataKey === 'mrr' ? `$${entry.value}` : entry.value}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
      <div className="mb-6">
        <h2 className="font-display font-600 text-base text-ink-900">Evolución de Negocio</h2>
        <p className="text-sm text-ink-500 mt-0.5">Métricas agrupadas según la duración del rango temporal.</p>
      </div>
      
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis 
              dataKey="fecha" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#64748B' }}
              dy={10}
            />
            {/* Eje izquierdo para Altas y Bajas */}
            <YAxis 
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#64748B' }}
              domain={[0, Math.ceil(maxLeft * 1.2)]}
              allowDecimals={false}
            />
            {/* Eje derecho para MRR (usd) */}
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#64748B' }}
              tickFormatter={(value) => `$${value}`}
            />
            
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              onClick={handleLegendClick} 
              wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }}
              iconType="circle"
            />
            
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="nuevasOrganizaciones" 
              name="Altas"
              stroke="#10B981" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0 }}
              hide={!visibleLines.nuevasOrganizaciones}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="bajas" 
              name="Bajas"
              stroke="#F43F5E" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0 }}
              hide={!visibleLines.bajas}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="mrr" 
              name="MRR ($)"
              stroke="#6366F1" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0 }}
              hide={!visibleLines.mrr}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
