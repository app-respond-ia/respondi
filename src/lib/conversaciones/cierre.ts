import { supabaseAdmin } from '@/utils/supabase/admin'
import { generarResumen } from '@/lib/ai/generarResumen'
import { registrarError } from '@/lib/errores'
import { ESTADOS_CASO_ABIERTOS } from '@/lib/casos/estados'

// Una conversación puede terminar de cuatro formas: un agente resuelve su caso
// desde Casos, lo resuelve desde el detalle del caso, cierra la conversación
// desde Chats, o se queda 24 h parada. Cada camino hacía una cosa distinta:
//   · cerrar desde Chats dejaba el caso abierto, colgado de una conversación
//     cerrada, y el aviso de "caso sin resolver" saltaba para siempre;
//   · resolver desde el detalle del caso no cerraba la conversación;
//   · resolver desde Casos la cerraba pero sin fecha de cierre;
//   · y solo el cierre por inactividad generaba el resumen, así que la IA NO
//     recordaba las conversaciones que había cerrado una persona — justo las
//     que suelen importar.
// Todas pasan ahora por aquí, para que terminen igual.

// Cierra la conversación y, si le queda un caso abierto, lo da por resuelto.
// Usa el cliente que le pasen: la acción ya ha comprobado quién es el usuario.
export async function cerrarConversacionYCaso(
  supabase: any,
  conversationId: string,
  tenantId: string,
  notaCaso: string
) {
  const ahora = new Date().toISOString()

  const { error: errConv } = await supabase
    .from('conversations')
    .update({ estado: 'cerrada', fecha_cierre: ahora, ia_procesando_desde: null })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)

  if (errConv) return { success: false, error: errConv.message }

  const { data: casosAbiertos } = await supabase
    .from('cases')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .in('estatus', ESTADOS_CASO_ABIERTOS as unknown as string[])

  for (const caso of casosAbiertos || []) {
    const { error: errCaso } = await supabase
      .from('cases')
      .update({ estatus: 'resuelto', fecha_cierre: ahora })
      .eq('id', caso.id)

    if (!errCaso) {
      await supabase.from('case_notes').insert({
        tenant_id: tenantId, case_id: caso.id, user_id: null, nota: notaCaso
      })
    }
  }

  return { success: true }
}

// Genera y guarda el resumen de una conversación ya cerrada, que es lo que la
// IA lee para "recordar" a ese cliente la próxima vez. Pensado para lanzarse en
// segundo plano (`after()`), porque llama a OpenAI y el agente no tiene por
// qué esperar a que termine.
export async function resumirConversacionCerrada(conversationId: string) {
  try {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('tenant_id, branch_id, estado, resumen, fecha_ultimo_resumen, fecha_ultimo_mensaje')
      .eq('id', conversationId)
      .single()

    if (!conv || conv.estado !== 'cerrada') return

    // Si ya hay un resumen posterior al último mensaje, no hace falta otro.
    if (conv.resumen && conv.fecha_ultimo_resumen && conv.fecha_ultimo_mensaje &&
        new Date(conv.fecha_ultimo_resumen) >= new Date(conv.fecha_ultimo_mensaje)) return

    const resumen = await generarResumen(conversationId, conv.tenant_id, conv.branch_id)
    if (!resumen) return

    await supabaseAdmin
      .from('conversations')
      .update({ resumen, fecha_ultimo_resumen: new Date().toISOString() })
      .eq('id', conversationId)
  } catch (err: any) {
    await registrarError({
      origen: 'llm',
      descripcion: 'Fallo al resumir una conversación cerrada (la IA no la recordará)',
      stacktrace: JSON.stringify({ conversationId, message: err?.message })
    })
  }
}
