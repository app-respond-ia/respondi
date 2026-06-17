'use server'

import { createClient } from '@/utils/supabase/server'

export async function actualizarContrasena(formData: FormData) {
  const password = formData.get('password') as string
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  return { success: true }
}
