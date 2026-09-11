'use client'

import { useEffect, useState } from 'react'
import { conectarCorreo, detectarProveedorCorreo } from '@/app/actions/canales'
import { useToast } from '@/components/ui/Toast'
import { PROVEEDORES_CORREO, proveedorCorreo, esDireccionMicrosoft, esServidorMicrosoft, AVISO_MICROSOFT, type Servidor } from '@/lib/canales/proveedores-correo'

// Conectar el buzón de correo del negocio: su dirección, su proveedor (se
// detecta solo casi siempre) y la contraseña. Se comprueba entrando en el
// buzón antes de guardar nada.

interface CanalCorreo {
  id: string
  estado: string
  identificador_externo?: string
  configuracion?: {
    imap?: Servidor
    smtp?: Servidor
    usuario?: string
    direccion?: string
    nombre_remitente?: string | null
    firma?: string | null
  } | null
}

const caja = 'h-11 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
const campo = `w-full ${caja}`

export function ConectarCorreo({ canal, onCerrar, onConectado }: { canal: CanalCorreo | null; onCerrar: () => void; onConectado: () => void }) {
  const { showToast } = useToast()
  const cfg = canal?.configuracion || null
  // Si ya estaba conectado, la contraseña guardada se puede mantener
  const tieneContrasena = !!canal && canal.estado !== 'desconectado'

  const proveedorInicial = cfg?.imap?.host ? (PROVEEDORES_CORREO.find(p => p.id !== 'otro' && p.imap.host === cfg.imap!.host)?.id || 'otro') : ''
  const [direccion, setDireccion] = useState(cfg?.direccion || canal?.identificador_externo || '')
  const [proveedor, setProveedor] = useState(proveedorInicial)
  const [elegidoAMano, setElegidoAMano] = useState(!!proveedorInicial)
  const [detectado, setDetectado] = useState<string | null>(null)
  const [detectando, setDetectando] = useState(false)
  const [contrasena, setContrasena] = useState('')
  const [usuario, setUsuario] = useState(cfg?.usuario && cfg.usuario !== cfg.direccion ? cfg.usuario : '')
  const [imap, setImap] = useState<Servidor>(cfg?.imap || { host: '', puerto: 993, seguro: true })
  const [smtp, setSmtp] = useState<Servidor>(cfg?.smtp || { host: '', puerto: 465, seguro: true })
  const [nombreRemitente, setNombreRemitente] = useState(cfg?.nombre_remitente || '')
  const [firma, setFirma] = useState(cfg?.firma || '')
  const [verServidores, setVerServidores] = useState(proveedorInicial === 'otro')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const cerrarConEscape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !guardando) onCerrar() }
    window.addEventListener('keydown', cerrarConEscape)
    return () => window.removeEventListener('keydown', cerrarConEscape)
  }, [guardando, onCerrar])

  const elegir = (id: string, servidores?: { imap?: Servidor; smtp?: Servidor }) => {
    setProveedor(id)
    const p = proveedorCorreo(id)
    if (id !== 'otro') {
      setImap(servidores?.imap || p.imap)
      setSmtp(servidores?.smtp || p.smtp)
    } else {
      // Si venían puestos los de un proveedor conocido, no valen para "otro"
      if (PROVEEDORES_CORREO.some(x => x.id !== 'otro' && x.imap.host === imap.host)) {
        setImap({ host: '', puerto: 993, seguro: true })
        setSmtp({ host: '', puerto: 465, seguro: true })
      }
      setVerServidores(true)
    }
  }

  // Al escribir la dirección, se mira de qué proveedor es
  const detectar = async () => {
    const d = direccion.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d) || elegidoAMano) return
    setDetectando(true)
    const r = await detectarProveedorCorreo(d).catch(() => ({ proveedor: null }) as any)
    setDetectando(false)
    if (r.proveedor) {
      elegir(r.proveedor, { imap: r.imap, smtp: r.smtp })
      setDetectado(proveedorCorreo(r.proveedor).nombre)
    } else {
      setDetectado(null)
    }
  }

  const p = proveedor ? proveedorCorreo(proveedor) : null
  const microsoft = esDireccionMicrosoft(direccion) || esServidorMicrosoft(imap.host) || esServidorMicrosoft(smtp.host)
  const faltaServidor = proveedor === 'otro' && (!imap.host.trim() || !smtp.host.trim())
  const puedeGuardar = !guardando && !microsoft && !!direccion.trim() && !!proveedor && !faltaServidor && (!!contrasena || tieneContrasena)

  const guardar = async () => {
    setGuardando(true)
    const r = await conectarCorreo({
      direccion,
      contrasena,
      proveedor,
      usuario: usuario.trim() || undefined,
      imap,
      smtp,
      nombreRemitente,
      firma
    })
    setGuardando(false)
    if (!r.success) {
      showToast(r.error || 'No se ha podido conectar el correo', 'error')
      return
    }
    setContrasena('')
    showToast(tieneContrasena ? 'Datos del correo guardados' : 'Correo conectado. La IA contestará los correos que lleguen desde ahora.', 'success')
    onConectado()
  }

  const servidorFila = (titulo: string, s: Servidor, cambiar: (s: Servidor) => void, id: string) => (
    <div>
      <p className="text-xs font-600 text-ink-700 mb-1">{titulo}</p>
      <div className="flex gap-2">
        <input id={`${id}-host`} aria-label={`${titulo}: servidor`} value={s.host} onChange={e => cambiar({ ...s, host: e.target.value.trim() })} placeholder="mail.tunegocio.com" autoComplete="off" className={`${caja} flex-1 min-w-0 bg-white`} />
        <input id={`${id}-puerto`} aria-label={`${titulo}: puerto`} value={s.puerto || ''} onChange={e => cambiar({ ...s, puerto: Number(e.target.value.replace(/\D/g, '')) || 0 })} inputMode="numeric" className={`${caja} w-20 shrink-0 bg-white`} />
      </div>
      <label className="flex items-center gap-2 mt-1.5 text-xs text-ink-600">
        <input id={`${id}-seguro`} type="checkbox" checked={s.seguro} onChange={e => cambiar({ ...s, seguro: e.target.checked })} className="rounded border-slate-300" />
        Conexión cifrada desde el principio (SSL/TLS). Desmárcala si tu proveedor dice STARTTLS.
      </label>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !guardando && onCerrar()}></div>
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl z-10">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-display font-700 text-lg text-ink-900">{tieneContrasena ? 'Datos del correo' : 'Conectar correo'}</h2>
            <button onClick={() => !guardando && onCerrar()} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-ink-600">
              La IA contestará desde esta dirección a los correos que lleguen a la bandeja de entrada <strong className="text-ink-900">a partir de ahora</strong>. Los antiguos no se tocan, y no contesta respuestas automáticas, rebotes ni boletines.
            </p>

            <div>
              <label htmlFor="correo-direccion" className="block text-sm font-600 text-ink-900 mb-1">Dirección de correo</label>
              <input id="correo-direccion" type="email" value={direccion} onChange={e => { setDireccion(e.target.value); setDetectado(null) }} onBlur={detectar} autoComplete="off" placeholder="hola@tunegocio.com" className={campo} />
              <p className="text-xs text-ink-500 mt-1">
                {detectando ? 'Mirando de qué proveedor es…' : detectado ? `Es un correo de ${detectado}: ya hemos puesto sus servidores.` : 'Mejor un buzón de atención al cliente (info@, hola@…) que uno personal: la IA contestará a todo lo que llegue.'}
              </p>
            </div>

            {microsoft ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{AVISO_MICROSOFT}</div>
            ) : (
              <>
                <div>
                  <label htmlFor="correo-proveedor" className="block text-sm font-600 text-ink-900 mb-1">¿Dónde tienes el correo?</label>
                  <select id="correo-proveedor" value={proveedor} onChange={e => { setElegidoAMano(true); setDetectado(null); elegir(e.target.value) }} className={`${campo} bg-white`}>
                    <option value="" disabled>Elige tu proveedor</option>
                    {PROVEEDORES_CORREO.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                </div>

                {p && (
                  <div>
                    <label htmlFor="correo-contrasena" className="block text-sm font-600 text-ink-900 mb-1">{p.contrasena}</label>
                    <input id="correo-contrasena" type="password" value={contrasena} onChange={e => setContrasena(e.target.value)} autoComplete="new-password" placeholder={tieneContrasena ? 'Déjala vacía para mantener la actual' : ''} className={campo} />
                    {p.ayuda && p.id !== 'otro' && (
                      <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                        {p.ayuda}{' '}
                        {p.enlace && <a href={p.enlace.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 font-600 hover:underline">{p.enlace.texto}</a>}
                      </p>
                    )}
                    <p className="text-xs text-ink-500 mt-1">Queda cifrada: nadie la vuelve a ver.</p>
                  </div>
                )}

                <div>
                  <label htmlFor="correo-nombre" className="block text-sm font-600 text-ink-900 mb-1">Nombre del remitente <span className="font-400 text-ink-400">(opcional)</span></label>
                  <input id="correo-nombre" value={nombreRemitente} onChange={e => setNombreRemitente(e.target.value)} maxLength={80} placeholder="Ej. Atención al cliente · Tu Negocio" className={campo} />
                </div>

                <div>
                  <label htmlFor="correo-firma" className="block text-sm font-600 text-ink-900 mb-1">Firma <span className="font-400 text-ink-400">(opcional)</span></label>
                  <textarea id="correo-firma" value={firma} onChange={e => setFirma(e.target.value)} maxLength={1000} rows={3} placeholder={'Un saludo,\nEl equipo de Tu Negocio\nwww.tunegocio.com'} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none" />
                  <p className="text-xs text-ink-500 mt-1">Se añade al final de cada respuesta.</p>
                </div>

                {p && (
                  <details open={verServidores} onToggle={e => setVerServidores((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-600 text-ink-700 select-none">Datos del servidor {proveedor === 'otro' ? '' : '(ya puestos)'}</summary>
                    <div className="mt-3 space-y-3">
                      {proveedor === 'otro' && p.ayuda && <p className="text-xs text-ink-500 leading-relaxed">{p.ayuda}</p>}
                      {servidorFila('Servidor de entrada (IMAP)', imap, setImap, 'correo-imap')}
                      {servidorFila('Servidor de salida (SMTP)', smtp, setSmtp, 'correo-smtp')}
                      <div>
                        <label htmlFor="correo-usuario" className="block text-xs font-600 text-ink-700 mb-1">Usuario</label>
                        <input id="correo-usuario" value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="off" placeholder={direccion.trim() || 'Normalmente, la dirección de correo'} className={`${campo} bg-white`} />
                        <p className="text-xs text-ink-500 mt-1">Déjalo vacío si es la propia dirección (lo normal).</p>
                      </div>
                    </div>
                  </details>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
            <button onClick={onCerrar} disabled={guardando} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">Cancelar</button>
            <button onClick={guardar} disabled={!puedeGuardar} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
              {guardando ? 'Comprobando el buzón…' : tieneContrasena ? 'Comprobar y guardar' : 'Comprobar y conectar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
