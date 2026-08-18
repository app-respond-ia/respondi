import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsTabs from './NotificationsTabs'

export const metadata = {
  title: 'Notificaciones - Respondi Vendedores',
}

export default async function NotificacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
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
        <h1 className="text-2xl font-700 text-ink-900 font-display">Notificaciones</h1>
        <p className="text-ink-500 mt-1">Revisa tus alertas recientes y ajusta tus preferencias.</p>
      </div>

      <NotificationsTabs 
        initialNotifications={notifications || []} 
        initialPreferences={preferences || []} 
      />
    </div>
  )
}
