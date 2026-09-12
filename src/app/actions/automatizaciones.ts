'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import { AUTOMATIZACIONES, automatizacionPorClave } from '@/lib/automatizaciones/catalogo'
import { CATEGORIAS, ajustesConDefectos } from '@/lib/automatizaciones/tipos'
import { permisosQueFaltan } from '@/lib/tiendas/shopify'

// Todo lo que necesita la pantalla de Automatizaciones: el catálogo entero
// (que vive en el código), lo que esta sucursal tiene encendido, y si la
// tienda está conectada y con permisos suficientes.
export async function getAutomatizaciones() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const [{ data: guardadas, error }, { data: tienda }, { data: plantillas }] = await Promise.all([
    supabase
      .from('automatizaciones')
      .select('id, clave, activa, ajustes, ultima_ejecucion')
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
      .order('nombre')
  ])
  if (error) return { success: false, error: error.message }

  const porClave = new Map((guardadas || []).map((g: any) => [g.clave, g]))
  const permisosTienda: string[] = (tienda?.configuracion as any)?.permisos || []
  const tiendaConectada = !!tienda && tienda.estado === 'activo'

  const lista = AUTOMATIZACIONES.map(a => {
    const guardada = porClave.get(a.clave)
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
      ajustes: ajustesConDefectos(a, guardada?.ajustes),
      ultima_ejecucion: guardada?.ultima_ejecucion || null,
      // Qué le impide funcionar ahora mismo
      falta_tienda: a.requiereTienda && !tiendaConectada,
      faltan_permisos: a.requiereTienda && tiendaConectada ? permisosQueFaltan(permisosTienda, a.permisos || []) : []
    }
  })

  return {
    success: true,
    data: {
      categorias: CATEGORIAS,
      automatizaciones: lista,
      plantillas: plantillas || [],
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

  const definicion = automatizacionPorClave(clave)
  if (!definicion) return { success: false, error: 'Esa automatización no existe.' }

  const { data: guardada } = await supabase
    .from('automatizaciones')
    .select('id, activa, ajustes')
    .eq('branch_id', auth.branch_id)
    .eq('clave', clave)
    .maybeSingle()

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

  return {
    success: true,
    data: (data || []).map((e: any) => ({
      ...e,
      nombre: automatizacionPorClave(e.clave)?.nombre || e.clave
    }))
  }
}
