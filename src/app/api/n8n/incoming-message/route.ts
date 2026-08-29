import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import crypto from 'crypto'

function secureCompare(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function POST(req: Request) {
  try {
    // 1. Autenticación a prueba de timing
    const secretHeader = req.headers.get('x-n8n-webhook-secret') || ''
    const expectedSecret = process.env.N8N_WEBHOOK_SECRET || ''
    
    if (!secretHeader || !expectedSecret || !secureCompare(secretHeader, expectedSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Usamos formData para soportar adjuntos binarios nativamente desde n8n
    const formData = await req.formData()
    
    const channelExternalId = formData.get('channel_external_id') as string
    const contactExternalId = formData.get('contact_external_id') as string
    const contactName = formData.get('contact_name') as string || 'Desconocido'
    const messageExternalId = formData.get('message_external_id') as string
    const content = formData.get('content') as string || ''
    const media = formData.get('media') as File | null

    if (!channelExternalId || !contactExternalId || !messageExternalId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 2. Resolución de Canal (Origen Seguro de la Verdad)
    const { data: channel, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('tenant_id, branch_id, tipo')
      .eq('identificador_externo', channelExternalId)
      .eq('estado', 'activo')
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ error: 'Channel not found or inactive' }, { status: 404 })
    }

    const tenantId = channel.tenant_id
    const branchId = channel.branch_id
    const canalTipo = channel.tipo

    // 3 y 4. Resolución Atómica de Contexto (Contacto, Conversación, Caso)
    const { data: context, error: rpcError } = await supabaseAdmin.rpc('resolve_incoming_message_context', {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_canal: canalTipo,
      p_identificador_canal: contactExternalId,
      p_nombre_contacto: contactName
    })

    if (rpcError || !context) {
      console.error('Error in resolve_incoming_message_context:', rpcError)
      return NextResponse.json({ error: 'Internal server error resolving context' }, { status: 500 })
    }

    const { conversation_id } = context as any

    // 5. Validación y Gestión de Adjuntos (Storage)
    let mediaUrl = null
    let mediaTipo = null

    if (media && media.size > 0) {
      // 50 MB en bytes
      const MAX_FILE_SIZE = 50 * 1024 * 1024
      if (media.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 })
      }

      // Validar MIME types permitidos (Imágenes, Audios, Videos, Documentos comunes)
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/amr', 'audio/aac', 'audio/wav',
        'video/mp4', 'video/mpeg', 'video/webm',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
      
      if (!allowedMimeTypes.includes(media.type)) {
        return NextResponse.json({ error: `Unsupported media type: ${media.type}` }, { status: 400 })
      }

      const arrayBuffer = await media.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const extension = media.name.split('.').pop() || 'bin'
      const filePath = `${tenantId}/${conversation_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('whatsapp_media')
        .upload(filePath, buffer, {
          contentType: media.type || 'application/octet-stream',
          upsert: false
        })

      if (uploadError) {
        console.error('Error uploading media to storage:', uploadError)
        return NextResponse.json({ error: 'Error uploading media' }, { status: 500 })
      }

      // Guardamos la RUTA RELATIVA en la DB, no una URL firmada.
      // El bucket es PRIVADO. Firmar una URL aquí (con expiresIn) y guardarla en DB
      // rompería el historial del chat cuando la firma expire.
      mediaUrl = filePath
      mediaTipo = media.type || 'application/octet-stream'
    }

    // 6. Persistencia del Mensaje
    const { data: newMessage, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversation_id,
        remitente: 'cliente',
        contenido: content,
        media_url: mediaUrl,
        media_tipo: mediaTipo,
        identificador_externo: messageExternalId
      })
      .select('id')
      .single()

    if (insertError) {
      // 23505 es unique_violation en PostgreSQL
      if (insertError.code === '23505') {
        console.log(`Mensaje duplicado ignorado silenciosamente: ${messageExternalId}`)
        // Recuperamos el ID existente para retornarlo a n8n y cerrar el ciclo correctamente
        const { data: existingMessage } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('identificador_externo', messageExternalId)
          .single()

        return NextResponse.json({ success: true, message_id: existingMessage?.id })
      }

      console.error('Error inserting message:', insertError)
      return NextResponse.json({ error: 'Internal server error saving message' }, { status: 500 })
    }

    // 7. Emisión de Eventos (Realtime)
    // El frontend suscrito al canal del tenant en 'messages' recibirá el broadcast automáticamente por los triggers/config de Supabase Realtime.

    return NextResponse.json({ success: true, message_id: newMessage.id })

  } catch (err: any) {
    console.error('Unhandled webhook error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
