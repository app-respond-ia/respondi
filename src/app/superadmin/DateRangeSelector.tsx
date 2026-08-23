'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export default function DateRangeSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const [preset, setPreset] = useState('30d')
  const [isCustom, setIsCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const currentPreset = searchParams.get('preset')

    if (currentPreset) {
      setPreset(currentPreset)
      setIsCustom(currentPreset === 'custom')
      if (from) setCustomFrom(from.split('T')[0])
      if (to) setCustomTo(to.split('T')[0])
    } else if (from && to) {
      setIsCustom(true)
      setPreset('custom')
      setCustomFrom(from.split('T')[0])
      setCustomTo(to.split('T')[0])
    }
  }, [searchParams])

  const applyRange = (p: string, f?: Date, t?: Date) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('preset', p)
    
    if (f && t) {
      params.set('from', f.toISOString())
      params.set('to', t.toISOString())
    } else {
      const now = new Date()
      let start = new Date()
      let end = new Date()
      
      if (p === 'hoy') {
        start.setHours(0, 0, 0, 0)
      } else if (p === '7d') {
        start.setDate(now.getDate() - 7)
      } else if (p === '30d') {
        start.setDate(now.getDate() - 30)
      } else if (p === 'mes') {
        start = new Date(now.getFullYear(), now.getMonth(), 1)
      }

      if (p !== 'custom') {
        params.set('from', start.toISOString())
        params.set('to', end.toISOString())
      }
    }
    
    router.push(pathname + '?' + params.toString())
  }

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setPreset(val)
    if (val === 'custom') {
      setIsCustom(true)
    } else {
      setIsCustom(false)
      applyRange(val)
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      const f = new Date(customFrom)
      const t = new Date(customTo)
      t.setHours(23, 59, 59, 999) // end of day
      applyRange('custom', f, t)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="relative">
        <select 
          value={preset} 
          onChange={handlePresetChange}
          className="appearance-none h-10 pl-4 pr-10 rounded-xl border border-slate-300 bg-white text-sm font-500 text-ink-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition shadow-sm"
        >
          <option value="hoy">Hoy</option>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="mes">Este mes</option>
          <option value="custom">Rango personalizado...</option>
        </select>
        <svg className="absolute right-3 top-2.5 w-5 h-5 text-ink-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
      </div>

      {isCustom && (
        <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl p-1 shadow-sm">
          <input 
            type="date" 
            value={customFrom} 
            onChange={e => setCustomFrom(e.target.value)} 
            className="h-8 px-2 text-sm text-ink-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-100 rounded-lg"
          />
          <span className="text-ink-300">-</span>
          <input 
            type="date" 
            value={customTo} 
            onChange={e => setCustomTo(e.target.value)} 
            className="h-8 px-2 text-sm text-ink-900 bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-100 rounded-lg"
          />
          <button 
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            className="h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-600 transition"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
