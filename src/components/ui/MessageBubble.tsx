import React from 'react'

interface MessageBubbleProps {
  msg: any
  contactName?: string
  channelId?: string
}

// La foto, el vídeo o el archivo que lleva el mensaje. El enlace es temporal
// (lo crea el servidor al cargar los mensajes): el almacén es privado.
function Archivos({ msg }: { msg: any }) {
  // Un correo puede traer varios; WhatsApp, uno
  const lista = Array.isArray(msg.adjuntos) && msg.adjuntos.length
    ? msg.adjuntos.map((a: any) => ({ tipo: a.tipo, enlace: a.enlace, nombre: a.nombre }))
    : msg.media_url ? [{ tipo: msg.media_tipo, enlace: msg.media_enlace, nombre: String(msg.media_url).split('/').pop() }] : []
  if (!lista.length) return null
  return <>{lista.map((a: any, i: number) => <Archivo key={i} archivo={a} />)}</>
}

function Archivo({ archivo }: { archivo: { tipo?: string | null; enlace?: string | null; nombre?: string | null } }) {
  const tipo = String(archivo.tipo || '')
  const enlace = archivo.enlace || undefined
  const nombre = archivo.nombre || 'archivo'

  if (!enlace) {
    return <p className="text-xs text-ink-400 mb-1">📎 Archivo adjunto (no se ha podido abrir)</p>
  }
  if (tipo.startsWith('image/')) {
    return (
      <a href={enlace} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enlace} alt="Archivo enviado en el chat" className="rounded-xl max-h-64 w-auto max-w-full object-cover" />
      </a>
    )
  }
  if (tipo.startsWith('video/')) {
    return <video src={enlace} controls className="rounded-xl max-h-64 w-full mb-1.5" />
  }
  if (tipo.startsWith('audio/')) {
    return <audio src={enlace} controls className="w-full mb-1.5" />
  }
  return (
    <a href={enlace} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded-xl bg-white/70 border border-slate-200 text-xs font-600 text-ink-700 hover:bg-white transition">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
      <span className="truncate">{nombre}</span>
    </a>
  )
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
            <Archivos msg={msg} />
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
            <Archivos msg={msg} />
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
