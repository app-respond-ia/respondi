import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'

// Helper interno: Recrea crearCasoDesdeConversacion pero para llamadas de sistema (sin sesión)
async function crearCasoDesdeSistema(conversationId: string, tenantId: string, branchId: string, contactId: string, motivo: string) {
  // Verificar si ya existe un caso ACTIVO (no cerrado) para evitar conflictos con unique_active_case
  const { data: existingCase } = await supabaseAdmin
    .from('cases')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .neq('estatus', 'cerrado')
    .maybeSingle()

  if (existingCase) return existingCase.id

  const { data: nuevoCaso, error } = await supabaseAdmin
    .from('cases')
    .insert([{
      tenant_id: tenantId,
      branch_id: branchId,
      contact_id: contactId,
      conversation_id: conversationId,
      tipo: 'normal',
      descripcion: motivo,
      estatus: 'pendiente',
      agente_id: null,
      fecha_apertura: new Date().toISOString()
    }])
    .select('id')
    .single()

  if (error) {
    console.error('Error insertando caso derivado automáticamente:', error)
    return null
  }

  if (nuevoCaso) {
    await notificarAAdminsDeOrganizacion(supabaseAdmin, tenantId, {
      tipo: 'conversacion_escalada',
      titulo: 'Conversación derivada a soporte',
      cuerpo: 'Se ha creado un nuevo caso automáticamente que requiere atención humana.',
      url: `/dashboard/casos/${nuevoCaso.id}`,
      entidadId: nuevoCaso.id
    })
    return nuevoCaso.id
  }
  return null
}

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

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select(`
      id, tenant_id, branch_id, contact_id, ia_pausada,
      contacts:contact_id (trato, modo, respuesta_auto),
      sucursales:branch_id (
        modo_pausa, timezone, blacklist_respuesta_auto,
        business_profiles (ia_activa_fuera_horario, msg_fuera_horario, msg_cuota_agotada, msg_pausa_automatica, abrir_caso_fuera_horario),
        business_hours (dia_semana, apertura, cierre, cerrado)
      )
    `)
    .eq('id', conversationId)
    .single()

  if (!conv) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  const liberarCandado = async () => {
    await supabaseAdmin.from('conversations').update({ ia_procesando_desde: null }).eq('id', conversationId)
  }

  // ============================================================================
  // 3. JERARQUÍA DE REGLAS
  // ============================================================================
  try {
    if (conv.ia_pausada) {
      await liberarCandado()
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
        const msg = contact.respuesta_auto || branch?.blacklist_respuesta_auto || 'En este momento no podemos atenderte.'
        await supabaseAdmin.from('messages').insert({
          tenant_id: conv.tenant_id, conversation_id: conversationId, remitente: 'ia', contenido: msg
        })
      }
      await liberarCandado()
      return NextResponse.json({ status: `Ignorado (Trato contacto: ${contact.trato}, Modo: ${contact.modo})` })
    }

    if (branch && branch.modo_pausa === 'apagada') {
      await liberarCandado()
      return NextResponse.json({ status: 'Ignorado (Sucursal pausada/apagada)' })
    }
    
    if (branch && profile && isFueraDeHorario(branch.timezone, hours)) {
      if (profile.ia_activa_fuera_horario === false) {
        if (profile.msg_fuera_horario) {
          await supabaseAdmin.from('messages').insert({
            tenant_id: conv.tenant_id, conversation_id: conversationId, remitente: 'ia', contenido: profile.msg_fuera_horario
          })
        }
        if (profile.abrir_caso_fuera_horario) {
          await crearCasoDesdeSistema(conversationId, conv.tenant_id, conv.branch_id, conv.contact_id, 'Contacto fuera de horario comercial.')
        }
        await liberarCandado()
        return NextResponse.json({ status: 'Ignorado (Fuera de horario comercial)' })
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
      return NextResponse.json({ status: 'Ignorado (Cuota agotada)' })
    }

    // ============================================================================
    // 5. FLUJO LIBRE PARA LA IA
    // ============================================================================
    
    // TODO: aquí va la llamada a la IA (siguiente prompt)

    await liberarCandado()
    return NextResponse.json({ status: 'Exito (Listo para integrar IA)' })

  } catch (error: any) {
    await liberarCandado()
    console.error('Error en webhook IA:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
