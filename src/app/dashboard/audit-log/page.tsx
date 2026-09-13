'use client'
import Loading from '@/components/Loading'
import { PAGINA } from '@/lib/ui'
import { Tabla } from '@/components/ui/Tabla'
import { ErrorCarga } from '@/components/ui/ErrorCarga'

import { useState, useEffect } from 'react'
import { getAuditLog } from '@/app/actions/audit-log'
import { getMisPermisos } from '@/app/actions/permisos'
import { traducirError } from '@/lib/traducirError'

export default function AuditLogPage() {
  const [entradas, setEntradas] = useState<any[]>([])
  const [usuariosDisp, setUsuariosDisp] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [errorCarga, setErrorCarga] = useState(false)

  const [filtroUser, setFiltroUser] = useState('todos')
  const [filtroTabla, setFiltroTabla] = useState('todas')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  useEffect(() => {
    cargarDatos().catch(() => setErrorCarga(true))
  }, [fechaInicio, fechaFin])

  const cargarDatos = async () => {
    setLoading(true)
    const [res, permisosRes] = await Promise.all([
      getAuditLog({
        fechaInicio: fechaInicio ? new Date(fechaInicio).toISOString() : undefined,
        fechaFin: fechaFin ? new Date(fechaFin + 'T23:59:59').toISOString() : undefined
      }),
      getMisPermisos()
    ])
    
    if (!permisosRes.success) setErrorCarga(true)
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'audit_log')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    if (res.success && res.data) {
      setEntradas(res.data.entradas || [])
      setUsuariosDisp(res.data.usuarios_disponibles || [])
    } else {
      setErrorMsg(traducirError(res.error || 'Error al cargar el registro de auditoría'))
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

  const getDateGroup = (dateString: string) => {
    const today = new Date()
    const date = new Date(dateString)
    
    today.setHours(0, 0, 0, 0)
    const logDate = new Date(date)
    logDate.setHours(0, 0, 0, 0)
    
    const diffTime = Math.abs(today.getTime() - logDate.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Hoy'
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} días`
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  }

  const exportarCSV = () => {
    if (entradasFiltradas.length === 0) return

    const escaparCSV = (valor: any) => {
      const texto = valor === null || valor === undefined ? '' : String(valor)
      if (texto.includes(',') || texto.includes('"') || texto.includes('\n')) {
        return `"${texto.replace(/"/g, '""')}"`
      }
      return texto
    }

    const encabezados = ['Fecha', 'Hora', 'Usuario', 'Acción', 'Módulo']
    const filas = entradasFiltradas.map(item => {
      const fecha = new Date(item.timestamp)
      return [
        fecha.toLocaleDateString('es-ES'),
        fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        `${item.users?.nombre || item.users?.email || 'Sistema'}${item.por_asistente ? ' (por el asistente de IA)' : ''}`,
        item.accion,
        item.tabla_afectada || 'Sistema'
      ].map(escaparCSV).join(',')
    })

    const csv = [encabezados.join(','), ...filas].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registro_actividad_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
    if (t.includes('contacto')) return 'bg-rose-100 text-rose-700'
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
    return true
  })


  if (errorCarga) return <ErrorCarga />

  if (loading || nivelPermiso === null) {
    return <Loading />
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-ink-900 mb-2">Acceso denegado</h2>
        <p className="text-ink-500">No tienes permisos para ver el registro de auditoría.</p>
      </div>
    )
  }

  return (
    <div className={PAGINA}>
      
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Registro de actividad</h1>
          <p className="text-ink-500 mt-1">Historial de cambios realizados por tu equipo.</p>
        </div>
        <button onClick={exportarCSV} disabled={entradasFiltradas.length === 0} title={entradasFiltradas.length === 0 ? 'No hay datos para exportar' : 'Exportar a CSV'} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Exportar
        </button>
      </div>

      {errorMsg && <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm font-500 mb-4">{errorMsg}</div>}

      <Tabla
        filas={entradasFiltradas}
        idDe={e => e.id}
        nombre={['cambio', 'cambios']}
        buscar={{ placeholder: 'Buscar en el registro…', en: e => `${e.accion || ''} ${e.users?.nombre || ''} ${e.users?.email || ''} ${e.tabla_afectada || ''} ${e.por_asistente ? 'asistente de ia' : ''}` }}
        herramientas={
          <>
            <select value={filtroUser} onChange={e => setFiltroUser(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition">
              <option value="todos">Todos los usuarios</option>
              {usuariosDisp.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
            </select>
            <select value={filtroTabla} onChange={e => setFiltroTabla(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition">
              <option value="todas">Todos los módulos</option>
              <option value="users">Usuarios</option>
              <option value="roles">Roles</option>
              <option value="channels">Canales</option>
              <option value="skills">Skills</option>
              <option value="precios">Precios</option>
              <option value="reglas">Reglas</option>
              <option value="etiquetas">Etiquetas</option>
              <option value="horarios">Horarios</option>
              <option value="perfil">Perfil</option>
              <option value="novedades">Novedades</option>
              <option value="contactos">Contactos</option>
              <option value="conversations">Conversaciones / Chats</option>
              <option value="sucursales">Sucursales</option>
            </select>
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} max={fechaFin || undefined} aria-label="Desde" className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition" />
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} min={fechaInicio || undefined} aria-label="Hasta" className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition" />
            {(fechaInicio || fechaFin) && <button onClick={() => { setFechaInicio(''); setFechaFin('') }} className="text-xs text-ink-500 hover:text-ink-800 underline underline-offset-2">Limpiar fechas</button>}
          </>
        }
        ordenInicial={{ clave: 'cuando', direccion: 'desc' }}
        columnas={[
          { clave: 'cuando', titulo: 'Cuándo', valor: e => e.timestamp, render: e => <span className="text-ink-500 whitespace-nowrap">{new Date(e.timestamp).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> },
          { clave: 'quien', titulo: 'Quién', valor: e => `${e.users?.nombre || e.users?.email || 'Sistema'}${e.por_asistente ? ' (asistente)' : ''}`, render: e => (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-[10px] font-600 shrink-0">{getInitials(e.users)}</div>
              <div className="min-w-0">
                <span className="block font-600 text-ink-900 truncate">{e.users?.nombre || e.users?.email || 'Sistema'}</span>
                {/* Lo ejecutó la IA, pero se lo pidió la persona de arriba */}
                {e.por_asistente && (
                  <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-600 px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100 whitespace-nowrap">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    Asistente de IA
                  </span>
                )}
              </div>
            </div>
          ) },
          { clave: 'que', titulo: 'Qué cambió', enMovil: 'titulo', valor: e => e.accion, render: e => (
            <div className="min-w-0">
              <p className="text-ink-900 break-words">{e.accion}</p>
              {renderDiff(e.valor_anterior, e.valor_nuevo)}
            </div>
          ) },
          { clave: 'modulo', titulo: 'Módulo', valor: e => e.tabla_afectada || 'Sistema', render: e => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-700 uppercase tracking-wide whitespace-nowrap ${getBadgeColor(e.tabla_afectada)}`}>{e.tabla_afectada || 'Sistema'}</span> }
        ]}
        vacio={<div><h3 className="text-lg font-600 text-ink-900 mb-1">No hay actividad registrada aún</h3><p className="text-ink-500 text-sm">Los cambios de configuración aparecerán aquí.</p></div>}
      />

    </div>
  )
}
