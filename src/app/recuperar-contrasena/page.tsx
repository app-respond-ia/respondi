import RecoveryForm from './RecoveryForm'
import Link from 'next/link'

export default function RecuperarContrasenaPage() {
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
          <RecoveryForm />
          
          <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-500 text-ink-500 hover:text-ink-700 mt-6 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
