import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase con permisos de administrador (bypasses RLS)
// IMPORTANTE: Nunca usar en el cliente, solo en Server Actions o Route Handlers
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)
