'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import { AUTOMATIZACIONES, automatizacionPorClave } from '@/lib/automatizaciones/catalogo'
import { CATEGORIAS, CANALES_SALIDA, ajustesConDefectos } from '@/lib/automatizaciones/tipos'
import { describirReceta } from '@/lib/automatizaciones/describir'
import { ejemploRelleno } from '@/lib/automatizaciones/plantillas-predisenadas'
import { definicionDeFila, esPropia, problemaDeReceta, limpiarReceta, simularReceta, PREFIJO_PROPIA, MAXIMO_PROPIAS_POR_SUCURSAL } from '@/lib/automatizaciones/definiciones'
import { permisosQueFaltan } from '@/lib/tiendas/shopify'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { leerCredencialesMeta, crearPlantillaMeta, borrarPlantillaMeta, ErrorMeta } from '@/lib/canales/meta'
import { estadoDesdeMeta } from '@/lib/canales/plantillas'

// Todo lo que necesita la pantalla de Automatizaciones: el catálogo entero
// (que vive en el código), lo que esta sucursal tiene encendido, y si la
// tienda está conectada y con permisos suficientes.
export async function getAutomatizaciones() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const [{ data: guardadas, error }, { data: tienda }, { data: plantillas }, { data: canales }, { data: predisenadas }, { data: etiquetas }] = await Promise.all([
    supabase
      .from('automatizaciones')
      .select('id, clave, nombre, descripcion, activa, ajustes, receta, marketing, ultima_ejecucion')
      .eq('branch_id', auth.branch_id),
    supabase
      .from('tiendas')
      .select('id, dominio, nombre, estado, configuracion')
      .eq('branch_id', auth.branch_id)
      .maybeSingle(),
    // Las plantillas aprobadas de WhatsApp: son las únicas con las que se
    // puede escribir a un cliente que lleva más de 24 h sin decir nada
    supabase
      .from('whatsapp_templates')
      .select('id, nombre, idioma, contenido')
      .eq('branch_id', auth.branch_id)
      .eq('estado', 'aprobada')
      .order('nombre'),
    // Por dónde puede escribir esta sucursal (para el ajuste "Por dónde escribir")
    supabase
      .from('channels')
      .select('tipo')
      .eq('branch_id', auth.branch_id)
      .eq('estado', 'activo')
      .in('tipo', ['whatsapp', 'email']),
    // Las plantillas prediseñadas que ya se mandaron a Meta, con su estado
    supabase
      .from('whatsapp_templates')
      .select('id, nombre, estado, motivo_rechazo, categoria')
      .eq('branch_id', auth.branch_id)
      .like('nombre', 'respondi\\_%'),
    // Las etiquetas de la sucursal, para el paso "etiquetar" del editor
    supabase
      .from('message_categories')
      .select('nombre')
      .eq('branch_id', auth.branch_id)
      .order('nombre')
  ])
  if (error) return { success: false, error: error.message }
  const enMeta = new Map((predisenadas || []).map((p: any) => [p.nombre, p]))

  const porClave = new Map((guardadas || []).map((g: any) => [g.clave, g]))
  const permisosTienda: string[] = (tienda?.configuracion as any)?.permisos || []
  const tiendaConectada = !!tienda && tienda.estado === 'activo'

  // Cada fila del catálogo con lo que el cliente haya guardado encima
  // (encendida, ajustes y, si la ha moldeado, su receta). Después, las suyas.
  const lista: any[] = AUTOMATIZACIONES.map(base => {
    const guardada = porClave.get(base.clave)
    const a = (guardada?.receta ? definicionDeFila(guardada as any) : null) || base
    const ajustes = ajustesConDefectos(a, guardada?.ajustes)
    const mandada = a.plantilla ? enMeta.get(a.plantilla.nombre) : null
    return {
      clave: a.clave,
      nombre: a.nombre,
      descripcion: a.descripcion,
      detalle: a.detalle,
      categoria: a.categoria,
      estado: a.estado,
      requiereTienda: a.requiereTienda,
      escribeAlCliente: a.escribeAlCliente,
      marketing: a.marketing,
      campos: a.campos,
      activa: !!guardada?.activa,
      ajustes,
      ultima_ejecucion: guardada?.ultima_ejecucion || null,
      propia: false,
      // ¿La ha moldeado el cliente? Entonces la receta es la suya
      moldeada: !!guardada?.receta,
      receta: a.receta,
      // El workflow contado paso a paso, para pintarlo
      pasos: describirReceta(a.receta, ajustes),
      // La plantilla de WhatsApp que viene hecha y en qué punto está en Meta
      plantilla_predisenada: a.plantilla ? {
        nombre: a.plantilla.nombre,
        categoria: a.plantilla.categoria,
        cuerpo: a.plantilla.cuerpo,
        ejemplo: ejemploRelleno(a.plantilla),
        estado: mandada ? mandada.estado : 'no_enviada',
        motivo_rechazo: mandada?.motivo_rechazo || null,
        id: mandada?.id || null,
        en_uso: !!mandada && ajustes.plantilla === mandada.id
      } : null,
      // Qué le impide funcionar ahora mismo
      falta_tienda: a.requiereTienda && !tiendaConectada,
      faltan_permisos: a.requiereTienda && tiendaConectada ? permisosQueFaltan(permisosTienda, a.permisos || []) : []
    }
  })

  // Las que ha creado el cliente
  for (const g of guardadas || []) {
    if (!esPropia(g.clave)) continue
    const a = definicionDeFila(g as any)
    if (!a) continue
    const ajustes = ajustesConDefectos(a, g.ajustes)
    lista.unshift({
      clave: a.clave,
      nombre: a.nombre,
      descripcion: a.descripcion,
      detalle: a.detalle,
      categoria: 'propias',
      estado: 'lista',
      requiereTienda: a.requiereTienda,
      escribeAlCliente: a.escribeAlCliente,
      marketing: a.marketing,
      campos: a.campos,
      activa: !!g.activa,
      ajustes,
      ultima_ejecucion: g.ultima_ejecucion || null,
      propia: true,
      moldeada: false,
      receta: a.receta,
      pasos: describirReceta(a.receta, ajustes),
      plantilla_predisenada: null,
      falta_tienda: a.requiereTienda && !tiendaConectada,
      faltan_permisos: a.requiereTienda && tiendaConectada ? permisosQueFaltan(permisosTienda, a.permisos || []) : []
    })
  }

  return {
    success: true,
    data: {
      categorias: CATEGORIAS,
      automatizaciones: lista,
      maximo_propias: MAXIMO_PROPIAS_POR_SUCURSAL,
      etiquetas: (etiquetas || []).map((e: any) => e.nombre as string),
      plantillas: plantillas || [],
      canales: Array.from(new Set((canales || []).map((c: any) => c.tipo as string))),
      tienda: tienda ? { dominio: tienda.dominio, nombre: tienda.nombre, estado: tienda.estado } : null
    }
  }
}

// Encender, apagar o cambiar los ajustes de una automatización
export async function cambiarAutomatizacion(clave: string, cambios: { activa?: boolean; ajustes?: Record<string, any> }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: guardada } = await supabase
    .from('automatizaciones')
    .select('id, clave, nombre, descripcion, activa, ajustes, receta, marketing')
    .eq('branch_id', auth.branch_id)
    .eq('clave', clave)
    .maybeSingle()

  // La definición de verdad: del catálogo, moldeada por el cliente, o suya
  const definicion = (guardada ? definicionDeFila(guardada as any) : null) || automatizacionPorClave(clave)
  if (!definicion) return { success: false, error: 'Esa automatización no existe.' }

  const activa = cambios.activa ?? !!guardada?.activa

  // Lo primero, lo más de fondo: si todavía no está construida, no hay nada
  // más que mirar
  if (activa && definicion.estado !== 'lista') {
    return { success: false, error: 'Esta automatización todavía se está preparando. Muy pronto.' }
  }

  // Encenderla sin tienda conectada no tendría efecto: mejor decirlo
  if (activa && definicion.requiereTienda) {
    const { data: tienda } = await supabase
      .from('tiendas')
      .select('estado, configuracion')
      .eq('branch_id', auth.branch_id)
      .maybeSingle()
    if (!tienda || tienda.estado !== 'activo') {
      return { success: false, error: 'Antes tienes que conectar tu tienda online.' }
    }
    const faltan = permisosQueFaltan(((tienda.configuracion as any)?.permisos) || [], definicion.permisos || [])
    if (faltan.length) {
      return { success: false, error: `A tu app de Shopify le faltan permisos para esto (${faltan.join(', ')}).` }
    }
  }

  // Solo se guardan los ajustes que existen de verdad, con su tipo
  let ajustes = (guardada?.ajustes as Record<string, any>) || {}
  if (cambios.ajustes) {
    const limpios: Record<string, any> = { ...ajustes }
    for (const campo of definicion.campos) {
      if (!(campo.clave in cambios.ajustes)) continue
      let valor: any = cambios.ajustes[campo.clave]
      if (campo.tipo === 'interruptor') valor = !!valor
      else if (campo.tipo === 'numero' || campo.tipo === 'horas' || campo.tipo === 'dias' || campo.tipo === 'hora') {
        const n = Number(valor)
        if (!Number.isFinite(n)) return { success: false, error: `El valor de "${campo.etiqueta}" tiene que ser un número.` }
        if (campo.min !== undefined && n < campo.min) return { success: false, error: `"${campo.etiqueta}" no puede ser menor que ${campo.min}.` }
        if (campo.max !== undefined && n > campo.max) return { success: false, error: `"${campo.etiqueta}" no puede ser mayor que ${campo.max}.` }
        valor = n
      } else if (campo.tipo === 'canal') {
        valor = String(valor || 'auto')
        if (!CANALES_SALIDA.some(c => c.valor === valor)) return { success: false, error: 'Ese canal no existe.' }
      } else if (campo.tipo === 'plantilla') {
        // Solo una plantilla de esta sucursal y aprobada por Meta: con otra
        // cosa el mensaje no saldría y el cliente no se enteraría hasta verlo
        // en el registro
        valor = valor ? String(valor) : null
        if (valor) {
          const { data: plantilla } = await supabase
            .from('whatsapp_templates')
            .select('id, estado')
            .eq('id', valor)
            .eq('branch_id', auth.branch_id)
            .maybeSingle()
          if (!plantilla) return { success: false, error: 'Esa plantilla no existe en esta sucursal.' }
          if (plantilla.estado !== 'aprobada') return { success: false, error: 'Esa plantilla todavía no está aprobada por Meta.' }
        }
      } else if (valor !== null && valor !== undefined) {
        valor = String(valor).slice(0, 2000)
      }
      limpios[campo.clave] = valor
    }
    ajustes = limpios
  }

  // Una propia que no existe no se puede "crear" desde aquí: solo con el editor
  if (esPropia(clave) && !guardada) return { success: false, error: 'Esa automatización no existe.' }

  const { error } = await supabase
    .from('automatizaciones')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      clave,
      nombre: definicion.nombre,
      activa,
      ajustes,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'branch_id, clave' })
  if (error) return { success: false, error: error.message }

  if (cambios.activa !== undefined && cambios.activa !== !!guardada?.activa) {
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: `${activa ? 'encendió' : 'apagó'} la automatización "${definicion.nombre}"`,
      tabla_afectada: 'automatizaciones',
      valor_nuevo: { clave, activa }
    })
  }

  return { success: true, data: { clave, activa, ajustes } }
}

// Lo último que han hecho las automatizaciones, para que se vea que trabajan
export async function getHistorialAutomatizaciones(limite = 30) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('automatizaciones_ejecuciones')
    .select('id, clave, referencia, estado, detalle, created_at')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: false })
    .limit(Math.min(limite, 100))

  if (error) return { success: false, error: error.message }

  // Las propias no están en el catálogo: su nombre está en su fila
  const clavesPropias = Array.from(new Set((data || []).map((e: any) => e.clave as string).filter(esPropia)))
  const nombresPropias = new Map<string, string>()
  if (clavesPropias.length) {
    const { data: propias } = await supabase
      .from('automatizaciones')
      .select('clave, nombre')
      .eq('branch_id', auth.branch_id)
      .in('clave', clavesPropias)
    for (const p of propias || []) nombresPropias.set(p.clave, p.nombre || p.clave)
  }

  return {
    success: true,
    data: (data || []).map((e: any) => ({
      ...e,
      nombre: automatizacionPorClave(e.clave)?.nombre || nombresPropias.get(e.clave) || e.clave
    }))
  }
}

// Mandar a Meta la plantilla prediseñada de una automatización, con la
// cuenta de WhatsApp del cliente, y dejarla elegida en los ajustes: en
// cuanto Meta la apruebe (nos avisa solo), la automatización la usa sin que
// el cliente tenga que hacer nada más. El texto no se puede cambiar: está
// escrito para que Meta lo apruebe.
export async function enviarPlantillaPredisenada(clave: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const definicion = automatizacionPorClave(clave)
  if (!definicion?.plantilla) return { success: false, error: 'Esta automatización no tiene plantilla de WhatsApp.' }
  const p = definicion.plantilla

  const { data: canal } = await supabase
    .from('channels')
    .select('id, estado, meta_waba_id')
    .eq('branch_id', auth.branch_id)
    .eq('tipo', 'whatsapp')
    .eq('metodo', 'meta_oficial')
    .neq('estado', 'desconectado')
    .maybeSingle()
  if (!canal) return { success: false, error: 'Antes conecta tu WhatsApp con Meta en Canales.' }
  if (!canal.meta_waba_id) return { success: false, error: 'Falta el identificador de tu cuenta de WhatsApp Business. Añádelo en Canales → WhatsApp → Cambiar claves.' }

  // Si ya está en Meta (pendiente o aprobada), no se vuelve a mandar
  const { data: existente } = await supabase
    .from('whatsapp_templates')
    .select('id, estado, meta_template_id')
    .eq('channel_id', canal.id)
    .eq('nombre', p.nombre)
    .eq('idioma', p.idioma)
    .maybeSingle()
  if (existente && ['pendiente', 'aprobada'].includes(existente.estado)) {
    await dejarElegida(supabase, auth, definicion, existente.id)
    return { success: true, data: { id: existente.id, estado: existente.estado, repetida: true } }
  }

  const credenciales = await leerCredencialesMeta(canal.id).catch((e: any) => e as Error)
  if (credenciales instanceof Error) return { success: false, error: credenciales.message }
  if (!credenciales) return { success: false, error: 'El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.' }

  // Una rechazada (o pausada/desactivada) hay que borrarla en Meta antes de
  // volver a mandarla: Meta no deja dos con el mismo nombre e idioma
  if (existente?.meta_template_id) {
    try {
      await borrarPlantillaMeta(canal.meta_waba_id, credenciales.access_token, p.nombre, existente.meta_template_id)
    } catch {
      // Si ya no existía en Meta, mejor: seguimos
    }
  }

  let enMeta
  try {
    enMeta = await crearPlantillaMeta(canal.meta_waba_id, credenciales.access_token, {
      nombre: p.nombre,
      idioma: p.idioma,
      categoria: p.categoria === 'marketing' ? 'MARKETING' : 'UTILITY',
      cuerpo: p.cuerpo,
      ejemplos: p.ejemplos
    })
  } catch (e: any) {
    const detalle = e instanceof ErrorMeta && e.clavesInvalidas ? 'las claves del canal ya no valen (puede que el token haya caducado)' : e?.message
    return { success: false, error: `Meta no ha aceptado la plantilla: ${detalle}` }
  }

  const categoria = String(enMeta.category || '').toUpperCase() === 'MARKETING' ? 'marketing' : 'utilidad'
  const { data: fila, error } = await supabase
    .from('whatsapp_templates')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      channel_id: canal.id,
      nombre: p.nombre,
      contenido: p.cuerpo,
      idioma: p.idioma,
      categoria,
      estado: estadoDesdeMeta(enMeta.status),
      componentes: [{ type: 'BODY', text: p.cuerpo }],
      meta_template_id: enMeta.id,
      motivo_rechazo: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id,nombre,idioma' })
    .select('id, estado')
    .single()
  if (error || !fila) return { success: false, error: error?.message || 'No se ha podido guardar la plantilla.' }

  await dejarElegida(supabase, auth, definicion, fila.id)

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `envió a Meta la plantilla prediseñada "${p.nombre}" de la automatización "${definicion.nombre}"`,
    tabla_afectada: 'whatsapp_templates',
    registro_id: fila.id,
    valor_nuevo: { nombre: p.nombre, categoria, contenido: p.cuerpo }
  })

  return { success: true, data: { id: fila.id, estado: fila.estado } }
}

// ---------------------------------------------------------------------------
// El editor: crear las suyas, moldear las nuestras, y probar sin enviar nada
// ---------------------------------------------------------------------------

// Lo que rodea a una automatización, para saber qué pasaría de verdad
async function entornoDeLaSucursal(supabase: any, auth: any, ajustes: Record<string, any>) {
  const [{ data: canales }, { data: etiquetas }, { data: tienda }, plantilla] = await Promise.all([
    supabase.from('channels').select('tipo').eq('branch_id', auth.branch_id).eq('estado', 'activo').in('tipo', ['whatsapp', 'email']),
    supabase.from('message_categories').select('nombre').eq('branch_id', auth.branch_id),
    supabase.from('tiendas').select('estado').eq('branch_id', auth.branch_id).maybeSingle(),
    ajustes.plantilla
      ? supabase.from('whatsapp_templates').select('estado').eq('id', ajustes.plantilla).eq('branch_id', auth.branch_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])
  return {
    canales: Array.from(new Set<string>((canales || []).map((c: any) => String(c.tipo)))),
    etiquetas: (etiquetas || []).map((e: any) => String(e.nombre)),
    tiendaConectada: tienda?.estado === 'activo',
    plantillaAprobada: (plantilla as any)?.data?.estado === 'aprobada'
  }
}

// Probar con un pedido de ejemplo: qué haría paso a paso, sin hacer nada.
// Sirve para lo guardado y para un borrador que aún no se ha guardado.
export async function simularAutomatizacion(clave: string, borrador?: { receta?: any; ajustes?: Record<string, any>; nombre?: string; marketing?: boolean }) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: guardada } = await supabase
    .from('automatizaciones')
    .select('id, clave, nombre, descripcion, activa, ajustes, receta, marketing')
    .eq('branch_id', auth.branch_id)
    .eq('clave', clave)
    .maybeSingle()

  const propia = esPropia(clave)
  let definicion = (guardada ? definicionDeFila(guardada as any) : null) || automatizacionPorClave(clave)
  if (borrador?.receta) {
    const problema = problemaDeReceta(borrador.receta, { propia })
    if (problema) return { success: false, error: problema }
    const receta = limpiarReceta(borrador.receta)
    definicion = definicionDeFila({
      clave: propia ? clave : `${PREFIJO_PROPIA}borrador`,
      nombre: borrador.nombre || guardada?.nombre || 'Borrador',
      descripcion: guardada?.descripcion,
      receta,
      marketing: borrador.marketing ?? guardada?.marketing ?? false
    })
    // Una del catálogo moldeada en borrador: su definición con la receta nueva
    if (!propia) {
      const base = automatizacionPorClave(clave)
      if (base) definicion = { ...base, receta }
    }
  }
  if (!definicion) return { success: false, error: 'Esa automatización no existe.' }

  const ajustes = { ...ajustesConDefectos(definicion, guardada?.ajustes), ...(borrador?.ajustes || {}) }
  const entorno = await entornoDeLaSucursal(supabase, auth, ajustes)
  return { success: true, data: simularReceta(definicion, ajustes, entorno) }
}

const NOMBRE_VALIDO = (n: any) => typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 80

// Crear una automatización propia. Nace apagada, como todas.
export async function crearAutomatizacionPropia(datos: { nombre: string; descripcion?: string; marketing?: boolean; receta: any }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  if (!NOMBRE_VALIDO(datos.nombre)) return { success: false, error: 'Ponle un nombre (de 2 a 80 letras).' }
  const problema = problemaDeReceta(datos.receta, { propia: true })
  if (problema) return { success: false, error: problema }

  const { count } = await supabase
    .from('automatizaciones')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', auth.branch_id)
    .like('clave', `${PREFIJO_PROPIA}%`)
  if ((count || 0) >= MAXIMO_PROPIAS_POR_SUCURSAL) {
    return { success: false, error: `Ya tienes ${MAXIMO_PROPIAS_POR_SUCURSAL} automatizaciones propias en esta sucursal. Borra alguna para crear otra.` }
  }

  const clave = `${PREFIJO_PROPIA}${Math.random().toString(36).slice(2, 10)}`
  const receta = limpiarReceta(datos.receta)
  const { data: fila, error } = await supabase
    .from('automatizaciones')
    .insert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      clave,
      nombre: datos.nombre.trim(),
      descripcion: (datos.descripcion || '').trim().slice(0, 500) || null,
      marketing: !!datos.marketing,
      receta,
      activa: false,
      ajustes: {}
    })
    .select('id, clave')
    .single()
  if (error || !fila) return { success: false, error: error?.message || 'No se ha podido crear.' }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó la automatización propia "${datos.nombre.trim()}"`,
    tabla_afectada: 'automatizaciones',
    registro_id: fila.id,
    valor_nuevo: { clave, receta }
  })
  return { success: true, data: { clave } }
}

// Guardar la receta de una automatización: la suya (y su nombre) o una del
// catálogo moldeada. Si estaba encendida sigue encendida con la receta nueva;
// lo que estuviera esperando sigue por la receta nueva desde su paso.
export async function guardarReceta(clave: string, datos: { receta: any; nombre?: string; descripcion?: string; marketing?: boolean }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const propia = esPropia(clave)
  const base = propia ? null : automatizacionPorClave(clave)
  if (!propia && !base) return { success: false, error: 'Esa automatización no existe.' }

  const problema = problemaDeReceta(datos.receta, { propia })
  if (problema) return { success: false, error: problema }
  if (propia && datos.nombre !== undefined && !NOMBRE_VALIDO(datos.nombre)) return { success: false, error: 'Ponle un nombre (de 2 a 80 letras).' }
  const receta = limpiarReceta(datos.receta)

  const { data: guardada } = await supabase
    .from('automatizaciones')
    .select('id, receta, nombre')
    .eq('branch_id', auth.branch_id)
    .eq('clave', clave)
    .maybeSingle()
  if (propia && !guardada) return { success: false, error: 'Esa automatización no existe.' }

  const { error } = await supabase
    .from('automatizaciones')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      clave,
      nombre: propia ? (datos.nombre?.trim() || guardada?.nombre) : base!.nombre,
      ...(propia && datos.descripcion !== undefined ? { descripcion: datos.descripcion.trim().slice(0, 500) || null } : {}),
      ...(propia && datos.marketing !== undefined ? { marketing: !!datos.marketing } : {}),
      receta,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'branch_id, clave' })
  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: propia ? `cambió la automatización propia "${datos.nombre?.trim() || guardada?.nombre}"` : `moldeó la automatización "${base!.nombre}"`,
    tabla_afectada: 'automatizaciones',
    registro_id: guardada?.id,
    valor_anterior: guardada?.receta ? { receta: guardada.receta } : null,
    valor_nuevo: { receta }
  })
  return { success: true }
}

// Volver a la receta de Respondi (solo las del catálogo)
export async function restablecerReceta(clave: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const base = automatizacionPorClave(clave)
  if (!base || esPropia(clave)) return { success: false, error: 'Esa automatización no tiene versión de Respondi a la que volver.' }

  const { error } = await supabase
    .from('automatizaciones')
    .update({ receta: null, actualizado_en: new Date().toISOString() })
    .eq('branch_id', auth.branch_id)
    .eq('clave', clave)
  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `devolvió la automatización "${base.nombre}" a la receta de Respondi`,
    tabla_afectada: 'automatizaciones'
  })
  return { success: true }
}

// Borrar una propia (se lleva su registro). Las del catálogo no se borran:
// se apagan.
export async function borrarAutomatizacionPropia(clave: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  if (!esPropia(clave)) return { success: false, error: 'Las automatizaciones de Respondi no se borran: apágala si no la quieres.' }

  const { data: fila } = await supabase
    .from('automatizaciones')
    .select('id, nombre')
    .eq('branch_id', auth.branch_id)
    .eq('clave', clave)
    .maybeSingle()
  if (!fila) return { success: false, error: 'Esa automatización no existe.' }

  const { error } = await supabase.from('automatizaciones').delete().eq('id', fila.id)
  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `borró la automatización propia "${fila.nombre}"`,
    tabla_afectada: 'automatizaciones',
    registro_id: fila.id
  })
  return { success: true }
}

// La plantilla prediseñada queda elegida en los ajustes de la automatización
async function dejarElegida(supabase: any, auth: any, definicion: { clave: string; nombre: string }, plantillaId: string) {
  const { data: guardada } = await supabase
    .from('automatizaciones')
    .select('ajustes')
    .eq('branch_id', auth.branch_id)
    .eq('clave', definicion.clave)
    .maybeSingle()
  await supabaseAdmin
    .from('automatizaciones')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      clave: definicion.clave,
      nombre: definicion.nombre,
      ajustes: { ...((guardada?.ajustes as any) || {}), plantilla: plantillaId },
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'branch_id, clave' })
}
