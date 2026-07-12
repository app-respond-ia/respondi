'use client'

import { useState, useEffect } from 'react'
import { getRolesPersonalizados, crearRolPersonalizado, actualizarRolPersonalizado, eliminarRolPersonalizado } from '@/app/actions/roles'
import { getMisPermisos } from '@/app/actions/permisos'

type PermisoUI = {
  seccion: string
  nivel: 'ninguno' | 'lectura' | 'escritura'
  alcance?: 'todos' | 'propios'
}

const SECCIONES_CON_ALCANCE = ['casos', 'conversaciones', 'chats']

const GRUPOS = [
  {
    label: 'Operación',
    secciones: [
      { id: 'casos', label: 'Casos' },
      { id: 'conversaciones', label: 'Conversaciones' },
      { id: 'chats', label: 'Chats' },
      { id: 'novedades', label: 'Novedades del día' },
      { id: 'blacklist', label: 'Blacklist' },
    ]
  },
  {
    label: 'Configuración',
    secciones: [
      { id: 'skills', label: 'Skills de IA' },
      { id: 'precios', label: 'Lista de precios' },
      { id: 'reglas', label: 'Escalado de casos' },
      { id: 'etiquetas', label: 'Etiquetas' },
      { id: 'canales', label: 'Canales' },
      { id: 'usuarios', label: 'Usuarios' },
      { id: 'sucursales', label: 'Sucursales' },
      { id: 'perfil', label: 'Perfil de sucursal' },
      { id: 'audit_log', label: 'Audit log' },
    ]
  }
]

const SECCIONES_DEFAULT: PermisoUI[] = GRUPOS.flatMap(g =>
  g.secciones.map(s => ({ seccion: s.id, nivel: 'ninguno', alcance: 'todos' }))
)

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [permisos, setPermisos] = useState<PermisoUI[]>(SECCIONES_DEFAULT)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const [resRoles, permisosRes] = await Promise.all([
      getRolesPersonalizados(),
      getMisPermisos()
    ])
    if (resRoles.success && resRoles.data) setRoles(resRoles.data)
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'usuarios')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }
    setLoading(false)
  }

  const openCrear = () => {
    setModalMode('crear')
    setSelectedId(null)
    setNombre('')
    setDescripcion('')
    setPermisos([...SECCIONES_DEFAULT])
    setIsModalOpen(true)
  }

  const openEditar = (rol: any) => {
    setModalMode('editar')
    setSelectedId(rol.id)
    setNombre(rol.nombre)
    setDescripcion(rol.descripcion || '')
    const loaded = SECCIONES_DEFAULT.map(s => {
      const existing = (rol.permisos || []).find((p: any) => p.seccion === s.seccion)
      return existing ? { ...s, nivel: existing.nivel, alcance: existing.alcance || 'todos' } : s
    })
    setPermisos(loaded)
    setIsModalOpen(true)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar este rol? Los usuarios que lo tengan asignado mantendrán sus permisos actuales.')) return
    const res = await eliminarRolPersonalizado(id)
    if (res.success) {
      setRoles(prev => prev.filter(r => r.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Rol eliminado ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar' })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre del rol es obligatorio' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setSaving(true)
    const permisosPayload = permisos
      .filter(p => p.nivel !== 'ninguno')
      .map(p => ({
        seccion: p.seccion,
        nivel: p.nivel,
        ...(SECCIONES_CON_ALCANCE.includes(p.seccion) && { alcance: p.alcance || 'todos' })
      }))

    let res
    if (modalMode === 'crear') {
      res = await crearRolPersonalizado({ nombre, descripcion, permisos: permisosPayload })
    } else {
      res = await actualizarRolPersonalizado(selectedId!, { nombre, descripcion, permisos: permisosPayload })
    }

    if (res.success) {
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'crear' ? 'Rol creado ✓' : 'Rol actualizado ✓' })
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSaving(false)
  }

  const updateNivel = (seccion: string, nivel: 'ninguno' | 'lectura' | 'escritura') => {
    setPermisos(prev => prev.map(p => p.seccion === seccion ? { ...p, nivel } : p))
  }

  const updateAlcance = (seccion: string, alcance: 'todos' | 'propios') => {
    setPermisos(prev => prev.map(p => p.seccion === seccion ? { ...p, alcance } : p))
  }

  const getResumenPermisos = (rol: any) => {
    const ps = rol.permisos || []
    if (ps.length === 0) return 'Sin permisos'
    const escritura = ps.filter((p: any) => p.nivel === 'escritura').length
    const lectura = ps.filter((p: any) => p.nivel === 'lectura').length
    const parts = []
    if (escritura > 0) parts.push(`${escritura} escritura`)
    if (lectura > 0) parts.push(`${lectura} lectura`)
    return parts.join(' · ')
  }

  if (loading || nivelPermiso === null) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando roles...</div>
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-500 font-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border flex items-center gap-2 ${
          mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {mensaje.texto}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Roles</h1>
          <p className="text-ink-500 mt-1">Crea plantillas de permisos para asignar rápidamente a nuevos usuarios.</p>
        </div>
        {nivelPermiso === 'escritura' && (
          <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo rol
          </button>
        )}
      </div>

      {/* Info box */}
      <div className="mb-6 p-4 rounded-xl bg-brand-50 border border-brand-100 flex items-start gap-3">
        <svg className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <p className="text-sm text-brand-800">Los roles son plantillas de permisos reutilizables. Al invitar un usuario puedes aplicar un rol para configurar sus permisos automáticamente.</p>
      </div>

      {/* Lista de roles */}
      {roles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-slate-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <p className="font-semibold text-ink-900 text-lg mb-2">No tienes roles creados.</p>
          <p className="text-ink-500 text-sm mb-6 max-w-sm mx-auto">Crea roles para agilizar la configuración de permisos al invitar nuevos usuarios.</p>
          {nivelPermiso === 'escritura' && (
            <button onClick={openCrear} className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition">
              Crear primer rol
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {roles.map(rol => (
            <div key={rol.id} className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-600 text-ink-900">{rol.nombre}</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  {rol.descripcion && <span className="mr-2">{rol.descripcion}</span>}
                  <span className="text-ink-400">{getResumenPermisos(rol)}</span>
                </p>
              </div>
              {nivelPermiso === 'escritura' && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditar(rol)} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onClick={() => handleEliminar(rol.id)} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="font-display font-700 text-lg text-ink-900">
                  {modalMode === 'crear' ? 'Nuevo rol' : 'Editar rol'}
                </h2>
                <button onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre del rol</label>
                    <input type="text" placeholder="Ej. Agente de ventas" value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción <span className="text-ink-400 font-400">· opcional</span></label>
                    <input type="text" placeholder="Para qué se usa este rol"
                      value={descripcion} onChange={e => setDescripcion(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-3">Permisos</label>
                  <div className="space-y-4">
                    {GRUPOS.map(grupo => (
                      <div key={grupo.label} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                          <h3 className="font-600 text-sm text-slate-700">{grupo.label}</h3>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {grupo.secciones.map(sec => {
                            const perm = permisos.find(p => p.seccion === sec.id) || { seccion: sec.id, nivel: 'ninguno', alcance: 'todos' }
                            const showAlcance = SECCIONES_CON_ALCANCE.includes(sec.id) && perm.nivel !== 'ninguno'
                            return (
                              <div key={sec.id} className="p-3 bg-white flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sm font-500 text-ink-900">{sec.label}</span>
                                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                                    {(['ninguno', 'lectura', 'escritura'] as const).map(n => (
                                      <button key={n} type="button" onClick={() => updateNivel(sec.id, n)}
                                        className={`px-2.5 py-1 text-xs font-600 rounded-md transition capitalize ${perm.nivel === n ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-600 hover:bg-slate-200'}`}>
                                        {n}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {showAlcance && (
                                  <div className="flex justify-end">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-ink-500">Alcance:</span>
                                      <select value={perm.alcance || 'todos'} onChange={e => updateAlcance(sec.id, e.target.value as any)}
                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:ring-brand-500 outline-none text-ink-700">
                                        <option value="todos">Todos</option>
                                        <option value="propios">Solo propios</option>
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button onClick={() => setIsModalOpen(false)} disabled={saving}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : modalMode === 'crear' ? 'Crear rol' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
