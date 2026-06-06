export default async function AdminDashboardPage() {
  return (
    <div className="animate-fade-in-up">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Dashboard</h1>
          <p className="text-ink-500 mt-1">Esqueleto base del layout de administración.</p>
        </div>
      </div>
      
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-ink-500">
        <p>El layout base está funcionando correctamente.</p>
        <p className="text-sm mt-2">Sidebar a la izquierda y Header arriba con selector de sucursales conectado a Supabase.</p>
      </div>
    </div>
  )
}
