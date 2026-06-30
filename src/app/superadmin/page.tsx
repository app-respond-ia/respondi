import Link from 'next/link'
import { getDashboardData } from '@/app/actions/superadmin'

export const dynamic = 'force-dynamic'

export default async function SuperadminDashboardPage() {
  const { data, success, error } = await getDashboardData()

  if (!success || !data) {
    return <div className="p-6 text-red-500">Error cargando dashboard: {error}</div>
  }

  const { organizacionesPorEstado, trialsPorVencer, totalMensajesMes, erroresSinResolver } = data

  // Estimación simple de ingresos (en una app real sacaríamos de una query más compleja o pagos reales)
  // Para el stub, asumimos un valor promedio por comercio activo.
  const ingresosEstimados = organizacionesPorEstado.activos * 59 

  const totalOrganizaciones = organizacionesPorEstado.total
  const pctActivos = totalOrganizaciones > 0 ? (organizacionesPorEstado.activos / totalOrganizaciones) * 100 : 0
  const pctTrial = totalOrganizaciones > 0 ? (organizacionesPorEstado.trial / totalOrganizaciones) * 100 : 0
  const pctVencidos = totalOrganizaciones > 0 ? (organizacionesPorEstado.vencidos / totalOrganizaciones) * 100 : 0
  const pctSuspendidos = totalOrganizaciones > 0 ? (organizacionesPorEstado.suspendidos / totalOrganizaciones) * 100 : 0

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Visión general</h1>
        <p className="text-ink-500 mt-1">El estado de Respondi en todas las organizaciones.</p>
      </div>

      {/* KPIs de negocio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-ink-500 mb-1">Ingresos del mes (Est.)</p>
          <p className="font-display font-700 text-2xl text-ink-900">{ingresosEstimados} $</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-ink-500 mb-1">Organizaciones activas</p>
          <p className="font-display font-700 text-2xl text-ink-900">
            {organizacionesPorEstado.activos}<span className="text-lg text-ink-400">/{totalOrganizaciones}</span>
          </p>
          <p className="text-xs text-ink-400 mt-1">{organizacionesPorEstado.trial} en trial</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-ink-500 mb-1">Mensajes IA (mes)</p>
          <p className="font-display font-700 text-2xl text-ink-900">
            {(totalMensajesMes / 1000).toFixed(1)}<span className="text-lg text-ink-400">k</span>
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-ink-500 mb-1">Trials por vencer</p>
          <p className="font-display font-700 text-2xl text-ink-900">{trialsPorVencer}</p>
          <p className="text-xs text-amber-600 font-500 mt-1">en los próximos 3 días</p>
        </div>
      </div>

      {/* Alertas de errores */}
      {erroresSinResolver > 0 && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-600 text-ink-900">{erroresSinResolver} errores del sistema requieren atención</p>
              <p className="text-sm text-ink-600 mt-0.5">Revisa el panel de errores para más detalles.</p>
            </div>
            <Link href="/superadmin/errores" className="shrink-0 inline-flex items-center gap-1 text-sm font-600 text-red-700 hover:text-red-800 hover:underline underline-offset-2 transition self-center">Ver</Link>
          </div>
        </div>
      )}

      {/* Estado de los comercios (Barras CSS simples) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 max-w-xl">
        <h2 className="font-display font-600 text-base text-ink-900 mb-4">Estado de las organizaciones</h2>
        <div className="space-y-3 mt-6">
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-ink-600">Activos</span><span className="font-600 text-ink-900">{organizacionesPorEstado.activos}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pctActivos}%` }}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-ink-600">En trial</span><span className="font-600 text-ink-900">{organizacionesPorEstado.trial}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctTrial}%` }}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-ink-600">Vencidos</span><span className="font-600 text-ink-900">{organizacionesPorEstado.vencidos}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${pctVencidos}%` }}></div></div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-ink-600">Suspendidos</span><span className="font-600 text-ink-900">{organizacionesPorEstado.suspendidos}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-red-500 rounded-full" style={{ width: `${pctSuspendidos}%` }}></div></div>
          </div>
        </div>
      </div>
    </>
  )
}
