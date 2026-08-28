'use client'
import Loading from '@/components/Loading'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getPlantillasWhatsApp, crearPlantillaWhatsApp } from '@/app/actions/whatsapp-plantillas'
import { useToast } from '@/components/ui/Toast'

interface Plantilla {
  id: string
  nombre: string
  contenido: string
  idioma: string
  categoria: 'marketing' | 'utilidad' | 'autenticacion'
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  motivo_rechazo?: string | null
  created_at: string
  updated_at: string
}

export default function WhatsappPlantillasPage() {
  const [loading, setLoading] = useState(true)
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [channelId, setChannelId] = useState<string | null>(null)
  const { showToast } = useToast()

  const [isSlideoverOpen, setIsSlideoverOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [formNombre, setFormNombre] = useState('')
  const [formCategoria, setFormCategoria] = useState<'marketing' | 'utilidad' | 'autenticacion'>('marketing')
  const [formIdioma, setFormIdioma] = useState('es_ES')
  const [formContenido, setFormContenido] = useState('')

  const cargar = async () => {
    setLoading(true)
    const res = await getPlantillasWhatsApp()
    if (res.success && res.plantillas) {
      setPlantillas(res.plantillas)
      setChannelId(res.channelId || null)
    } else {
      showToast(res.error || 'Error al cargar plantillas', 'error')
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!channelId) {
      showToast('No hay un canal de WhatsApp activo', 'error')
      return
    }

    // Validar nombre (minúsculas y guiones bajos)
    if (!/^[a-z0-9_]+$/.test(formNombre)) {
      showToast('El nombre solo puede contener letras minúsculas, números y guiones bajos (_)', 'error')
      return
    }

    if (!formContenido.trim()) {
      showToast('El contenido no puede estar vacío', 'error')
      return
    }

    setSaving(true)
    const res = await crearPlantillaWhatsApp({
      nombre: formNombre,
      contenido: formContenido,
      idioma: formIdioma,
      categoria: formCategoria,
      channel_id: channelId
    })

    if (res.success) {
      showToast('Plantilla enviada a revisión', 'success')
      setIsSlideoverOpen(false)
      setFormNombre('')
      setFormContenido('')
      cargar()
    } else {
      showToast(res.error || 'Error al crear la plantilla', 'error')
    }
    setSaving(false)
  }

  if (loading) return <Loading />

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard/canales" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 transition mb-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Volver a Canales
          </Link>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900 flex items-center gap-3">
            <svg className="w-8 h-8 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
            Plantillas de WhatsApp
          </h1>
          <p className="text-ink-500 mt-1">Gestiona los mensajes pre-aprobados por Meta para iniciar conversaciones.</p>
        </div>
        <button 
          onClick={() => setIsSlideoverOpen(true)}
          className="px-5 h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center justify-center gap-2 shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva plantilla
        </button>
      </div>

      {!channelId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <h3 className="text-lg font-600 text-amber-900 mb-1">WhatsApp no está conectado</h3>
          <p className="text-amber-700 max-w-md mx-auto">Para gestionar plantillas primero debes conectar tu número de WhatsApp desde la pantalla de Canales.</p>
          <Link href="/dashboard/canales" className="inline-block mt-4 px-4 py-2 bg-amber-200 text-amber-800 rounded-lg text-sm font-600 hover:bg-amber-300 transition">Ir a Canales</Link>
        </div>
      ) : plantillas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
          </div>
          <h3 className="text-lg font-600 text-ink-900 mb-1">No hay plantillas todavía</h3>
          <p className="text-ink-500 max-w-md mx-auto">Crea tu primera plantilla para poder iniciar conversaciones con tus clientes mediante WhatsApp.</p>
          <button onClick={() => setIsSlideoverOpen(true)} className="mt-6 px-5 h-11 bg-white border-2 border-slate-200 hover:border-brand-600 text-ink-700 hover:text-brand-600 rounded-xl text-sm font-600 transition inline-flex items-center gap-2">
            Crear primera plantilla
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plantillas.map(p => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition flex flex-col h-full">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-600 text-ink-900 mb-1 break-all">{p.nombre}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-500 text-slate-500 uppercase tracking-wide bg-slate-100 px-2 py-0.5 rounded-md">{p.idioma}</span>
                    {p.categoria === 'marketing' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-600"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>Marketing</span>}
                    {p.categoria === 'utilidad' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>Utilidad</span>}
                    {p.categoria === 'autenticacion' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-600"><span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>Autenticación</span>}
                  </div>
                </div>
                
                <div className="shrink-0">
                  {p.estado === 'aprobada' && (
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center" title="Aprobada">
                      <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    </div>
                  )}
                  {p.estado === 'pendiente' && (
                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center" title="Pendiente de revisión">
                      <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>
                  )}
                  {p.estado === 'rechazada' && (
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center" title="Rechazada">
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-ink-700 whitespace-pre-wrap flex-1 border border-slate-100">
                {p.contenido.length > 200 ? p.contenido.substring(0, 200) + '...' : p.contenido}
              </div>

              {p.estado === 'rechazada' && p.motivo_rechazo && (
                <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-100">
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p><strong>Motivo de rechazo:</strong> {p.motivo_rechazo}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Slide-over Formulario */}
      {isSlideoverOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => !saving && setIsSlideoverOpen(false)}></div>
          
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="font-display font-600 text-xl text-ink-900">Nueva plantilla</h2>
              <button onClick={() => !saving && setIsSlideoverOpen(false)} className="p-2 text-ink-400 hover:text-ink-900 rounded-lg hover:bg-slate-50 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <form id="template-form" onSubmit={handleCreate} className="space-y-6">
                
                <div>
                  <label className="block text-sm font-600 text-ink-900 mb-1.5">Nombre de la plantilla</label>
                  <input 
                    type="text"
                    required
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="ej: bienvenida_cliente_v1"
                    className="w-full px-4 h-11 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition outline-none"
                  />
                  <p className="text-xs text-ink-500 mt-1.5">Solo letras minúsculas, números y guiones bajos (_).</p>
                </div>

                <div>
                  <label className="block text-sm font-600 text-ink-900 mb-1.5">Categoría</label>
                  <select 
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value as any)}
                    className="w-full px-4 h-11 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition outline-none"
                  >
                    <option value="marketing">Marketing (Promociones, ofertas)</option>
                    <option value="utilidad">Utilidad (Avisos, confirmaciones)</option>
                    <option value="autenticacion">Autenticación (OTPs, códigos)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-600 text-ink-900 mb-1.5">Idioma</label>
                  <select 
                    value={formIdioma}
                    onChange={(e) => setFormIdioma(e.target.value)}
                    className="w-full px-4 h-11 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition outline-none"
                  >
                    <option value="es_ES">Español (España)</option>
                    <option value="es_MX">Español (México)</option>
                    <option value="es_AR">Español (Argentina)</option>
                    <option value="en_US">Inglés (EEUU)</option>
                    <option value="pt_BR">Portugués (Brasil)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-600 text-ink-900 mb-1.5">Contenido del mensaje</label>
                  <textarea 
                    required
                    value={formContenido}
                    onChange={(e) => setFormContenido(e.target.value)}
                    rows={6}
                    placeholder="Hola {{1}}, gracias por contactar con nosotros..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition outline-none resize-none"
                  ></textarea>
                  
                  <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2.5">
                    <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Puedes insertar variables escribiendo <strong>{`{{1}}`}</strong>, <strong>{`{{2}}`}</strong>, etc. Cuando uses la plantilla, la IA rellenará estos espacios automáticamente.
                    </p>
                  </div>
                </div>

              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button 
                type="submit" 
                form="template-form"
                disabled={saving}
                className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Enviando a revisión...
                  </>
                ) : 'Guardar y enviar a Meta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
