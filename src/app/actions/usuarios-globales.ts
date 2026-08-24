'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { requireSuperAdmin, canManageSuperadminRole } from './superadmin'
import { superadminHasPermission } from '@/lib/permisosSuperadmin'
import { revalidatePath } from 'next/cache'

// 1. Obtener todos los usuarios globales
export async function getTodosLosUsuarios(filtro: string = 'Todos', busqueda: string = '') {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'usuarios_globales', 'lectura')) {
      return { success: false, error: 'No tienes permiso para ver usuarios globales' }
    }

    let query = supabaseAdmin
      .from('users')
      .select(`
        id, email, nombre, rol, activo, fecha_creacion,
        tenant_id,
        organizaciones (nombre),
        superadmin_rol_id,
        superadmin_roles (nombre, nivel)
      `)
      .order('fecha_creacion', { ascending: false })

    if (filtro === 'Clientes') {
      query = query.in('rol', ['admin', 'usuario']) // tenant_user in Respondi v1, but schema says admin, usuario
    } else if (filtro === 'Vendedores') {
      query = query.eq('rol', 'vendedor')
    } else if (filtro === 'Superadmins') {
      query = query.eq('rol', 'super_admin')
    }

    if (busqueda) {
      query = query.or(`email.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// 2. Activar o desactivar cuenta
export async function cambiarEstadoUsuario(targetUserId: string, activo: boolean) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'usuarios_globales', 'escritura')) {
      return { success: false, error: 'No tienes permiso de escritura en usuarios globales' }
    }

    // No permitir desactivarse a uno mismo
    if (targetUserId === auth.userId) {
      return { success: false, error: 'No puedes desactivar tu propia cuenta' }
    }

    // Validar si el target es super_admin
    const { data: targetUser } = await supabaseAdmin.from('users').select('rol, superadmin_roles(nivel, es_propietario)').eq('id', targetUserId).single()
    if (!targetUser) return { success: false, error: 'Usuario no encontrado' }

    if (targetUser.rol === 'super_admin') {
      const targetRole = Array.isArray(targetUser.superadmin_roles) ? targetUser.superadmin_roles[0] : targetUser.superadmin_roles
      const targetLevel = targetRole?.nivel ?? 5
      
      const checkUser = await canManageSuperadminRole(auth.userId, targetLevel)
      if (!checkUser.allowed && targetRole?.es_propietario !== true) {
        if (!auth.esPropietario) {
          return { success: false, error: 'No tienes jerarquía suficiente para modificar el estado de este superadmin' }
        }
      }
    }

    const { error } = await supabaseAdmin.from('users').update({ activo }).eq('id', targetUserId)
    if (error) throw error

    // Registrar en audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: null,
      user_id: auth.userId,
      accion: activo ? 'activar_usuario' : 'desactivar_usuario',
      tabla_afectada: 'users',
      registro_id: targetUserId
    })

    revalidatePath('/superadmin/usuarios')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// 3. Enviar email de reseteo
export async function enviarResetPassword(email: string) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'usuarios_globales', 'escritura')) {
      return { success: false, error: 'No tienes permiso de escritura en usuarios globales' }
    }

    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/auth/procesar-hash`

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo
    })

    if (error) throw error

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: null,
      user_id: auth.userId,
      accion: 'enviar_reset_password',
      tabla_afectada: 'users',
      valor_nuevo: { email }
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// 4. Cambiar rol entre tenant_user/admin y vendedor
export async function cambiarRolUsuario(targetUserId: string, nuevoRol: 'admin' | 'vendedor') {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'usuarios_globales', 'escritura')) {
      return { success: false, error: 'No tienes permiso de escritura en usuarios globales' }
    }

    const { data: targetUser } = await supabaseAdmin.from('users').select('rol, nombre, email').eq('id', targetUserId).single()
    if (!targetUser) return { success: false, error: 'Usuario no encontrado' }

    if (targetUser.rol === 'super_admin') {
      return { success: false, error: 'No puedes usar esta acción para modificar a un superadmin' }
    }
    
    if (targetUser.rol === nuevoRol) {
      return { success: false, error: `El usuario ya tiene el rol ${nuevoRol}` }
    }

    // Actualizar rol y quitar tenant si pasa a vendedor
    const updates: any = { rol: nuevoRol }
    if (nuevoRol === 'vendedor') {
      updates.tenant_id = null
      updates.branch_id = null
    }

    const { error: updErr } = await supabaseAdmin.from('users').update(updates).eq('id', targetUserId)
    if (updErr) throw updErr

    // Si se pasa a vendedor, creamos la fila en vendedores
    if (nuevoRol === 'vendedor') {
      const { data: existe } = await supabaseAdmin.from('vendedores').select('id').eq('user_id', targetUserId).single()
      if (!existe) {
        await supabaseAdmin.from('vendedores').insert({
          user_id: targetUserId,
          nombre: targetUser.nombre || targetUser.email,
          email: targetUser.email,
          porcentaje_comision: 0,
          tipo_comision: 'recurrente',
          activo: true
        })
      }
    }

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: null,
      user_id: auth.userId,
      accion: 'cambiar_rol_global',
      tabla_afectada: 'users',
      registro_id: targetUserId,
      valor_anterior: { rol: targetUser.rol },
      valor_nuevo: { rol: nuevoRol }
    })

    revalidatePath('/superadmin/usuarios')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// 5. Degradar Superadmin
export async function degradarSuperadmin(targetUserId: string) {
  try {
    const auth = await requireSuperAdmin()
    if (!superadminHasPermission(auth, 'usuarios_globales', 'escritura')) {
      return { success: false, error: 'No tienes permiso de escritura en usuarios globales' }
    }

    const { data: targetUser } = await supabaseAdmin.from('users').select('rol, superadmin_roles(nivel, es_propietario)').eq('id', targetUserId).single()
    if (!targetUser) return { success: false, error: 'Usuario no encontrado' }

    if (targetUser.rol !== 'super_admin') {
      return { success: false, error: 'El usuario no es un superadmin' }
    }

    const targetRole = Array.isArray(targetUser.superadmin_roles) ? targetUser.superadmin_roles[0] : targetUser.superadmin_roles
    const targetLevel = targetRole?.nivel ?? 5
    
    // Verificar jerarquía
    const checkUser = await canManageSuperadminRole(auth.userId, targetLevel)
    if (!checkUser.allowed && targetRole?.es_propietario !== true) {
      if (!auth.esPropietario) {
        return { success: false, error: 'No tienes jerarquía suficiente para degradar a este superadmin' }
      }
    }
    
    if (targetRole?.es_propietario) {
        return { success: false, error: 'No puedes degradar a un Propietario' }
    }

    // Degradar a admin sin tenant (o usuario base)
    const { error: updErr } = await supabaseAdmin.from('users').update({
      rol: 'admin',
      superadmin_rol_id: null,
      tenant_id: null,
      branch_id: null
    }).eq('id', targetUserId)

    if (updErr) throw updErr

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: null,
      user_id: auth.userId,
      accion: 'degradar_superadmin',
      tabla_afectada: 'users',
      registro_id: targetUserId
    })

    revalidatePath('/superadmin/usuarios')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
