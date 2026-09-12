'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarAuditoria } from '@/lib/auditoria'
import { after } from 'next/server'
import { getAuthContext } from '@/lib/auth-context'

// Cada tienda tiene su propia ficha de cada contacto: si lo trata normal, sin
// IA o bloqueado, y la nota que le pone (que también lee la IA). La persona es
// la misma en toda la organización (mismo número = mismo contacto, con el
// mismo nombre), pero lo que decide y anota una tienda no lo ve ni le afecta a
// otra. Decidido con Jorge el 11-09-2026. La ficha vive en `contactos_sucursal`;
// las antiguas columnas trato/modo/nota de `contacts` se borraron el mismo día.

export interface ActualizarTratoContactoData {
  canal: string
  identificador_canal: string
  nombre?: string | null
  trato: 'normal' | 'sin_ia' | 'bloqueado'
  // Sin nota, se conserva la que hubiera
  nota?: string
  modo?: 'ignorar' | 'respuesta_automatica' | 'derivar' | null
}

// Lo que la pantalla de Contactos pinta por cada fila: la persona y la ficha
// de la tienda activa.
function fila(contacto: any, ficha: any) {
  return {
    id: contacto.id,
    canal: contacto.canal,
    identificador_canal: contacto.identificador_canal,
    nombre: contacto.nombre,
    created_at: contacto.created_at,
    trato: ficha?.trato || 'normal',
    modo: ficha?.modo || null,
    nota: ficha?.nota || null,
    fecha_actualizacion: ficha?.fecha_actualizacion || contacto.fecha_actualizacion || contacto.created_at
  }
}

// Los contactos de la tienda activa: los que le han escrito y los que tienen
// ficha en ella (por ejemplo, un número bloqueado antes de que escriba).
export async function getContactos() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const [{ data: fichas, error: errFichas }, { data: convs, error: errConvs }] = await Promise.all([
    supabase
      .from('contactos_sucursal')
      .select('trato, modo, nota, fecha_actualizacion, contacts(*)')
      .eq('tenant_id', auth.tenant_id)
      .eq('branch_id', auth.branch_id),
    supabase
      .from('conversations')
      .select('contact_id')
      .eq('tenant_id', auth.tenant_id)
      .eq('branch_id', auth.branch_id)
  ])

  if (errFichas) return { success: false, error: errFichas.message }
  if (errConvs) return { success: false, error: errConvs.message }

  const filas = new Map<string, any>()
  for (const f of fichas || []) {
    const c: any = Array.isArray(f.contacts) ? f.contacts[0] : f.contacts
    if (c) filas.set(c.id, fila(c, f))
  }

  const sinFicha = [...new Set((convs || []).map((c: any) => c.contact_id))].filter(id => id && !filas.has(id))
  for (let i = 0; i < sinFicha.length; i += 100) {
    const { data: contactos, error } = await supabase
      .from('contacts')
      .select('*')
      .in('id', sinFicha.slice(i, i + 100))
    if (error) return { success: false, error: error.message }
    for (const c of contactos || []) filas.set(c.id, fila(c, null))
  }

  const data = [...filas.values()].sort((a, b) => String(b.fecha_actualizacion).localeCompare(String(a.fecha_actualizacion)))
  return { success: true, data }
}

export async function actualizarTratoContacto(data: ActualizarTratoContactoData) {
  if (data.nota && data.nota.length > 300) {
    return { success: false, error: 'La nota no puede superar los 300 caracteres.' }
  }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. La persona. Se busca en toda la organización porque el mismo número
  //    puede haber escrito ya a otra tienda: como el usuario solo ve los
  //    contactos de sus tiendas, con su cliente no lo encontraría y crearía un
  //    duplicado. Por eso esta búsqueda la hace el sistema.
    // Sin canal ni identificador no hay contacto: antes fallaba con un error de
  // base de datos ("null value in column canal")
  if (!(data.canal || '').trim()) return { success: false, error: 'Elige el canal del contacto.' }
  if (!(data.identificador_canal || '').trim()) {
    return { success: false, error: data.canal === 'email' ? 'Escribe la dirección de correo del contacto.' : data.canal === 'whatsapp' ? 'Escribe el número de teléfono del contacto.' : 'Escribe el usuario del contacto.' }
  }

const { data: existente, error: errBusqueda } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .eq('canal', data.canal)
    .eq('identificador_canal', data.identificador_canal)
    .maybeSingle()

  if (errBusqueda) return { success: false, error: errBusqueda.message }

  let contacto = existente
  if (!contacto) {
    const { data: creado, error: errCrear } = await supabaseAdmin
      .from('contacts')
      .insert({
        tenant_id: auth.tenant_id,
        canal: data.canal,
        identificador_canal: data.identificador_canal,
        nombre: data.nombre || null
      })
      .select('*')
      .single()
    if (errCrear) return { success: false, error: errCrear.message }
    contacto = creado
  }

  // 2. La ficha de ESTA tienda
  const { data: fichaAnterior } = await supabase
    .from('contactos_sucursal')
    .select('*')
    .eq('contact_id', contacto.id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()

  const cambios: any = {
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    contact_id: contacto.id,
    trato: data.trato,
    modo: data.trato === 'normal' ? null : (data.modo || null),
    fecha_actualizacion: new Date().toISOString()
  }
  if (data.nota !== undefined) cambios.nota = data.nota.trim() || null

  const { data: ficha, error: errFicha } = await supabase
    .from('contactos_sucursal')
    .upsert(cambios, { onConflict: 'contact_id,branch_id' })
    .select('*')
    .single()

  if (errFicha) return { success: false, error: errFicha.message }

  // El nombre es de la persona, el mismo en todas las tiendas
  if (data.nombre && data.nombre !== contacto.nombre) {
    const { data: renombrado } = await supabase
      .from('contacts')
      .update({ nombre: data.nombre, fecha_actualizacion: new Date().toISOString() })
      .eq('id', contacto.id)
      .select('*')
      .single()
    if (renombrado) contacto = renombrado
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: fichaAnterior
      ? `actualizó el trato del contacto "${contacto.nombre || contacto.identificador_canal}" a ${data.trato}`
      : `asignó trato ${data.trato} al contacto "${contacto.nombre || contacto.identificador_canal}"`,
    tabla_afectada: 'contactos',
    registro_id: contacto.id,
    valor_anterior: fichaAnterior || undefined,
    valor_nuevo: ficha
  })

  // 3. Si vuelve a trato normal, se liberan las conversaciones de ESTA tienda
  //    que estaban bloqueadas por el trato, y la IA contesta lo pendiente.
  if (data.trato === 'normal') {
    const { data: convsToUnlock } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contacto.id)
      .eq('branch_id', auth.branch_id)
      .eq('estado', 'activa')
      .eq('motivo_bloqueo', 'derivacion_contacto')

    for (const c of convsToUnlock || []) {
      const { error: unlockErr } = await supabase
        .from('conversations')
        .update({
          motivo_bloqueo: null,
          bloqueada_desde: null,
          ia_procesando_desde: new Date().toISOString()
        })
        .eq('id', c.id)

      if (!unlockErr) {
        after(() => {
          fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app'}/api/ai/process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.CRON_INTERNAL_SECRET}`
            },
            body: JSON.stringify({ conversation_id: c.id })
          }).catch(e => console.error('Error triggering webhook for unlocked conversation:', e))
        })
      }
    }
  }

  return { success: true, data: fila(contacto, ficha) }
}
