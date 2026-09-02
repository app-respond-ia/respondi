'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { getAuthContext } from '@/lib/auth-context'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '@/lib/auditoria'

const MAX_DOCUMENTS = 20
const BUCKET_NAME = 'policy_documents'

// 1. Validar si la sucursal ha llegado al límite de 20 documentos
async function checkLimit(supabase: any, branchId: string) {
  const { count, error } = await supabase
    .from('policy_sources')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', branchId)

  if (error) throw new Error('Error al verificar límites de documentos')
  if (count && count >= MAX_DOCUMENTS) {
    throw new Error(`Límite alcanzado: Tienes ${count} de ${MAX_DOCUMENTS} documentos permitidos.`)
  }
}

// 2. Generar Signed Upload URL
export async function getPolicyUploadUrl(filename: string, extension: string, fileSize: number) {
  try {
    // Verificación de tamaño en el servidor
    if (fileSize > 10 * 1024 * 1024) {
      throw new Error('El archivo excede el límite permitido de 10 MB.')
    }
    const supabase = await createClient()
    const auth = await getAuthContext(supabase)
    if (auth.error) return { success: false, error: auth.error }

    const { tenant_id: tenantId, branch_id: branchId } = auth
    if (!branchId || !tenantId) throw new Error('Contexto inválido')

    await checkLimit(supabase, branchId)

    const fileId = uuidv4()
    const safePath = `${tenantId}/${branchId}/${fileId}.${extension.toLowerCase()}`

    const { data, error } = await supabaseAdmin
      .storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(safePath)

    if (error) throw error

    return { 
      success: true, 
      data: {
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path,
        safePath
      } 
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error desconocido' }
  }
}

// 3. Registrar documento subido en DB
export async function registerPolicyDocument(nombre: string, rutaArchivo: string) {
  try {
    const supabase = await createClient()
    const auth = await getAuthContext(supabase)
    if (auth.error) return { success: false, error: auth.error }

    const { tenant_id: tenantId, branch_id: branchId, user_id: userId } = auth
    if (!branchId || !tenantId) throw new Error('Contexto inválido')

    // COMPROBACIÓN ESTRICTA DE SEGURIDAD
    if (!rutaArchivo.startsWith(`${tenantId}/${branchId}/`)) {
      throw new Error('Ruta de archivo no autorizada para esta sucursal.')
    }

    await checkLimit(supabase, branchId)

    const { data, error } = await supabase
      .from('policy_sources')
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        nombre,
        tipo_origen: 'archivo',
        ruta_archivo: rutaArchivo,
        estado: 'procesando'
      })
      .select('id')
      .single()

    if (error) throw error

    await registrarAuditoria({
      tenant_id: tenantId,
      user_id: userId,
      accion: 'crear',
      tabla_afectada: 'policy_sources',
      registro_id: data.id,
      valor_nuevo: { nombre, tipo_origen: 'archivo' }
    })

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error desconocido' }
  }
}

// 4. Guardar política manual
export async function saveManualPolicy(nombre: string, textoManual: string) {
  try {
    const supabase = await createClient()
    const auth = await getAuthContext(supabase)
    if (auth.error) return { success: false, error: auth.error }

    const { tenant_id: tenantId, branch_id: branchId, user_id: userId } = auth
    if (!branchId || !tenantId) throw new Error('Contexto inválido')

    await checkLimit(supabase, branchId)

    const { data, error } = await supabase
      .from('policy_sources')
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        nombre,
        tipo_origen: 'texto_manual',
        texto_manual: textoManual,
        estado: 'procesando'
      })
      .select('id')
      .single()

    if (error) throw error

    await registrarAuditoria({
      tenant_id: tenantId,
      user_id: userId,
      accion: 'crear',
      tabla_afectada: 'policy_sources',
      registro_id: data.id,
      valor_nuevo: { nombre, tipo_origen: 'texto_manual' }
    })

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error desconocido' }
  }
}

// 5. Borrar política
export async function deletePolicy(id: string, rutaArchivo?: string | null) {
  try {
    const supabase = await createClient()
    const auth = await getAuthContext(supabase)
    if (auth.error) return { success: false, error: auth.error }

    const { tenant_id: tenantId, branch_id: branchId, user_id: userId } = auth
    if (!branchId || !tenantId) throw new Error('Contexto inválido')

    // Verificar propiedad
    const { data: source, error: fetchError } = await supabase
      .from('policy_sources')
      .select('id, nombre, ruta_archivo')
      .eq('id', id)
      .eq('branch_id', branchId)
      .single()

    if (fetchError || !source) throw new Error('Política no encontrada o sin permisos')

    const fileToDelete = rutaArchivo || source.ruta_archivo

    // Borrar de Storage si aplica usando admin para saltar restricciones
    if (fileToDelete) {
      const { error: storageError } = await supabaseAdmin
        .storage
        .from(BUCKET_NAME)
        .remove([fileToDelete])
      
      if (storageError) console.error('Error borrando archivo de storage:', storageError)
    }

    // Borrar de DB (borra fragments en cascada)
    const { error: deleteError } = await supabase
      .from('policy_sources')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    await registrarAuditoria({
      tenant_id: tenantId,
      user_id: userId,
      accion: 'borrar',
      tabla_afectada: 'policy_sources',
      registro_id: id,
      valor_anterior: { nombre: source.nombre }
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error desconocido' }
  }
}

// 6. Obtener lista de políticas
export async function getPolicies() {
  try {
    const supabase = await createClient()
    const auth = await getAuthContext(supabase)
    if (auth.error) return { success: false, error: auth.error }

    const { branch_id: branchId } = auth
    if (!branchId) throw new Error('Contexto inválido')

    const { data, error } = await supabase
      .from('policy_sources')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error desconocido' }
  }
}
