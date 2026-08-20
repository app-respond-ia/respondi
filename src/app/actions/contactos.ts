'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'



export interface ActualizarTratoContactoData {
  canal: string
  identificador_canal: string
  nombre?: string | null
  trato: 'normal' | 'sin_ia' | 'bloqueado'
  nota?: string
  modo?: 'ignorar' | 'respuesta_automatica' | 'derivar' | null
}

import { getAuthContext } from '@/lib/auth-context'



export async function getContactos() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Obtenemos todos los contactos para permitir filtrar en UI
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .order('fecha_actualizacion', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function actualizarTratoContacto(data: ActualizarTratoContactoData) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. Buscar si ya existe el contacto
  const { data: existing, error: searchError } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .eq('canal', data.canal)
    .eq('identificador_canal', data.identificador_canal)
    .maybeSingle()

  if (searchError) return { success: false, error: searchError.message }

  const ahora = new Date().toISOString()

  if (existing) {
    // 2. Si existe, actualizar
    const updatePayload: any = {
      trato: data.trato,
      modo: data.trato === 'normal' ? null : (data.modo || null),
      nota: data.nota,
      fecha_actualizacion: ahora
    }

    if (data.nombre) {
      updatePayload.nombre = data.nombre
    }

    const { data: updated, error: updateError } = await supabase
      .from('contacts')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError) return { success: false, error: updateError.message }

    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: `actualizó el trato del contacto "${updated.nombre || updated.identificador_canal}" a ${data.trato}`,
      tabla_afectada: 'contactos',
      registro_id: updated.id,
      valor_anterior: existing,
      valor_nuevo: updated
    })

    return { success: true, data: updated }
  } else {
    // 3. Si no existe, insertar
    const { data: inserted, error: insertError } = await supabase
      .from('contacts')
      .insert([{
        tenant_id: auth.tenant_id,
        canal: data.canal,
        identificador_canal: data.identificador_canal,
        nombre: data.nombre || null,
        trato: data.trato,
        modo: data.trato === 'normal' ? null : (data.modo || null),
        nota: data.nota,
        fecha_actualizacion: ahora
      }])
      .select('*')
      .single()

    if (insertError) return { success: false, error: insertError.message }

    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: `creó y asignó trato ${data.trato} al contacto "${inserted.nombre || inserted.identificador_canal}"`,
      tabla_afectada: 'contactos',
      registro_id: inserted.id,
      valor_nuevo: inserted
    })

    return { success: true, data: inserted }
  }
}
