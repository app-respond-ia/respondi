import { supabaseAdmin } from '@/utils/supabase/admin'
import { leerCredencialesMeta, listarPlantillasMeta } from '@/lib/canales/meta'
import { analizarComponentes } from '@/lib/canales/plantillas-texto'

// Las plantillas de un canal de WhatsApp tal como las tiene Meta. Meta es
// quien manda (aprueba, rechaza, pausa, desactiva), así que Respondi guarda
// una copia y la pone al día: al conectarse, cuando Meta avisa de un cambio y
// cuando alguien pulsa "Actualizar". Se trabaja con el cliente del sistema
// porque los avisos de Meta llegan sin usuario.
//
// VERSIONES (13-09-2026, decidido con Jorge): una plantilla es una FAMILIA de
// versiones. Cada versión es una plantilla distinta en Meta
// ("recordatorio_cita", "recordatorio_cita_v2"...), porque Meta no deja usar
// una plantilla editada hasta que la vuelve a aprobar. De cada familia hay
// una versión EN USO (la que mandan la IA, Chats y las automatizaciones);
// una versión nueva se pone en uso sola cuando Meta la aprueba
// (`activar_al_aprobar`), y se puede volver a cualquier versión aprobada.

type CanalConCuenta = { id: string; tenant_id: string; branch_id: string; meta_waba_id: string | null }

export interface FilaPlantilla {
  id: string
  channel_id: string
  branch_id: string
  nombre: string
  familia: string
  version: number
  idioma: string
  categoria: string
  estado: string
  contenido: string
  componentes: any[] | null
  meta_template_id: string | null
  en_uso: boolean
  activar_al_aprobar: boolean
  huecos: string[] | null
  ejemplos: string[] | null
  origen: string
  motivo_rechazo: string | null
  created_at: string
  updated_at: string
}

export const COLUMNAS_PLANTILLA = 'id, channel_id, branch_id, nombre, familia, version, idioma, categoria, estado, contenido, componentes, meta_template_id, en_uso, activar_al_aprobar, huecos, ejemplos, origen, motivo_rechazo, created_at, updated_at'

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

// "recordatorio_cita_v3" → familia "recordatorio_cita", versión 3
export function familiaDe(nombre: string): { familia: string; version: number } {
  const m = String(nombre || '').match(/^(.*)_v(\d+)$/)
  if (m && m[1]) return { familia: m[1], version: Number(m[2]) || 1 }
  return { familia: String(nombre || ''), version: 1 }
}

export function nombreDeVersion(familia: string, version: number) {
  return version <= 1 ? familia : `${familia}_v${version}`
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

// ---------- Versión en uso ----------

// Deja esta versión como la que se usa en su familia (y ninguna otra)
export async function ponerEnUso(fila: { id: string; channel_id: string; familia: string; idioma: string }) {
  await supabaseAdmin.from('whatsapp_templates')
    .update({ en_uso: false })
    .eq('channel_id', fila.channel_id).eq('familia', fila.familia).eq('idioma', fila.idioma).neq('id', fila.id)
  await supabaseAdmin.from('whatsapp_templates')
    .update({ en_uso: true, activar_al_aprobar: false, updated_at: new Date().toISOString() })
    .eq('id', fila.id)
}

// Una versión recién aprobada que estaba esperando para ponerse en uso
async function activarSiToca(fila: { id: string; channel_id: string; familia: string; idioma: string; estado: string; activar_al_aprobar: boolean }) {
  if (fila.estado === 'aprobada' && fila.activar_al_aprobar) await ponerEnUso(fila)
}

// La versión de una familia que se puede mandar ahora mismo: la que está en
// uso si Meta la tiene aprobada; si no (pausada, borrada...), la aprobada
// más reciente. Null si ninguna vale.
export async function versionParaEnviar(channelId: string, familia: string, idioma: string): Promise<FilaPlantilla | null> {
  const { data } = await supabaseAdmin
    .from('whatsapp_templates')
    .select(COLUMNAS_PLANTILLA)
    .eq('channel_id', channelId).eq('familia', familia).eq('idioma', idioma)
    .order('version', { ascending: false })
  const filas = (data || []) as FilaPlantilla[]
  const enUso = filas.find(f => f.en_uso && f.estado === 'aprobada' && f.meta_template_id)
  return enUso || filas.find(f => f.estado === 'aprobada' && f.meta_template_id) || null
}

// Cualquier versión guardada en los ajustes (una automatización, la
// reapertura) → la versión de su familia que toca mandar hoy
export async function resolverPlantilla(plantillaId: string, branchId?: string | null): Promise<FilaPlantilla | null> {
  let q = supabaseAdmin.from('whatsapp_templates').select(COLUMNAS_PLANTILLA).eq('id', plantillaId)
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q.maybeSingle()
  const fila = data as FilaPlantilla | null
  if (!fila) return null
  return versionParaEnviar(fila.channel_id, fila.familia, fila.idioma)
}

// ---------- Poner al día con Meta ----------

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

  const { data: guardadasCrudo } = await supabaseAdmin
    .from('whatsapp_templates')
    .select(COLUMNAS_PLANTILLA)
    .eq('channel_id', canal.id)
  const guardadas = (guardadasCrudo || []) as FilaPlantilla[]
  const porNombre = new Map(guardadas.map(g => [`${g.nombre}|${g.idioma}`, g]))
  // Familias que ya tienen una versión en uso (para que una nueva no se cuele)
  const familiasConUso = new Set(guardadas.filter(g => g.en_uso).map(g => `${g.familia}|${g.idioma}`))

  const nuevas: any[] = []
  const cambiadas: { id: string; cambios: any; fila: FilaPlantilla }[] = []
  // Con varias versiones nuevas de una misma familia, en uso la aprobada
  // más alta (o la más alta si ninguna está aprobada)
  const mejorNueva = new Map<string, { version: number; aprobada: boolean }>()
  for (const p of vivas) {
    if (porNombre.has(`${p.name}|${p.language}`)) continue
    const { familia, version } = familiaDe(p.name)
    const clave = `${familia}|${p.language}`
    if (familiasConUso.has(clave)) continue
    const aprobada = estadoDesdeMeta(p.status) === 'aprobada'
    const actual = mejorNueva.get(clave)
    if (!actual || (aprobada && !actual.aprobada) || (aprobada === actual.aprobada && version > actual.version)) mejorNueva.set(clave, { version, aprobada })
  }
  for (const p of vivas) {
    const { cuerpo } = analizarComponentes(p.components)
    const estado = estadoDesdeMeta(p.status)
    const base = {
      categoria: CATEGORIA_DE_META[String(p.category).toUpperCase()] || 'utilidad',
      estado,
      contenido: cuerpo || '(sin texto)',
      componentes: p.components || [],
      meta_template_id: String(p.id),
      motivo_rechazo: estado === 'rechazada' ? motivoDeRechazo(p.rejected_reason) : null,
      updated_at: ahora
    }
    const existente = porNombre.get(`${p.name}|${p.language}`)
    if (existente) {
      cambiadas.push({ id: existente.id, cambios: base, fila: { ...existente, ...base } })
    } else {
      const { familia, version } = familiaDe(p.name)
      const clave = `${familia}|${p.language}`
      // Creada en Meta: si su familia no tiene nada en uso, lo será la mejor
      const enUso = !familiasConUso.has(clave) && mejorNueva.get(clave)?.version === version
      if (enUso) familiasConUso.add(clave)
      nuevas.push({
        tenant_id: canal.tenant_id, branch_id: canal.branch_id, channel_id: canal.id,
        nombre: p.name, familia, version, idioma: p.language, origen: 'meta', en_uso: enUso, ...base
      })
    }
  }

  if (nuevas.length) {
    const { error } = await supabaseAdmin.from('whatsapp_templates').insert(nuevas)
    if (error) return { ok: false, error: error.message }
  }
  for (const c of cambiadas) {
    const { error } = await supabaseAdmin.from('whatsapp_templates').update(c.cambios).eq('id', c.id)
    if (error) return { ok: false, error: error.message }
    // Una versión que esperaba a que Meta la aprobara
    if (c.fila.estado === 'aprobada' && c.fila.activar_al_aprobar) await ponerEnUso(c.fila)
  }

  // Las que se han borrado en Meta: si son la única versión, fuera; si
  // tienen hermanas, se guardan como historial ("borrada en Meta")
  const vigentes = new Set(vivas.map(p => `${p.name}|${p.language}`))
  const sobran = guardadas.filter(g => g.meta_template_id && !vigentes.has(`${g.nombre}|${g.idioma}`))
  for (const g of sobran) await marcarBorrada(g, guardadas)

  return { ok: true, total: vivas.length }
}

async function marcarBorrada(g: FilaPlantilla, todas: FilaPlantilla[]) {
  const hermanas = todas.filter(x => x.id !== g.id && x.familia === g.familia && x.idioma === g.idioma && x.channel_id === g.channel_id && x.estado !== 'borrada')
  if (!hermanas.length) {
    await supabaseAdmin.from('whatsapp_templates').delete().eq('id', g.id)
    return
  }
  await supabaseAdmin.from('whatsapp_templates')
    .update({ estado: 'borrada', en_uso: false, activar_al_aprobar: false, meta_template_id: null, updated_at: new Date().toISOString() })
    .eq('id', g.id)
  // Si era la que estaba en uso, pasa a usarse la aprobada más reciente
  if (g.en_uso) {
    const sustituta = hermanas.filter(h => h.estado === 'aprobada').sort((a, b) => b.version - a.version)[0]
    if (sustituta) await ponerEnUso(sustituta)
  }
}

// Meta avisa de que una plantilla ha cambiado de estado
export async function aplicarCambioDePlantilla(canal: CanalConCuenta, v: any) {
  const evento = String(v?.event || '').toUpperCase()
  const id = v?.message_template_id ? String(v.message_template_id) : ''
  if (!id) return

  const { data } = await supabaseAdmin
    .from('whatsapp_templates')
    .select(COLUMNAS_PLANTILLA)
    .eq('channel_id', canal.id)
    .eq('meta_template_id', id)
    .maybeSingle()
  const fila = data as FilaPlantilla | null

  if (['DELETED', 'PENDING_DELETION'].includes(evento)) {
    if (!fila) return
    const { data: todas } = await supabaseAdmin.from('whatsapp_templates').select(COLUMNAS_PLANTILLA).eq('channel_id', canal.id)
    await marcarBorrada(fila, (todas || []) as FilaPlantilla[])
    return
  }

  const nuevo = evento === 'REINSTATED' ? 'aprobada' : ESTADO_DE_META[evento]

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
  await activarSiToca({ ...fila, estado: nuevo })
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

  // La versión en uso de esa familia (la elegida puede haber sido sustituida)
  const p = await resolverPlantilla(canal.plantilla_reapertura_id, branchId)
  if (!p || p.channel_id !== canal.id) return null

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
