import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { vueltaFirmada, leerEstadoInstalacion, canjearCodigo, registrarWebhooksDeTienda, normalizarDominio, instalacionDisponible } from '@/lib/tiendas/shopify'
import { guardarTiendaConectada, urlDelAviso } from '@/lib/tiendas/conectar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// La vuelta de Shopify cuando el cliente autoriza la app de Respondi: se
// comprueba la firma y el "state", se cambia el código por el token, se
// guarda la tienda y se registran los avisos. Después, de vuelta al panel.
function volver(parametros: Record<string, string>) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app').replace(/\/$/, '')
  return NextResponse.redirect(`${base}/dashboard/tienda?${new URLSearchParams(parametros).toString()}`, { status: 302 })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const p = url.searchParams
  // Sin las claves de la app en Vercel no hay nada que comprobar (y no es un error que apuntar)
  if (!instalacionDisponible()) return volver({ instalada: '0', motivo: 'La instalación con un clic todavía no está activada en Respondi.' })
  try {
    if (!vueltaFirmada(p)) return volver({ instalada: '0', motivo: 'La vuelta de Shopify no viene firmada correctamente.' })
    const estado = leerEstadoInstalacion(p.get('state'))
    if (!estado) return volver({ instalada: '0', motivo: 'La instalación ha caducado o no es válida. Vuelve a empezar desde Tienda online.' })
    const dominio = normalizarDominio(p.get('shop') || '')
    if (!dominio || dominio !== estado.dominio) return volver({ instalada: '0', motivo: 'La tienda que ha respondido no es la que pediste conectar.' })
    const codigo = p.get('code') || ''
    if (!codigo) return volver({ instalada: '0', motivo: 'Shopify no ha devuelto el código de instalación.' })

    const { access_token } = await canjearCodigo(dominio, codigo)

    const { data: existente } = await supabaseAdmin
      .from('tiendas')
      .select('id, dominio, estado')
      .eq('branch_id', estado.branch_id)
      .eq('plataforma', 'shopify')
      .maybeSingle()
    const r = await guardarTiendaConectada({
      tenant_id: estado.tenant_id,
      branch_id: estado.branch_id,
      user_id: estado.user_id,
      dominio,
      token: access_token,
      // Los avisos de una app van firmados con el secreto de la app
      apiSecret: process.env.SHOPIFY_CLIENT_SECRET || null,
      existente: existente || null,
      mismaTienda: !!existente && existente.dominio === dominio && existente.estado !== 'desconectado',
      instaladaPorApp: true
    })
    if (!r.success || !r.data) return volver({ instalada: '0', motivo: r.error || 'No se ha podido guardar la tienda.' })

    // Los avisos al instante, registrados por Respondi
    const fallos = await registrarWebhooksDeTienda(dominio, access_token, urlDelAviso(r.data.id))
    const { data: fila } = await supabaseAdmin.from('tiendas').select('configuracion').eq('id', r.data.id).maybeSingle()
    await supabaseAdmin.from('tiendas').update({
      configuracion: { ...((fila?.configuracion as any) || {}), webhooks_registrados: fallos.length === 0, webhooks_fallidos: fallos }
    }).eq('id', r.data.id)
    if (fallos.length) {
      await registrarError({ origen: 'app', descripcion: 'No se han podido registrar todos los avisos de Shopify al instalar la app', stacktrace: JSON.stringify({ tienda: r.data.id, fallos }), tenant_id: estado.tenant_id })
    }
    return volver({ instalada: '1', ...(fallos.length ? { avisos: 'parcial' } : {}) })
  } catch (e: any) {
    await registrarError({ origen: 'app', descripcion: 'Fallo en la vuelta de la instalación de Shopify', stacktrace: JSON.stringify({ message: e?.message }) })
    return volver({ instalada: '0', motivo: e?.message || 'Fallo inesperado al instalar la app.' })
  }
}
