'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { enviarMensajeSaliente } from '@/lib/canales/salida'

export async function getConversaciones(filtros?: { estado?: string, canal?: string, search?: string, iaPausada?: boolean, dateRange?: { from: string, to: string }, sort?: 'asc' | 'desc' }) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const tenantId = auth.tenant_id
  const user = { id: auth.user_id }

  let query = supabase
    .from('conversations')
    .select(`
      id,
      estado,
      canal,
      ia_pausada,
      fecha_inicio,
      fecha_ultimo_mensaje,
      resumen,
      contacts:contact_id (nombre, canal, identificador_canal),
      conversation_tags (
        message_categories (nombre, color)
      ),
      cases (id, estatus, agente:agente_id(nombre))
    `)
    .eq('tenant_id', tenantId)
    // Cada tienda ve solo sus conversaciones (antes salían las de todas)
    .eq('branch_id', auth.branch_id)
    .order('fecha_ultimo_mensaje', { ascending: filtros?.sort === 'asc', nullsFirst: false })

  if (filtros?.estado && filtros.estado !== 'Todas') {
    const est = filtros.estado === 'Abiertas' ? 'activa' : filtros.estado === 'Cerradas' ? 'cerrada' : null
    if (est) query = query.eq('estado', est)
  }
  
  if (filtros?.canal && filtros.canal !== 'Todos') {
    query = query.eq('canal', filtros.canal.toLowerCase())
  }

  if (filtros?.iaPausada) {
    query = query.eq('ia_pausada', true)
  }

  if (filtros?.dateRange?.from) {
    query = query.gte('fecha_inicio', filtros.dateRange.from)
  }
  if (filtros?.dateRange?.to) {
    // Add 23:59:59 to include the whole end day
    query = query.lte('fecha_inicio', filtros.dateRange.to + 'T23:59:59.999Z')
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  let result = data || []
  
  if (filtros?.search) {
    const s = filtros.search.toLowerCase()
    result = result.filter(c => {
      const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
      return (
        (contact?.nombre && contact.nombre.toLowerCase().includes(s)) ||
        (contact?.identificador_canal && contact.identificador_canal.toLowerCase().includes(s)) ||
        (c.resumen && c.resumen.toLowerCase().includes(s)) ||
        (c.conversation_tags && c.conversation_tags.some((t: any) => t.message_categories?.nombre?.toLowerCase().includes(s)))
      )
    })
  }

  return { success: true, data: result }
}

export async function pausarIA(convId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  const { data: cambiada, error } = await supabase
    .from('conversations')
    .update({ ia_pausada: true, atendida_por: user.id })
    .eq('id', convId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .select('id')

  if (!error && !cambiada?.length) return { success: false, error: 'Conversación no encontrada' }

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: 'pausó la IA en la conversación',
      tabla_afectada: 'conversations',
      registro_id: convId
    })
  }

  return { success: !error, error: error?.message }
}

export async function reanudarIA(convId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  
  const { data: cambiada, error } = await supabase
    .from('conversations')
    .update({ ia_pausada: false, atendida_por: null })
    .eq('id', convId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .select('id')

  if (!error && !cambiada?.length) return { success: false, error: 'Conversación no encontrada' }

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: 'reanudó la IA en la conversación',
      tabla_afectada: 'conversations',
      registro_id: convId
    })
  }

  return { success: !error, error: error?.message }
}

// Cuando una persona escribe al cliente, la IA se aparta: se pausa en esa
// conversación y da por contestado todo lo que el cliente había escrito hasta
// ahora. Antes la IA seguía activa y el cliente podía recibir a la vez la
// respuesta del agente y la de la IA. Vale igual para un texto que para una
// plantilla de WhatsApp.
type ResultadoEscribir =
  | { success: true; iaPausadaAhora: boolean; envio: string; errorEnvio: string | null; error?: undefined }
  | { success: false; error: string; iaPausadaAhora?: undefined; envio?: undefined; errorEnvio?: undefined }

async function escribirComoAgente(convId: string, mensaje: { contenido: string; plantilla?: { nombre: string; idioma: string; parametros: string[] } }): Promise<ResultadoEscribir> {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: String(auth.error) }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, estado, ia_pausada')
    .eq('id', convId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()

  if (!conv) return { success: false, error: 'Conversación no encontrada' }
  if (conv.estado !== 'activa') {
    return { success: false, error: 'La conversación está cerrada. Reábrela para escribir al cliente.' }
  }

  const { data: nuevo, error } = await supabase
    .from('messages')
    .insert({
      tenant_id: auth.tenant_id,
      conversation_id: convId,
      remitente: 'agente',
      contenido: mensaje.contenido,
      agente_id: auth.user_id,
      agrupado: true,
      ...(mensaje.plantilla ? { plantilla: mensaje.plantilla } : {})
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  // Lo que el cliente había escrito ya lo ha contestado una persona: la IA no
  // debe volver sobre ello si más adelante se reactiva.
  await supabase
    .from('messages')
    .update({ agrupado: true })
    .eq('conversation_id', convId)
    .eq('agrupado', false)

  const iaPausadaAhora = !conv.ia_pausada
  await supabase
    .from('conversations')
    .update({
      fecha_ultimo_mensaje: new Date().toISOString(),
      ...(iaPausadaAhora ? { ia_pausada: true, atendida_por: auth.user_id } : {})
    })
    .eq('id', convId)

  const { registrarAuditoria } = await import('@/lib/auditoria')
  if (iaPausadaAhora) {
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: 'pausó la IA al escribir al cliente',
      tabla_afectada: 'conversations',
      registro_id: convId
    })
  }
  if (mensaje.plantilla) {
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: `envió la plantilla de WhatsApp "${mensaje.plantilla.nombre}" al cliente`,
      tabla_afectada: 'conversations',
      registro_id: convId
    })
  }

  // Y ahora sí, hacia el WhatsApp del cliente
  const envio = await enviarMensajeSaliente(nuevo.id)

  return { success: true, iaPausadaAhora, envio: envio.estado, errorEnvio: envio.error || null }
}

export async function enviarMensajeAgenteConv(convId: string, contenido: string): Promise<ResultadoEscribir> {
  const texto = contenido?.trim()
  if (!texto) return { success: false, error: 'El mensaje no puede estar vacío.' }
  return escribirComoAgente(convId, { contenido: texto })
}

// Pasadas 24 h desde el último mensaje del cliente, WhatsApp solo deja
// escribirle con una plantilla aprobada. Se guarda con el texto ya rellenado
// (es lo que se ve en Chats) y sale hacia Meta como plantilla.
export async function enviarPlantillaConv(convId: string, plantillaId: string, valores: string[]): Promise<ResultadoEscribir> {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: String(auth.error) }

  const { data: plantilla } = await supabase
    .from('whatsapp_templates')
    .select('id, nombre, idioma, estado, contenido, componentes')
    .eq('id', plantillaId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()

  if (!plantilla) return { success: false, error: 'Plantilla no encontrada en esta sucursal.' }
  if (plantilla.estado !== 'aprobada') return { success: false, error: 'Esa plantilla no está aprobada por Meta, así que no se puede enviar.' }

  const { analizarComponentes, rellenar } = await import('@/lib/canales/plantillas-texto')
  const info = analizarComponentes(plantilla.componentes as any[], plantilla.contenido)
  if (!info.enviable) return { success: false, error: `Esta plantilla no se puede enviar desde Respondi: ${info.motivoNoEnviable?.toLowerCase()}.` }

  const parametros = info.huecos.map((_, i) => (valores?.[i] || '').trim())
  if (parametros.some(v => !v)) return { success: false, error: 'Rellena todos los huecos de la plantilla.' }
  if (parametros.some(v => v.length > 1000 || /\n|\t|\s{5,}/.test(v))) {
    return { success: false, error: 'Los huecos no pueden llevar saltos de línea, tabuladores ni muchos espacios seguidos (WhatsApp no lo permite).' }
  }

  const texto = [info.cabecera, rellenar(info.cuerpo, parametros), info.pie].filter(Boolean).join('\n\n')
  return escribirComoAgente(convId, {
    contenido: texto,
    plantilla: { nombre: plantilla.nombre, idioma: plantilla.idioma, parametros }
  })
}

// La ficha de un cliente: todas sus conversaciones con esta sucursal, de la
// más antigua a la más reciente, para leerlas de arriba abajo como un hilo.
// De cada una va lo necesario para verla plegada (fechas, resumen, etiquetas,
// caso y notas internas); los mensajes se piden al desplegarla, salvo los de
// la conversación desde la que se ha abierto la ficha. Solo las de esta
// sucursal: lo que el cliente habló con otra no se comparte.
export async function getHiloCliente(convId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: origen } = await supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('id', convId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  if (!origen) return { success: false, error: 'Conversación no encontrada' }

  const [{ data: contacto }, { data: convs, error }] = await Promise.all([
    supabase.from('contacts').select('id, nombre, canal, identificador_canal, created_at').eq('id', origen.contact_id).maybeSingle(),
    supabase
      .from('conversations')
      .select(`
        id, estado, canal, ia_pausada, fecha_inicio, fecha_cierre, fecha_ultimo_mensaje, resumen,
        conversation_tags ( message_categories (nombre, color) ),
        cases ( id, estatus, agente:agente_id (nombre) )
      `)
      .eq('tenant_id', auth.tenant_id)
      .eq('branch_id', auth.branch_id)
      .eq('contact_id', origen.contact_id)
      .order('fecha_inicio', { ascending: true })
  ])
  if (error) return { success: false, error: error.message }

  const ids = (convs || []).map(c => c.id)
  const { data: notas } = ids.length
    ? await supabase
        .from('internal_notes')
        .select('id, conversation_id, contenido, created_at, users:user_id (nombre, email)')
        .in('conversation_id', ids)
        .order('created_at', { ascending: true })
    : { data: [] as any[] }

  const { data: mensajesActuales } = await supabase
    .from('messages')
    .select('*, users(nombre)')
    .eq('conversation_id', convId)
    .order('timestamp', { ascending: true })

  const conversaciones = (convs || []).map((c: any) => ({
    ...c,
    etiquetas: (c.conversation_tags || []).map((t: any) => t.message_categories).filter(Boolean),
    caso: c.cases?.[0] || null,
    notas: (notas || []).filter((n: any) => n.conversation_id === c.id)
  }))

  return {
    success: true,
    data: {
      contacto,
      conversaciones,
      conversacionActual: convId,
      mensajesActuales: mensajesActuales || [],
      totalCasos: conversaciones.filter(c => c.caso).length
    }
  }
}
