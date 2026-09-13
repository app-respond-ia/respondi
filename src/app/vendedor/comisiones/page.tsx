'use client'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'

import { useState, useEffect } from 'react'
import { getVendedorComisiones } from '@/app/actions/vendedor'

export default function VendedorComisionesPage() {
  const [comisiones, setComisiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filtros (el estado lo llevan las pestañas de la tabla)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  useEffect(() => {
    const cargar = async () => {
      const res = await getVendedorComisiones()
      if (res.success && res.comisiones) setComisiones(res.comisiones)
      setLoading(false)
    }
    cargar()
  }, [])

  const getEstadoBadge = (estado: string) => {
    if (estado === 'pendiente') return 'bg-amber-100 text-amber-700'
    if (estado === 'aprobada') return 'bg-blue-100 text-blue-700'
    if (estado === 'pagada') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-600'
  }

  const etiquetaEstado = (estado: string) => estado === 'pendiente' ? 'Por aprobar' : estado === 'aprobada' ? 'Por cobrar' : 'Cobrada'

  const getTipoBadge = (tipo: string) => {
    if (tipo === 'conversion') return 'bg-purple-100 text-purple-700'
    return 'bg-cyan-100 text-cyan-700'
  }

  const formatFecha = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const clientesUnicos = Array.from(new Set(comisiones.map(c => c.organizaciones?.nombre).filter(Boolean)))

  const comisionesFiltradas = comisiones.filter(c => {
    if (filtroCliente && c.organizaciones?.nombre !== filtroCliente) return false
    if (filtroTipo && c.tipo !== filtroTipo) return false
    
    if (fechaInicio || fechaFin) {
      const fechaGen = new Date(c.fecha_generacion).getTime()
      if (fechaInicio) {
        const fInicio = new Date(fechaInicio).getTime()
        if (fechaGen < fInicio) return false
      }
      if (fechaFin) {
        const fFin = new Date(fechaFin + 'T23:59:59').getTime()
        if (fechaGen > fFin) return false
      }
    }
    return true
  })

  const totalPendiente = comisionesFiltradas.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalAprobado = comisionesFiltradas.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalPagado = comisionesFiltradas.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0)

  const hasFilters = filtroCliente !== '' || filtroTipo !== '' || fechaInicio !== '' || fechaFin !== ''

  const limpiarFiltros = () => {
    setFiltroCliente('')
    setFiltroTipo('')
    setFechaInicio('')
    setFechaFin('')
  }

  return (
    <div className={`${PAGINA} space-y-6`}>
      <div>
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Mis comisiones</h1>
        <p className="text-ink-500 mt-1">Historial completo de tus comisiones.</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-amber-200 p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <p className="text-sm text-ink-500">Por aprobar</p>
          </div>
          <p className="font-display font-700 text-2xl text-amber-600">{totalPendiente.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-2xl border border-blue-200 p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <p className="text-sm text-ink-500">Por cobrar</p>
          </div>
          <p className="font-display font-700 text-2xl text-blue-600">{totalAprobado.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <p className="text-sm text-ink-500">Cobrado</p>
          </div>
          <p className="font-display font-700 text-2xl text-emerald-600">{totalPagado.toFixed(2)} €</p>
        </div>
      </div>

      {/* Lista */}
      <Tabla
        filas={comisionesFiltradas}
        idDe={c => c.id}
        cargando={loading}
        nombre={['comisión', 'comisiones']}
        buscar={{ placeholder: 'Buscar por cliente o nota…', en: c => `${c.organizaciones?.nombre || ''} ${c.notas_pago || ''}` }}
        pestanas={[
          { id: 'todas', etiqueta: 'Todas' },
          { id: 'pendiente', etiqueta: 'Por aprobar', filtro: c => c.estado === 'pendiente' },
          { id: 'aprobada', etiqueta: 'Por cobrar', filtro: c => c.estado === 'aprobada' },
          { id: 'pagada', etiqueta: 'Cobradas', filtro: c => c.estado === 'pagada' }
        ]}
        herramientas={
          <>
            <select 
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              aria-label="Cliente"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition"
            >
              <option value="">Todos los clientes</option>
              {clientesUnicos.map((cliente: any) => (
                <option key={cliente} value={cliente}>{cliente}</option>
              ))}
            </select>
            <select 
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              aria-label="Tipo"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition"
            >
              <option value="">Todos los tipos</option>
              <option value="conversion">Conversión</option>
              <option value="mrr">MRR</option>
            </select>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                max={fechaFin || undefined}
                aria-label="Desde"
                className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition"
              />
              <span className="text-ink-400 text-sm">–</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                min={fechaInicio || undefined}
                aria-label="Hasta"
                className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition"
              />
            </div>
            {hasFilters && (
              <button
                onClick={limpiarFiltros}
                className="h-10 px-3 text-sm text-ink-500 hover:text-ink-700 font-500 transition underline underline-offset-2"
              >
                Limpiar filtros
              </button>
            )}
          </>
        }
        ordenInicial={{ clave: 'generada', direccion: 'desc' }}
        columnas={[
          { clave: 'cliente', titulo: 'Cliente', enMovil: 'titulo', valor: c => c.organizaciones?.nombre || '', render: c => <span className="font-600 text-ink-900">{c.organizaciones?.nombre || '—'}</span> },
          { clave: 'tipo', titulo: 'Tipo', valor: c => (c.tipo === 'conversion' ? 'Conversión' : 'MRR'), render: c => <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getTipoBadge(c.tipo)}`}>{c.tipo === 'conversion' ? 'Conversión' : 'MRR'}</span> },
          { clave: 'estado', titulo: 'Estado', valor: c => etiquetaEstado(c.estado), render: c => <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getEstadoBadge(c.estado)}`}>{etiquetaEstado(c.estado)}</span> },
          { clave: 'generada', titulo: 'Generada', valor: c => c.fecha_generacion || '', render: c => <span className="text-ink-500 whitespace-nowrap">{formatFecha(c.fecha_generacion)}</span> },
          { clave: 'pagada', titulo: 'Pagada', valor: c => (c.estado === 'pagada' ? c.fecha_pago || '' : ''), render: c => <span className="text-ink-500 whitespace-nowrap">{c.estado === 'pagada' && c.fecha_pago ? formatFecha(c.fecha_pago) : '—'}</span> },
          { clave: 'notas', titulo: 'Notas', valor: c => c.notas_pago || '', clase: 'max-w-xs', render: c => <span className="text-ink-500 text-xs line-clamp-2" title={c.notas_pago || ''}>{c.notas_pago || '—'}</span> },
          { clave: 'importe', titulo: 'Importe', alinear: 'derecha', valor: c => Number(c.importe || 0), render: c => <span className="font-display font-700 text-ink-900 whitespace-nowrap tabular-nums">{Number(c.importe).toFixed(2)} {c.moneda}</span> }
        ]}
        vacio={<p className="text-ink-500">No hay comisiones con estos filtros.</p>}
      />
    </div>
  )
}
