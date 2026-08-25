import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ConfiguracionForm from './ConfiguracionForm'

export const metadata = {
  title: 'Configuración - Respondi',
}

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Verificar el proveedor
  const provider = user.app_metadata?.provider || 'email'

  return (
    <div className="max-w-3xl mx-auto space-y-8 w-full">
      <div>
        <h1 className="text-2xl font-700 text-ink-900 font-display">Configuración de cuenta</h1>
        <p className="text-ink-500 mt-1">Gestiona las opciones de seguridad de tu cuenta.</p>
      </div>

      {provider === 'email' ? (
        <ConfiguracionForm />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-600 text-ink-900 font-display">Cuenta vinculada externa</h2>
          <p className="text-ink-500 mt-2 max-w-md mx-auto">
            Tu cuenta está vinculada con un proveedor externo ({provider}). 
            La contraseña y otros métodos de seguridad se gestionan directamente desde tu cuenta de {provider}, no desde aquí.
          </p>
        </div>
      )}
    </div>
  )
}
