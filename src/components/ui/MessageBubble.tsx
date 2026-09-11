import React from 'react'

interface MessageBubbleProps {
  msg: any
  contactName?: string
  channelId?: string
}

function getInitials(name: string) {
  if (!name) return '?'
  return name.substring(0, 2).toUpperCase()
}

// La hora, y el día si no es de hoy: un mensaje de ayer con solo "14:14"
// parecía de hoy (y en WhatsApp importa, por las 24 h)
function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const hora = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return hora
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${hora}`
  const fecha = d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}) })
  return `${fecha}, ${hora}`
}

// Cómo va el envío de un mensaje hacia el cliente (IA o agente)
const ESTADO_ENVIO: Record<string, { texto: string; clase: string; titulo: string }> = {
  pendiente: { texto: '🕓', clase: 'text-ink-400', titulo: 'Enviando…' },
  reintentar: { texto: '🕓', clase: 'text-amber-600', titulo: 'No se pudo enviar; se está reintentando' },
  enviado: { texto: '✓', clase: 'text-ink-400', titulo: 'Enviado' },
  entregado: { texto: '✓✓', clase: 'text-ink-400', titulo: 'Entregado' },
  leido: { texto: '✓✓', clase: 'text-sky-500', titulo: 'Leído' },
  fallido: { texto: '⚠ No enviado', clase: 'text-rose-600', titulo: 'No ha llegado al cliente' }
}

export function MessageBubble({ msg, contactName, channelId }: MessageBubbleProps) {
  const isCliente = msg.remitente === 'cliente'
  const isIA = msg.remitente === 'ia'

  if (isCliente) {
    return (
      <div className="flex gap-2.5">
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-600 shrink-0">
          {getInitials(contactName || channelId || '')}
        </div>
        <div className="max-w-[75%]">
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5">
            {msg.asunto && <p className="text-xs font-600 text-ink-700 mb-1 break-words">Asunto: {msg.asunto}</p>}
            <p className="text-sm text-ink-900 whitespace-pre-wrap break-words">{msg.contenido}</p>
          </div>
          <p className="text-[11px] text-ink-400 mt-1 ml-1">{formatTime(msg.timestamp)}</p>
        </div>
      </div>
    )
  } else {
    const bgClass = isIA ? 'bg-brand-100 text-brand-900' : 'bg-emerald-100 text-emerald-900'
    const labelColor = isIA ? 'text-brand-600' : 'text-emerald-700'
    
    return (
      <div className="flex gap-2.5 justify-end">
        <div className="max-w-[75%]">
          <div className={`${bgClass} rounded-2xl rounded-tr-sm px-4 py-2.5`}>
            {msg.asunto && <p className="text-xs font-600 opacity-80 mb-1 break-words">Asunto: {msg.asunto}</p>}
            <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-1 mr-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-600 ${labelColor}`}>
              {isIA ? 'IA' : (msg.users?.nombre || 'Agente')}
            </span>
            {msg.plantilla?.nombre && (
              <span className="text-[10px] font-600 text-ink-500 bg-slate-100 px-1.5 py-0.5 rounded" title={`Plantilla de WhatsApp "${msg.plantilla.nombre}"`}>
                Plantilla
              </span>
            )}
            <span className="text-[11px] text-ink-400">{formatTime(msg.timestamp)}</span>
            {msg.estado_envio && ESTADO_ENVIO[msg.estado_envio] && (
              <span className={`text-[11px] font-600 ${ESTADO_ENVIO[msg.estado_envio].clase}`} title={msg.error_envio || ESTADO_ENVIO[msg.estado_envio].titulo}>
                {ESTADO_ENVIO[msg.estado_envio].texto}
              </span>
            )}
          </div>
          {msg.estado_envio === 'fallido' && msg.error_envio && (
            <p className="text-[11px] text-rose-600 mt-0.5 mr-1 text-right max-w-xs ml-auto">{msg.error_envio}</p>
          )}
        </div>
      </div>
    )
  }
}
