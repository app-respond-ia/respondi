import { supabaseAdmin } from '@/utils/supabase/admin'
import { leerCredencialesMeta, listarPlantillasMeta } from '@/lib/canales/meta'
import { analizarComponentes } from '@/lib/canales/plantillas-texto'

// Las plantillas de un canal de WhatsApp tal como las tiene Meta. Meta es
// quien manda (aprueba, rechaza, pausa, desactiva), así que Respondi guarda
// una copia y la pone al día: al conectarse, cuando Meta avisa de un cambio y
// cuando alguien pulsa "Actualizar". Se trabaja con el cliente del sistema
// porque los avisos de Meta llegan sin usuario.

type CanalConCuenta = { id: string; tenant_id: string; branch_id: string; meta_waba_id: string | null }

const ESTADO_DE_META: Record<string, string> = {
  APPROVED: 'aprobada',
  PENDING: 'pendiente',
  IN_APPEAL: 'pendiente',
  REJECTED: 'rechazada',
  PAUSED: 'pausada',
  DISABLED: 'desactivada',
  ARCHIVED: 'desactivada',
  LIMIT_EXCEEDED: 'desactivada'
}

export const CATEGORIA_DE_META: Record<string, string> = {
  MARKETING: 'marketing',
  UTILITY: 'utilidad',
  AUTHENTICATION: 'autenticacion'
}

export function estadoDesdeMeta(status: string | undefined) {
  return ESTADO_DE_META[String(status || '').toUpperCase()] || 'pendiente'
}

// Por qué la ha rechazado Meta, en palabras que se entiendan
export function motivoDeRechazo(motivo: string | undefined | null) {
  const m = String(motivo || '').toUpperCase()
  if (!m || m === 'NONE') return 'Meta la ha rechazado sin dar un motivo concreto.'
  const textos: Record<string, string> = {
    INVALID_FORMAT: 'El formato no es válido: revisa el texto y los huecos.',
    ABUSIVE_CONTENT: 'Meta considera el contenido inapropiado.',
    INCORRECT_CATEGORY: 'La categoría no corresponde al contenido (por ejemplo, una promoción marcada como Utilidad).',
    TAG_CONTENT_MISMATCH: 'La categoría no corresponde al contenido (por ejemplo, una promoción marcada como Utilidad).',
    PROMOTIONAL: 'Tiene contenido promocional: créala como Marketing.',
    SCAM: 'Meta la considera engañosa.'
  }
  return textos[m] || `Meta la ha rechazado (${m}).`
}

export async function sincronizarPlantillas(canal: CanalConCuenta): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  if (!canal.meta_waba_id) {
    return { ok: false, error: 'Falta el identificador de tu cuenta de WhatsApp Business. Añádelo en Canales → WhatsApp → Cambiar claves.' }
  }
  const credenciales = await leerCredencialesMeta(canal.id).catch((e: any) => e as Error)
  if (credenciales instanceof Error) return { ok: false, error: credenciales.message }
  if (!credenciales) return { ok: false, error: 'El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.' }

  const deMeta = await listarPlantillasMeta(canal.meta_waba_id, credenciales.access_token)
  const vivas = deMeta.filter(p => !['DELETED', 'PENDING_DELETION'].includes(String(p.status).toUpperCase()))
  const ahora = new Date().toISOString()

  const filas = vivas.map(p => {
    const { cuerpo } = analizarComponentes(p.components)
    const estado = estadoDesdeMeta(p.status)
    return {
      tenant_id: canal.tenant_id,
      branch_id: canal.branch_id,
      channel_id: canal.id,
      nombre: p.name,
      idioma: p.language,
      categoria: CATEGORIA_DE_META[String(p.category).toUpperCase()] || 'utilidad',
      estado,
      contenido: cuerpo || '(sin texto)',
      componentes: p.components || [],
      meta_template_id: String(p.id),
      motivo_rechazo: estado === 'rechazada' ? motivoDeRechazo(p.rejected_reason) : null,
      updated_at: ahora
    }
  })

  if (filas.length) {
    const { error } = await supabaseAdmin.from('whatsapp_templates').upsert(filas, { onConflict: 'channel_id,nombre,idioma' })
    if (error) return { ok: false, error: error.message }
  }

  // Las que se han borrado en Meta tampoco siguen en Respondi
  const vigentes = new Set(filas.map(f => f.meta_template_id))
  const { data: guardadas } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('id, meta_template_id')
    .eq('channel_id', canal.id)
    .not('meta_template_id', 'is', null)
  const sobran = (guardadas || []).filter(g => !vigentes.has(String(g.meta_template_id))).map(g => g.id)
  if (sobran.length) await supabaseAdmin.from('whatsapp_templates').delete().in('id', sobran)

  return { ok: true, total: filas.length }
}

// Meta avisa de que una plantilla ha cambiado de estado
export async function aplicarCambioDePlantilla(canal: CanalConCuenta, v: any) {
  const evento = String(v?.event || '').toUpperCase()
  const id = v?.message_template_id ? String(v.message_template_id) : ''
  if (!id) return

  if (['DELETED', 'PENDING_DELETION'].includes(evento)) {
    await supabaseAdmin.from('whatsapp_templates').delete().eq('channel_id', canal.id).eq('meta_template_id', id)
    return
  }

  const nuevo = evento === 'REINSTATED' ? 'aprobada' : ESTADO_DE_META[evento]
  const { data: fila } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('id')
    .eq('channel_id', canal.id)
    .eq('meta_template_id', id)
    .maybeSingle()

  // Una plantilla que Respondi no conoce (creada en Meta) o un cambio sin
  // estado claro (vuelve del archivo, se bloquea...): se pregunta a Meta
  if (!fila || !nuevo) {
    await sincronizarPlantillas(canal).catch(() => {})
    return
  }

  await supabaseAdmin.from('whatsapp_templates').update({
    estado: nuevo,
    motivo_rechazo: nuevo === 'rechazada' ? motivoDeRechazo(v?.reason) : null,
    updated_at: new Date().toISOString()
  }).eq('id', fila.id)
}

// La plantilla de reapertura de la sucursal, lista para enviar a un contacto:
// aprobada, que Respondi sepa enviar y con como mucho un hueco, que es el
// nombre del cliente. Si no hay o no vale, null.
export async function plantillaDeReapertura(branchId: string, contactId: string) {
  const { data: canal } = await supabaseAdmin
    .from('channels')
    .select('id, plantilla_reapertura_id')
    .eq('branch_id', branchId)
    .eq('tipo', 'whatsapp')
    .eq('metodo', 'meta_oficial')
    .neq('estado', 'desconectado')
    .maybeSingle()
  if (!canal?.plantilla_reapertura_id) return null

  const { data: p } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('nombre, idioma, estado, contenido, componentes')
    .eq('id', canal.plantilla_reapertura_id)
    .eq('channel_id', canal.id)
    .maybeSingle()
  if (!p || p.estado !== 'aprobada') return null

  const { rellenar } = await import('@/lib/canales/plantillas-texto')
  const info = analizarComponentes(p.componentes as any[], p.contenido)
  // La manda la IA sola: no puede pedir archivo ni valores de botones
  if (!info.automatica || info.huecos.length > 1) return null

  let parametros: string[] = []
  if (info.huecos.length === 1) {
    const { data: contacto } = await supabaseAdmin.from('contacts').select('nombre').eq('id', contactId).maybeSingle()
    const nombre = (contacto?.nombre || '').trim()
    const primero = nombre && nombre.toLowerCase() !== 'desconocido' ? nombre.split(/\s+/)[0] : ''
    parametros = [primero || 'cliente']
  }
  return {
    texto: [info.cabecera, rellenar(info.cuerpo, parametros), info.pie].filter(Boolean).join('\n\n'),
    plantilla: { nombre: p.nombre, idioma: p.idioma, parametros }
  }
}
