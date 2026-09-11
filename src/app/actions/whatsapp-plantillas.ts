'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { registrarAuditoria } from '@/lib/auditoria'
import { sinPermiso } from '@/lib/permisos-servidor'
import { leerCredencialesMeta, crearPlantillaMeta, borrarPlantillaMeta, ErrorMeta } from '@/lib/canales/meta'
import { sincronizarPlantillas, estadoDesdeMeta } from '@/lib/canales/plantillas'
import { analizarComponentes, problemaDelCuerpo, huecosDe } from '@/lib/canales/plantillas-texto'

// Las plantillas de WhatsApp de la sucursal activa. Se crean en Meta (que las
// revisa y las aprueba o rechaza) y Respondi guarda una copia al día. Antes se
// guardaban aquí con el aviso "enviada a revisión", pero nunca llegaban a Meta.

async function canalDeLaSucursal(supabase: any, auth: any) {
  const { data } = await supabase
    .from('channels')
    .select('id, tenant_id, branch_id, estado, metodo, meta_waba_id, plantilla_reapertura_id')
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .eq('tipo', 'whatsapp')
    .eq('metodo', 'meta_oficial')
    .neq('estado', 'desconectado')
    .maybeSingle()
  return data
}

function conAnalisis(p: any) {
  return { ...p, ...analizarComponentes(p.componentes, p.contenido) }
}

export async function getPlantillasWhatsApp() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: true, canal: null, plantillas: [] }

  const { data: plantillas, error } = await supabase
    .from('whatsapp_templates')
    .select('id, nombre, contenido, idioma, categoria, estado, motivo_rechazo, componentes, meta_template_id, created_at, updated_at')
    .eq('channel_id', canal.id)
    .order('nombre', { ascending: true })

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    canal: { id: canal.id, tieneCuenta: !!canal.meta_waba_id, plantillaReaperturaId: canal.plantilla_reapertura_id || null },
    plantillas: (plantillas || []).map(conAnalisis)
  }
}

// Las que se pueden enviar desde Chats: aprobadas y sin datos que Respondi
// todavía no sepa pedir
export async function getPlantillasParaEnviar() {
  const res = await getPlantillasWhatsApp()
  if (!res.success) return res
  return {
    success: true,
    plantillas: (res.plantillas || []).filter((p: any) => p.estado === 'aprobada' && p.enviable)
  }
}

export async function sincronizarPlantillasWhatsApp() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }

  try {
    const r = await sincronizarPlantillas(canal)
    if (!r.ok) return { success: false, error: r.error }
    return { success: true, total: r.total }
  } catch (e: any) {
    return { success: false, error: `Meta no ha dado la lista de plantillas: ${e?.message}` }
  }
}

const IDIOMAS_VALIDOS = /^[a-z]{2,3}(_[A-Z]{2})?$/

export async function crearPlantillaWhatsApp(data: { nombre: string; contenido: string; idioma: string; categoria: 'utilidad' | 'marketing'; ejemplos: string[] }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }
  if (!canal.meta_waba_id) return { success: false, error: 'Falta el identificador de tu cuenta de WhatsApp Business. Añádelo en Canales → WhatsApp → Cambiar claves.' }

  const nombre = (data.nombre || '').trim()
  const contenido = (data.contenido || '').trim()
  if (!/^[a-z0-9_]{1,512}$/.test(nombre)) return { success: false, error: 'El nombre solo puede llevar letras minúsculas sin tildes, números y guiones bajos (_), por ejemplo: pedido_listo.' }
  if (!IDIOMAS_VALIDOS.test(data.idioma || '')) return { success: false, error: 'Elige el idioma de la plantilla.' }
  if (!['utilidad', 'marketing'].includes(data.categoria)) return { success: false, error: 'Elige si es de Utilidad o de Marketing.' }
  const problema = problemaDelCuerpo(contenido)
  if (problema) return { success: false, error: problema }
  const huecos = huecosDe(contenido)
  const ejemplos = (data.ejemplos || []).slice(0, huecos.length).map(e => (e || '').trim())
  if (ejemplos.length < huecos.length || ejemplos.some(e => !e)) {
    return { success: false, error: 'Pon un ejemplo para cada hueco: Meta los necesita para revisar la plantilla.' }
  }

  const credenciales = await leerCredencialesMeta(canal.id).catch((e: any) => e as Error)
  if (credenciales instanceof Error) return { success: false, error: credenciales.message }
  if (!credenciales) return { success: false, error: 'El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.' }

  let enMeta
  try {
    enMeta = await crearPlantillaMeta(canal.meta_waba_id, credenciales.access_token, {
      nombre,
      idioma: data.idioma,
      categoria: data.categoria === 'marketing' ? 'MARKETING' : 'UTILITY',
      cuerpo: contenido,
      ejemplos
    })
  } catch (e: any) {
    const detalle = e instanceof ErrorMeta && e.clavesInvalidas ? 'las claves del canal ya no valen (puede que el token haya caducado)' : e?.message
    return { success: false, error: `Meta no ha aceptado la plantilla: ${detalle}` }
  }

  // Meta puede cambiar la categoría si no encaja con el texto
  const categoria = enMeta.category.toUpperCase() === 'MARKETING' ? 'marketing' : enMeta.category.toUpperCase() === 'AUTHENTICATION' ? 'autenticacion' : 'utilidad'
  const { data: nueva, error } = await supabase
    .from('whatsapp_templates')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      channel_id: canal.id,
      nombre,
      contenido,
      idioma: data.idioma,
      categoria,
      estado: estadoDesdeMeta(enMeta.status),
      componentes: [{ type: 'BODY', text: contenido }],
      meta_template_id: enMeta.id,
      motivo_rechazo: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id,nombre,idioma' })
    .select('id, nombre, estado, categoria')
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó la plantilla de WhatsApp "${nombre}" y la envió a Meta para revisión`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: nueva.id,
    valor_nuevo: { nombre, idioma: data.idioma, categoria, contenido }
  })

  return { success: true, plantilla: nueva, categoriaCambiada: categoria !== data.categoria }
}

export async function borrarPlantillaWhatsApp(id: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }

  const { data: plantilla } = await supabase
    .from('whatsapp_templates')
    .select('id, nombre, idioma, meta_template_id, contenido')
    .eq('id', id)
    .eq('channel_id', canal.id)
    .maybeSingle()
  if (!plantilla) return { success: false, error: 'Plantilla no encontrada.' }

  // Primero en Meta: si allí sigue, volvería a aparecer al actualizar
  if (plantilla.meta_template_id && canal.meta_waba_id) {
    const credenciales = await leerCredencialesMeta(canal.id).catch((e: any) => e as Error)
    if (credenciales instanceof Error) return { success: false, error: credenciales.message }
    if (!credenciales) return { success: false, error: 'El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.' }
    try {
      await borrarPlantillaMeta(canal.meta_waba_id, credenciales.access_token, plantilla.nombre, plantilla.meta_template_id)
    } catch (e: any) {
      return { success: false, error: `Meta no ha dejado borrarla: ${e?.message}` }
    }
  }

  const { error } = await supabase.from('whatsapp_templates').delete().eq('id', plantilla.id)
  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `borró la plantilla de WhatsApp "${plantilla.nombre}"`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: plantilla.id,
    valor_anterior: { nombre: plantilla.nombre, idioma: plantilla.idioma, contenido: plantilla.contenido }
  })

  return { success: true }
}

// La plantilla que manda la IA cuando el negocio abre y han pasado más de
// 24 h desde que el cliente escribió. Tiene que estar aprobada, poder
// enviarse desde Respondi y tener como mucho un hueco ({{1}}), que se rellena
// con el nombre del cliente. null: ninguna (esas conversaciones quedan para
// el equipo).
export async function guardarPlantillaReapertura(plantillaId: string | null) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }

  let nombre: string | null = null
  if (plantillaId) {
    const { data: p } = await supabase
      .from('whatsapp_templates')
      .select('id, nombre, estado, contenido, componentes')
      .eq('id', plantillaId)
      .eq('channel_id', canal.id)
      .maybeSingle()
    if (!p) return { success: false, error: 'Plantilla no encontrada.' }
    const info = analizarComponentes(p.componentes as any[], p.contenido)
    if (p.estado !== 'aprobada') return { success: false, error: 'Tiene que ser una plantilla aprobada por Meta.' }
    if (!info.automatica || info.huecos.length > 1) return { success: false, error: 'Tiene que ser una plantilla que se pueda enviar sola: sin huecos o con uno solo ({{1}}, que se rellena con el nombre del cliente), y sin archivos ni botones que haya que rellenar.' }
    nombre = p.nombre
  }

  const { error } = await supabase.from('channels').update({ plantilla_reapertura_id: plantillaId }).eq('id', canal.id)
  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: nombre ? `eligió la plantilla "${nombre}" para cuando se abre pasadas 24 h` : 'quitó la plantilla de reapertura',
    tabla_afectada: 'canales',
    registro_id: canal.id
  })
  return { success: true }
}
