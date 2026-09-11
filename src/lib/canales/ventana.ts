import { supabaseAdmin } from '@/utils/supabase/admin'

// La ventana de 24 h de WhatsApp: solo se puede escribir libremente al
// cliente durante las 24 h siguientes a su último mensaje (en cualquiera de
// sus conversaciones con la sucursal). Después, solo con una plantilla.
export const VENTANA_WHATSAPP_MS = 24 * 3600 * 1000

export async function ultimoMensajeDelCliente(contactId: string, branchId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('timestamp, conversations!inner(contact_id, branch_id)')
    .eq('remitente', 'cliente')
    .eq('conversations.contact_id', contactId)
    .eq('conversations.branch_id', branchId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.timestamp || null
}

export function ventanaAbierta(ultimoDelCliente: string | null) {
  return !!ultimoDelCliente && Date.now() - new Date(ultimoDelCliente).getTime() < VENTANA_WHATSAPP_MS
}
