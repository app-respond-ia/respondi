'use server'

import { createClient } from '@/utils/supabase/server'

import { getAuthContext } from '@/lib/auth-context'
import { after } from 'next/server'
import { cerrarConversacionYCaso, resumirConversacionCerrada } from '@/lib/conversaciones/cierre'
import { casoTerminado } from '@/lib/casos/estados'
import { reabrirCaso } from './casos'

export async function getCasoDetalle(caseId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  // 1. Obtener el caso principal
  const { data: casoData, error: casoError } = await supabase
    .from('cases')
    .select(`
      *,
      contacts (
        nombre,
        canal,
        identificador_canal
      ),
      producto:price_list (
        nombre
      ),
      conversation_tags:conversations (
        id,
        conversation_tags (
          message_categories (
            nombre,
            color
          )
        )
      )
    `)
    .eq('id', caseId)
    .eq('tenant_id', auth.tenant_id)
    .eq('agente_id', auth.user_id)
    .single()

  if (casoError || !casoData) {
    return { success: false, error: 'Caso no encontrado' }
  }

  // Extraer el primer tag si existe
  let tag = null
  if (casoData.conversation_tags && casoData.conversation_tags.conversation_tags) {
    const tagsArray = Array.isArray(casoData.conversation_tags.conversation_tags) 
      ? casoData.conversation_tags.conversation_tags 
      : [casoData.conversation_tags.conversation_tags]
    
    const firstTag = tagsArray[0]
    if (firstTag?.message_categories) {
      tag = firstTag.message_categories
    }
  }

  const caso = {
    ...casoData,
    primer_tag: tag
  }

  // 2. Obtener los mensajes de la conversación
  let mensajes = []
  if (casoData.conversation_id) {
    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('*, users(nombre)')
      .eq('conversation_id', casoData.conversation_id)
      .order('timestamp', { ascending: true })

    if (!messagesError && messagesData) {
      mensajes = messagesData
    }
  }

  // 3. Obtener las notas del caso
  let notas = []
  const { data: notesData, error: notesError } = await supabase
    .from('case_notes')
    .select(`
      *,
      users (
        nombre
      )
    `)
    .eq('case_id', caseId)
    .order('timestamp', { ascending: true })

  if (!notesError && notesData) {
    notas = notesData
  }

  return { 
    success: true, 
    data: { 
      caso, 
      mensajes, 
      notas 
    } 
  }
}

export async function actualizarEstadoCaso(caseId: string, estatus: 'pendiente' | 'atendiendo' | 'resuelto') {
  const validEstatus = ['pendiente', 'atendiendo', 'resuelto']
  if (!validEstatus.includes(estatus)) {
    return { success: false, error: 'Estatus inválido' }
  }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  // Solo el agente que lleva el caso puede cambiar su estado.
  const { data: actual } = await supabase
    .from('cases')
    .select('id, estatus, conversation_id')
    .eq('id', caseId)
    .eq('tenant_id', auth.tenant_id)
    .eq('agente_id', auth.user_id)
    .maybeSingle()

  if (!actual) return { success: false, error: 'No puedes cambiar el estado de un caso que no llevas tú.' }

  // Reabrir un caso ya resuelto va por el mismo camino que "Reabrir caso" en
  // Chats: si el cliente ya tiene otra conversación activa, el caso se engancha
  // a ella. Hacerlo aquí con un simple cambio de estado dejaba el caso colgado
  // de una conversación cerrada.
  if (estatus !== 'resuelto' && casoTerminado(actual.estatus)) {
    const res = await reabrirCaso(caseId)
    if (!res.success) return { success: false, error: res.error }
    // Al reabrir, el caso puede haberse llevado a la conversación actual del
    // cliente: a partir de aquí se trabaja con esa.
    const { data: movido } = await supabase.from('cases').select('conversation_id').eq('id', caseId).single()
    if (movido) actual.conversation_id = movido.conversation_id
  }

  const payload: any = { estatus }
  payload.fecha_cierre = estatus === 'resuelto' ? new Date().toISOString() : null

  const { data, error } = await supabase
    .from('cases')
    .update(payload)
    .eq('id', caseId)
    .eq('tenant_id', auth.tenant_id)
    .eq('agente_id', auth.user_id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // Ponerse a atender el caso es lo mismo que tomarlo: la IA se aparta.
  if (estatus === 'atendiendo' && actual.conversation_id) {
    await supabase
      .from('conversations')
      .update({ ia_pausada: true, atendida_por: auth.user_id })
      .eq('id', actual.conversation_id)
      .eq('tenant_id', auth.tenant_id)
  }

  // Resolver el caso desde aquí hace lo mismo que desde Casos: cierra su
  // conversación (antes se quedaba abierta) y genera el resumen.
  if (estatus === 'resuelto' && actual.conversation_id) {
    await cerrarConversacionYCaso(supabase, actual.conversation_id, auth.tenant_id, 'Resuelto desde el detalle del caso')
    const convId = actual.conversation_id
    after(() => resumirConversacionCerrada(convId))
  }

  return { success: true, data }
}

export async function agregarNotaCaso(caseId: string, nota: string) {
  if (!nota || nota.trim().length === 0) {
    return { success: false, error: 'La nota no puede estar vacía' }
  }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  const { data, error } = await supabase
    .from('case_notes')
    .insert({
      tenant_id: auth.tenant_id,
      case_id: caseId,
      user_id: auth.user_id,
      nota: nota.trim()
    })
    .select(`
      *,
      users (
        nombre
      )
    `)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data }
}
