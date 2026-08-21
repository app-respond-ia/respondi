'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleFijarTicket(ticketId: string, tipo: 'vendedor' | 'cliente', fijar: boolean) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No autorizado')

    if (fijar) {
      const payload: any = {
        user_id: session.user.id,
        ...(tipo === 'vendedor' ? { support_ticket_id: ticketId } : { client_ticket_id: ticketId })
      }
      const { error } = await supabase.from('tickets_fijados').insert(payload)
      if (error && error.code !== '23505') throw error // Ignorar si ya está fijado (unique constraint)
    } else {
      const column = tipo === 'vendedor' ? 'support_ticket_id' : 'client_ticket_id'
      const { error } = await supabase.from('tickets_fijados')
        .delete()
        .eq('user_id', session.user.id)
        .eq(column, ticketId)
      if (error) throw error
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
