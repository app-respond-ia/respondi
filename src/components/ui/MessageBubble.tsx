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

function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
            <p className="text-sm whitespace-pre-wrap break-words">{msg.contenido}</p>
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-1 mr-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-600 ${labelColor}`}>
              {isIA ? 'IA' : (msg.users?.nombre || 'Agente')}
            </span>
            <span className="text-[11px] text-ink-400">{formatTime(msg.timestamp)}</span>
          </div>
        </div>
      </div>
    )
  }
}
