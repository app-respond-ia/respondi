'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function marcarNotificacionLeida(id: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('No autorizado')

    const { error } = await supabase
      .from('notifications')
      .update({ leida: true })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw new Error(error.message)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function marcarTodasLeidas() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('No autorizado')

    const { error } = await supabase
      .from('notifications')
      .update({ leida: true })
      .eq('user_id', user.id)
      .eq('leida', false)

    if (error) throw new Error(error.message)
    revalidatePath('/vendedor/notificaciones')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function actualizarPreferencia(tipo: string, activado: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('No autorizado')

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ 
        user_id: user.id, 
        tipo, 
        activado 
      }, { 
        onConflict: 'user_id, tipo' 
      })

    if (error) throw new Error(error.message)
    revalidatePath('/vendedor/notificaciones')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
