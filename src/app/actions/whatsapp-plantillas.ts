'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { registrarAuditoria } from '@/lib/auditoria'
import { sinPermiso } from '@/lib/permisos-servidor'
import { borrarPlantillaMeta } from '@/lib/canales/meta'
import { sincronizarPlantillas, ponerEnUso, COLUMNAS_PLANTILLA, type FilaPlantilla } from '@/lib/canales/plantillas'
import { crearVersion, comprobarTexto, credencialesDelCanal, PREDISENADAS_POR_NOMBRE } from '@/lib/canales/plantillas-versiones'
import { analizarComponentes } from '@/lib/canales/plantillas-texto'
import { ejemploRelleno } from '@/lib/automatizaciones/plantillas-predisenadas'

// Las plantillas de WhatsApp de la sucursal activa. Se crean en Meta (que las
// revisa y las aprueba o rechaza) y Respondi guarda una copia al día.
//
// Cada plantilla es una familia de VERSIONES (ver `lib/canales/plantillas.ts`):
// editar crea una versión nueva que va a Meta a revisión; mientras tanto se
// sigue usando la que estaba en uso, y se puede volver a cualquier aprobada.

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

// Las plantillas agrupadas por familia, con la versión en uso delante
function agruparFamilias(plantillas: any[]) {
  const familias = new Map<string, any>()
  for (const p of plantillas) {
    const clave = `${p.familia}|${p.idioma}`
    if (!familias.has(clave)) familias.set(clave, { familia: p.familia, idioma: p.idioma, versiones: [] })
    familias.get(clave).versiones.push(p)
  }
  return [...familias.values()].map(f => {
    f.versiones.sort((a: any, b: any) => b.version - a.version)
    // Lo que se enseña como "la plantilla": la versión en uso; si no hay, la
    // más reciente. Copias, no el mismo objeto: Next convierte los objetos
    // repetidos en referencias y quien lea la respuesta a mano ve un hueco
    const copia = (v: any) => (v ? { ...v } : null)
    f.enUso = copia(f.versiones.find((v: any) => v.en_uso))
    f.principal = copia(f.enUso || f.versiones[0])
    f.pendiente = copia(f.versiones.find((v: any) => v.estado === 'pendiente' && !v.en_uso))
    f.predisenada = PREDISENADAS_POR_NOMBRE.get(f.familia) || null
    return f
  }).sort((a, b) => a.familia.localeCompare(b.familia, 'es'))
}

export async function getPlantillasWhatsApp() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: true, canal: null, plantillas: [], familias: [], predisenadas: [] }

  const { data: plantillas, error } = await supabase
    .from('whatsapp_templates')
    .select(COLUMNAS_PLANTILLA)
    .eq('channel_id', canal.id)
    .order('nombre', { ascending: true })

  if (error) return { success: false, error: error.message }
  const lista = (plantillas || []).map(conAnalisis)
  const familias = agruparFamilias(lista)
  const yaEnviadas = new Set(familias.map(f => f.familia))
  // Las prediseñadas que todavía no se han mandado a Meta, listas para
  // enviar tal cual o editar antes
  const predisenadas = [...PREDISENADAS_POR_NOMBRE.entries()]
    .filter(([nombre]) => !yaEnviadas.has(nombre))
    .map(([nombre, p]) => ({ nombre, ...p, ejemplo: ejemploRelleno({ nombre, categoria: p.categoria as any, idioma: p.idioma, cuerpo: p.cuerpo, huecos: p.huecos, ejemplos: p.ejemplos }) }))
  return {
    success: true,
    canal: { id: canal.id, tieneCuenta: !!canal.meta_waba_id, plantillaReaperturaId: canal.plantilla_reapertura_id || null },
    plantillas: lista,
    familias,
    predisenadas
  }
}

// Las que se pueden enviar desde Chats: la versión en uso de cada familia,
// aprobada y sin datos que Respondi todavía no sepa pedir
export async function getPlantillasParaEnviar() {
  const res = await getPlantillasWhatsApp()
  if (!res.success) return res
  const enviables = (res.familias || [])
    .map((f: any) => (f.enUso && f.enUso.estado === 'aprobada' ? f.enUso : f.versiones.find((v: any) => v.estado === 'aprobada' && v.meta_template_id)) || null)
    .filter((p: any) => p && p.enviable)
  return { success: true, plantillas: enviables }
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
  if (!/^[a-z0-9_]{1,500}$/.test(nombre)) return { success: false, error: 'El nombre solo puede llevar letras minúsculas sin tildes, números y guiones bajos (_), por ejemplo: pedido_listo.' }
  if (/_v\d+$/.test(nombre)) return { success: false, error: 'El nombre no puede terminar en _v y un número: eso lo usa Respondi para las versiones.' }
  if (!IDIOMAS_VALIDOS.test(data.idioma || '')) return { success: false, error: 'Elige el idioma de la plantilla.' }
  if (!['utilidad', 'marketing'].includes(data.categoria)) return { success: false, error: 'Elige si es de Utilidad o de Marketing.' }
  const t = comprobarTexto(contenido, data.ejemplos || [])
  if ('error' in t) return { success: false, error: t.error! }

  // ¿Ya existe esa familia? Entonces es una versión nueva, no otra plantilla
  const { data: existentes } = await supabase.from('whatsapp_templates').select('id').eq('channel_id', canal.id).eq('familia', nombre).eq('idioma', data.idioma).limit(1)
  if (existentes?.length) return { success: false, error: 'Ya tienes una plantilla con ese nombre e idioma. Edítala para crear una versión nueva.' }

  const r = await crearVersion(auth, canal, { familia: nombre, version: 1, idioma: data.idioma, categoria: data.categoria, contenido, ejemplos: t.ejemplos!, huecos: null, origen: 'cliente', activarAlAprobar: true, enUso: true })
  if (!r.success) return r

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó la plantilla de WhatsApp "${nombre}" y la envió a Meta para revisión`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: r.plantilla.id,
    valor_nuevo: { nombre, idioma: data.idioma, categoria: r.plantilla.categoria, contenido }
  })

  return { success: true, plantilla: r.plantilla, categoriaCambiada: r.categoriaCambiada }
}

// Editar = una versión nueva de la misma familia. Va a Meta a revisión y,
// en cuanto la aprueben, se pone en uso sola. Mientras tanto se sigue usando
// la de siempre.
export async function editarPlantillaWhatsApp(data: { id: string; contenido: string; ejemplos: string[]; categoria?: 'utilidad' | 'marketing' }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }
  if (!canal.meta_waba_id) return { success: false, error: 'Falta el identificador de tu cuenta de WhatsApp Business. Añádelo en Canales → WhatsApp → Cambiar claves.' }

  const { data: base } = await supabase.from('whatsapp_templates').select(COLUMNAS_PLANTILLA).eq('id', data.id).eq('channel_id', canal.id).maybeSingle()
  const original = base as FilaPlantilla | null
  if (!original) return { success: false, error: 'Plantilla no encontrada.' }
  if (original.categoria === 'autenticacion') return { success: false, error: 'Las plantillas de autenticación no se editan desde Respondi.' }
  const info = analizarComponentes(original.componentes as any[], original.contenido)
  if (info.archivoCabecera || info.botones.length || info.cabeceraTexto || info.pie) {
    return { success: false, error: 'Esta plantilla lleva cabecera, pie o botones. Desde Respondi solo se edita el texto de las de solo texto; edítala en Meta y pulsa «Actualizar desde Meta».' }
  }

  const contenido = (data.contenido || '').trim()
  const categoria = data.categoria && ['utilidad', 'marketing'].includes(data.categoria) ? data.categoria : (original.categoria === 'marketing' ? 'marketing' : 'utilidad')
  // Una prediseñada solo puede usar los huecos que la automatización sabe rellenar
  const nombresHuecos = Array.isArray(original.huecos) ? original.huecos : (PREDISENADAS_POR_NOMBRE.get(original.familia)?.huecos || null)
  const t = comprobarTexto(contenido, data.ejemplos || [], nombresHuecos ? nombresHuecos.length : null)
  if ('error' in t) return { success: false, error: t.error! }
  if (contenido === original.contenido.trim() && original.estado !== 'borrada') return { success: false, error: 'El texto es el mismo que el de esta versión.' }

  const { data: hermanas } = await supabase.from('whatsapp_templates').select('version').eq('channel_id', canal.id).eq('familia', original.familia).eq('idioma', original.idioma)
  const version = Math.max(0, ...(hermanas || []).map((h: any) => Number(h.version) || 0)) + 1
  const { data: enUsoAhora } = await supabase.from('whatsapp_templates').select('id').eq('channel_id', canal.id).eq('familia', original.familia).eq('idioma', original.idioma).eq('en_uso', true).maybeSingle()

  const r = await crearVersion(auth, canal, {
    familia: original.familia, version, idioma: original.idioma, categoria, contenido, ejemplos: t.ejemplos!,
    huecos: nombresHuecos ? nombresHuecos.slice(0, t.huecos!.length) : null,
    origen: original.origen === 'predisenada' ? 'predisenada' : 'cliente',
    activarAlAprobar: true,
    enUso: !enUsoAhora
  })
  if (!r.success) return r

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `editó la plantilla de WhatsApp "${original.familia}" (versión ${version}) y la envió a Meta para revisión`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: r.plantilla.id,
    valor_anterior: { version: original.version, contenido: original.contenido },
    valor_nuevo: { version, contenido }
  })

  return { success: true, plantilla: r.plantilla, categoriaCambiada: r.categoriaCambiada, sigueEnUso: !!enUsoAhora }
}

// Volver a una versión: si Meta la tiene aprobada, pasa a usarse ya. Si se
// borró en Meta, se vuelve a mandar su texto como versión nueva.
export async function usarVersionPlantilla(id: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }

  const { data } = await supabase.from('whatsapp_templates').select(COLUMNAS_PLANTILLA).eq('id', id).eq('channel_id', canal.id).maybeSingle()
  const fila = data as FilaPlantilla | null
  if (!fila) return { success: false, error: 'Plantilla no encontrada.' }
  if (fila.en_uso) return { success: true, yaEnUso: true }

  if (fila.estado === 'borrada' || !fila.meta_template_id) {
    // Se recupera el texto mandándolo otra vez a Meta
    return editarPlantillaWhatsApp({ id: fila.id, contenido: fila.contenido, ejemplos: Array.isArray(fila.ejemplos) ? fila.ejemplos : [], categoria: fila.categoria === 'marketing' ? 'marketing' : 'utilidad' })
  }
  if (fila.estado !== 'aprobada') return { success: false, error: `Solo se puede poner en uso una versión aprobada por Meta (esta está «${fila.estado}»).` }

  await ponerEnUso(fila)
  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `puso en uso la versión ${fila.version} de la plantilla de WhatsApp "${fila.familia}"`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: fila.id
  })
  return { success: true }
}

export async function borrarPlantillaWhatsApp(id: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const canal = await canalDeLaSucursal(supabase, auth)
  if (!canal) return { success: false, error: 'No hay un WhatsApp conectado con Meta en esta sucursal.' }

  const { data } = await supabase.from('whatsapp_templates').select(COLUMNAS_PLANTILLA).eq('id', id).eq('channel_id', canal.id).maybeSingle()
  const plantilla = data as FilaPlantilla | null
  if (!plantilla) return { success: false, error: 'Plantilla no encontrada.' }

  const { data: hermanasCrudo } = await supabase.from('whatsapp_templates').select(COLUMNAS_PLANTILLA).eq('channel_id', canal.id).eq('familia', plantilla.familia).eq('idioma', plantilla.idioma).neq('id', plantilla.id)
  const hermanas = (hermanasCrudo || []) as FilaPlantilla[]
  if (plantilla.en_uso && hermanas.some(h => h.estado === 'aprobada')) {
    return { success: false, error: 'Esta versión está en uso. Pon otra versión en uso antes de borrarla.' }
  }

  // Primero en Meta: si allí sigue, volvería a aparecer al actualizar
  if (plantilla.meta_template_id && canal.meta_waba_id && plantilla.estado !== 'borrada') {
    const c = await credencialesDelCanal(canal)
    if ('error' in c) return { success: false, error: c.error! }
    try {
      await borrarPlantillaMeta(canal.meta_waba_id, c.credenciales!.access_token, plantilla.nombre, plantilla.meta_template_id)
    } catch (e: any) {
      return { success: false, error: `Meta no ha dejado borrarla: ${e?.message}` }
    }
  }

  // Con otras versiones en la familia se guarda como historial (y así no se
  // repite nunca un número de versión: Meta reserva los nombres borrados);
  // si era la única, desaparece del todo
  const { error } = hermanas.some(h => h.estado !== 'borrada')
    ? await supabase.from('whatsapp_templates').update({ estado: 'borrada', en_uso: false, activar_al_aprobar: false, meta_template_id: null, updated_at: new Date().toISOString() }).eq('id', plantilla.id)
    : await supabase.from('whatsapp_templates').delete().eq('channel_id', canal.id).eq('familia', plantilla.familia).eq('idioma', plantilla.idioma)
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
// el equipo). Se guarda la familia (su versión en uso), así que si el
// cliente la edita, la reapertura sigue funcionando con la versión nueva.
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
    const { data } = await supabase
      .from('whatsapp_templates')
      .select(COLUMNAS_PLANTILLA)
      .eq('id', plantillaId)
      .eq('channel_id', canal.id)
      .maybeSingle()
    const p = data as FilaPlantilla | null
    if (!p) return { success: false, error: 'Plantilla no encontrada.' }
    const info = analizarComponentes(p.componentes as any[], p.contenido)
    if (p.estado !== 'aprobada') return { success: false, error: 'Tiene que ser una plantilla aprobada por Meta.' }
    if (!info.automatica || info.huecos.length > 1) return { success: false, error: 'Tiene que ser una plantilla que se pueda enviar sola: sin huecos o con uno solo ({{1}}, que se rellena con el nombre del cliente), y sin archivos ni botones que haya que rellenar.' }
    nombre = p.familia
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
