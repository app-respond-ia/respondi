'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { getMisPermisos } from '@/app/actions/permisos'
import { comoAsistente } from '@/lib/auditoria'
import { registrarError } from '@/lib/errores'
import { responderAsistente } from '@/lib/asistente/asistente'
import { PorNombre } from '@/lib/asistente/herramientas'

// EL ASISTENTE DEL PANEL (14-09-2026).
//
// Dos momentos separados a propósito:
//   · preguntar: la IA mira lo que necesita y PREPARA los cambios.
//   · confirmar: el cliente dice que sí y entonces, y solo entonces, se
//     ejecuta la acción del panel de siempre.
//
// Los argumentos de la propuesta se guardan en la base de datos, no viajan
// por el navegador. Al confirmar solo llega el identificador de la propuesta:
// nadie puede colar unos argumentos distintos de los que se le enseñaron.
//
// Todo lo que ejecuta el asistente va envuelto en `comoAsistente()`, que
// marca la auditoría: se ve que lo hizo la IA y qué usuario se lo pidió.

const CADUCA_MINUTOS = 60

async function sesion() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { error: auth.error as string }
  return { supabase, auth }
}

export async function getConversacionesAsistente() {
  const s = await sesion()
  if ('error' in s) return { success: false, error: s.error }

  const { data, error } = await s.supabase
    .from('asistente_conversaciones')
    .select('id, titulo, actualizado_en')
    .eq('user_id', s.auth.user_id)
    .order('actualizado_en', { ascending: false })
    .limit(30)

  if (error) return { success: false, error: error.message }
  return { success: true, data: data || [] }
}

export async function getConversacionAsistente(id: string) {
  const s = await sesion()
  if ('error' in s) return { success: false, error: s.error }

  const [{ data: mensajes }, { data: acciones }] = await Promise.all([
    s.supabase.from('asistente_mensajes').select('id, papel, contenido, created_at').eq('conversacion_id', id).order('created_at', { ascending: true }),
    s.supabase.from('asistente_acciones').select('id, mensaje_id, herramienta, resumen, estado, destructiva, error, created_at').eq('conversacion_id', id).order('created_at', { ascending: true })
  ])

  return { success: true, data: { mensajes: mensajes || [], acciones: acciones || [] } }
}

export async function borrarConversacionAsistente(id: string) {
  const s = await sesion()
  if ('error' in s) return { success: false, error: s.error }
  const { error } = await s.supabase.from('asistente_conversaciones').delete().eq('id', id).eq('user_id', s.auth.user_id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function preguntarAsistente(p: { conversacion_id?: string | null; mensaje: string }) {
  const s = await sesion()
  if ('error' in s) return { success: false, error: s.error }
  const { supabase, auth } = s

  const mensaje = String(p.mensaje || '').trim().slice(0, 4000)
  if (!mensaje) return { success: false, error: 'Escribe algo primero.' }

  // 1. La conversación (se crea la primera vez, con el principio como título)
  let conversacionId = p.conversacion_id || null
  if (conversacionId) {
    const { data } = await supabase.from('asistente_conversaciones').select('id').eq('id', conversacionId).eq('user_id', auth.user_id).maybeSingle()
    if (!data) conversacionId = null
  }
  if (!conversacionId) {
    const { data, error } = await supabase
      .from('asistente_conversaciones')
      .insert({ tenant_id: auth.tenant_id, branch_id: auth.branch_id, user_id: auth.user_id, titulo: mensaje.slice(0, 80) })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message || 'No se ha podido abrir la conversación.' }
    conversacionId = data.id
  }

  // 2. Lo que ha escrito, guardado antes de pensar (si algo falla, no se pierde)
  const { data: historialPrevio } = await supabase
    .from('asistente_mensajes').select('papel, contenido').eq('conversacion_id', conversacionId).order('created_at', { ascending: true }).limit(20)

  await supabase.from('asistente_mensajes').insert({ conversacion_id: conversacionId, tenant_id: auth.tenant_id, papel: 'usuario', contenido: mensaje })

  // 3. El contexto: quién es y qué puede tocar
  const permisos: any = await getMisPermisos()
  const { data: sucursal } = await supabase.from('sucursales').select('nombre, timezone, moneda').eq('id', auth.branch_id).maybeSingle()
  const { data: organizacion } = await supabase.from('organizaciones').select('nombre').eq('id', auth.tenant_id).maybeSingle()

  const r = await responderAsistente({
    mensaje,
    historial: (historialPrevio || []) as any,
    contexto: {
      negocio: organizacion?.nombre || null,
      sucursal: sucursal?.nombre || null,
      zona: sucursal?.timezone || null,
      moneda: sucursal?.moneda || null,
      esAdmin: !!permisos?.esAdmin,
      permisos: (permisos?.data || []) as any
    }
  })

  if (r.error) {
    await registrarError({ origen: 'app', descripcion: 'El asistente del panel no ha podido responder', stacktrace: JSON.stringify({ error: r.error }), tenant_id: auth.tenant_id })
  }

  // 4. La respuesta y, si las hay, las propuestas que esperan confirmación
  const { data: mensajeIa } = await supabase
    .from('asistente_mensajes')
    .insert({ conversacion_id: conversacionId, tenant_id: auth.tenant_id, papel: 'asistente', contenido: r.texto })
    .select('id')
    .single()

  let acciones: any[] = []
  if (r.propuestas.length) {
    const { data } = await supabase
      .from('asistente_acciones')
      .insert(r.propuestas.map(x => ({
        conversacion_id: conversacionId,
        mensaje_id: mensajeIa?.id || null,
        tenant_id: auth.tenant_id,
        branch_id: auth.branch_id,
        user_id: auth.user_id,
        herramienta: x.herramienta,
        argumentos: x.argumentos,
        resumen: x.resumen,
        seccion: x.seccion,
        destructiva: x.destructiva
      })))
      .select('id, herramienta, resumen, estado, destructiva')
    acciones = data || []
  }

  await supabase.from('asistente_conversaciones').update({ actualizado_en: new Date().toISOString() }).eq('id', conversacionId)

  return { success: true, data: { conversacion_id: conversacionId, texto: r.texto, acciones } }
}

export async function confirmarAccionAsistente(accionId: string) {
  const s = await sesion()
  if ('error' in s) return { success: false, error: s.error }
  const { supabase, auth } = s

  const { data: accion } = await supabase
    .from('asistente_acciones')
    .select('id, herramienta, argumentos, seccion, estado, created_at, user_id, branch_id')
    .eq('id', accionId)
    .maybeSingle()

  if (!accion) return { success: false, error: 'No encuentro esa propuesta.' }
  if (accion.user_id !== auth.user_id) return { success: false, error: 'Esa propuesta no es tuya.' }
  if (accion.estado === 'hecha') return { success: false, error: 'Eso ya estaba hecho.' }
  if (accion.estado !== 'propuesta') return { success: false, error: 'Esa propuesta ya no está pendiente.' }
  if (accion.branch_id && accion.branch_id !== auth.branch_id) {
    return { success: false, error: 'La propuesta era de otra sucursal. Vuelve a pedírmelo aquí.' }
  }

  // Una propuesta vieja se descarta: la configuración puede haber cambiado
  if (Date.now() - new Date(accion.created_at).getTime() > CADUCA_MINUTOS * 60 * 1000) {
    await supabase.from('asistente_acciones').update({ estado: 'caducada' }).eq('id', accion.id)
    return { success: false, error: 'La propuesta ha caducado. Pídemelo otra vez y la preparo de nuevo.' }
  }

  const herramienta = PorNombre[accion.herramienta]
  if (!herramienta || !herramienta.escribe) return { success: false, error: 'Esa propuesta ya no se puede ejecutar.' }

  // Los permisos se vuelven a comprobar aquí: pueden haber cambiado desde que
  // se preparó. La acción del panel los comprueba otra vez por su cuenta.
  if (herramienta.seccion) {
    const permisos: any = await getMisPermisos()
    if (!permisos?.success) return { success: false, error: 'No autorizado' }
    if (!permisos.esAdmin) {
      const nivel = (permisos.data || []).find((x: any) => x.seccion === herramienta.seccion)?.nivel
      if (nivel !== 'escritura') return { success: false, error: 'Ya no tienes permiso para hacer este cambio.' }
    }
  }

  // Y ahora sí. `comoAsistente` marca la auditoría: la hizo la IA, a petición
  // de este usuario, que es el que sigue quedando en user_id.
  let r: { ok: boolean; mensaje: string }
  try {
    r = await comoAsistente(() => herramienta.ejecutar(accion.argumentos))
  } catch (e: any) {
    r = { ok: false, mensaje: e?.message || 'Ha fallado al ejecutarse.' }
  }

  await supabase.from('asistente_acciones').update({
    estado: r.ok ? 'hecha' : 'fallida',
    error: r.ok ? null : r.mensaje.slice(0, 500),
    ejecutada_en: new Date().toISOString()
  }).eq('id', accion.id)

  if (!r.ok) {
    await registrarError({ origen: 'app', descripcion: 'Una acción del asistente no se ha podido ejecutar', stacktrace: JSON.stringify({ herramienta: accion.herramienta, motivo: r.mensaje }), tenant_id: auth.tenant_id })
  }

  return { success: r.ok, error: r.ok ? undefined : r.mensaje, data: { mensaje: r.mensaje } }
}

export async function rechazarAccionAsistente(accionId: string) {
  const s = await sesion()
  if ('error' in s) return { success: false, error: s.error }

  const { error } = await s.supabase
    .from('asistente_acciones')
    .update({ estado: 'rechazada' })
    .eq('id', accionId)
    .eq('user_id', s.auth.user_id)
    .eq('estado', 'propuesta')

  if (error) return { success: false, error: error.message }
  return { success: true }
}
