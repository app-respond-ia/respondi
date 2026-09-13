'use client'
import Loading from '@/components/Loading'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'
import { ErrorCarga } from '@/components/ui/ErrorCarga'
import { useState, useEffect } from 'react'
import { getMisPermisos } from '@/app/actions/permisos'
import { getMetricas, getMovimientosCreditosCliente } from '@/app/actions/metricas'
import { getPlanesDisponibles, iniciarPagoPlan, abrirPortalPago, getEstadoCreditos } from '@/app/actions/planes'
import { CLASES_NIVEL, textoNivel } from '@/lib/creditos-nivel'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

function StatCard({ label, value, sub }: { label: string, value: string | number, sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-sm text-ink-500 mb-1">{label}</p>
      <p className="font-display font-700 text-2xl text-ink-900">{value}</p>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-600 text-sm text-ink-500 uppercase tracking-wide mb-3">{children}</h2>
  )
}

export default function FacturacionPage() {
  const [loading, setLoading] = useState(true)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [errorCarga, setErrorCarga] = useState(false)
  
  const [metricasCreditos, setMetricasCreditos] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
  
  const [origenFiltro, setOrigenFiltro] = useState('')
  const [planes, setPlanes] = useState<any>(null)
  const [estadoCreditos, setEstadoCreditos] = useState<any>(null)
  const [planPedido, setPlanPedido] = useState<any>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const { showToast } = useToast()

  const [abriendoPortal, setAbriendoPortal] = useState(false)

  // Elegir un plan: sin suscripción va a la página de pago de Stripe; con
  // suscripción, cambia el plan (subida ya, bajada en la renovación)
  const elegirPlan = async (plan: any) => {
    setPidiendo(true)
    const r = await iniciarPagoPlan(plan.id).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    if (r.success && (r as any).url) {
      window.location.href = (r as any).url
      return
    }
    setPidiendo(false)
    setPlanPedido(null)
    if (r.success) {
      showToast((r as any).cuando === 'ahora' ? `Ya tienes el plan ${plan.nombre}. Stripe te cobra la parte proporcional.` : `Pasarás al plan ${plan.nombre} en la próxima renovación.`, 'success')
      const p = await getPlanesDisponibles().catch(() => null)
      if (p?.success) setPlanes(p.data)
    } else {
      showToast((r as any).error || 'No se ha podido preparar el pago', 'error')
    }
  }

  const gestionarPago = async () => {
    setAbriendoPortal(true)
    const r = await abrirPortalPago().catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    if (r.success && (r as any).url) { window.location.href = (r as any).url; return }
    setAbriendoPortal(false)
    showToast((r as any).error || 'No se ha podido abrir la gestión del pago', 'error')
  }

  // Al volver de Stripe
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('pago')
    if (q === 'ok') showToast('Pago recibido. Tu plan se activa en unos segundos.', 'success')
    if (q === 'cancelado') showToast('No se ha hecho ningún cobro.', 'info')
    if (q) window.history.replaceState({}, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar().catch(() => setErrorCarga(true)) }, [])

  const cargar = async () => {
    setLoading(true)
    
    // 1. Validamos los permisos y calculamos el nivel en una sola variable
    const permisosRes = await getMisPermisos()
    let pNivel: 'ninguno' | 'lectura' | 'escritura' = 'ninguno'
    
    if (!permisosRes.success) setErrorCarga(true)
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        pNivel = 'escritura'
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'facturacion')
        pNivel = p?.nivel || 'ninguno'
      }
    }
    
    setNivelPermiso(pNivel)

    // 2. Si tiene permiso (cualquier nivel), cargamos los datos
    if (pNivel !== 'ninguno') {
      getPlanesDisponibles().then(r => { if (r.success) setPlanes(r.data) }).catch(() => {})
      getEstadoCreditos().then(r => { if (r.success) setEstadoCreditos(r.data) }).catch(() => {})
      const [resMetricas, resMov] = await Promise.all([
        getMetricas('mes'), // Reusado de Metricas, nos interesan solo los créditos
        getMovimientosCreditosCliente({} as any)
      ])
      
      if (resMetricas.success && resMetricas.data) {
        setMetricasCreditos(resMetricas.data.creditos)
      }
      if (resMov.success && resMov.movimientos) {
        setMovimientos(resMov.movimientos)
      }
    }
    
    setLoading(false)
  }

  if (errorCarga) return <ErrorCarga />

  if (loading || nivelPermiso === null) return <Loading />

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-ink-900 mb-2">Acceso denegado</h2>
        <p className="text-ink-500">No tienes permisos para ver la configuración de facturación y créditos.</p>
      </div>
    )
  }

  return (
    <div className={PAGINA}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Facturación y créditos</h1>
        <p className="text-ink-500 mt-1">Gestiona tu suscripción, método de pago e historial de consumo de IA.</p>
      </div>

      {/* PLANES: se pagan y se cambian con Stripe */}
      <section id="planes" className="mb-10 scroll-mt-6">
        <SectionTitle>Tu plan</SectionTitle>
        {!planes ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-ink-500">Cargando planes…</div>
        ) : (
          <>
            {planes.suscripcion && (
              <div className={`mb-4 rounded-2xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 ${planes.suscripcion.estado === 'impagada' ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-600 text-ink-900">
                    {planes.suscripcion.estado === 'impagada' ? 'No hemos podido cobrar tu suscripción' : planes.suscripcion.cancelarAlFinal ? 'Suscripción con baja programada' : `Suscripción activa: plan ${planes.planes.find((p: any) => p.id === planes.planActualId)?.nombre || ''}`}
                  </p>
                  <p className="text-sm text-ink-500 mt-0.5">
                    {planes.suscripcion.estado === 'impagada'
                      ? 'Revisa la tarjeta en «Gestionar pago». Stripe lo volverá a intentar; si no se cobra, la IA dejará de atender al terminar el periodo pagado.'
                      : planes.suscripcion.cancelarAlFinal
                        ? `Sigue activa hasta el ${planes.suscripcion.periodoFin ? new Date(planes.suscripcion.periodoFin).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'final del periodo'}. Puedes reactivarla desde «Gestionar pago».`
                        : `Próximo cobro el ${planes.suscripcion.periodoFin ? new Date(planes.suscripcion.periodoFin).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}. Tarjeta, facturas y baja, en «Gestionar pago».`}
                    {planes.planPendienteId && ` En la próxima renovación pasarás al plan ${planes.planes.find((p: any) => p.id === planes.planPendienteId)?.nombre || ''}.`}
                  </p>
                </div>
                <button onClick={gestionarPago} disabled={abriendoPortal || nivelPermiso !== 'escritura'} className="shrink-0 h-10 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  {abriendoPortal ? 'Abriendo…' : 'Gestionar pago'}
                </button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {planes.planes.map((p: any) => {
                const esActual = p.id === planes.planActualId && !planes.enPrueba
                const esPendiente = p.id === planes.planPendienteId
                return (
                  <div key={p.id} className={`rounded-2xl border p-5 flex flex-col ${esActual ? 'border-brand-400 bg-brand-50/40' : p.a_medida ? 'border-purple-300 bg-purple-50/30' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                      <p className="font-display font-700 text-lg text-ink-900">{p.nombre}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.a_medida && <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">A medida para ti</span>}
                        {esActual && <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-brand-600 text-white">Tu plan</span>}
                        {esPendiente && <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">En la próxima renovación</span>}
                      </div>
                    </div>
                    <p className="text-ink-900 mb-3"><span className="font-display font-700 text-2xl">{Number(p.precio_usd).toLocaleString('es-ES')} $</span><span className="text-ink-500"> /mes</span></p>
                    <ul className="text-sm text-ink-600 space-y-1 mb-5 flex-1">
                      <li>{Number(p.creditos_mensuales || 0).toLocaleString('es-ES')} respuestas de IA al mes</li>
                      {/* 999 (o vacío) es la forma de decir "sin límite" en los planes */}
                      <li>{p.canales_max === null || p.canales_max >= 999 ? 'Canales ilimitados' : `${p.canales_max} ${p.canales_max === 1 ? 'canal' : 'canales'} en total`}</li>
                      <li>{p.sucursales_max === null || p.sucursales_max >= 999 ? 'Sucursales ilimitadas' : `${p.sucursales_max} ${p.sucursales_max === 1 ? 'sucursal' : 'sucursales'}`}</li>
                      <li>{p.usuarios_max === null || p.usuarios_max >= 999 ? 'Usuarios ilimitados' : `${p.usuarios_max} ${p.usuarios_max === 1 ? 'usuario' : 'usuarios'}`}</li>
                    </ul>
                    {!esActual && !esPendiente && (
                      <button
                        onClick={() => (planes.suscripcion ? setPlanPedido(p) : elegirPlan(p))}
                        disabled={nivelPermiso !== 'escritura' || pidiendo || !planes.pagoDisponible}
                        className="h-10 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pidiendo ? 'Un momento…' : planes.suscripcion ? 'Cambiar a este plan' : 'Elegir y pagar'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-ink-500 mt-3">
              {planes.enPrueba ? 'Estás en la prueba gratuita. ' : ''}
              {planes.pagoDisponible
                ? 'El pago es mensual con tarjeta, por Stripe. Subir de plan se aplica al momento (Stripe cobra la parte proporcional); bajar, en la siguiente renovación. '
                : 'El pago con tarjeta se está activando; si tienes prisa, escríbenos en Soporte. '}
              No se venden créditos sueltos: si necesitas más respuestas de IA, el camino es un plan mayor.
            </p>
          </>
        )}
      </section>

      {/* RESUMEN DE CRÉDITOS */}
      {metricasCreditos && (
        <section className="mb-10">
          <SectionTitle>Resumen de uso</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className={`rounded-2xl p-5 shadow-sm border ${estadoCreditos ? `${CLASES_NIVEL[estadoCreditos.nivel as keyof typeof CLASES_NIVEL].fondo} border-transparent` : 'bg-gradient-to-br from-slate-900 to-slate-800 text-white border-transparent'}`}>
              <p className={`text-sm mb-1 ${estadoCreditos ? 'opacity-80' : 'text-slate-400'}`}>Disponibles</p>
              <div className="flex items-center gap-2">
                {estadoCreditos && <span className={`w-3 h-3 rounded-full ${CLASES_NIVEL[estadoCreditos.nivel as keyof typeof CLASES_NIVEL].punto}`}></span>}
                <p className="font-display font-700 text-3xl">{metricasCreditos.disponibles.toLocaleString()}{estadoCreditos?.max > 0 ? <span className="text-base font-500 opacity-70"> / {estadoCreditos.max.toLocaleString()}</span> : null}</p>
              </div>
              {metricasCreditos.diasRestantes !== null && estadoCreditos?.nivel !== 'agotado' && (
                <p className={`text-xs mt-2 ${estadoCreditos ? 'opacity-80' : 'text-slate-400'}`}>
                  ~{metricasCreditos.diasRestantes} días al ritmo actual
                </p>
              )}
              {estadoCreditos && textoNivel(estadoCreditos.nivel) && (
                <p className="text-xs mt-2 font-600">{textoNivel(estadoCreditos.nivel)} <a href="#planes" className="underline underline-offset-2">Ver planes</a></p>
              )}
            </div>
            <StatCard
              label="Consumidos en período"
              value={metricasCreditos.consumidos.toLocaleString()}
              sub="Mensajes respondidos por la IA en los últimos 30 días"
            />
            <StatCard
              label="Consumo diario promedio"
              value={metricasCreditos.consumoDiarioPromedio.toLocaleString()}
              sub="Media móvil de los últimos 30 días"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-600 text-ink-700">Uso de créditos</p>
              <p className="text-sm text-ink-500">
                {metricasCreditos.consumidos.toLocaleString()} / {(metricasCreditos.disponibles + metricasCreditos.consumidos).toLocaleString()}
              </p>
            </div>
            <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${estadoCreditos ? CLASES_NIVEL[estadoCreditos.nivel as keyof typeof CLASES_NIVEL].barra : 'bg-gradient-to-r from-brand-500 to-brand-600'}`}
                style={{
                  width: `${Math.min(Math.round((metricasCreditos.consumidos / Math.max(metricasCreditos.disponibles + metricasCreditos.consumidos, 1)) * 100), 100)}%`
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-ink-400">
              <span>Consumido</span>
              <span>Disponible</span>
            </div>
          </div>
        </section>
      )}

      {/* HISTORIAL DE MOVIMIENTOS */}
      <section>
        <SectionTitle>Historial de movimientos</SectionTitle>
        <Tabla
          filas={movimientos.filter((m: any) => !origenFiltro || m.origen === origenFiltro)}
          idDe={(m: any) => m.id}
          nombre={['movimiento', 'movimientos']}
          buscar={{ placeholder: 'Buscar en la descripción…', en: (m: any) => `${m.descripcion || ''} ${m.origen || ''}` }}
          pestanas={[
            { id: 'todos', etiqueta: 'Todos' },
            { id: 'abono', etiqueta: 'Abonos', filtro: (m: any) => m.tipo === 'abono' },
            { id: 'debito', etiqueta: 'Débitos', filtro: (m: any) => m.tipo === 'debito' }
          ]}
          herramientas={
            <select value={origenFiltro} onChange={e => setOrigenFiltro(e.target.value)} className="h-10 px-3 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-500 transition">
              <option value="">Cualquier origen</option>
              <option value="recarga_plan">Renovación de plan</option>
              <option value="recarga_manual">Recarga manual</option>
              <option value="consumo_ia">Consumo IA</option>
            </select>
          }
          ordenInicial={{ clave: 'fecha', direccion: 'desc' }}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', enMovil: 'titulo', valor: (m: any) => m.timestamp, render: (m: any) => <span className="text-slate-600 whitespace-nowrap">{new Date(m.timestamp).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> },
            { clave: 'tipo', titulo: 'Tipo', valor: (m: any) => m.tipo, render: (m: any) => <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${m.tipo === 'abono' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{m.tipo}</span> },
            { clave: 'origen', titulo: 'Origen', valor: (m: any) => m.origen || '', render: (m: any) => <span className="text-xs font-500 text-slate-600 capitalize bg-slate-100 px-2 py-1 rounded-md whitespace-nowrap">{m.origen ? m.origen.replace('_', ' ') : '—'}</span> },
            { clave: 'cantidad', titulo: 'Cantidad', alinear: 'derecha', valor: (m: any) => (m.tipo === 'abono' ? 1 : -1) * Number(m.cantidad || 0), render: (m: any) => <span className={`font-semibold ${m.tipo === 'abono' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.tipo === 'abono' ? '+' : '-'}{Math.abs(Number(m.cantidad || 0)).toLocaleString()}</span> },
            { clave: 'saldo', titulo: 'Saldo después', alinear: 'derecha', valor: (m: any) => Number(m.saldo || 0), render: (m: any) => <span className="font-medium text-slate-700">{Number(m.saldo || 0).toLocaleString()}</span> },
            { clave: 'descripcion', titulo: 'Descripción', valor: (m: any) => m.descripcion || '', clase: 'max-w-xs', render: (m: any) => <span className="text-slate-500 text-xs line-clamp-2" title={m.descripcion}>{m.descripcion || '—'}</span> }
          ]}
          vacio={<p className="text-slate-500">No hay movimientos todavía.</p>}
        />
      </section>
      <ConfirmModal
        isOpen={!!planPedido}
        onClose={() => !pidiendo && setPlanPedido(null)}
        onConfirm={() => planPedido && elegirPlan(planPedido)}
        title={`Cambiar al plan ${planPedido?.nombre || ''}`}
        message={planPedido && planes && Number(planPedido.precio_usd) >= Number(planes.planes.find((p: any) => p.id === planes.planActualId)?.precio_usd || 0)
          ? `El cambio se aplica ahora mismo y Stripe cobra la parte proporcional hasta tu próxima renovación. A partir de entonces, ${Number(planPedido.precio_usd).toLocaleString('es-ES')} $ al mes.`
          : `Es un plan más barato: sigues con el actual hasta la próxima renovación y entonces pasas al plan ${planPedido?.nombre || ''} (${planPedido ? Number(planPedido.precio_usd).toLocaleString('es-ES') : ''} $ al mes).`}
        confirmText="Confirmar cambio"
        cancelText="Cancelar"
        type="info"
        isLoading={pidiendo}
      />
    </div>
  )
}
