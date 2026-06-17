'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actualizarContrasena } from '@/app/actions/auth-recovery'

export default function RestablecerContrasenaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (password.length < 8) {
      setErrorMsg('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.')
      return
    }

    setIsLoading(true)
    const formData = new FormData()
    formData.append('password', password)
    
    const res = await actualizarContrasena(formData)
    setIsLoading(false)

    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setIsSuccess(true)
    }
  }

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
        <div className="w-full max-w-sm">
          
          {isSuccess ? (
            <div className="animate-fade-in-up bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 p-7 sm:p-9 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </div>
              <h1 className="font-display font-700 text-2xl text-ink-900 mb-1.5">¡Contraseña actualizada!</h1>
              <p className="text-ink-500 mb-6">Tu nueva contraseña se ha guardado correctamente.</p>
              
              <button onClick={() => router.push('/')}
                className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 shadow-lg shadow-brand-600/30 transition">
                Ir al dashboard
              </button>
            </div>
          ) : (
            <div className="animate-fade-in-up bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 p-7 sm:p-9">
              <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              </div>

              <h1 className="font-display font-700 text-2xl text-ink-900 mb-1.5">Crea tu nueva contraseña</h1>
              <p className="text-ink-500 mb-6">Elige una contraseña segura para tu cuenta.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nueva contraseña</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Confirmar contraseña</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  {password !== confirmPassword && confirmPassword.length > 0 && (
                    <p className="text-red-500 text-xs mt-1">Las contraseñas no coinciden.</p>
                  )}
                </div>

                {errorMsg && <p className="text-red-500 text-sm font-500">{errorMsg}</p>}

                <button type="submit" disabled={isLoading || password !== confirmPassword || password.length < 8}
                  className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 mt-2">
                  {isLoading ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </div>
          )}
          
          {!isSuccess && (
            <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-500 text-ink-500 hover:text-ink-700 mt-6 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              Volver al inicio de sesión
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
