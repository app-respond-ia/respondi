import LoginForm from './LoginForm'

export default function LoginPage() {
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
            Tu agente de IA atiende a tus clientes mientras tú haces crecer tu negocio.
          </h2>
          <p className="text-brand-200 mt-4 leading-relaxed">
            Responde mensajes 24/7 en Instagram, WhatsApp y Facebook. Cuando algo necesita una persona, Respondi te avisa al instante.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/15 px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div className="text-left">
              <p className="font-display font-700 text-xl leading-none">+42 h</p>
              <p className="text-brand-200 text-sm mt-1">ahorradas este mes por la IA</p>
            </div>
          </div>
        </div>

        <p className="relative text-center text-brand-300/70 text-sm mt-10">© 2026 Respondi · Atsura</p>
      </div>

      {/* ============ FORMULARIO ============ */}
      <div className="flex flex-col min-h-screen lg:min-h-0">
        <div className="lg:hidden flex items-center justify-center gap-2.5 px-6 pt-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </div>
          <span className="font-display font-700 text-lg">Respondi</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm animate-fade-in-up">
            <div className="mb-8">
              <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Inicia sesión</h1>
              <p className="text-ink-500 mt-2">Bienvenido de nuevo. Accede a tu panel de Respondi.</p>
            </div>
            
            <LoginForm />
            
          </div>
        </div>
      </div>
    </div>
  )
}
