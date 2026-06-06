import AcceptForm from './AcceptForm'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function AceptarInvitacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Si no hay sesión (porque no entró por el link o caducó)
    redirect('/login?error=InvalidInviteLink')
  }

  // Obtener detalles del usuario de la base de datos
  const { data: userData } = await supabase
    .from('users')
    .select('rol, invitacion_aceptada')
    .eq('id', user.id)
    .single()

  if (userData?.invitacion_aceptada) {
    // Ya había aceptado la invitación
    redirect('/')
  }

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Administrador',
    admin: 'Administrador de la Tienda',
    agente: 'Agente de Atención',
    operario: 'Operario',
  }

  const userRole = userData?.rol ? roleLabels[userData.rol] : 'Colaborador'

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-center gap-2.5 px-6 pt-10">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        </div>
        <span className="font-display font-700 text-lg">Respondi</span>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 p-7 sm:p-9">
            
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
              <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center shrink-0">
                🚀
              </div>
              <div className="min-w-0">
                <p className="text-sm text-ink-500">Invitación al equipo</p>
                <p className="font-600 text-ink-900 truncate">Bienvenido a Respondi</p>
              </div>
            </div>

            <h1 className="font-display font-700 text-2xl text-ink-900 mb-1.5">Activa tu cuenta</h1>
            <p className="text-ink-500 mb-6">
              Se ha creado una cuenta para ti como <span className="font-600 text-brand-700">{userRole}</span>. Elige cómo quieres acceder para activarla.
            </p>

            <AcceptForm userEmail={user.email || ''} />

          </div>

          <p className="text-center text-xs text-ink-400 mt-5 leading-relaxed">
            ¿No esperabas esta invitación? Puedes ignorar este mensaje de forma segura.
          </p>
        </div>
      </div>
    </div>
  )
}
