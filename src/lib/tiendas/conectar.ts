import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarAuditoria } from '@/lib/auditoria'
import { comprobarTienda, guardarCredencialesTienda, permisosQueFaltan, ErrorShopify, PERMISOS_MINIMOS, PERMISOS_RECOMENDADOS } from '@/lib/tiendas/shopify'

// Guardar una tienda de Shopify ya comprobada: la comparten "Conectar con
// token" (acción con sesión) y la instalación de la app de Respondi (la
// vuelta de Shopify, sin sesión: quién es el cliente viene firmado en el
// "state"). Solo servidor.

// Dirección a la que Shopify avisa de lo que pasa en la tienda
export function urlDelAviso(tiendaId: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app'}/api/tiendas/shopify/${tiendaId}`
}

export async function guardarTiendaConectada(p: {
  tenant_id: string
  branch_id: string
  user_id: string
  dominio: string
  token: string
  apiSecret: string | null
  existente: { id: string; dominio: string; estado: string } | null
  mismaTienda: boolean
  instaladaPorApp: boolean
}) {
  // 1. ¿Existe la tienda y vale el token?
  let info
  try {
    info = await comprobarTienda(p.dominio, p.token)
  } catch (e: any) {
    return { success: false, error: e instanceof ErrorShopify ? e.message : 'No se ha podido entrar en la tienda. Revisa el dominio y el token.' }
  }

  const faltanMinimos = permisosQueFaltan(info.permisos, PERMISOS_MINIMOS)
  if (faltanMinimos.length) {
    return {
      success: false,
      error: `A la app de Shopify le faltan permisos imprescindibles (${faltanMinimos.join(', ')}). ${p.instaladaPorApp ? 'Vuelve a instalar la app aceptando todos los permisos.' : 'Añádelos en Shopify, guarda, y vuelve a copiar el token.'}`
    }
  }

  // 2. La tienda (se crea o se actualiza). Queda "pendiente" hasta tener el
  //    token guardado, para que nada la dé por buena antes de tiempo.
  const configuracion = {
    permisos: info.permisos,
    zona_horaria: info.zona_horaria,
    direccion_publica: info.direccion_publica,
    correo_contacto: info.correo_contacto,
    tiene_secreto_avisos: !!p.apiSecret,
    instalada_por_app: p.instaladaPorApp
  }

  const { data: tienda, error } = await supabaseAdmin
    .from('tiendas')
    .upsert({
      tenant_id: p.tenant_id,
      branch_id: p.branch_id,
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
    await guardarCredencialesTienda(tienda.id, { access_token: p.token, api_secret: p.apiSecret })
  } catch (e: any) {
    await supabaseAdmin
      .from('tiendas')
      .update({ estado: 'error', ultimo_error: 'No se ha podido guardar el token. Vuelve a conectar la tienda.' })
      .eq('id', tienda.id)
    return { success: false, error: `No se ha podido guardar el token: ${e?.message}` }
  }

  const { error: errActivar } = await supabaseAdmin.from('tiendas').update({ estado: 'activo' }).eq('id', tienda.id)
  if (errActivar) return { success: false, error: errActivar.message }

  await registrarAuditoria({
    tenant_id: p.tenant_id,
    user_id: p.user_id,
    accion: p.instaladaPorApp ? `instaló la app de Respondi en la tienda de Shopify ${info.dominio}` : p.mismaTienda ? `cambió los datos de la tienda ${info.dominio}` : `conectó la tienda de Shopify ${info.dominio}`,
    tabla_afectada: 'tiendas',
    registro_id: tienda.id,
    // Nunca el token
    valor_anterior: p.existente ? { dominio: p.existente.dominio } : null,
    valor_nuevo: { dominio: info.dominio, nombre: info.nombre, moneda: info.moneda, instalada_por_app: p.instaladaPorApp }
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
