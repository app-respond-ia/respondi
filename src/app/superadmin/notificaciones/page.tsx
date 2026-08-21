import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import SuperadminNotificationsTabs from './SuperadminNotificationsTabs'

export const metadata = {
  title: 'Notificaciones - Respondi Superadmin',
}

export default async function SuperadminNotificacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Verificar rol super_admin
  const { data: userData } = await supabase
    .from('users')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!userData || userData.rol !== 'super_admin') {
    redirect('/dashboard')
  }

  // Cargar notificaciones iniciales (primeras 50)
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('timestamp', { ascending: false })
    .limit(50)

  // Cargar preferencias
  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-700 text-ink-900 font-display">Notificaciones de Sistema</h1>
        <p className="text-ink-500 mt-1">Revisa las alertas globales y ajusta tus preferencias de superadministrador.</p>
      </div>

      <SuperadminNotificationsTabs 
        initialNotifications={notifications || []} 
        initialPreferences={preferences || []} 
      />
    </div>
  )
}
