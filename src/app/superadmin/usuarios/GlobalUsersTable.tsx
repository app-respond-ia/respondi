'use client'
import { useState, useEffect } from 'react'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'
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
import { getSuperadminRoles, asignarRolSuperadmin, getOrganizacionesBasico, getPlanes } from '@/app/actions/superadmin'

export default function GlobalUsersTable({ defaultFiltro }: { defaultFiltro: string }) {
  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('usuarios_globales', 'escritura')
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [filtro] = useState(defaultFiltro)
  const [superadminRoles, setSuperadminRoles] = useState<any[]>([])

  // Filtros avanzados (solo para Clientes). La búsqueda por nombre/correo y
  // el estado activo/inactivo los lleva la propia tabla, sin ir al servidor.
  const [tenantFiltro, setTenantFiltro] = useState('')
  const [planFiltro, setPlanFiltro] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [rolEmpresaFiltro, setRolEmpresaFiltro] = useState('todos')
  const [organizaciones, setOrganizaciones] = useState<any[]>([])
  const [planes, setPlanes] = useState<any[]>([])

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
    if (defaultFiltro === 'Clientes') {
      cargarFiltros()
    }
  }, [])

  const cargarFiltros = async () => {
    const [orgs, planesRes] = await Promise.all([
      getOrganizacionesBasico(),
      getPlanes()
    ])
    if (orgs.success && orgs.organizaciones) setOrganizaciones(orgs.organizaciones)
    if (planesRes.success && planesRes.planes) setPlanes(planesRes.planes)
  }

  useEffect(() => {
    cargarUsuarios()
  }, [filtro, tenantFiltro, planFiltro, fechaDesde, fechaHasta, rolEmpresaFiltro])

  const cargarRoles = async () => {
    const res = await getSuperadminRoles()
    if (res.success && res.data) {
      setSuperadminRoles(res.data)
    }
  }

  const cargarUsuarios = async () => {
    setLoading(true)
    const res = await getTodosLosUsuarios(filtro, '', {
      estado: 'todos',
      tenant_id: tenantFiltro,
      plan_id: planFiltro,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      rol_empresa: rolEmpresaFiltro
    })
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

  // Nota: la conversión entre cliente y vendedor se ha deshabilitado por
  // decisión de producto; la función se conserva por si se reactiva.
  const handleChangeRole = (user: any, targetRole: 'tenant_user' | 'vendedor') => {
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
  void handleChangeRole

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

  const rolDe = (u: any) => Array.isArray(u.superadmin_roles) ? u.superadmin_roles[0] : u.superadmin_roles
  const orgDe = (u: any) => Array.isArray(u.organizaciones) ? u.organizaciones[0] : u.organizaciones
  const tipoDe = (u: any) => u.rol === 'super_admin' ? 'Superadmin' : u.rol === 'vendedor' ? 'Vendedor' : 'Cliente'

  const claseSelect = 'h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition'

  return (
    <div className={PAGINA}>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">
            {defaultFiltro === 'Clientes' ? 'Clientes' : defaultFiltro === 'Vendedores' ? 'Vendedores' : defaultFiltro === 'Superadmins' ? 'Superadmins' : 'Usuarios'}
          </h1>
          <p className="text-ink-500 mt-1">Gestión centralizada de todos los usuarios de la plataforma.</p>
        </div>
      </div>

      <Tabla
        filas={users}
        idDe={u => u.id}
        cargando={loading}
        nombre={['usuario', 'usuarios']}
        buscar={{ placeholder: 'Buscar por nombre o correo…', en: u => `${u.nombre || ''} ${u.email || ''} ${orgDe(u)?.nombre || ''}` }}
        pestanas={[
          { id: 'todos', etiqueta: 'Todos' },
          { id: 'activo', etiqueta: 'Activos', filtro: u => !!u.activo },
          { id: 'inactivo', etiqueta: 'Inactivos', filtro: u => !u.activo }
        ]}
        herramientas={defaultFiltro === 'Clientes' ? (
          <>
            <select value={tenantFiltro} onChange={e => setTenantFiltro(e.target.value)} aria-label="Organización" className={claseSelect}>
              <option value="">Cualquier organización</option>
              {organizaciones.map(o => (
                <option key={o.id} value={o.id}>{o.nombre}</option>
              ))}
            </select>
            <select value={planFiltro} onChange={e => setPlanFiltro(e.target.value)} aria-label="Plan" className={claseSelect}>
              <option value="">Cualquier plan</option>
              {planes.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <select value={rolEmpresaFiltro} onChange={e => setRolEmpresaFiltro(e.target.value)} aria-label="Rol en empresa" className={claseSelect}>
              <option value="todos">Todos los roles</option>
              <option value="propietario">Propietarios</option>
              <option value="resto">Resto de roles</option>
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-500">Alta</span>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} aria-label="Alta desde" className={claseSelect} />
              <span className="text-ink-400 text-sm">–</span>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} aria-label="Alta hasta" className={claseSelect} />
            </div>
          </>
        ) : undefined}
        ordenInicial={{ clave: 'alta', direccion: 'desc' }}
        columnas={[
          { clave: 'usuario', titulo: 'Usuario', enMovil: 'titulo', valor: u => u.nombre || u.email || '', render: u => (
            <div className="min-w-0">
              <p className="font-600 text-ink-900 truncate">{u.nombre || 'Sin nombre'}</p>
              <p className="text-xs text-ink-500 truncate">{u.email}</p>
            </div>
          ) },
          { clave: 'tipo', titulo: 'Tipo', valor: u => tipoDe(u), render: u => u.rol === 'super_admin' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 text-xs font-600 border border-purple-100">Superadmin</span>
          ) : u.rol === 'vendedor' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-600 border border-emerald-100">Vendedor</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-600 border border-blue-100">Cliente</span>
          ) },
          { clave: 'organizacion', titulo: 'Organización / Nivel', valor: u => (u.rol === 'super_admin' ? `Nivel ${rolDe(u)?.nivel ?? 5} ${rolDe(u)?.nombre || 'Rol base'}` : orgDe(u)?.nombre || ''), render: u => {
            const superadminRole = rolDe(u)
            const orgData = orgDe(u)
            if (u.rol === 'super_admin') {
              return (
                <div className="flex flex-col">
                  <span className="text-xs font-600 text-purple-700">Nivel {superadminRole?.nivel ?? 5}</span>
                  <span className="text-xs text-ink-500 truncate">{superadminRole?.nombre || 'Rol base'}</span>
                </div>
              )
            }
            return u.tenant_id ? (
              <Link href={`/superadmin/organizaciones`} onClick={e => e.stopPropagation()} className="text-brand-600 hover:underline text-sm truncate block max-w-[200px]">
                {orgData?.nombre || 'Organización Desconocida'}
              </Link>
            ) : (
              <span className="text-xs text-ink-400">Sin organización</span>
            )
          } },
          { clave: 'alta', titulo: 'Alta', valor: u => u.fecha_creacion || '', render: u => <span className="text-ink-500 text-xs whitespace-nowrap">{u.fecha_creacion ? new Date(u.fecha_creacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span> },
          { clave: 'estado', titulo: 'Estado', alinear: 'centro', valor: u => (u.activo ? 'Activo' : 'Inactivo'), render: u => (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-600 ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {u.activo ? 'Activo' : 'Inactivo'}
            </span>
          ) }
        ]}
        acciones={canWrite ? (u => (
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => handleToggleActivo(u)}
              className="p-1.5 text-ink-400 hover:text-ink-900 hover:bg-slate-100 rounded-lg transition"
              title={u.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
              aria-label={u.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
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
              aria-label="Enviar email de reseteo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </button>
            {u.rol === 'super_admin' ? (
              <>
                <button onClick={() => { setSelectedUserForNivel(u); setSelectedRoleId(u.superadmin_rol_id || ''); setModalNivelOpen(true); }} className="ml-1 px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition whitespace-nowrap">
                  Modificar nivel
                </button>
                <button onClick={() => handleDegradarSuperadmin(u)} className="px-3 h-8 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 text-xs font-600 text-rose-600 transition whitespace-nowrap">
                  Quitar superadmin
                </button>
              </>
            ) : (
              <button disabled title="Cambio de rol deshabilitado. Si necesitas cambiarlo, elimina y recrea la cuenta." className="ml-1 px-3 h-8 rounded-lg border border-slate-200 bg-slate-50 text-xs font-600 text-slate-400 cursor-not-allowed whitespace-nowrap">
                Cambiar rol
              </button>
            )}
          </div>
        )) : undefined}
        vacio={<p className="text-ink-500">No se encontraron usuarios.</p>}
      />

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
