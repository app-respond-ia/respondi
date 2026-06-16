'use client'

import { useState, useEffect } from 'react'
import { getAuditLog } from '@/app/actions/audit-log'

export default function AuditLogPage() {
  const [entradas, setEntradas] = useState<any[]>([])
  const [usuariosDisp, setUsuariosDisp] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [busqueda, setBusqueda] = useState('')
  const [filtroUser, setFiltroUser] = useState('todos')
  const [filtroTabla, setFiltroTabla] = useState('todas')

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    setLoading(true)
    const res = await getAuditLog()
    if (res.success && res.data) {
      setEntradas(res.data.entradas || [])
      setUsuariosDisp(res.data.usuarios_disponibles || [])
    } else {
      setErrorMsg(res.error || 'Error al cargar el registro de auditoría')
    }
    setLoading(false)
  }

  const getInitials = (user?: any) => {
    if (user?.nombre) return user.nombre.substring(0, 2).toUpperCase()
    if (user?.email) return user.email.substring(0, 2).toUpperCase()
    return '?'
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getDateGroup = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return 'Hoy'
    if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const getBadgeColor = (tabla: string) => {
    if (!tabla) return 'bg-slate-100 text-slate-700'
    const t = tabla.toLowerCase()
    if (t.includes('precio') || t.includes('price')) return 'bg-purple-100 text-purple-700'
    if (t.includes('skill')) return 'bg-blue-100 text-blue-700'
    if (t.includes('user')) return 'bg-orange-100 text-orange-700'
    if (t.includes('caso') || t.includes('case')) return 'bg-amber-100 text-amber-700'
    if (t.includes('novedad')) return 'bg-cyan-100 text-cyan-700'
    if (t.includes('canal') || t.includes('channel')) return 'bg-emerald-100 text-emerald-700'
    if (t.includes('regla') || t.includes('rule')) return 'bg-indigo-100 text-indigo-700'
    if (t.includes('etiqueta') || t.includes('tag')) return 'bg-pink-100 text-pink-700'
    if (t.includes('blacklist')) return 'bg-rose-100 text-rose-700'
    if (t.includes('conver')) return 'bg-purple-100 text-purple-700'
    return 'bg-slate-100 text-slate-700'
  }

  const renderDiff = (anterior: any, nuevo: any) => {
    if (anterior === undefined && nuevo === undefined) return null
    if (anterior === null && nuevo === null) return null

    const isSimple = (v: any) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

    if ((isSimple(anterior) || anterior == null) && (isSimple(nuevo) || nuevo == null)) {
      return (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {anterior != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-500 bg-red-50 text-red-600 line-through">
              {String(anterior)}
            </span>
          )}
          {anterior != null && nuevo != null && (
            <svg className="w-3.5 h-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
          )}
          {nuevo != null && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-600 bg-emerald-50 text-emerald-700">
              {String(nuevo)}
            </span>
          )}
        </div>
      )
    }

    return (
      <details className="mt-1.5 text-xs text-ink-500">
        <summary className="cursor-pointer hover:text-ink-700 font-500">Ver cambios (JSON)</summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-2 rounded border border-slate-200">
          {anterior != null && (
            <div>
              <span className="font-600 block mb-1">Anterior:</span>
              <pre className="whitespace-pre-wrap overflow-x-auto text-[10px]">{JSON.stringify(anterior, null, 2)}</pre>
            </div>
          )}
          {nuevo != null && (
            <div>
              <span className="font-600 block mb-1">Nuevo:</span>
              <pre className="whitespace-pre-wrap overflow-x-auto text-[10px]">{JSON.stringify(nuevo, null, 2)}</pre>
            </div>
          )}
        </div>
      </details>
    )
  }

  const entradasFiltradas = entradas.filter(e => {
    if (filtroUser !== 'todos' && e.user_id !== filtroUser) return false
    if (filtroTabla !== 'todas' && e.tabla_afectada !== filtroTabla) return false
    if (busqueda && !e.accion.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const agrupadas: { [key: string]: any[] } = {}
  entradasFiltradas.forEach(e => {
    const group = getDateGroup(e.timestamp)
    if (!agrupadas[group]) agrupadas[group] = []
    agrupadas[group].push(e)
  })

  return (
    <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-4xl w-full mx-auto">
      
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Registro de actividad</h1>
          <p className="text-ink-500 mt-1">Historial de cambios realizados por tu equipo.</p>
        </div>
        <button disabled title="Próximamente" className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Exportar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input 
            type="text" 
            placeholder="Buscar en el registro..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
          />
        </div>
        <select 
          value={filtroUser}
          onChange={(e) => setFiltroUser(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
        >
          <option value="todos">Todos los usuarios</option>
          {usuariosDisp.map(u => (
            <option key={u.id} value={u.id}>{u.nombre || u.email}</option>
          ))}
        </select>
        <select 
          value={filtroTabla}
          onChange={(e) => setFiltroTabla(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
        >
          <option value="todas">Todos los módulos</option>
          <option value="users">Usuarios</option>
          <option value="channels">Canales</option>
          <option value="skills">Skills</option>
          <option value="precios">Precios</option>
          <option value="reglas">Reglas</option>
          <option value="etiquetas">Etiquetas</option>
          <option value="horarios">Horarios</option>
          <option value="perfil">Perfil</option>
          <option value="novedades">Novedades</option>
          <option value="blacklist">Blacklist</option>
          <option value="conversations">Conversaciones</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-ink-500">Cargando registro...</div>
      ) : errorMsg ? (
        <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm font-500">{errorMsg}</div>
      ) : Object.keys(agrupadas).length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-12 h-12 text-ink-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <h3 className="text-lg font-600 text-ink-900 mb-1">No hay actividad registrada aún</h3>
          <p className="text-ink-500 text-sm">Los cambios de configuración aparecerán aquí.</p>
        </div>
      ) : (
        Object.entries(agrupadas).map(([fecha, items]) => (
          <div key={fecha} className="mb-6">
            <p className="text-xs font-700 uppercase tracking-wider text-ink-400 mb-2 mt-1">{fecha}</p>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-4">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-600 shrink-0">
                    {getInitials(item.users)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-900">
                      <span className="font-600 mr-1">{item.users?.nombre || item.users?.email || 'Sistema'}</span> 
                      {item.accion}
                    </p>
                    {renderDiff(item.valor_anterior, item.valor_nuevo)}
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-700 uppercase tracking-wide ${getBadgeColor(item.tabla_afectada)}`}>
                      {item.tabla_afectada || 'Sistema'}
                    </span>
                    <p className="text-xs text-ink-400 mt-1">{formatTime(item.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

    </main>
  )
}
