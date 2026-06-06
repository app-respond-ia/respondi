'use client'

import { useState } from 'react'
import { signupTrial, loginWithGoogle } from '@/app/actions/auth'
import Link from 'next/link'

export default function SignupForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    const terms = formData.get('terms')
    const risk = formData.get('risk')

    if (!terms || !risk) {
      setError('Debes aceptar los términos y la conexión de WhatsApp para continuar.')
      return
    }

    setIsLoading(true)
    setError(null)
    const result = await signupTrial(formData)
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    }
  }

  async function handleGoogle() {
    setIsLoading(true)
    setError(null)
    const result = await loginWithGoogle()
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
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
          Registrarme con Google
        </button>
      </form>

      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-slate-200"></div>
        <span className="text-xs text-ink-400 font-500">o con tu correo</span>
        <div className="flex-1 h-px bg-slate-200"></div>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre de tu comercio</label>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <input name="comercio" type="text" placeholder="Ej. Mi Tienda" required
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Tu nombre completo</label>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            <input name="nombre" type="text" placeholder="Ej. Ana Martínez" required
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Correo electrónico</label>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <input name="email" type="email" placeholder="tucorreo@comercio.com" required
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Crea una contraseña</label>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <input name="password" type={showPassword ? "text" : "password"} placeholder="Mínimo 8 caracteres" required minLength={8}
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

        <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
          <input name="terms" type="checkbox" className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400 shrink-0" required />
          <span className="text-sm text-ink-700 leading-relaxed">
            Acepto los <Link href="#" className="font-500 text-brand-600 hover:text-brand-700">Términos del servicio</Link> y la <Link href="#" className="font-500 text-brand-600 hover:text-brand-700">Política de privacidad</Link>.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer select-none rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <input name="risk" type="checkbox" className="mt-0.5 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-400 shrink-0" required />
          <span className="text-sm text-amber-900 leading-relaxed">
            <span className="flex items-center gap-1.5 font-600 mb-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"/></svg>
              Conexión de WhatsApp en la prueba
            </span>
            Durante el trial, WhatsApp se conecta por un método no oficial de Meta. Entiendo y acepto que Meta podría suspender el número sin previo aviso, bajo mi responsabilidad.
          </span>
        </label>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={isLoading}
          className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 shadow-lg shadow-brand-600/30 transition mt-2 disabled:opacity-50">
          {isLoading ? 'Creando cuenta...' : 'Empezar mis 14 días gratis'}
        </button>
      </form>

      <p className="text-center text-sm text-ink-500 mt-7">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-600 text-brand-600 hover:text-brand-700">Inicia sesión</Link>
      </p>
    </>
  )
}
