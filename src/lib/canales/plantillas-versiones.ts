import { supabaseAdmin } from '@/utils/supabase/admin'
import { leerCredencialesMeta, crearPlantillaMeta, ErrorMeta } from '@/lib/canales/meta'
import { estadoDesdeMeta, ponerEnUso, nombreDeVersion, COLUMNAS_PLANTILLA, type FilaPlantilla } from '@/lib/canales/plantillas'
import { problemaDelCuerpo, huecosDe } from '@/lib/canales/plantillas-texto'
import { AUTOMATIZACIONES } from '@/lib/automatizaciones/catalogo'

// Crear una VERSIÓN de una plantilla en Meta y guardarla. Lo comparten
// "nueva plantilla", "editar" (versión nueva) y "enviar una prediseñada".
// Vive aquí y no en el archivo de acciones porque recibe la sesión ya
// comprobada: no puede ser una acción a la que llame el navegador.

// Las plantillas que Respondi trae hechas, por el nombre que tienen en Meta
export const PREDISENADAS_POR_NOMBRE = new Map<string, { clave: string; automatizacion: string; categoria: 'utilidad' | 'marketing'; cuerpo: string; huecos: string[]; ejemplos: string[]; idioma: string }>()
for (const a of AUTOMATIZACIONES) {
  if (a.plantilla && !PREDISENADAS_POR_NOMBRE.has(a.plantilla.nombre)) {
    PREDISENADAS_POR_NOMBRE.set(a.plantilla.nombre, { clave: a.clave, automatizacion: a.nombre, categoria: a.plantilla.categoria, cuerpo: a.plantilla.cuerpo, huecos: a.plantilla.huecos, ejemplos: a.plantilla.ejemplos, idioma: a.plantilla.idioma })
  }
}

export function comprobarTexto(contenido: string, ejemplos: string[], maxHuecos?: number | null) {
  const problema = problemaDelCuerpo(contenido)
  if (problema) return { error: problema }
  const huecos = huecosDe(contenido)
  if (maxHuecos !== undefined && maxHuecos !== null && huecos.length > maxHuecos) {
    return { error: `Esta plantilla solo puede llevar ${maxHuecos} ${maxHuecos === 1 ? 'hueco' : 'huecos'} ({{1}}${maxHuecos > 1 ? ` a {{${maxHuecos}}}` : ''}), porque son los datos que la automatización sabe rellenar.` }
  }
  const limpios = (ejemplos || []).slice(0, huecos.length).map(e => (e || '').trim())
  if (limpios.length < huecos.length || limpios.some(e => !e)) {
    return { error: 'Pon un ejemplo para cada hueco: Meta los necesita para revisar la plantilla.' }
  }
  return { huecos, ejemplos: limpios }
}

export async function credencialesDelCanal(canal: any) {
  const credenciales = await leerCredencialesMeta(canal.id).catch((e: any) => e as Error)
  if (credenciales instanceof Error) return { error: credenciales.message }
  if (!credenciales) return { error: 'El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.' }
  return { credenciales }
}

export function errorDeMeta(e: any) {
  const detalle = e instanceof ErrorMeta && e.clavesInvalidas ? 'las claves del canal ya no valen (puede que el token haya caducado)' : e?.message
  return `Meta no ha aceptado la plantilla: ${detalle}`
}

// Crear en Meta una versión y guardarla. Es lo que comparten "nueva
// plantilla", "editar" (versión nueva) y "enviar una prediseñada".
export async function crearVersion(auth: any, canal: any, v: {
  familia: string
  version: number
  idioma: string
  categoria: 'utilidad' | 'marketing'
  contenido: string
  ejemplos: string[]
  huecos: string[] | null
  origen: 'cliente' | 'predisenada'
  // true: se pone en uso en cuanto Meta la apruebe (sustituye a la actual)
  activarAlAprobar: boolean
  // true: es la única de la familia, así que en uso desde ya
  enUso: boolean
}): Promise<{ success: true; plantilla: FilaPlantilla; categoriaCambiada: boolean } | { success: false; error: string }> {
  const nombre = nombreDeVersion(v.familia, v.version)
  const c = await credencialesDelCanal(canal)
  if ('error' in c) return { success: false, error: c.error! }

  let enMeta
  try {
    enMeta = await crearPlantillaMeta(canal.meta_waba_id, c.credenciales!.access_token, {
      nombre,
      idioma: v.idioma,
      categoria: v.categoria === 'marketing' ? 'MARKETING' : 'UTILITY',
      cuerpo: v.contenido,
      ejemplos: v.ejemplos
    })
  } catch (e: any) {
    return { success: false, error: errorDeMeta(e) }
  }

  // Meta puede cambiar la categoría si no encaja con el texto
  const categoria = enMeta.category.toUpperCase() === 'MARKETING' ? 'marketing' : enMeta.category.toUpperCase() === 'AUTHENTICATION' ? 'autenticacion' : 'utilidad'
  const estado = estadoDesdeMeta(enMeta.status)
  // Solo una versión por familia puede estar en uso (índice único parcial):
  // si esta entra en uso desde ya, la anterior (p. ej. una rechazada) lo deja
  if (v.enUso) {
    await supabaseAdmin.from('whatsapp_templates')
      .update({ en_uso: false, updated_at: new Date().toISOString() })
      .eq('channel_id', canal.id).eq('familia', v.familia).eq('idioma', v.idioma).eq('en_uso', true)
  }
  const { data: fila, error } = await supabaseAdmin
    .from('whatsapp_templates')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      channel_id: canal.id,
      nombre,
      familia: v.familia,
      version: v.version,
      contenido: v.contenido,
      idioma: v.idioma,
      categoria,
      estado,
      componentes: [{ type: 'BODY', text: v.contenido }],
      meta_template_id: enMeta.id,
      motivo_rechazo: null,
      huecos: v.huecos,
      ejemplos: v.ejemplos,
      origen: v.origen,
      en_uso: v.enUso,
      activar_al_aprobar: !v.enUso && v.activarAlAprobar,
      creado_por: auth.user_id || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id,nombre,idioma' })
    .select(COLUMNAS_PLANTILLA)
    .single()
  if (error || !fila) return { success: false, error: error?.message || 'No se ha podido guardar la plantilla.' }
  const guardada = fila as FilaPlantilla
  // Si Meta la ha aprobado en el acto (pasa con las de utilidad sencillas)
  if (guardada.estado === 'aprobada' && guardada.activar_al_aprobar) await ponerEnUso(guardada)
  return { success: true, plantilla: guardada, categoriaCambiada: categoria !== v.categoria }
}

