'use client'

// Panel reutilizable para listar invitaciones pendientes.
//
// Lo usan el panel de superadmin (vendedores, organizaciones y la ficha de
// un vendedor) porque las tres pantallas necesitan exactamente lo mismo:
// ver quién ha sido invitado y todavía no se ha dado de alta, reenviarle el
// correo o cancelar la invitación.

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

export type InvitacionUI = {
  id: string
  email: string
  aceptada: boolean
  created_at: string
  estado: 'aceptada' | 'pendiente' | 'caducada'
  email_valido: boolean
  posible_errata_de?: string | null
  tipo?: string
  nombre?: string | null
  nombre_organizacion?: string | null
  vendedor_id?: string | null
  vendedor_nombre?: string | null
  invitado_por?: string | null
}

type Props = {
  titulo: string
  descripcion: string
  invitaciones: InvitacionUI[]
  canWrite: boolean
  onReenviar: (id: string) => Promise<{ success: boolean; error?: string }>
  onCancelar: (id: string) => Promise<{ success: boolean; error?: string }>
  onCambio: () => void
  // Mostrar de qué vendedor viene la invitación (no aplica en la ficha de un
  // vendedor concreto, donde ya se sabe).
  mostrarVendedor?: boolean
  vacioTexto?: string
}

function formatFecha(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PanelInvitaciones({
  titulo,
  descripcion,
  invitaciones,
  canWrite,
  onReenviar,
  onCancelar,
  onCambio,
  mostrarVendedor = false,
  vacioTexto = 'No hay invitaciones pendientes.'
}: Props) {
  const { showToast } = useToast()
  const [verAceptadas, setVerAceptadas] = useState(false)
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null)
  const [aCancelar, setACancelar] = useState<InvitacionUI | null>(null)
  const [cancelando, setCancelando] = useState(false)

  const abiertas = invitaciones.filter(i => !i.aceptada)
  const aceptadas = invitaciones.filter(i => i.aceptada)
  const caducadas = abiertas.filter(i => i.estado === 'caducada')
  const invalidas = abiertas.filter(i => !i.email_valido)

  const visibles = verAceptadas ? invitaciones : abiertas

  const handleReenviar = async (inv: InvitacionUI) => {
    setAccionEnCurso(inv.id)
    const res = await onReenviar(inv.id)
    setAccionEnCurso(null)
    if (res.success) showToast(`Invitación reenviada a ${inv.email}`, 'success')
    else showToast(res.error || 'No se pudo reenviar la invitación', 'error')
  }

  const handleCancelar = async () => {
    if (!aCancelar) return
    setCancelando(true)
    const res = await onCancelar(aCancelar.id)
    setCancelando(false)
    if (res.success) {
      showToast('Invitación cancelada', 'success')
      setACancelar(null)
      onCambio()
    } else {
      showToast(res.error || 'No se pudo cancelar la invitación', 'error')
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display font-600 text-base text-ink-900">{titulo}</h2>
            <p className="text-sm text-ink-500 mt-0.5">{descripcion}</p>
          </div>
          {aceptadas.length > 0 && (
            <button
              type="button"
              onClick={() => setVerAceptadas(v => !v)}
              className="text-xs font-600 text-brand-600 hover:text-brand-700 transition shrink-0"
            >
              {verAceptadas ? 'Ocultar aceptadas' : `Ver aceptadas (${aceptadas.length})`}
            </button>
          )}
        </div>

        {/* Resumen medible del embudo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 text-center">
          <div className="py-3">
            <p className="font-display font-700 text-xl text-ink-900">{invitaciones.length}</p>
            <p className="text-[11px] text-ink-500 uppercase tracking-wide">Enviadas</p>
          </div>
          <div className="py-3">
            <p className="font-display font-700 text-xl text-amber-600">{abiertas.length - caducadas.length}</p>
            <p className="text-[11px] text-ink-500 uppercase tracking-wide">Pendientes</p>
          </div>
          <div className="py-3">
            <p className="font-display font-700 text-xl text-emerald-600">{aceptadas.length}</p>
            <p className="text-[11px] text-ink-500 uppercase tracking-wide">Aceptadas</p>
          </div>
          <div className="py-3">
            <p className="font-display font-700 text-xl text-ink-900">
              {invitaciones.length > 0 ? Math.round((aceptadas.length / invitaciones.length) * 100) : 0}%
            </p>
            <p className="text-[11px] text-ink-500 uppercase tracking-wide">Cierre</p>
          </div>
        </div>

        {invalidas.length > 0 && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">
            {invalidas.length === 1
              ? '1 invitación tiene un email mal escrito: nunca llegó el correo y no se podrá aceptar. Cancélala y vuelve a enviarla.'
              : `${invalidas.length} invitaciones tienen el email mal escrito: nunca llegó el correo y no se podrán aceptar. Cancélalas y vuelve a enviarlas.`}
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {visibles.length === 0 ? (
            <div className="p-8 text-center text-ink-500">{vacioTexto}</div>
          ) : (
            visibles.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 p-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900 text-sm">
                      {inv.nombre_organizacion || inv.nombre || inv.email}
                    </p>
                    <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded ${
                      inv.estado === 'aceptada' ? 'bg-emerald-100 text-emerald-700' :
                      inv.estado === 'caducada' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {inv.estado === 'aceptada' ? 'Aceptada' : inv.estado === 'caducada' ? 'Caducada' : 'Pendiente'}
                    </span>
                    {!inv.email_valido && (
                      <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        Email no válido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5 truncate">
                    {inv.email} · enviada el {formatFecha(inv.created_at)}
                    {mostrarVendedor && inv.vendedor_nombre && ` · vendedor: ${inv.vendedor_nombre}`}
                    {!inv.vendedor_nombre && inv.invitado_por && ` · invitó: ${inv.invitado_por}`}
                  </p>
                  {inv.posible_errata_de && (
                    <p className="text-xs text-amber-700 mt-1">
                      Parece una errata: ya existe la cuenta <strong>{inv.posible_errata_de}</strong>.
                      Si era esa, cancela esta invitación.
                    </p>
                  )}
                </div>

                {canWrite && !inv.aceptada && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleReenviar(inv)}
                      disabled={accionEnCurso === inv.id || !inv.email_valido}
                      title={!inv.email_valido ? 'El email no es válido, no se puede reenviar' : undefined}
                      className="px-3 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {accionEnCurso === inv.id ? 'Enviando...' : 'Reenviar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setACancelar(inv)}
                      className="px-3 h-9 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs font-600 text-ink-700 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!aCancelar}
        title="Cancelar invitación"
        message={`Se eliminará la invitación de "${aCancelar?.email}". Si esa persona intenta registrarse con ese email, ya no quedará vinculada automáticamente.`}
        confirmText="Cancelar invitación"
        cancelText="Volver"
        type="danger"
        isLoading={cancelando}
        onConfirm={handleCancelar}
        onClose={() => !cancelando && setACancelar(null)}
      />
    </>
  )
}
