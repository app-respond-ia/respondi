'use client'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { getCorreosDescartados, tratarCorreoComoCliente, ignorarRemitenteCorreo } from '@/app/actions/canales'
import { traducirError } from '@/lib/traducirError'

// Los correos que llegaron al buzón y la IA no contestó (avisos de
// plataformas, publicidad, internos, solo en copia, remitentes marcados). Si
// el filtro se equivocó, «Tratar como cliente» abre la conversación y la IA
// lo contesta. «No contestar nunca» añade el remitente a la lista del buzón.

const TEXTO_MOTIVO: Record<string, string> = {
  automatico: 'respuesta automática o boletín',
  en_copia: 'solo iba en copia',
  remitente_ignorado: 'remitente marcado',
  interno: 'correo interno',
  notificacion: 'aviso automático',
  publicidad: 'publicidad',
  otro: 'no parece un cliente'
}

type Fila = { id: string; de: string; nombre: string | null; asunto: string | null; motivo: string; adjuntos: number; recibido_en: string }

export function CorreosDescartados({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { showToast } = useToast()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = async () => {
    const r = await getCorreosDescartados()
    if (r.success) setFilas((r.data || []) as Fila[])
  }
  useEffect(() => { cargar() }, [])

  if (!filas || filas.length === 0) return null

  const tratar = async (f: Fila) => {
    setOcupado(f.id)
    const r = await tratarCorreoComoCliente(f.id)
    setOcupado(null)
    if (!r.success) return showToast(traducirError(r.error), 'error')
    showToast('Abierta la conversación: la IA lo contesta en un momento', 'success')
    cargar()
  }
  const ignorar = async (f: Fila, dominio: boolean) => {
    setOcupado(f.id)
    const r = await ignorarRemitenteCorreo(dominio ? f.de.split('@')[1] : f.de)
    setOcupado(null)
    if (!r.success) return showToast(traducirError(r.error), 'error')
    showToast(dominio ? `No se contestará a nadie de ${f.de.split('@')[1]}` : `No se contestará a ${f.de}`, 'success')
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm text-ink-700"><strong className="text-ink-900">{filas.length}</strong> {filas.length === 1 ? 'correo que la IA no ha contestado' : 'correos que la IA no ha contestado'} <span className="text-ink-400">(avisos, publicidad, internos)</span></span>
        <span className="text-xs font-600 text-brand-600">{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>
      {abierto && (
        <ul className="border-t border-slate-100 divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {filas.map(f => (
            <li key={f.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900 truncate"><span className="font-600">{f.nombre || f.de}</span>{f.nombre ? <span className="text-ink-400"> · {f.de}</span> : null}</p>
                <p className="text-xs text-ink-600 truncate">{f.asunto || '(sin asunto)'}{f.adjuntos ? ` · ${f.adjuntos} adjunto${f.adjuntos === 1 ? '' : 's'}` : ''}</p>
                <p className="text-xs text-ink-400">{new Date(f.recibido_en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {TEXTO_MOTIVO[f.motivo] || f.motivo}</p>
              </div>
              {puedeEscribir && (
                <div className="flex items-center gap-3 shrink-0 text-xs font-600">
                  <button onClick={() => tratar(f)} disabled={ocupado === f.id} className="text-brand-600 hover:underline disabled:opacity-50">Tratar como cliente</button>
                  {f.motivo !== 'remitente_ignorado' && (
                    <button onClick={() => ignorar(f, false)} disabled={ocupado === f.id} className="text-ink-500 hover:text-ink-800 hover:underline disabled:opacity-50">No contestar nunca</button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
