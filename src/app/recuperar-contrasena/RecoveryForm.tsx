'use client'

import { useState } from 'react'
import { resetPasswordForEmail } from '@/app/actions/auth'

export default function RecoveryForm() {
  const [email, setEmail] = useState('')
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError(null)
    const result = await resetPasswordForEmail(formData)
    setIsLoading(false)
    
    if (result?.error) {
      setError(result.error)
    } else {
      setIsSent(true)
    }
  }

  if (isSent) {
    return (
      <div className="animate-fade-in-up bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 p-7 sm:p-9 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        </div>

        <h1 className="font-display font-700 text-2xl text-ink-900 mb-1.5">Revisa tu correo</h1>
        <p className="text-ink-500 mb-1">Hemos enviado un enlace de recuperación a</p>
        <p className="font-600 text-ink-900 mb-6">{email}</p>

        <div className="rounded-xl bg-brand-50 border border-brand-100 p-3.5 text-left mb-6">
          <p className="text-sm text-ink-700">
            El enlace caduca en 1 hora. Si no lo ves, revisa la carpeta de spam.
          </p>
        </div>

        <form action={handleSubmit}>
          <input type="hidden" name="email" value={email} />
          <button type="submit" disabled={isLoading}
            className="w-full h-12 rounded-xl border border-slate-300 bg-white font-600 text-ink-700 hover:bg-slate-50 transition disabled:opacity-50">
            {isLoading ? 'Reenviando...' : 'Volver a enviar'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 p-7 sm:p-9">
      <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
      </div>

      <h1 className="font-display font-700 text-2xl text-ink-900 mb-1.5">¿Olvidaste tu contraseña?</h1>
      <p className="text-ink-500 mb-6">
        Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.
      </p>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Correo electrónico</label>
          <div className="relative">
            <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            <input name="email" type="email" placeholder="tucorreo@comercio.com" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={isLoading}
          className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
          {isLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
        </button>
      </form>
    </div>
  )
}
