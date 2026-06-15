'use client'

import { useState, useEffect } from 'react'
import {
  getUsuarios,
  invitarUsuario,
  actualizarUsuario,
  reenviarInvitacion,
  desactivarUsuario,
  reactivarUsuario
} from '@/app/actions/usuarios'

export default function UsuariosPage() {
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [usuariosMax, setUsuariosMax] = useState<number | null>(null)
  const [usuariosActivosCount, setUsuariosActivosCount] = useState<number>(0)
  const [planNombre, setPlanNombre] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sucursales, setSucursales] = useState<any[]>([])

  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Invitar Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteData, setInviteData] = useState<{ email: string, nombre: string, rol: 'agente' | 'operario', branch_ids: string[] }>({
    email: '', nombre: '', rol: 'agente', branch_ids: []
  })
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Editar Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [editData, setEditData] = useState<{ nombre: string, rol: 'agente' | 'operario', branch_ids: string[] }>({
    nombre: '', rol: 'agente', branch_ids: []
  })

  const cargar = async () => {
    setLoading(true)
    const res = await getUsuarios()
    if (res.success && res.data) {
      setUsuarios(res.data.usuarios)
      setUsuariosMax(res.data.usuarios_max)
      setUsuariosActivosCount(res.data.usuarios_activos_count || 0)
      setPlanNombre(res.data.plan_nombre)
      setCurrentUserId(res.data.current_user_id)
      setSucursales(res.data.sucursales)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cargar usuarios' })
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleOpenInvite = () => {
    setInviteData({ email: '', nombre: '', rol: 'agente', branch_ids: [] })
    setInviteError(null)
    setIsInviteModalOpen(true)
  }

  const handleInvitar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inviteData.branch_ids.length === 0) {
      setInviteError('Debes seleccionar al menos una sucursal')
      return
    }
    setInviteLoading(true)
    setInviteError(null)

    const res = await invitarUsuario({
      email: inviteData.email,
      nombre: inviteData.nombre || null,
      rol: inviteData.rol,
      branch_ids: inviteData.branch_ids
    })

    if (res.success) {
      setIsInviteModalOpen(false)
      setMensaje({ tipo: 'exito', texto: `Invitación enviada a ${inviteData.email} ✓` })
      setTimeout(() => setMensaje(null), 3000)
      cargar()
    } else {
      setInviteError(res.error || 'Error al invitar usuario')
    }
    setInviteLoading(false)
  }

  const handleOpenEdit = (user: any) => {
    setSelectedUser(user)
    setEditData({
      nombre: user.nombre || '',
      rol: user.rol === 'admin' || user.rol === 'super_admin' ? 'agente' : user.rol, // Para la UI si fuera modificable, pero no lo dejaremos si es admin
      branch_ids: Array.isArray(user.user_branches) ? user.user_branches.map((ub: any) => ub.branch_id) : []
    })
    setIsEditModalOpen(true)
  }

  const handleEditar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    if (editData.branch_ids.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Debes seleccionar al menos una sucursal' })
      return
    }
    setEditLoading(true)

    const res = await actualizarUsuario(selectedUser.id, {
      nombre: editData.nombre,
      rol: editData.rol,
      branch_ids: editData.branch_ids
    })

    if (res.success) {
      setIsEditModalOpen(false)
      setMensaje({ tipo: 'exito', texto: 'Usuario actualizado correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al actualizar usuario' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setEditLoading(false)
  }

  const handleReenviar = async () => {
    if (!selectedUser) return
    const res = await reenviarInvitacion(selectedUser.email)
    if (res.success) {
      setMensaje({ tipo: 'exito', texto: `Invitación reenviada a ${selectedUser.email} ✓` })
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al reenviar invitación' })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  const handleToggleActivo = async () => {
    if (!selectedUser) return
    setEditLoading(true)
    let res
    if (selectedUser.activo) {
      res = await desactivarUsuario(selectedUser.id)
    } else {
      res = await reactivarUsuario(selectedUser.id)
    }

    if (res.success) {
      setIsEditModalOpen(false)
      setMensaje({ tipo: 'exito', texto: `Usuario ${selectedUser.activo ? 'desactivado' : 'reactivado'} correctamente ✓` })
      setTimeout(() => setMensaje(null), 3000)
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cambiar estado del usuario' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setEditLoading(false)
  }

  const getInitials = (user: any) => {
    if (user.nombre) {
      return user.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    }
    return user.email.substring(0, 2).toUpperCase()
  }

  const getAvatarClass = (user: any) => {
    if (!user.invitacion_aceptada) return 'bg-slate-100 text-slate-500 ring-2 ring-amber-200 ring-offset-2'
    if (user.rol === 'admin' || user.rol === 'super_admin') return 'bg-gradient-to-br from-brand-400 to-brand-600 text-white'
    if (user.rol === 'operario') return 'bg-orange-100 text-orange-700'
    return 'bg-emerald-100 text-emerald-700'
  }

  const getRoleBadgeClass = (rol: string) => {
    if (rol === 'admin' || rol === 'super_admin') return 'bg-purple-100 text-purple-700'
    if (rol === 'operario') return 'bg-orange-100 text-orange-700'
    return 'bg-emerald-100 text-emerald-700'
  }

  const getRoleIcon = (rol: string) => {
    if (rol === 'admin' || rol === 'super_admin') {
      return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
    }
    if (rol === 'operario') {
      return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
    }
    return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
  }

  const getRoleLabel = (rol: string) => {
    if (rol === 'admin') return 'Administradora'
    if (rol === 'super_admin') return 'Super Admin'
    if (rol === 'operario') return 'Operario'
    return 'Agente'
  }

  const limitReached = usuariosMax !== null && usuariosActivosCount >= usuariosMax

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando usuarios...</div>
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      {/* Mensaje global */}
      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border flex items-center gap-2 ${
          mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Usuarios</h1>
          <p className="text-ink-500 mt-1">Quién puede entrar a tu Respondi y qué puede hacer.</p>
        </div>
        
        <div className="group relative">
          <button 
            onClick={!limitReached ? handleOpenInvite : undefined} 
            disabled={limitReached}
            className={`inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 text-white text-sm font-600 transition ${limitReached ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM20 8v6M23 11h-6"/></svg>
            Invitar usuario
          </button>
          {limitReached && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-ink-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
              Has alcanzado el límite de usuarios de tu plan
            </div>
          )}
        </div>
      </div>

      {/* Contador de plan */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
        {usuariosMax !== null ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-600 text-ink-900">Usuarios del plan {planNombre || 'Pro'}</p>
                <p className="text-xs text-ink-500 mt-0.5">Estás usando {usuariosActivosCount} de {usuariosMax} disponibles</p>
              </div>
              <span className="font-display font-700 text-2xl text-ink-900">{usuariosActivosCount}<span className="text-ink-400 font-500 text-lg">/{usuariosMax}</span></span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full" style={{ width: `${Math.min((usuariosActivosCount / usuariosMax) * 100, 100)}%` }}></div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-600 text-ink-900">Usuarios del plan {planNombre || 'Actual'}</p>
              <p className="text-xs text-ink-500 mt-0.5">Sin límite de usuarios</p>
            </div>
            <span className="font-display font-700 text-2xl text-ink-900">{usuariosActivosCount}</span>
          </div>
        )}
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {usuarios.map(user => {
          const isCurrent = user.id === currentUserId
          const isPending = !user.invitacion_aceptada
          const isDisabled = !user.activo
          const userBranchNames = Array.isArray(user.user_branches) && user.user_branches.length > 0
            ? user.user_branches
                .map((ub: any) => sucursales.find((s: any) => s.id === ub.branch_id)?.nombre)
                .filter(Boolean).join(', ')
            : 'Sin sucursal asignada'
          const canEdit = !isCurrent && user.rol !== 'admin' && user.rol !== 'super_admin'

          return (
            <div key={user.id} className={`flex items-center gap-3 p-4 ${isDisabled ? 'opacity-50' : ''}`}>
              
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-600 shrink-0 ${getAvatarClass(user)}`}>
                {isPending ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                ) : (
                  getInitials(user)
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-600 text-ink-900">
                    {isPending ? 'Pendiente' : (user.nombre || 'Usuario')}
                  </p>
                  
                  {isCurrent && (
                    <span className="text-[10px] font-700 uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">Tú</span>
                  )}
                  {isPending && !isCurrent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-700 uppercase tracking-wide">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>
                      Invitación enviada
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-500 truncate">{user.email}</p>
              </div>

              <div className="hidden sm:flex flex-col items-end gap-1">
                {isDisabled ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-600">
                    Desactivado
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-600 ${getRoleBadgeClass(user.rol)}`}>
                    {getRoleIcon(user.rol)}
                    {getRoleLabel(user.rol)}
                  </span>
                )}
                <span className="text-xs text-ink-400">{userBranchNames}</span>
              </div>

              <button 
                onClick={() => canEdit ? handleOpenEdit(user) : undefined}
                disabled={!canEdit}
                className={`p-1.5 rounded-lg transition ${canEdit ? 'text-ink-400 hover:text-ink-700 hover:bg-slate-100' : 'text-ink-300 cursor-not-allowed'}`}
                aria-label={canEdit ? "Más opciones" : "No puedes editar este usuario"}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
              </button>
            </div>
          )
        })}
        {usuarios.length === 0 && (
          <div className="p-8 text-center text-ink-500">No hay usuarios.</div>
        )}
      </div>
      <div className="mt-3 px-1 text-xs text-ink-500 sm:hidden">
        Pulsa el menú de un usuario para editar o desactivar.
      </div>

      {/* =========================================================
           POPUP · Invitar usuario
           ========================================================= */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !inviteLoading && setIsInviteModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleInvitar} className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">Invitar usuario</h2>
                  <button type="button" onClick={() => !inviteLoading && setIsInviteModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="px-6 py-5 space-y-4 overflow-y-auto">
                  {inviteError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-500">
                      {inviteError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Correo electrónico</label>
                    <input type="email" placeholder="empleado@ejemplo.com" required
                      value={inviteData.email} onChange={e => setInviteData({...inviteData, email: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                    <p className="text-xs text-ink-400 mt-1.5">Le enviaremos un correo con el enlace para activar su cuenta.</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre <span className="text-ink-400 font-400">· opcional</span></label>
                    <input type="text" placeholder="Cómo se llama"
                      value={inviteData.nombre} onChange={e => setInviteData({...inviteData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-2.5">Rol</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`relative rounded-xl border-2 p-3 cursor-pointer transition ${inviteData.rol === 'agente' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="rol" value="agente" className="sr-only" checked={inviteData.rol === 'agente'} onChange={() => setInviteData({...inviteData, rol: 'agente'})} />
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                          </div>
                          <div className="min-w-0">
                            <p className="font-600 text-sm text-ink-900">Agente</p>
                            <p className="text-xs text-ink-500 leading-tight">Atiende casos</p>
                          </div>
                        </div>
                      </label>
                      <label className={`relative rounded-xl border-2 p-3 cursor-pointer transition ${inviteData.rol === 'operario' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="rol" value="operario" className="sr-only" checked={inviteData.rol === 'operario'} onChange={() => setInviteData({...inviteData, rol: 'operario'})} />
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                          </div>
                          <div className="min-w-0">
                            <p className="font-600 text-sm text-ink-900">Operario</p>
                            <p className="text-xs text-ink-500 leading-tight">Carga novedades</p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Sucursales asignadas</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50">
                      {sucursales.map(s => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" 
                            checked={inviteData.branch_ids.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setInviteData({...inviteData, branch_ids: [...inviteData.branch_ids, s.id]})
                              } else {
                                setInviteData({...inviteData, branch_ids: inviteData.branch_ids.filter(id => id !== s.id)})
                              }
                            }}
                            className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                          />
                          <span className="text-sm text-ink-700">{s.nombre}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
        
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                  <button type="button" disabled={inviteLoading} onClick={() => setIsInviteModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={inviteLoading} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
                    {inviteLoading ? 'Enviando...' : 'Enviar invitación'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
           POPUP · Editar usuario
           ========================================================= */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !editLoading && setIsEditModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
              
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="font-display font-700 text-lg text-ink-900">Editar usuario</h2>
                <button type="button" onClick={() => !editLoading && setIsEditModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
      
              <div className="px-6 py-5 space-y-4 overflow-y-auto">
                {/* Cabecera de usuario */}
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-600 shrink-0 ${getAvatarClass(selectedUser)}`}>
                    {!selectedUser.invitacion_aceptada ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    ) : getInitials(selectedUser)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-500 truncate">{selectedUser.email}</p>
                    {!selectedUser.invitacion_aceptada ? (
                      <p className="text-xs text-amber-600 font-500 mt-0.5">Pendiente de activación</p>
                    ) : !selectedUser.activo ? (
                      <p className="text-xs text-slate-500 font-500 mt-0.5">Desactivado</p>
                    ) : (
                      <p className="text-xs text-emerald-600 font-500 mt-0.5">Activo</p>
                    )}
                  </div>
                </div>

                {/* Aviso pendiente */}
                {!selectedUser.invitacion_aceptada && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <div className="flex-1">
                      <p className="text-xs font-600 text-amber-800">Invitación pendiente</p>
                      <p className="text-xs text-amber-700 mt-0.5">Aún no ha activado su cuenta. Le puedes reenviar la invitación.</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                  <input type="text" value={editData.nombre} onChange={e => setEditData({...editData, nombre: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-2.5">Rol</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`relative rounded-xl border-2 p-3 cursor-pointer transition ${editData.rol === 'agente' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                      <input type="radio" name="erol" value="agente" className="sr-only" checked={editData.rol === 'agente'} onChange={() => setEditData({...editData, rol: 'agente'})} />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                        </div>
                        <div className="min-w-0">
                          <p className="font-600 text-sm text-ink-900">Agente</p>
                          <p className="text-xs text-ink-500 leading-tight">Atiende casos</p>
                        </div>
                      </div>
                    </label>
                    <label className={`relative rounded-xl border-2 p-3 cursor-pointer transition ${editData.rol === 'operario' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                      <input type="radio" name="erol" value="operario" className="sr-only" checked={editData.rol === 'operario'} onChange={() => setEditData({...editData, rol: 'operario'})} />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                        </div>
                        <div className="min-w-0">
                          <p className="font-600 text-sm text-ink-900">Operario</p>
                          <p className="text-xs text-ink-500 leading-tight">Carga novedades</p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Sucursales asignadas</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50">
                    {sucursales.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" 
                          checked={editData.branch_ids.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditData({...editData, branch_ids: [...editData.branch_ids, s.id]})
                            } else {
                              setEditData({...editData, branch_ids: editData.branch_ids.filter(id => id !== s.id)})
                            }
                          }}
                          className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                        />
                        <span className="text-sm text-ink-700">{s.nombre}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Acciones secundarias */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  {!selectedUser.invitacion_aceptada && (
                    <button type="button" onClick={handleReenviar} className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-brand-300 bg-brand-50 hover:bg-brand-100 text-sm font-600 text-brand-700 transition">
                      <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      Reenviar invitación
                    </button>
                  )}
                  {selectedUser.activo ? (
                    <button type="button" onClick={handleToggleActivo} className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-sm font-600 text-red-600 transition">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                      Desactivar usuario
                    </button>
                  ) : (
                    <button type="button" onClick={handleToggleActivo} className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 text-sm font-600 text-emerald-600 transition">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      Reactivar usuario
                    </button>
                  )}
                </div>
              </div>
      
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button type="button" disabled={editLoading} onClick={() => setIsEditModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button type="button" onClick={handleEditar} disabled={editLoading} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
