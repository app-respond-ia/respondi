import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { generarResumen } from '@/lib/ai/generarResumen'
import crypto from 'crypto'

export async function POST(req: Request) {
  let conversationIdToUnlock: string | null = null

  try {
    const authHeader = req.headers.get('Authorization')
    const secret = process.env.CRON_INTERNAL_SECRET

    // Falla cerrado si no hay secreto configurado
    if (!secret || !authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Validación segura contra timing attacks (mismo patrón que api/ai/process)
    if (token.length !== secret.length) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const valid = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
    if (!valid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const conversation_id = body.conversation_id
    if (!conversation_id) {
      return NextResponse.json({ error: 'Falta conversation_id' }, { status: 400 })
    }

    // Setear para el finally
    conversationIdToUnlock = conversation_id

    // 1. Doble validación de condiciones
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('estado, fecha_ultimo_mensaje, fecha_ultimo_resumen, contact_id, branch_id, tenant_id')
      .eq('id', conversation_id)
      .single()

    if (!conv || conv.estado !== 'activa') {
      return NextResponse.json({ status: 'Ignorado (No está activa)' })
    }

    const hoursInactiva = (new Date().getTime() - new Date(conv.fecha_ultimo_mensaje).getTime()) / (1000 * 60 * 60)
    if (hoursInactiva < 24) {
      return NextResponse.json({ status: 'Ignorado (No lleva 24h inactiva)' })
    }

    // 2. Verificar si hay casos pendientes vinculados a esta conversación
    const { data: cases } = await supabaseAdmin
      .from('cases')
      .select('estatus')
      .eq('conversation_id', conversation_id)

    const tieneCasoPendiente = cases?.some(c => !['cerrado', 'resuelto'].includes(c.estatus))

    // 3. Generar el resumen interactuando con OpenAI
    const resumen = await generarResumen(conversation_id, conv.tenant_id, conv.branch_id)

    // Si falló la generación del resumen, se aborta y el finally libera el candado
    if (!resumen) {
      return NextResponse.json({ error: 'Fallo al generar resumen en la IA' }, { status: 500 })
    }

    // 4. Actualizar la base de datos
    const updateData: any = {
      resumen: resumen,
      fecha_ultimo_resumen: new Date().toISOString()
    }

    if (!tieneCasoPendiente) {
      updateData.estado = 'cerrada'
      updateData.fecha_cierre = new Date().toISOString()
    }

    await supabaseAdmin.from('conversations').update(updateData).eq('id', conversation_id)

    return NextResponse.json({ status: 'Exito', cerrada: !tieneCasoPendiente })

  } catch (error: any) {
    console.error('Error en /api/ai/summarize:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    // Liberación garantizada del candado
    if (conversationIdToUnlock) {
      await supabaseAdmin
        .from('conversations')
        .update({ ia_procesando_desde: null })
        .eq('id', conversationIdToUnlock)
    }
  }
}
