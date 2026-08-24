'use client'
import { useState, useEffect } from 'react'
import Loading from '@/components/Loading'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'
import Link from 'next/link'
import {
  getTodosLosUsuarios,
  cambiarEstadoUsuario,
  enviarResetPassword,
  cambiarRolUsuario,
  degradarSuperadmin
} from '@/app/actions/usuarios-globales'
import { getSuperadminRoles, asignarRolSuperadmin } from '@/app/actions/superadmin'

export default function GlobalUsersTable({ defaultFiltro }: { defaultFiltro: string }) {
  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('usuarios_globales', 'escritura')
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [filtro, setFiltro] = useState(defaultFiltro)
  const [busqueda, setBusqueda] = useState('')
  const [superadminRoles, setSuperadminRoles] = useState<any[]>([])

  // Modal State
  const [confirmProps, setConfirmProps] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText: string
    actionFn: () => Promise<void>
    type?: 'danger' | 'info' | 'warning' | 'success'
  }>({ isOpen: false, title: '', message: '', confirmText: '', actionFn: async () => {} })

  // Cambio de Nivel Superadmin Modal
  const [modalNivelOpen, setModalNivelOpen] = useState(false)
  const [selectedUserForNivel, setSelectedUserForNivel] = useState<any>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [savingNivel, setSavingNivel] = useState(false)

  useEffect(() => {
    cargarRoles()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      cargarUsuarios()
    }, 400)
    return () => clearTimeout(timer)
  }, [filtro, busqueda])

  const cargarRoles = async () => {
    const res = await getSuperadminRoles()
    if (res.success && res.data) {
      setSuperadminRoles(res.data)
    }
  }

  const cargarUsuarios = async () => {
    setLoading(true)
    const res = await getTodosLosUsuarios(filtro, busqueda)
    if (res.success && res.data) {
      setUsers(res.data)
    } else {
      showToast(res.error || 'Error al cargar usuarios', 'error')
    }
    setLoading(false)
  }

  const handleToggleActivo = (user: any) => {
    if (!canWrite) return
    const accion = user.activo ? 'desactivar' : 'activar'
    setConfirmProps({
      isOpen: true,
      title: `${user.activo ? 'Desactivar' : 'Activar'} cuenta`,
      message: `¿Estás seguro de que quieres ${accion} la cuenta de ${user.email}? ${user.activo ? 'El usuario no podrá iniciar sesión.' : ''}`,
      confirmText: accion === 'activar' ? 'Activar cuenta' : 'Desactivar cuenta',
      type: user.activo ? 'danger' : 'info',
      actionFn: async () => {
        const res = await cambiarEstadoUsuario(user.id, !user.activo)
        if (res.success) {
          showToast(`Cuenta ${accion}da correctamente`, 'success')
          cargarUsuarios()
        } else {
          showToast(res.error || `Error al ${accion} la cuenta`, 'error')
        }
      }
    })
  }

  const handleSendResetPassword = (user: any) => {
    if (!canWrite) return
    setConfirmProps({
      isOpen: true,
      title: 'Enviar reseteo de contraseña',
      message: `Se enviará un correo a ${user.email} con un enlace para establecer una nueva contraseña.`,
      confirmText: 'Enviar email',
      type: 'info',
      actionFn: async () => {
        const res = await enviarResetPassword(user.email)
        if (res.success) {
          showToast(`Email de reseteo enviado a ${user.email}`, 'success')
        } else {
          showToast(res.error || 'Error al enviar email', 'error')
        }
      }
    })
  }

  const handleChangeRole = (user: any, targetRole: 'admin' | 'vendedor') => {
    if (!canWrite) return
    let desc = `El usuario pasará a ser ${targetRole}. `
    if (targetRole === 'vendedor') {
      desc += 'Perderá el acceso a su organización actual y se creará automáticamente su perfil de vendedor (con 0% de comisión).'
    } else {
      desc += 'Deberás asignarle una organización manualmente o a través de invitación.'
    }
    
    setConfirmProps({
      isOpen: true,
      title: `Cambiar rol a ${targetRole}`,
      message: desc,
      confirmText: 'Confirmar cambio',
      type: 'danger',
      actionFn: async () => {
        const res = await cambiarRolUsuario(user.id, targetRole)
        if (res.success) {
          showToast(`Rol cambiado a ${targetRole}`, 'success')
          cargarUsuarios()
        } else {
          showToast(res.error || 'Error al cambiar rol', 'error')
        }
      }
    })
  }

  const handleDegradarSuperadmin = (user: any) => {
    if (!canWrite) return
    setConfirmProps({
      isOpen: true,
      title: 'Degradar Superadmin',
      message: `¿Estás seguro de que quieres quitarle el rol de superadmin a ${user.email}? Pasará a ser un usuario normal sin acceso al panel maestro.`,
      confirmText: 'Degradar',
      type: 'danger',
      actionFn: async () => {
        const res = await degradarSuperadmin(user.id)
        if (res.success) {
          showToast('Usuario degradado correctamente', 'success')
          cargarUsuarios()
        } else {
          showToast(res.error || 'Error al degradar', 'error')
        }
      }
    })
  }

  const handleAsignarRolNivel = async () => {
    if (!selectedUserForNivel || !selectedRoleId) return
    setSavingNivel(true)
    const res = await asignarRolSuperadmin(selectedUserForNivel.id, selectedRoleId)
    if (res.success) {
      showToast('Nivel de superadmin actualizado', 'success')
      setModalNivelOpen(false)
      cargarUsuarios()
    } else {
      showToast(res.error || 'Error al asignar nivel', 'error')
    }
    setSavingNivel(false)
  }

  return (
    <div className="p-6 sm:p-10 max-w-7xl w-full mx-auto pb-20">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">
            {defaultFiltro === 'Clientes' ? 'Clientes' : defaultFiltro === 'Vendedores' ? 'Vendedores' : defaultFiltro === 'Superadmins' ? 'Superadmins' : 'Usuarios'}
          </h1>
          <p className="text-ink-500 mt-1">Gestión centralizada de todos los usuarios de la plataforma.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 max-w-sm relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input 
              type="text" 
              placeholder="Buscar por nombre o email..." 
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider font-600 text-ink-500">
                <th className="p-4 whitespace-nowrap">Usuario</th>
                <th className="p-4 whitespace-nowrap">Tipo</th>
                <th className="p-4 whitespace-nowrap">Organización / Nivel</th>
                <th className="p-4 whitespace-nowrap">Alta</th>
                <th className="p-4 whitespace-nowrap text-center">Estado</th>
                <th className="p-4 whitespace-nowrap text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center"><Loading /></td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-500">No se encontraron usuarios.</td>
                </tr>
              ) : (
                users.map(u => {
                  const superadminRole = Array.isArray(u.superadmin_roles) ? u.superadmin_roles[0] : u.superadmin_roles;
                  const orgData = Array.isArray(u.organizaciones) ? u.organizaciones[0] : u.organizaciones;
                  
                  return (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-4 min-w-[200px]">
                      <p className="font-600 text-ink-900">{u.nombre || 'Sin nombre'}</p>
                      <p className="text-xs text-ink-500">{u.email}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {u.rol === 'super_admin' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 text-xs font-600 border border-purple-100">
                          Superadmin
                        </span>
                      ) : u.rol === 'vendedor' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-600 border border-emerald-100">
                          Vendedor
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-600 border border-blue-100">
                          Cliente
                        </span>
                      )}
                    </td>
                    <td className="p-4 min-w-[180px]">
                      {u.rol === 'super_admin' ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-600 text-purple-700">Nivel {superadminRole?.nivel ?? 5}</span>
                          <span className="text-xs text-ink-500 truncate">{superadminRole?.nombre || 'Rol base'}</span>
                        </div>
                      ) : (
                        u.tenant_id ? (
                          <Link href={`/superadmin/organizaciones`} className="text-brand-600 hover:underline text-sm truncate block max-w-[200px]">
                            {orgData?.nombre || 'Organización Desconocida'}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-400">Sin organización</span>
                        )
                      )}
                    </td>
                    <td className="p-4 text-ink-500 text-xs whitespace-nowrap">
                      {new Date(u.fecha_creacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {u.activo ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        )}
                      </span>
                    </td>
                    <td className="p-4 text-right relative">
                      {canWrite && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActivo(u)}
                            className="p-1.5 text-ink-400 hover:text-ink-900 hover:bg-slate-100 rounded-lg transition"
                            title={u.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
                          >
                            {u.activo ? (
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleSendResetPassword(u)}
                            className="p-1.5 text-ink-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                            title="Enviar email de reseteo"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                          </button>

                          <div className="relative inline-block text-left group/dropdown">
                            <button className="p-1.5 text-ink-400 hover:text-ink-900 hover:bg-slate-100 rounded-lg transition">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                            </button>
                            <div className="hidden group-hover/dropdown:block absolute right-0 mt-0 w-48 bg-white border border-slate-100 shadow-xl rounded-xl py-1 z-50">
                              {u.rol !== 'super_admin' ? (
                                <>
                                  {u.rol !== 'vendedor' && (
                                    <button onClick={() => handleChangeRole(u, 'vendedor')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition">
                                      Convertir a Vendedor
                                    </button>
                                  )}
                                  {u.rol !== 'admin' && (
                                    <button onClick={() => handleChangeRole(u, 'admin')} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition">
                                      Convertir a Cliente
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setSelectedUserForNivel(u); setSelectedRoleId(u.superadmin_rol_id || ''); setModalNivelOpen(true); }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition">
                                    Modificar Nivel
                                  </button>
                                  <button onClick={() => handleDegradarSuperadmin(u)} className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition">
                                    Quitar Superadmin
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmProps.isOpen}
        onClose={() => setConfirmProps(p => ({ ...p, isOpen: false }))}
        onConfirm={async () => {
          await confirmProps.actionFn()
          setConfirmProps(p => ({ ...p, isOpen: false }))
        }}
        title={confirmProps.title}
        message={confirmProps.message}
        confirmText={confirmProps.confirmText}
        type={confirmProps.type}
      />

      {/* MODAL CAMBIAR NIVEL SUPERADMIN */}
      {modalNivelOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !savingNivel && setModalNivelOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto">
              <div className="p-6">
                <h2 className="font-display font-700 text-lg text-ink-900 mb-2">Modificar nivel de Superadmin</h2>
                <p className="text-sm text-ink-500 mb-6">Selecciona el nuevo rol para {selectedUserForNivel?.email}</p>

                <div className="space-y-3 mb-8 max-h-[40vh] overflow-y-auto">
                  {superadminRoles.map(rol => (
                    <label key={rol.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedRoleId === rol.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input 
                        type="radio" 
                        name="superadmin_role" 
                        value={rol.id} 
                        checked={selectedRoleId === rol.id} 
                        onChange={() => setSelectedRoleId(rol.id)}
                        className="w-4 h-4 text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <p className="font-600 text-sm text-ink-900">{rol.nombre} {rol.es_propietario && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Propietario</span>}</p>
                        <p className="text-xs text-ink-500">Nivel {rol.nivel}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setModalNivelOpen(false)} disabled={savingNivel}
                    className="px-4 h-11 rounded-xl text-sm font-600 border border-slate-200 text-ink-700 hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleAsignarRolNivel} disabled={savingNivel || !selectedRoleId}
                    className="px-4 h-11 rounded-xl text-sm font-600 bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-50"
                  >
                    {savingNivel ? 'Guardando...' : 'Guardar nivel'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
