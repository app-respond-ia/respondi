import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { registrarMensajeEntrante } from '@/lib/canales/entrada'
import { leerCredencialesMeta, firmaValida, descargarArchivo } from '@/lib/canales/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// La dirección a la que Meta avisa de todo lo que pasa en un número de
// WhatsApp conectado: mensajes que entran y cómo van los que enviamos. Hay
// una por canal (/api/whatsapp/meta/<id del canal>), y cada cliente la pega
// en su propia app de Meta, junto con el "verify token" que le da Respondi.

type Ctx = { params: Promise<{ canal: string }> }

async function cargarCanal(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabaseAdmin
    .from('channels')
    .select('id, tenant_id, branch_id, tipo, metodo, estado, verify_token, meta_phone_number_id')
    .eq('id', id)
    .maybeSingle()
  return data
}

// 1. Verificación: al configurar el aviso en Meta, Meta comprueba que la
//    dirección es nuestra enviando el verify token. Si coincide, el canal
//    queda activo.
export async function GET(req: Request, { params }: Ctx) {
  const { canal: id } = await params
  const url = new URL(req.url)
  const modo = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token') || ''
  const reto = url.searchParams.get('hub.challenge') || ''

  const canal = await cargarCanal(id)
  const coincide = !!canal?.verify_token && token.length === canal.verify_token.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(canal.verify_token))

  if (modo !== 'subscribe' || !canal || !coincide) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  if (canal.estado !== 'activo') {
    await supabaseAdmin.from('channels').update({ estado: 'activo', fecha_conexion: new Date().toISOString(), ultimo_error: null }).eq('id', canal.id)
  }
  return new NextResponse(reto, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

// Texto que se guarda para cada tipo de mensaje de WhatsApp
function textoDelMensaje(m: any): string {
  switch (m.type) {
    case 'text': return m.text?.body || ''
    case 'image': return m.image?.caption || ''
    case 'video': return m.video?.caption || ''
    case 'document': return m.document?.caption || ''
    case 'audio':
    case 'sticker': return ''
    case 'location': {
      const l = m.location || {}
      return `[Ubicación${l.name ? `: ${l.name}` : ''}${l.address ? `, ${l.address}` : ''}] ${l.latitude},${l.longitude}`
    }
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
    case 'button': return m.button?.text || ''
    case 'contacts': return `[El cliente ha compartido ${m.contacts?.length || 1} contacto(s)]`
    default: return `[El cliente ha enviado un mensaje de tipo "${m.type}" que no se puede mostrar]`
  }
}

// El orden en que avanza un envío; los avisos pueden llegar desordenados y un
// "entregado" que llega tarde no debe tapar un "leído".
const ORDEN: Record<string, number> = { pendiente: 0, reintentar: 0, enviado: 1, entregado: 2, leido: 3 }
const ESTADO_META: Record<string, string> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' }

// 2. Avisos: mensajes que entran y estados de los que enviamos
export async function POST(req: Request, { params }: Ctx) {
  const { canal: id } = await params
  const cuerpo = Buffer.from(await req.arrayBuffer())

  const canal = await cargarCanal(id)
  if (!canal || canal.metodo !== 'meta_oficial') return new NextResponse('Not found', { status: 404 })

  const credenciales = await leerCredencialesMeta(canal.id)
  if (!credenciales || !firmaValida(cuerpo, req.headers.get('x-hub-signature-256'), credenciales.app_secret)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let datos: any
  try {
    datos = JSON.parse(cuerpo.toString('utf8'))
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }

  // Un canal desconectado no recibe nada (se contesta bien para que Meta no
  // insista)
  if (canal.estado === 'desconectado') return NextResponse.json({ ok: true })

  try {
    for (const entrada of datos.entry || []) {
      for (const cambio of entrada.changes || []) {
        if (cambio.field !== 'messages') continue
        const v = cambio.value || {}
        // Por si la misma app de Meta tiene varios números: solo los de este canal
        if (v.metadata?.phone_number_id && canal.meta_phone_number_id && v.metadata.phone_number_id !== canal.meta_phone_number_id) continue

        for (const m of v.messages || []) {
          if (m.type === 'reaction') continue
          const perfil = (v.contacts || []).find((c: any) => c.wa_id === m.from)
          const media = m.image || m.audio || m.video || m.document || m.sticker
          let archivo = null
          if (media?.id) {
            const d = await descargarArchivo(media.id, credenciales.access_token)
            archivo = { datos: d.datos, tipo: d.tipo, nombre: media.filename || `${m.type}` }
          }
          const r = await registrarMensajeEntrante({
            canal: { id: canal.id, tenant_id: canal.tenant_id, branch_id: canal.branch_id, tipo: canal.tipo },
            contactoExterno: `+${String(m.from).replace(/\D/g, '')}`,
            nombreContacto: perfil?.profile?.name || null,
            mensajeExterno: m.id,
            contenido: textoDelMensaje(m),
            archivo
          })
          if (!r.ok) throw new Error(r.error)
        }

        for (const s of v.statuses || []) {
          const nuevo = ESTADO_META[s.status]
          if (!nuevo || !s.id) continue
          const { data: msg } = await supabaseAdmin
            .from('messages')
            .select('id, estado_envio')
            .eq('identificador_externo', s.id)
            .eq('tenant_id', canal.tenant_id)
            .maybeSingle()
          if (!msg) continue
          const avanza = nuevo === 'fallido' || (ORDEN[nuevo] ?? 0) > (ORDEN[msg.estado_envio || 'pendiente'] ?? 0)
          if (!avanza) continue
          const error = s.errors?.[0]
          await supabaseAdmin.from('messages').update({
            estado_envio: nuevo,
            error_envio: nuevo === 'fallido' ? (error?.error_data?.details || error?.title || error?.message || 'Meta no ha podido entregar el mensaje') : null
          }).eq('id', msg.id)
        }
      }
    }
  } catch (e: any) {
    // Se contesta con error para que Meta lo vuelva a mandar más tarde (los
    // mensajes repetidos se ignoran, así que reintentar es seguro)
    await registrarError({
      origen: 'api_meta',
      descripcion: 'Fallo al procesar un aviso de WhatsApp (Meta lo reintentará)',
      stacktrace: JSON.stringify({ canal: canal.id, message: e?.message }),
      tenant_id: canal.tenant_id
    })
    return NextResponse.json({ error: 'Error procesando el aviso' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
