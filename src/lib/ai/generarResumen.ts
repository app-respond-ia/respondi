import OpenAI from 'openai'
import { supabaseAdmin } from '@/utils/supabase/admin'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-placeholder'
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// El resumen no usa herramientas, así que vale cualquier modelo barato. Se
// queda en el mismo que el resto (4o mini) para no tener dos precios que
// cuadrar. Medido el 14-09-2026: es más barato que el gpt-5.6-luna que había
// escrito a fuego aquí (0,15/0,60 frente a 0,20/1,20 por millón).
const MODELO = process.env.RESUMEN_MODELO_IA || 'gpt-4o-mini'
const PRICING = {
  input: 0.15 / 1000000,
  output: 0.60 / 1000000
}

export async function generarResumen(conversationId: string, tenantId: string, branchId: string): Promise<string | null> {
  // 1. Cargar historial completo (agrupados y no agrupados)
  const { data: allMessages } = await supabaseAdmin
    .from('messages')
    .select('remitente, contenido')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })

  if (!allMessages || allMessages.length === 0) return null

  // 2. Preparar el contexto
  const textoConversacion = allMessages.map(m => `${m.remitente.toUpperCase()}: ${m.contenido}`).join('\n')

  const systemPrompt = `Eres un sistema analítico interno.
Tu tarea es leer la siguiente conversación entre un cliente y el sistema (bot/agente) y redactar un resumen conciso y directo en 2 o 3 frases como máximo.
El resumen debe capturar qué solicitaba el cliente y cuál fue la resolución o el estado en el que se quedó, para darle contexto a la IA en un futuro si el cliente vuelve a escribir.
No saludes ni añadas florituras, ve directo al grano.`

  try {
    const response = await openai.chat.completions.create({
      model: MODELO,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textoConversacion }
      ]
    })

    const resumenFinal = response.choices[0].message.content || 'Sin resumen.'
    const tokensInput = response.usage?.prompt_tokens || 0
    const tokensOutput = response.usage?.completion_tokens || 0
    const costeTotal = (tokensInput * PRICING.input) + (tokensOutput * PRICING.output)

    // 3. Registrar coste en ai_logs (sin tocar cuotas de message_quotas)
    const { error: errorLog } = await supabaseAdmin.from('ai_logs').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      message_id: null,
      modelo_ia: MODELO,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      costo_estimado_usd: costeTotal,
      resultado: 'resumen'
    })

    if (errorLog) {
      console.error('Error insertando ai_log de resumen:', errorLog)
    }

    return resumenFinal

  } catch (error) {
    console.error('Error en generarResumen:', error)
    return null
  }
}
