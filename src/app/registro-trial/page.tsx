import SignupForm from './SignupForm'

export default function RegistroTrialPage() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* ============ PANEL DE MARCA (solo ordenador) ============ */}
      <div className="hidden lg:flex relative flex-col justify-center overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-ink-900 text-white p-12">
        <div className="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-brand-500/30 blur-2xl"></div>
        <div className="absolute bottom-10 -left-20 w-72 h-72 rounded-full bg-brand-400/20 blur-2xl"></div>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '28px 28px' }}></div>

        <div className="relative flex items-center justify-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </div>
          <span className="font-display font-700 text-2xl">Respondi</span>
        </div>

        <div className="relative max-w-md mx-auto text-center">
          <h2 className="font-display font-700 text-3xl leading-tight">
            Empieza gratis. Sin tarjeta, sin compromiso.
          </h2>
          <p className="text-brand-200 mt-4 leading-relaxed">
            14 días para que tu agente de IA atienda a tus clientes y veas el tiempo que recupera para ti.
          </p>

          <ul className="mt-8 space-y-3 text-left max-w-xs mx-auto">
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </span>
              <span className="text-brand-100 text-sm">Instagram conectado en minutos</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </span>
              <span className="text-brand-100 text-sm">Respuestas 24/7 en el idioma del cliente</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </span>
              <span className="text-brand-100 text-sm">Sin permanencia: cancelas cuando quieras</span>
            </li>
          </ul>
        </div>

        <p className="relative text-center text-brand-300/70 text-sm mt-10">© 2026 Respondi · Atsura</p>
      </div>

      {/* ============ FORMULARIO ============ */}
      <div className="flex flex-col min-h-screen lg:min-h-screen lg:overflow-y-auto">
        <div className="lg:hidden flex items-center justify-center gap-2.5 px-6 pt-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </div>
          <span className="font-display font-700 text-lg">Respondi</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md animate-fade-in-up">
            <div className="mb-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-600 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600"></span>
                14 días gratis
              </div>
              <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Crea tu cuenta</h1>
              <p className="text-ink-500 mt-2">Activa tu prueba y empieza a atender con IA hoy mismo.</p>
            </div>
            
            <SignupForm />

          </div>
        </div>
      </div>
    </div>
  )
}
