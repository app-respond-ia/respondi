import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { after } from 'next/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { leerCredencialesTienda } from '@/lib/tiendas/shopify'
import { procesarEvento, type TiendaBasica } from '@/lib/tiendas/eventos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// La dirección a la que Shopify avisa de lo que pasa en la tienda (pedidos
// nuevos, envíos, cancelaciones). Hay una por tienda conectada
// (/api/tiendas/shopify/<id de la tienda>), y el cliente la pega en su propia
// app de Shopify.
//
// Shopify espera respuesta en 5 segundos y reintenta si tarda más: por eso se
// apunta el aviso y se contesta enseguida, y el trabajo se hace después.

type Ctx = { params: Promise<{ tienda: string }> }

// Shopify firma cada aviso con la clave secreta de la app. Sin comprobarlo,
// cualquiera podría inventarse pedidos falsos.
function firmaValida(cuerpo: Buffer, cabecera: string | null, secreto: string) {
  if (!cabecera) return false
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64')
  const recibida = Buffer.from(cabecera, 'utf8')
  const buena = Buffer.from(esperada, 'utf8')
  if (recibida.length !== buena.length) return false
  return crypto.timingSafeEqual(recibida, buena)
}

export async function POST(req: Request, { params }: Ctx) {
  const { tienda: id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })

  const cuerpo = Buffer.from(await req.arrayBuffer())
  const evento = req.headers.get('x-shopify-topic') || ''
  const dominioAviso = req.headers.get('x-shopify-shop-domain') || ''
  const idAviso = req.headers.get('x-shopify-webhook-id') || ''

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, tenant_id, branch_id, dominio, moneda, estado')
    .eq('id', id)
    .maybeSingle()

  if (!tienda || tienda.estado === 'desconectado') return new NextResponse('Not found', { status: 404 })
  // Un aviso que dice venir de otra tienda no se toca
  if (dominioAviso && dominioAviso.toLowerCase() !== tienda.dominio.toLowerCase()) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let credenciales
  try {
    credenciales = await leerCredencialesTienda(tienda.id)
  } catch {
    // Fallo pasajero de la base de datos: que Shopify lo reintente
    return new NextResponse('Service unavailable', { status: 503 })
  }
  if (!credenciales?.api_secret) {
    // Sin clave secreta no se puede comprobar quién manda el aviso, así que no
    // se acepta. La tienda sigue funcionando con los repasos programados.
    return new NextResponse('Forbidden', { status: 403 })
  }
  if (!firmaValida(cuerpo, req.headers.get('x-shopify-hmac-sha256'), credenciales.api_secret)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let datos: any = {}
  try {
    datos = JSON.parse(cuerpo.toString('utf8') || '{}')
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }

  // La referencia: el pedido al que se refiere. Con ella, si Shopify manda el
  // mismo aviso dos veces (lo hace cuando duda si llegó), solo se trata uno.
  // Los avisos de checkout y de envío llegan varias veces por el mismo objeto
  // (uno por cada cambio): ahí lo que no puede repetirse es la entrega.
  const porCambio = evento.startsWith('checkouts/') || evento.startsWith('fulfillments/')
  const referencia = porCambio
    ? String(idAviso || `${datos?.id}:${datos?.updated_at || Date.now()}`)
    : String(datos?.admin_graphql_api_id || datos?.id || idAviso || Date.now())

  const { data: apuntado, error } = await supabaseAdmin
    .from('tienda_eventos')
    .insert({
      tenant_id: tienda.tenant_id,
      branch_id: tienda.branch_id,
      tienda_id: tienda.id,
      tipo: evento,
      referencia,
      datos
    })
    .select('id')
    .single()

  if (error?.code === '23505') return NextResponse.json({ ok: true, repetido: true })
  if (error) {
    await registrarError({
      origen: 'app',
      descripcion: 'No se ha podido apuntar un aviso de Shopify',
      stacktrace: JSON.stringify({ tienda: tienda.id, evento, error: error.message }),
      tenant_id: tienda.tenant_id
    })
    return new NextResponse('Service unavailable', { status: 503 })
  }

  // Se contesta ya a Shopify y el trabajo se hace después. Si esto se cortara,
  // el evento queda sin procesar y el cron de cada minuto lo recoge.
  after(async () => {
    await procesarEvento(apuntado.id, evento, datos, tienda as TiendaBasica)
  })

  return NextResponse.json({ ok: true })
}
