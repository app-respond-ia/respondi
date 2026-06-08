'use client'

import { useState } from 'react'
import { login, loginWithGoogle } from '@/app/actions/auth'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError(null)
    const result = await login(formData)
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      if (result?.session) {
        const supabase = createClient()
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })
      }
      window.location.href = '/'
    }
  }

  async function handleGoogle() {
    setIsLoading(true)
    setError(null)
    const result = await loginWithGoogle()
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    }
  }

  return (
    <>
      <form action={handleGoogle}>
        <button type="submit" className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-slate-300 bg-white font-500 text-ink-700 hover:bg-slate-50 hover:border-slate-400 transition">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 010-4.18V7.07H2.18a11 11 0 000 9.86l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 002.18 7.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z"/>
          </svg>
          Continuar con Google
        </button>
      </form>

      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-slate-200"></div>
        <span className="text-xs text-ink-400 font-500">o con tu correo</span>
        <div className="flex-1 h-px bg-slate-200"></div>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Correo electrónico</label>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <input name="email" type="email" placeholder="tucorreo@comercio.com" required
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-500 text-ink-700">Contraseña</label>
            <Link href="/recuperar-contrasena" className="text-sm font-500 text-brand-600 hover:text-brand-700">¿La olvidaste?</Link>
          </div>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <input name="password" type={showPassword ? "text" : "password"} placeholder="••••••••" required
              className="w-full h-12 pl-11 pr-12 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-400 hover:text-ink-700">
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m6.88 6.88L21 21"/></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              )}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
          <span className="text-sm text-ink-700">Mantener sesión iniciada</span>
        </label>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={isLoading}
          className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
          {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="text-center text-sm text-ink-500 mt-7">
        ¿Tu comercio aún no usa Respondi?{' '}
        <Link href="/registro-trial" className="font-600 text-brand-600 hover:text-brand-700">Prueba gratis 14 días</Link>
      </p>

      <p className="text-center text-xs text-ink-400 mt-3 leading-relaxed">
        Si tu administrador te creó una cuenta, revisa tu correo para activar la invitación.
      </p>
    </>
  )
}
