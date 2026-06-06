import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const activeBranchId = cookieStore.get('respondi_active_branch')?.value
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Obtener usuario y su comercio
  const { data: userData } = await supabase
    .from('users')
    .select('*, comercios(*)')
    .eq('id', user.id)
    .single()

  const tenantId = userData?.tenant_id
  const comercio = userData?.comercios

  // 1. Mensajes IA (filtrados por branch_id si existe)
  let iaQuery = supabase
    .from('messages')
    .select('id, conversations!inner(branch_id)', { count: 'exact', head: true })
    .eq('remitente', 'ia')
    .eq('tenant_id', tenantId)

  if (activeBranchId) {
    iaQuery = iaQuery.eq('conversations.branch_id', activeBranchId)
  }
  const { count: iaMessagesCount } = await iaQuery

  // 2. Casos (filtrados por branch_id)
  let casesQuery = supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
  
  if (activeBranchId) {
    casesQuery = casesQuery.eq('branch_id', activeBranchId)
  }
  const { count: casesCount } = await casesQuery

  // 3. Consumo de cuota (Global del comercio)
  const { data: quotaData } = await supabase
    .from('message_quotas')
    .select('saldo')
    .eq('tenant_id', tenantId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  const saldo = quotaData?.saldo || 0
  const maxCreditos = 100 // En el futuro vendrá de plans.creditos_diarios_trial

  // Cálculos de KPIs
  const totalMensajes = iaMessagesCount || 0
  const totalCasos = casesCount || 0
  const totalInteracciones = totalMensajes + totalCasos
  const tasaResolucion = totalInteracciones > 0 ? Math.round((totalMensajes / totalInteracciones) * 100) : 0

  const minutosAhorrados = totalMensajes * 3
  const horasAhorradas = Math.floor(minutosAhorrados / 60)
  const minutosRestantes = minutosAhorrados % 60

  // Cálculo de días restantes de trial
  let diasTrial = 0
  if (comercio?.trial_activo && comercio?.fecha_inicio) {
    const fechaInicio = new Date(comercio.fecha_inicio)
    const hoy = new Date()
    const diffTime = Math.abs(hoy.getTime() - fechaInicio.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    diasTrial = Math.max(0, 14 - diffDays)
  }

  return (
    <div className="animate-fade-in-up">
      {/* Banner de estado del trial */}
      {comercio?.trial_activo && (
        <div className="flex items-start sm:items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-amber-900 text-sm">Tu prueba gratuita termina en {diasTrial} días</p>
            <p className="text-sm text-amber-700">Activa un plan para que tu agente siga atendiendo sin interrupciones.</p>
          </div>
          <button className="shrink-0 px-4 h-10 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-600 transition">
            Ver planes
          </button>
        </div>
      )}

      {/* Encabezado + selector de periodo */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Hola, {userData?.nombre?.split(' ')[0] || 'Usuario'} 👋</h1>
          <p className="text-ink-500 mt-1">Así ha trabajado tu agente de IA hasta ahora.</p>
        </div>
        {/* Selector hoy / semana / mes (Visual) */}
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
          <button className="px-4 py-1.5 rounded-lg text-sm font-500 text-ink-500 transition hover:bg-slate-50">Hoy</button>
          <button className="px-4 py-1.5 rounded-lg text-sm font-600 bg-brand-600 text-white transition">Semana</button>
          <button className="px-4 py-1.5 rounded-lg text-sm font-500 text-ink-500 transition hover:bg-slate-50">Mes</button>
        </div>
      </div>

      {/* ===== KPI PROTAGONISTA: Tiempo recuperado ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white p-6 sm:p-7 mb-5 shadow-xl shadow-brand-900/20">
        <div className="absolute -right-10 -top-12 w-52 h-52 rounded-full bg-white/10 blur-sm"></div>
        <div className="absolute right-20 -bottom-20 w-44 h-44 rounded-full bg-brand-400/30"></div>
        <div className="relative flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-brand-200 text-sm font-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Tiempo recuperado total
            </div>
            <p className="font-display font-700 text-4xl sm:text-5xl mt-2">{horasAhorradas} h {minutosRestantes} min</p>
            <p className="text-brand-100 text-sm mt-2">
              Tu agente respondió <span className="font-600 text-white">{totalMensajes} mensajes</span> · estimado en 3 min por mensaje.
            </p>
          </div>
          {totalMensajes > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-sm font-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
              Activo
            </div>
          )}
        </div>
      </div>

      {/* ===== Fila de KPIs secundarios ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {/* Mensajes IA vs casos */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">{totalMensajes}</p>
          <p className="text-sm text-ink-500 mt-0.5">Mensajes resueltos por IA</p>
          <p className="text-xs text-ink-400 mt-1.5">{totalCasos} escalaron a un agente</p>
        </div>

        {/* Tasa de resolución automática */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">{tasaResolucion}%</p>
          <p className="text-sm text-ink-500 mt-0.5">Resolución automática</p>
          <p className="text-xs text-emerald-600 mt-1.5 font-500">Sin intervención humana</p>
        </div>

        {/* Tiempo de respuesta IA */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">{totalMensajes > 0 ? '8 s' : '--'}</p>
          <p className="text-sm text-ink-500 mt-0.5">Tiempo de respuesta IA</p>
          <p className="text-xs text-ink-400 mt-1.5">Promedio por mensaje</p>
        </div>

        {/* Tiempo de cierre de casos */}
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
          </div>
          <p className="text-2xl font-display font-700 text-ink-900">--</p>
          <p className="text-sm text-ink-500 mt-0.5">Cierre de casos</p>
          <p className="text-xs text-ink-400 mt-1.5">Promedio de los agentes</p>
        </div>
      </div>

      {/* ===== Fila: gráfico + temas ===== */}
      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Gráfico de evolución (Visual mockup temporal) */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display font-600 text-ink-900">Evolución del tiempo recuperado</h2>
              <p className="text-sm text-ink-500">Horas ahorradas por día (Mockup visual)</p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 sm:gap-3 h-44">
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-brand-200" style={{height: '48%'}}></div>
              <span className="text-xs text-ink-400">Lun</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-brand-200" style={{height: '62%'}}></div>
              <span className="text-xs text-ink-400">Mar</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-brand-200" style={{height: '55%'}}></div>
              <span className="text-xs text-ink-400">Mié</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-brand-200" style={{height: '78%'}}></div>
              <span className="text-xs text-ink-400">Jue</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-brand-600" style={{height: '100%'}}></div>
              <span className="text-xs font-600 text-brand-700">Vie</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-brand-200" style={{height: '40%'}}></div>
              <span className="text-xs text-ink-400">Sáb</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-lg bg-slate-100" style={{height: '15%'}}></div>
              <span className="text-xs text-ink-400">Dom</span>
            </div>
          </div>
        </div>

        {/* Temas más frecuentes (Visual mockup temporal) */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5">
          <h2 className="font-display font-600 text-ink-900 mb-1">Temas más frecuentes</h2>
          <p className="text-sm text-ink-500 mb-4">Etiquetas que asignó la IA (Mockup visual)</p>
          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-500 text-ink-700">Precios</span>
                <span className="text-ink-400">42%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-600" style={{width: '42%'}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-500 text-ink-700">Disponibilidad</span>
                <span className="text-ink-400">28%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500" style={{width: '28%'}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-500 text-ink-700">Horarios</span>
                <span className="text-ink-400">17%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-400" style={{width: '17%'}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-500 text-ink-700">Reclamos</span>
                <span className="text-ink-400">13%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-300" style={{width: '13%'}}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Consumo de cuota ===== */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="font-display font-600 text-ink-900">Consumo de cuota</h2>
            <p className="text-sm text-ink-500">Créditos usados este mes · Plan Trial</p>
          </div>
          <div className="text-right">
            <p className="font-display font-700 text-xl text-ink-900">{saldo} <span className="text-ink-400 text-base font-500">/ {maxCreditos}</span></p>
            <p className="text-xs text-ink-400">créditos</p>
          </div>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600" style={{width: `${Math.min(100, (saldo / maxCreditos) * 100)}%`}}></div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-sm text-ink-500">
          <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Te quedan {Math.max(0, maxCreditos - saldo)} créditos. La cuota del trial se reinicia cada día.
        </div>
      </div>
    </div>
  )
}
