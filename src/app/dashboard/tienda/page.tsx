'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Loading from '@/components/Loading'
import { ErrorCarga } from '@/components/ui/ErrorCarga'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { getTienda, conectarTienda, probarTienda, desconectarTienda } from '@/app/actions/tiendas'
import { getMisPermisos } from '@/app/actions/permisos'

// Conectar la tienda online del negocio (Shopify). El cliente crea una "app
// personalizada" en su propio Shopify y pega aquí dos cosas: la dirección de
// su tienda y el token. A partir de ahí la IA puede hablar de productos,
// stock y pedidos de verdad, y se pueden encender las automatizaciones.

interface Tienda {
  id: string
  plataforma: string
  dominio: string
  nombre: string | null
  moneda: string | null
  estado: 'pendiente' | 'activo' | 'error' | 'desconectado'
  configuracion: any
  ultimo_error: string | null
  ultima_sincronizacion: string | null
  faltan_permisos?: string[]
  webhook_url?: string
}

const caja = 'h-11 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
const campo = `w-full ${caja}`

const NOMBRE_PERMISO: Record<string, string> = {
  read_products: 'ver productos',
  read_inventory: 'ver stock',
  read_orders: 'ver pedidos',
  read_fulfillments: 'ver envíos',
  read_customers: 'ver clientes',
  read_shipping: 'ver gastos de envío',
  read_content: 'ver las políticas de la tienda',
  write_draft_orders: 'crear enlaces de compra',
  write_discounts: 'crear descuentos'
}

export default function TiendaPage() {
  const { showToast } = useToast()
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [tienda, setTienda] = useState<Tienda | null>(null)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)
  const [confirmarDesconectar, setConfirmarDesconectar] = useState(false)
  const [probando, setProbando] = useState(false)

  const puedeEscribir = nivelPermiso === 'escritura'

  async function cargar() {
    setErrorCarga(false)
    const [r, permisos] = await Promise.all([getTienda(), getMisPermisos()])
    if (permisos.success) {
      const nivel = (permisos as any).esAdmin
        ? 'escritura'
        : ((permisos.data || []).find((p: any) => p.seccion === 'canales')?.nivel || 'ninguno')
      setNivelPermiso(nivel as any)
    }
    if (!r.success) {
      setErrorCarga(true)
      setCargando(false)
      return
    }
    setTienda((r.data as Tienda) || null)
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  async function handleProbar() {
    if (!tienda) return
    setProbando(true)
    const r = await probarTienda(tienda.id)
    setProbando(false)
    if (r.success) {
      showToast(`Conectado con ${(r.data as any).nombre}`, 'success')
      cargar()
    } else {
      showToast(r.error || 'No se ha podido conectar con la tienda', 'error')
      cargar()
    }
  }

  async function handleDesconectar() {
    if (!tienda) return
    setConfirmarDesconectar(false)
    const r = await desconectarTienda(tienda.id)
    if (r.success) {
      showToast('Tienda desconectada', 'success')
      cargar()
    } else {
      showToast(r.error || 'No se ha podido desconectar', 'error')
    }
  }

  if (cargando) return <Loading />
  if (errorCarga) return <ErrorCarga onReintentar={cargar} />
  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto">
        <p className="text-ink-500">No tienes permiso para ver esta sección.</p>
      </div>
    )
  }

  const conectada = tienda && tienda.estado !== 'desconectado'

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      <div className="mb-6">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Tienda online</h1>
        <p className="text-ink-500 mt-1">Conecta tu tienda para que la IA hable de tus productos, tu stock y tus pedidos de verdad.</p>
      </div>

      {conectada ? (
        <article className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 shadow-sm">
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-[#95BF47] text-white shadow-sm shadow-lime-200">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M15.3 3.4c-.1 0-.3.1-.5.1l-.5-.5c-.4-.4-.9-.6-1.5-.5-.1 0-.2 0-.3.1-.4-1-1-1.4-1.8-1.4-.9 0-1.7.7-2.3 1.8-.4.8-.7 1.8-.8 2.6l-1.9.6c-.6.2-.6.2-.7.7L3.5 21.3l11.1 2.1 4.8-1.2S15.4 3.5 15.3 3.4zm-3.6.9-1.6.5c.2-.9.6-1.7 1-2.2.2-.2.4-.4.7-.5.3.5.4 1.2.4 2-.2.1-.3.1-.5.2zm-1.3-3c.2 0 .4.1.6.2-.3.2-.6.4-.8.8-.5.6-.9 1.6-1.1 2.6l-1.4.4c.4-1.7 1.5-3.9 2.7-4zm-1 8.5.5 3.5s-1-.5-2.2-.4c-1.7.1-1.7 1.2-1.7 1.4.1 1.3 3.6 1.6 3.8 4.7.1 2.4-1.3 4-3.3 4.1-2.5.2-3.8-1.3-3.8-1.3l.5-2.2s1.4 1 2.5.9c.7 0 1-.6 1-1 0-1.7-2.9-1.6-3.1-4.4-.2-2.4 1.4-4.8 4.8-5 1.3-.1 2 .3 2 .3l-.8 2.4h-.2zm2.9-4.9c0-.7-.1-1.6-.4-2.2.8.1 1.2 1.1 1.4 1.6l-1 .6z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-display font-600 text-lg text-ink-900">{tienda!.nombre || tienda!.dominio}</h3>
                  {tienda!.estado === 'activo' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Conectada
                    </span>
                  ) : tienda!.estado === 'error' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      Con problemas
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Pendiente
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-500 break-all">{tienda!.dominio}{tienda!.moneda ? ` · ${tienda!.moneda}` : ''}</p>
                {tienda!.ultima_sincronizacion && (
                  <p className="text-xs text-ink-400 mt-1">
                    Última comprobación: {new Date(tienda!.ultima_sincronizacion).toLocaleString([], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>

            {tienda!.ultimo_error && (
              <div className="mt-4 p-4 rounded-xl border bg-red-50 border-red-200 flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p className="text-sm text-red-800 leading-relaxed">{tienda!.ultimo_error}</p>
              </div>
            )}

            {tienda!.configuracion?.tiene_secreto_avisos && tienda!.webhook_url && (
              <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-sm font-600 text-ink-800">Dirección para los avisos de Shopify</p>
                <p className="text-xs text-ink-500 mt-1 mb-2">
                  Pégala en tu Shopify (Configuración → Notificaciones → Webhooks) para los sucesos «Creación de pedido», «Pedido pagado», «Cumplimiento de pedido» y «Cancelación de pedido». Sin esto todo funciona igual, solo que los avisos tardan un poco más.
                </p>
                <code className="block text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 break-all text-ink-700">{tienda!.webhook_url}</code>
              </div>
            )}

            {!!tienda!.faltan_permisos?.length && (
              <div className="mt-4 p-4 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.73-3l-7-12a2 2 0 00-3.46 0l-7 12A2 2 0 005 19z"/></svg>
                <div>
                  <p className="text-sm font-600 text-amber-900">A tu app de Shopify le faltan permisos</p>
                  <p className="text-sm mt-1 leading-relaxed text-amber-800">
                    Sin ellos hay cosas que la IA no podrá hacer: {tienda!.faltan_permisos!.map(p => NOMBRE_PERMISO[p] || p).join(', ')}.
                    Añádelos en tu app de Shopify, guarda, y vuelve a pegar el token aquí.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex-wrap">
            <Link href="/dashboard/automatizaciones" className="text-sm font-600 text-brand-600 hover:text-brand-700 hover:underline underline-offset-2 transition mr-auto">
              Ver automatizaciones
            </Link>
            <button onClick={handleProbar} disabled={probando} className="text-sm font-600 text-ink-700 hover:text-ink-900 hover:underline underline-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {probando ? 'Probando…' : 'Probar conexión'}
            </button>
            <button onClick={() => setFormularioAbierto(true)} disabled={!puedeEscribir} className="text-sm font-600 text-ink-700 hover:text-ink-900 hover:underline underline-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
              Cambiar datos
            </button>
            <button onClick={() => setConfirmarDesconectar(true)} disabled={!puedeEscribir} className="text-sm font-600 text-red-600 hover:text-red-700 hover:underline underline-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed">
              Desconectar
            </button>
          </div>
        </article>
      ) : (
        <article className="bg-white rounded-2xl border-2 border-dashed border-slate-300 mb-4">
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-display font-600 text-lg text-ink-900">Shopify</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-600">
                    {tienda ? 'Desconectada' : 'Sin conectar'}
                  </span>
                </div>
                <p className="text-sm text-ink-500">Conecta tu tienda de Shopify para que la IA conteste con tus productos, precios y pedidos reales.</p>
              </div>
              <button onClick={() => setFormularioAbierto(true)} disabled={!puedeEscribir} className={`hidden sm:flex shrink-0 items-center gap-1.5 px-5 h-11 rounded-xl bg-brand-600 text-white text-sm font-600 transition ${!puedeEscribir ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700'}`}>
                Conectar
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
            </div>
            <button onClick={() => setFormularioAbierto(true)} disabled={!puedeEscribir} className={`sm:hidden mt-5 w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-600 transition flex items-center justify-center gap-1.5 ${!puedeEscribir ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700'}`}>
              Conectar Shopify
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
            </button>
          </div>
        </article>
      )}

      <div className="rounded-2xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-ink-900">Tu tienda sigue siendo tuya</p>
            <p className="text-sm text-ink-600">El token se guarda cifrado y solo lo usa Respondi para consultar tus productos y pedidos. La IA nunca reembolsa ni cancela pedidos: eso lo hace siempre una persona de tu equipo.</p>
          </div>
        </div>
      </div>

      {formularioAbierto && (
        <FormularioTienda
          tienda={conectada ? tienda : null}
          onCerrar={() => setFormularioAbierto(false)}
          onConectada={() => { setFormularioAbierto(false); cargar() }}
        />
      )}

      <ConfirmModal
        isOpen={confirmarDesconectar}
        onClose={() => setConfirmarDesconectar(false)}
        onConfirm={handleDesconectar}
        title="¿Desconectar la tienda?"
        message="Se borrará el token guardado y las automatizaciones que dependen de la tienda dejarán de actuar. Podrás volver a conectarla cuando quieras."
        confirmText="Desconectar"
        type="danger"
      />
    </div>
  )
}

function FormularioTienda({ tienda, onCerrar, onConectada }: { tienda: Tienda | null; onCerrar: () => void; onConectada: () => void }) {
  const { showToast } = useToast()
  const [dominio, setDominio] = useState(tienda?.dominio || '')
  const [token, setToken] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [verGuia, setVerGuia] = useState(!tienda)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const r = await conectarTienda({ dominio, token, apiSecret })
    setGuardando(false)
    if (r.success) {
      const faltan = (r.data as any)?.faltan_permisos || []
      showToast(
        faltan.length
          ? `Tienda conectada, pero faltan permisos: ${faltan.map((p: string) => NOMBRE_PERMISO[p] || p).join(', ')}`
          : `Tienda conectada: ${(r.data as any).nombre}`,
        faltan.length ? 'info' : 'success'
      )
      onConectada()
    } else {
      showToast(r.error || 'No se ha podido conectar la tienda', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/50" onClick={onCerrar}></div>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <form onSubmit={guardar}>
          <div className="px-6 pt-6 pb-2">
            <h2 className="font-display font-700 text-xl text-ink-900">{tienda ? 'Cambiar los datos de la tienda' : 'Conectar tu tienda de Shopify'}</h2>
            <p className="text-sm text-ink-500 mt-1">Necesitas dos cosas de tu Shopify: la dirección de tu tienda y un token.</p>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <label htmlFor="tienda-dominio" className="block text-sm font-600 text-ink-800 mb-1.5">Dirección de tu tienda</label>
              <input
                id="tienda-dominio"
                value={dominio}
                onChange={e => setDominio(e.target.value)}
                placeholder="mitienda.myshopify.com"
                className={campo}
                autoComplete="off"
              />
              <p className="text-xs text-ink-400 mt-1">Vale también con pegar la dirección del panel de Shopify.</p>
            </div>

            <div>
              <label htmlFor="tienda-token" className="block text-sm font-600 text-ink-800 mb-1.5">
                Token de acceso {tienda && <span className="font-400 text-ink-400">(déjalo vacío para mantener el que ya guardaste)</span>}
              </label>
              <input
                id="tienda-token"
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="shpat_…"
                className={campo}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="tienda-secreto" className="block text-sm font-600 text-ink-800 mb-1.5">
                Clave secreta de la app <span className="font-400 text-ink-400">(opcional)</span>
              </label>
              <input
                id="tienda-secreto"
                type="password"
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="Para que Shopify nos avise al instante"
                className={campo}
                autoComplete="new-password"
              />
              <p className="text-xs text-ink-400 mt-1">Sin ella todo funciona igual, solo que los avisos de pedidos tardan un poco más.</p>
            </div>

            <button type="button" onClick={() => setVerGuia(v => !v)} className="text-sm font-600 text-brand-600 hover:text-brand-700 transition">
              {verGuia ? 'Ocultar' : '¿De dónde saco el token?'}
            </button>

            {verGuia && (
              <ol className="text-sm text-ink-600 space-y-2 bg-slate-50 rounded-xl p-4 list-decimal list-inside leading-relaxed">
                <li>En tu Shopify, entra en <strong>Configuración → Aplicaciones y canales de venta</strong>.</li>
                <li>Pulsa <strong>Desarrollar aplicaciones</strong> y luego <strong>Crear una aplicación</strong>. Ponle de nombre «Respondi».</li>
                <li>En <strong>Configuración → Admin API</strong>, marca estos permisos: ver productos, stock, pedidos, envíos, clientes, gastos de envío y contenido; y, para vender desde el chat, crear pedidos borrador y descuentos.</li>
                <li>Guarda y pulsa <strong>Instalar aplicación</strong>.</li>
                <li>Copia el <strong>token de acceso de la Admin API</strong> (empieza por <code className="px-1 rounded bg-slate-200">shpat_</code>) y pégalo aquí. Shopify solo lo enseña una vez.</li>
              </ol>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-2xl">
            <button type="button" onClick={onCerrar} className="px-4 h-11 rounded-xl text-sm font-600 text-ink-700 hover:bg-slate-200 transition">Cancelar</button>
            <button type="submit" disabled={guardando} className="px-5 h-11 rounded-xl bg-brand-600 text-white text-sm font-600 transition hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {guardando ? 'Comprobando…' : tienda ? 'Guardar' : 'Conectar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
