'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import {
  normalizarDominio,
  comprobarTienda,
  guardarCredencialesTienda,
  borrarCredencialesTienda,
  leerCredencialesTienda,
  permisosQueFaltan,
  ErrorShopify,
  PERMISOS_MINIMOS,
  PERMISOS_RECOMENDADOS
} from '@/lib/tiendas/shopify'

// La tienda online que el negocio ha conectado en esta sucursal. Nunca
// devuelve el token: solo lo que se puede enseñar en pantalla.
export async function getTienda() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('tiendas')
    .select('id, plataforma, dominio, nombre, moneda, estado, configuracion, ultimo_error, ultima_sincronizacion, created_at')
    .eq('branch_id', auth.branch_id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: true, data: null }

  const permisos: string[] = (data.configuracion as any)?.permisos || []
  return {
    success: true,
    data: {
      ...data,
      faltan_permisos: permisosQueFaltan(permisos, PERMISOS_RECOMENDADOS),
      // Lo que el cliente pega en su Shopify para que nos avise al instante
      webhook_url: urlDelAviso(data.id)
    }
  }
}

// Dirección a la que Shopify avisa de lo que pasa en la tienda
function urlDelAviso(tiendaId: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app'}/api/tiendas/shopify/${tiendaId}`
}

const TOKEN_VALIDO = /^shp[a-z]{2}_[A-Za-z0-9]{10,}$/

// Conectar la tienda de Shopify del negocio. Se entra en ella con el token
// ANTES de guardar nada (como con el buzón de correo); el token va a la caja
// fuerte y no vuelve a salir. Sirve también para cambiar el token de una ya
// conectada: si se deja vacío, se mantiene el que había.
export async function conectarTienda(datos: { dominio: string; token?: string; apiSecret?: string }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const dominio = normalizarDominio(datos.dominio || '')
  if (!dominio) {
    return { success: false, error: 'Escribe la dirección de tu tienda (por ejemplo, mitienda.myshopify.com).' }
  }

  // Una tienda solo puede estar conectada a una cuenta de Respondi: si no,
  // dos negocios contestarían por los mismos pedidos
  const { data: yaUsada } = await supabaseAdmin
    .from('tiendas')
    .select('tenant_id, branch_id')
    .eq('dominio', dominio)
    .maybeSingle()
  if (yaUsada && (yaUsada.tenant_id !== auth.tenant_id || yaUsada.branch_id !== auth.branch_id)) {
    return { success: false, error: 'Esta tienda ya está conectada en otra sucursal u organización.' }
  }

  const { data: existente } = await supabase
    .from('tiendas')
    .select('id, dominio, estado, configuracion, created_at')
    .eq('branch_id', auth.branch_id)
    .eq('plataforma', 'shopify')
    .maybeSingle()

  // Sin token nuevo, el guardado (solo si es la misma tienda)
  const mismaTienda = !!existente && existente.dominio === dominio && existente.estado !== 'desconectado'
  let token = (datos.token || '').trim()
  let apiSecret = (datos.apiSecret || '').trim() || null
  if (!token && mismaTienda && existente) {
    try {
      const guardadas = await leerCredencialesTienda(existente.id)
      token = guardadas?.access_token || ''
      if (!apiSecret) apiSecret = guardadas?.api_secret || null
    } catch (e: any) {
      return { success: false, error: `${e?.message} Inténtalo en un momento o vuelve a escribir el token.` }
    }
  }
  if (!token) return { success: false, error: 'Pega el token de acceso de la Admin API (empieza por shpat_).' }
  if (!TOKEN_VALIDO.test(token)) {
    return { success: false, error: 'Ese token no tiene la forma de un token de Shopify. Cópialo entero desde tu app de Shopify (empieza por shpat_).' }
  }

  // 1. ¿Existe la tienda y vale el token?
  let info
  try {
    info = await comprobarTienda(dominio, token)
  } catch (e: any) {
    return { success: false, error: e instanceof ErrorShopify ? e.message : 'No se ha podido entrar en la tienda. Revisa el dominio y el token.' }
  }

  const faltanMinimos = permisosQueFaltan(info.permisos, PERMISOS_MINIMOS)
  if (faltanMinimos.length) {
    return {
      success: false,
      error: `A la app de Shopify le faltan permisos imprescindibles (${faltanMinimos.join(', ')}). Añádelos en Shopify, guarda, y vuelve a copiar el token.`
    }
  }

  // 2. La tienda (se crea o se actualiza). Queda "pendiente" hasta tener el
  //    token guardado, para que nada la dé por buena antes de tiempo.
  const configuracion = {
    permisos: info.permisos,
    zona_horaria: info.zona_horaria,
    direccion_publica: info.direccion_publica,
    correo_contacto: info.correo_contacto,
    tiene_secreto_avisos: !!apiSecret
  }

  const { data: tienda, error } = await supabase
    .from('tiendas')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      plataforma: 'shopify',
      dominio: info.dominio,
      nombre: info.nombre,
      moneda: info.moneda,
      estado: 'pendiente',
      configuracion,
      ultimo_error: null,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'branch_id, plataforma' })
    .select('id, dominio, nombre, moneda, estado')
    .single()
  if (error || !tienda) return { success: false, error: error?.message || 'No se ha podido guardar la tienda.' }

  // 3. El token, a la caja fuerte, y entonces sí: activa
  try {
    await guardarCredencialesTienda(tienda.id, { access_token: token, api_secret: apiSecret })
  } catch (e: any) {
    await supabaseAdmin
      .from('tiendas')
      .update({ estado: 'error', ultimo_error: 'No se ha podido guardar el token. Vuelve a conectar la tienda.' })
      .eq('id', tienda.id)
    return { success: false, error: `No se ha podido guardar el token: ${e?.message}` }
  }

  const { error: errActivar } = await supabase.from('tiendas').update({ estado: 'activo' }).eq('id', tienda.id)
  if (errActivar) return { success: false, error: errActivar.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: mismaTienda ? `cambió los datos de la tienda ${info.dominio}` : `conectó la tienda de Shopify ${info.dominio}`,
    tabla_afectada: 'tiendas',
    registro_id: tienda.id,
    // Nunca el token
    valor_anterior: existente ? { dominio: existente.dominio } : null,
    valor_nuevo: { dominio: info.dominio, nombre: info.nombre, moneda: info.moneda }
  })

  return {
    success: true,
    data: {
      id: tienda.id,
      dominio: info.dominio,
      nombre: info.nombre,
      moneda: info.moneda,
      faltan_permisos: permisosQueFaltan(info.permisos, PERMISOS_RECOMENDADOS)
    }
  }
}

// Volver a comprobar una tienda ya conectada (el botón "Probar conexión")
export async function probarTienda(id: string) {
  const denegado = await sinPermiso('canales', 'lectura')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: tienda } = await supabase
    .from('tiendas')
    .select('id, dominio, configuracion')
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  if (!tienda) return { success: false, error: 'Tienda no encontrada.' }

  let credenciales
  try {
    credenciales = await leerCredencialesTienda(tienda.id)
  } catch (e: any) {
    return { success: false, error: e?.message || 'No se han podido leer las claves guardadas.' }
  }
  if (!credenciales) return { success: false, error: 'La tienda no tiene token guardado. Vuelve a conectarla.' }

  try {
    const info = await comprobarTienda(tienda.dominio, credenciales.access_token)
    await supabaseAdmin
      .from('tiendas')
      .update({
        estado: 'activo',
        nombre: info.nombre,
        moneda: info.moneda,
        ultimo_error: null,
        ultima_sincronizacion: new Date().toISOString(),
        configuracion: { ...(tienda.configuracion as any), permisos: info.permisos, zona_horaria: info.zona_horaria, direccion_publica: info.direccion_publica }
      })
      .eq('id', tienda.id)
    return {
      success: true,
      data: { nombre: info.nombre, moneda: info.moneda, faltan_permisos: permisosQueFaltan(info.permisos, PERMISOS_RECOMENDADOS) }
    }
  } catch (e: any) {
    const mensaje = e instanceof ErrorShopify ? e.message : 'No se ha podido entrar en la tienda.'
    // Un fallo pasajero no deja la tienda marcada como rota
    if (!(e instanceof ErrorShopify) || !e.reintentable) {
      await supabaseAdmin.from('tiendas').update({ estado: 'error', ultimo_error: mensaje }).eq('id', tienda.id)
    }
    return { success: false, error: mensaje }
  }
}

// Desconectar: se borra el token de la caja fuerte y la tienda queda
// desconectada. Las automatizaciones que dependían de ella dejan de actuar.
export async function desconectarTienda(id: string) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: tienda } = await supabase
    .from('tiendas')
    .select('id, dominio')
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  if (!tienda) return { success: false, error: 'Tienda no encontrada.' }

  try {
    await borrarCredencialesTienda(tienda.id)
  } catch {
    // Si el borrado del secreto falla, se sigue: lo importante es que la
    // tienda quede desconectada y ya no se use
  }

  const { error } = await supabase
    .from('tiendas')
    .update({ estado: 'desconectado', ultimo_error: null, actualizado_en: new Date().toISOString() })
    .eq('id', tienda.id)
  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `desconectó la tienda de Shopify ${tienda.dominio}`,
    tabla_afectada: 'tiendas',
    registro_id: tienda.id
  })

  return { success: true }
}
