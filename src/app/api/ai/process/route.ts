import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'

export const dynamic = 'force-dynamic'

import { crearCasoDesdeSistema } from '@/lib/casos/crearCasoDesdeSistema'

// Comprobador de huso horario basado en Intl (nativo)
function isFueraDeHorario(timezone: string, horarios: any[]) {
  // Si no hay horario configurado, asumimos abierto 24/7
  if (!horarios || horarios.length === 0) return false 

  try {
    const dateStr = new Date().toLocaleString('en-US', { timeZone: timezone, hour12: false })
    const dateInTz = new Date(dateStr) 
    const dayOfWeek = dateInTz.getDay() // 0 = Domingo, 6 = Sábado
    const currentMinutes = dateInTz.getHours() * 60 + dateInTz.getMinutes()

    const franjasHoy = horarios.filter(h => h.dia_semana === dayOfWeek && !h.cerrado)
    if (franjasHoy.length === 0) return true // Cerrado todo el día

    for (const franja of franjasHoy) {
      if (!franja.apertura || !franja.cierre) continue
      const [apH, apM] = franja.apertura.split(':').map(Number)
      const [ciH, ciM] = franja.cierre.split(':').map(Number)
      const openMin = apH * 60 + apM
      const closeMin = ciH * 60 + ciM
      
      if (currentMinutes >= openMin && currentMinutes <= closeMin) {
        return false // Está abierto
      }
    }
    return true // Fuera de todas las franjas
  } catch (error) {
    console.error('Error calculando timezone:', error)
    return false
  }
}

export async function POST(req: Request) {
  // ============================================================================
  // 1. AUTENTICACIÓN
  // ============================================================================
  const authHeader = req.headers.get('Authorization')
  const secret = process.env.CRON_INTERNAL_SECRET

  if (!secret || !authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  
  try {
    const isMatch = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
    if (!isMatch) throw new Error()
  } catch (e) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // ============================================================================
  // 2. RECUPERACIÓN DE CONTEXTO
  // ============================================================================
  let body
  try {
    body = await req.json()
  } catch (e) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const conversationId = body.conversation_id
  if (!conversationId) return NextResponse.json({ error: 'conversation_id faltante' }, { status: 400 })

  const { data: conv, error: fetchError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id, tenant_id, branch_id, contact_id, ia_pausada, ia_intentos_fallidos,
      contacts:contact_id (trato, modo, respuesta_auto, nota),
      sucursales:branch_id (
        modo_pausa, timezone, trato_contactos_respuesta_auto,
        business_profiles (ia_activa_fuera_horario, msg_fuera_horario, msg_cuota_agotada, msg_pausa_automatica, abrir_caso_fuera_horario, modo_horario_ia),
        business_hours (dia_semana, apertura, cierre, cerrado, tipo)
      )
    `)
    .eq('id', conversationId)
    .single()

  if (!conv) {
    console.error('Fetch error:', fetchError)
    return NextResponse.json({ error: 'Conversación no encontrada', details: fetchError }, { status: 404 })
  }

  const liberarCandado = async () => {
    await supabaseAdmin.from('conversations').update({ ia_procesando_desde: null }).eq('id', conversationId)
  }

  const logRechazo = async (resultado: string) => {
    await supabaseAdmin.from('ai_logs').insert({
      tenant_id: conv.tenant_id,
      branch_id: conv.branch_id,
      resultado
    })
  }

  // ============================================================================
  // 3. JERARQUÍA DE REGLAS
  // ============================================================================
  try {
    if (conv.ia_pausada) {
      await liberarCandado()
      await logRechazo('pausa')
      return NextResponse.json({ status: 'Ignorado (IA pausada por agente)' })
    }

    const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts
    const branch = Array.isArray(conv.sucursales) ? conv.sucursales[0] : conv.sucursales
    const profile = Array.isArray(branch?.business_profiles) ? branch?.business_profiles[0] : branch?.business_profiles
    const hours = branch?.business_hours || []

    if (contact && contact.trato !== 'normal') {
      if (contact.modo === 'derivar') {
        await crearCasoDesdeSistema(conversationId, conv.tenant_id, conv.branch_id, conv.contact_id, 'Contacto configurado para derivar a humano sin pasar por IA.')
      } else if (contact.modo === 'respuesta_automatica') {
        const msg = contact.respuesta_auto || branch?.trato_contactos_respuesta_auto || 'En este momento no podemos atenderte.'
        await supabaseAdmin.from('messages').insert({
          tenant_id: conv.tenant_id, conversation_id: conversationId, remitente: 'ia', contenido: msg
        })
      }
      await liberarCandado()
      await logRechazo('blacklist')
      return NextResponse.json({ status: `Ignorado (Trato contacto: ${contact.trato}, Modo: ${contact.modo})` })
    }

    if (branch && branch.modo_pausa === 'apagada') {
      await liberarCandado()
      await logRechazo('pausa_sucursal')
      return NextResponse.json({ status: 'Ignorado (Sucursal pausada/apagada)' })
    }
    
    if (branch && profile) {
      const modo = profile.modo_horario_ia || 'mismo_negocio'
      
      if (modo !== 'siempre_activa') {
        const targetTipo = modo === 'personalizado' ? 'ia' : 'negocio'
        const horasAFiltrar = hours.filter((h: any) => h.tipo === targetTipo)
        
        if (isFueraDeHorario(branch.timezone, horasAFiltrar)) {
          if (profile.msg_fuera_horario) {
            await supabaseAdmin.from('messages').insert({
              tenant_id: conv.tenant_id, conversation_id: conversationId, remitente: 'ia', contenido: profile.msg_fuera_horario
            })
          }
          if (profile.abrir_caso_fuera_horario) {
            await crearCasoDesdeSistema(conversationId, conv.tenant_id, conv.branch_id, conv.contact_id, 'Contacto fuera de horario comercial.')
          }
          await liberarCandado()
          await logRechazo('fuera_horario')
          return NextResponse.json({ status: 'Ignorado (Fuera de horario comercial)' })
        }
      }
    }

    // ============================================================================
    // 4. CONTROL DE SALDO
    // ============================================================================
    const { data: quota } = await supabaseAdmin
      .from('message_quotas')
      .select('saldo')
      .eq('tenant_id', conv.tenant_id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    const saldo = quota?.saldo || 0

    if (saldo <= 0) {
      const msg = profile?.msg_cuota_agotada || 'En este momento nuestros agentes están experimentando demoras. Te atenderemos lo antes posible.'
      await supabaseAdmin.from('messages').insert({
        tenant_id: conv.tenant_id, conversation_id: conversationId, remitente: 'ia', contenido: msg
      })
      await crearCasoDesdeSistema(conversationId, conv.tenant_id, conv.branch_id, conv.contact_id, 'Cuota de mensajes agotada. Requiere atención manual.')
      await liberarCandado()
      await logRechazo('sin_cuota')
      return NextResponse.json({ status: 'Ignorado (Cuota agotada)' })
    }

    // ============================================================================
    // 5. FLUJO LIBRE PARA LA IA
    // ============================================================================
    const { generarRespuesta } = await import('@/lib/ai/generarRespuesta')
    const aiResult = await generarRespuesta(conv)

    if (!aiResult.success) {
      // Manejo de intentos fallidos
      const intentos = (conv.ia_intentos_fallidos || 0) + 1
      if (intentos >= 3) {
        // Escalar por error de sistema
        await crearCasoDesdeSistema(
          conversationId, 
          conv.tenant_id, 
          conv.branch_id, 
          conv.contact_id, 
          'Escalado automático: La IA ha fallado 3 veces consecutivas.'
        )
        await supabaseAdmin.from('conversations').update({ 
          ia_intentos_fallidos: 0, 
          ia_pausada: true 
        }).eq('id', conversationId)
      } else {
        await supabaseAdmin.from('conversations').update({ 
          ia_intentos_fallidos: intentos 
        }).eq('id', conversationId)
      }
      throw new Error(aiResult.error || 'Fallo en la generación de IA')
    }

    // Si tuvo éxito, reseteamos fallos a 0
    if (conv.ia_intentos_fallidos > 0) {
      await supabaseAdmin.from('conversations').update({ ia_intentos_fallidos: 0 }).eq('id', conversationId)
    }

    await liberarCandado()
    return NextResponse.json({ status: 'Exito (Proceso IA finalizado)' })

  } catch (error: any) {
    await liberarCandado()
    console.error('Error en webhook IA:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
