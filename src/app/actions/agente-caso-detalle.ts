'use server'

import { createClient } from '@/utils/supabase/server'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización', user_id: user.id }
  }

  return { tenant_id: userData.tenant_id, branch_id: userData.branch_id, user_id: user.id }
}

export async function getCasoDetalle(caseId: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  
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
      .select('*')
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
  const auth = await getAuthData(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  const payload: any = { estatus }
  
  if (estatus === 'resuelto') {
    payload.fecha_cierre = new Date().toISOString()
  } else {
    payload.fecha_cierre = null
  }

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

  return { success: true, data }
}

export async function agregarNotaCaso(caseId: string, nota: string) {
  if (!nota || nota.trim().length === 0) {
    return { success: false, error: 'La nota no puede estar vacía' }
  }

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  
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

export async function enviarMensaje(conversationId: string, contenido: string) {
  if (!contenido || contenido.trim().length === 0) {
    return { success: false, error: 'El mensaje no puede estar vacío' }
  }

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  const timestamp = new Date().toISOString()

  // 1. Insertar el mensaje
  const { data, error } = await supabase
    .from('messages')
    .insert({
      tenant_id: auth.tenant_id,
      conversation_id: conversationId,
      remitente: 'agente',
      contenido: contenido.trim(),
      timestamp: timestamp,
      entregado: false
    })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  // 2. Actualizar fecha_ultimo_mensaje en conversations
  await supabase
    .from('conversations')
    .update({ fecha_ultimo_mensaje: timestamp })
    .eq('id', conversationId)
    .eq('tenant_id', auth.tenant_id)

  return { success: true, data }
}
