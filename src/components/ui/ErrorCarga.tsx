'use client'

// Pantalla de error para cuando una carga de datos falla. Sustituye al
// caso en que la pantalla se quedaba en "Cargando..." indefinidamente
// porque el nivel de permiso nunca llegaba a asignarse.
export function ErrorCarga({ onReintentar }: { onReintentar?: () => void }) {
  return (
    <div className="p-10 flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="font-semibold text-ink-900 text-lg mb-1">No se pudieron cargar los datos</p>
      <p className="text-ink-500 text-sm max-w-sm mb-6">
        Puede ser un problema temporal de conexión. Si acabas de crear tu cuenta, puede que aún te falte
        terminar la configuración inicial.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={() => (onReintentar ? onReintentar() : window.location.reload())}
          className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition"
        >
          Reintentar
        </button>
        <a
          href="/dashboard"
          className="px-5 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 text-sm font-600 transition inline-flex items-center"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  )
}
