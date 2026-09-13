'use client'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getVendedores, getInvitacionesSuperadmin, reenviarInvitacionSuperadmin, cancelarInvitacionSuperadmin } from '@/app/actions/superadmin'
import PanelInvitaciones from '@/components/invitaciones/PanelInvitaciones'
import Link from 'next/link'
import VendedorModal from '@/components/vendedores/VendedorModal'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'

const AVATAR_COLORES = ['bg-brand-100 text-brand-700', 'bg-blue-100 text-blue-700', 'bg-orange-100 text-orange-700', 'bg-purple-100 text-purple-700']

// El color del avatar sale del id, así no cambia al ordenar o filtrar
function colorAvatar(id: string) {
  let h = 0
  for (const ch of String(id || '')) h = (h + ch.charCodeAt(0)) % AVATAR_COLORES.length
  return AVATAR_COLORES[h]
}

export default function VendedoresPage() {
  const router = useRouter()
  const [vendedores, setVendedores] = useState<any[]>([])
  const [invitaciones, setInvitaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedVendedor, setSelectedVendedor] = useState<any>(null)

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('vendedores', 'escritura')

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const [res, resInv] = await Promise.all([getVendedores(), getInvitacionesSuperadmin()])
    if (res.success && res.vendedores) setVendedores(res.vendedores)
    // Un vendedor invitado no existe en `vendedores` hasta que se registra:
    // sin este bloque, quien invitaba no volvía a ver ni rastro.
    if (resInv.success && resInv.vendedores) setInvitaciones(resInv.vendedores)
    setLoading(false)
  }

  const openCrear = () => {
    setModalMode('crear')
    setSelectedVendedor(null)
    setIsModalOpen(true)
  }

  const openEditar = (v: any) => {
    setModalMode('editar')
    setSelectedVendedor(v)
    setIsModalOpen(true)
  }

  const totalClientes = vendedores.reduce((acc, v) => acc + (v.vendedor_clientes?.length || 0), 0)
  const totalActivos = vendedores.filter(v => v.activo).length

  const numClientes = (v: any) => v.vendedor_clientes?.length || 0
  const clientesActivos = (v: any) => v.vendedor_clientes?.filter((c: any) => c.estado_seguimiento === 'activo').length || 0
  const formatFecha = (d: string) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  return (
    <div className={PAGINA}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Vendedores</h1>
          <p className="text-ink-500 mt-1">Afiliados externos que traen clientes a Respondi.</p>
        </div>
        {canWrite && (
          <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo vendedor
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Vendedores activos</p>
          <p className="font-display font-700 text-2xl text-ink-900">{totalActivos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total registrados</p>
          <p className="font-display font-700 text-2xl text-ink-900">{vendedores.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Clientes en cartera</p>
          <p className="font-display font-700 text-2xl text-ink-900">{totalClientes}</p>
        </div>
      </div>

      {/* Invitaciones de vendedor: existen antes de que la persona se registre */}
      {invitaciones.length > 0 && (
        <div className="mb-6">
          <PanelInvitaciones
            titulo="Invitaciones de vendedor"
            descripcion="Todavía no se han registrado. Aparecerán en la lista de abajo en cuanto creen su cuenta."
            invitaciones={invitaciones}
            canWrite={canWrite}
            onReenviar={reenviarInvitacionSuperadmin}
            onCancelar={cancelarInvitacionSuperadmin}
            onCambio={cargar}
          />
        </div>
      )}

      {/* Lista */}
      <Tabla
        filas={vendedores}
        idDe={v => v.id}
        cargando={loading}
        nombre={['vendedor', 'vendedores']}
        buscar={{ placeholder: 'Buscar por nombre o correo…', en: v => `${v.nombre || ''} ${v.email || ''}` }}
        pestanas={[
          { id: 'todos', etiqueta: 'Todos' },
          { id: 'activos', etiqueta: 'Activos', filtro: v => !!v.activo },
          { id: 'inactivos', etiqueta: 'Inactivos', filtro: v => !v.activo }
        ]}
        ordenInicial={{ clave: 'alta', direccion: 'desc' }}
        onFilaClick={v => router.push(`/superadmin/vendedores/${v.id}`)}
        columnas={[
          { clave: 'nombre', titulo: 'Vendedor', enMovil: 'titulo', valor: v => v.nombre || '', render: v => (
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-600 text-sm shrink-0 ${colorAvatar(v.id)} ${!v.activo ? 'opacity-40' : ''}`}>
                {(v.nombre || '??').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-600 text-ink-900 truncate">{v.nombre}</p>
                  {!v.activo && (
                    <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Inactivo</span>
                  )}
                </div>
                <p className="text-xs text-ink-500 truncate">{v.email}</p>
              </div>
            </div>
          ) },
          { clave: 'conversion', titulo: 'Comisión conversión', valor: v => Number(v.comision_conversion_pct || 0), render: v => <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-600 whitespace-nowrap">Conv. {v.comision_conversion_pct}%</span> },
          { clave: 'mrr', titulo: 'Comisión MRR', valor: v => Number(v.comision_mrr_pct || 0), render: v => <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-600 whitespace-nowrap">MRR {v.comision_mrr_pct}%</span> },
          { clave: 'clientes', titulo: 'Clientes', valor: v => numClientes(v), render: v => <span className="text-ink-700 whitespace-nowrap">{numClientes(v)} <span className="text-ink-400">· {clientesActivos(v)} activos</span></span> },
          { clave: 'alta', titulo: 'Alta', valor: v => v.created_at || '', render: v => <span className="text-ink-500 whitespace-nowrap">{formatFecha(v.created_at)}</span> }
        ]}
        acciones={v => (
          <>
            {canWrite && (
              <button onClick={() => openEditar(v)} className="px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition" title="Editar vendedor">Editar</button>
            )}
            <Link href={`/superadmin/vendedores/${v.id}`} className="ml-2 inline-flex items-center px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition">Ver</Link>
          </>
        )}
        vacio={<p className="text-ink-500">No hay vendedores que coincidan con los filtros.</p>}
      />

      <VendedorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
        vendedor={selectedVendedor}
        onSuccess={cargar}
      />
    </div>
  )
}
