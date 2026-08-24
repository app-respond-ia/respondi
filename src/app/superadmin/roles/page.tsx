'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { getSuperadminRoles, crearSuperadminRol, actualizarSuperadminRol, eliminarSuperadminRol } from '@/app/actions/superadmin'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'
import { useToast } from '@/components/ui/Toast'

type PermisoUI = {
  seccion: string
  nivel: 'ninguno' | 'lectura' | 'escritura'
}

const GRUPOS = [
  {
    label: 'Principal',
    secciones: [
      { id: 'vision_general', label: 'Visión general' },
    ]
  },
  {
    label: 'Plataforma y Clientes',
    secciones: [
      { id: 'organizaciones', label: 'Organizaciones' },
      { id: 'planes', label: 'Planes' },
    ]
  },
  {
    label: 'Negocio y Partners',
    secciones: [
      { id: 'vendedores', label: 'Vendedores' },
      { id: 'comisiones', label: 'Comisiones' },
    ]
  },
  {
    label: 'Soporte',
    secciones: [
      { id: 'soporte_vendedores', label: 'Tickets (Vendedores)' },
      { id: 'soporte_clientes', label: 'Tickets (Clientes)' },
    ]
  },
  {
    label: 'Sistema',
    secciones: [
      { id: 'skills', label: 'Skills de IA' },
      { id: 'errores', label: 'Errores del sistema' },
      { id: 'gestion_superadmins', label: 'Gestión de Superadmins' },
      { id: 'usuarios_globales', label: 'Usuarios Globales' },
    ]
  }
]

const SECCIONES_DEFAULT: PermisoUI[] = GRUPOS.flatMap(g =>
  g.secciones.map(s => ({ seccion: s.id, nivel: 'ninguno' }))
)

export default function SuperadminRolesPage() {
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [nivel, setNivel] = useState(5)
  const [permisos, setPermisos] = useState<PermisoUI[]>(SECCIONES_DEFAULT)

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('gestion_superadmins', 'escritura')

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const res = await getSuperadminRoles()
    if (res.success && res.data) {
      setRoles(res.data)
    } else {
      showToast(res.error || 'Error al cargar los roles', 'error')
    }
    setLoading(false)
  }

  const openCrear = () => {
    setModalMode('crear')
    setSelectedId(null)
    setNombre('')
    setDescripcion('')
    setNivel(5)
    setPermisos([...SECCIONES_DEFAULT])
    setIsModalOpen(true)
  }

  const openEditar = (rol: any) => {
    setModalMode('editar')
    setSelectedId(rol.id)
    setNombre(rol.nombre)
    setDescripcion(rol.descripcion || '')
    setNivel(rol.nivel || 5)
    const loaded = SECCIONES_DEFAULT.map(s => {
      const existing = (rol.permisos || []).find((p: any) => p.seccion === s.seccion)
      return existing ? { ...s, nivel: existing.nivel } : s
    })
    setPermisos(loaded)
    setIsModalOpen(true)
  }

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      showToast('El nombre del rol es obligatorio', 'error')
      return
    }
    setSaving(true)
    const permisosPayload = permisos
      .filter(p => p.nivel !== 'ninguno')
      .map(p => ({
        seccion: p.seccion,
        nivel: p.nivel
      }))

    let res
    if (modalMode === 'crear') {
      res = await crearSuperadminRol({ nombre, descripcion, nivel, permisos: permisosPayload })
    } else {
      res = await actualizarSuperadminRol(selectedId!, { nombre, descripcion, nivel, permisos: permisosPayload })
    }

    if (res.success) {
      setIsModalOpen(false)
      showToast(modalMode === 'crear' ? 'Rol creado ✓' : 'Rol actualizado ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al guardar', 'error')
    }
    setSaving(false)
  }

  const updateNivel = (seccion: string, n: 'ninguno' | 'lectura' | 'escritura') => {
    setPermisos(prev => prev.map(p => {
      if (p.seccion === seccion) {
        return { ...p, nivel: n }
      }
      return p
    }))
  }

  const getResumenPermisos = (rol: any) => {
    if (rol.es_propietario) return 'Acceso total a la plataforma'
    const ps = rol.permisos || []
    if (ps.length === 0) return 'Sin permisos'
    const escritura = ps.filter((p: any) => p.nivel === 'escritura').length
    const lectura = ps.filter((p: any) => p.nivel === 'lectura').length
    const parts = []
    if (escritura > 0) parts.push(`${escritura} escritura`)
    if (lectura > 0) parts.push(`${lectura} lectura`)
    return parts.join(' · ')
  }

  if (loading) return <Loading />

  const filteredRoles = roles
    .filter(r => r.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Propietario siempre primero
      if (a.es_propietario && !b.es_propietario) return -1
      if (!a.es_propietario && b.es_propietario) return 1
      return (a.nivel || 5) - (b.nivel || 5)
    })

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Roles de Superadmin</h1>
          <p className="text-ink-500 mt-1">Crea niveles de acceso para tu equipo interno.</p>
        </div>
        {canWrite && (
          <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo rol
          </button>
        )}
      </div>

      {/* Lista de roles */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {filteredRoles.map(rol => (
          <div key={rol.id} className="flex items-center gap-4 p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rol.es_propietario ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-600 text-ink-900">{rol.nombre}</p>
              <p className="text-xs text-ink-500 mt-0.5">
                {rol.descripcion && <span className="mr-2">{rol.descripcion}</span>}
                <span className="text-ink-400 font-600">Nivel {rol.nivel}</span>
                <span className="text-ink-400 mx-2">·</span>
                <span className="text-ink-400">{getResumenPermisos(rol)}</span>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canWrite && !rol.es_propietario && (
                <button onClick={() => openEditar(rol)} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

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
                    <input type="text" placeholder="Ej. Soporte Nivel 1" value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción <span className="text-ink-400 font-400">· opcional</span></label>
                    <input type="text" placeholder="Ej: Solo tickets de vendedores"
                      value={descripcion} onChange={e => setDescripcion(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nivel jerárquico</label>
                    <select 
                      value={nivel} onChange={e => setNivel(parseInt(e.target.value))}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm"
                    >
                      {[2, 3, 4, 5].map(n => (
                        <option key={n} value={n}>Nivel {n}</option>
                      ))}
                    </select>
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
                            const perm = permisos.find(p => p.seccion === sec.id) || { seccion: sec.id, nivel: 'ninguno' }
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
