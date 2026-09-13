import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { registrarMensajeEntrante } from '@/lib/canales/entrada'
import { leerCredencialesMeta, firmaValida, perfilDeContacto, descargarAdjuntoDePagina, suscribirAppAPagina } from '@/lib/canales/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// La dirección a la que Meta avisa de lo que pasa en una página de Facebook
// (Messenger) o en una cuenta de Instagram conectada: mensajes que entran y
// entregas/lecturas de los que enviamos. Hay una por canal
// (/api/meta/<id del canal>) y el cliente la pega en su propia app de Meta
// (objetos "Page" e "Instagram" del webhook), con el "verify token" que le
// da Respondi.

type Ctx = { params: Promise<{ canal: string }> }

async function cargarCanal(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabaseAdmin
    .from('channels')
    .select('id, tenant_id, branch_id, tipo, metodo, estado, verify_token, identificador_externo, configuracion')
    .eq('id', id)
    .in('tipo', ['facebook', 'instagram'])
    .maybeSingle()
  return data
}

export async function GET(req: Request, { params }: Ctx) {
  const { canal: id } = await params
  const url = new URL(req.url)
  const modo = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token') || ''
  const reto = url.searchParams.get('hub.challenge') || ''

  const canal = await cargarCanal(id)
  const coincide = !!canal?.verify_token && token.length === canal.verify_token.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(canal.verify_token))
  if (modo !== 'subscribe' || !canal || !coincide) return new NextResponse('Forbidden', { status: 403 })

  if (canal.estado !== 'activo') {
    await supabaseAdmin.from('channels').update({ estado: 'activo', fecha_conexion: new Date().toISOString(), ultimo_error: null }).eq('id', canal.id)
  }
  const pageId = (canal.configuracion as any)?.page_id
  if (pageId) {
    after(async () => {
      try {
        const credenciales = await leerCredencialesMeta(canal.id)
        if (credenciales) await suscribirAppAPagina(pageId, credenciales.access_token)
      } catch (e: any) {
        await registrarError({ origen: 'api_meta', descripcion: 'No se ha podido suscribir la app a la página al verificar el webhook', stacktrace: JSON.stringify({ canal: canal.id, message: e?.message }), tenant_id: canal.tenant_id })
      }
    })
  }
  return new NextResponse(reto, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

// Texto que se guarda para cada mensaje de Messenger / Instagram
function textoDelMensaje(m: any): string {
  if (m.text) return String(m.text)
  const tipos = (m.attachments || []).map((a: any) => String(a.type || ''))
  if (m.reply_to?.story) return '[El cliente ha respondido a una historia]'
  if (tipos.includes('story_mention')) return '[El cliente te ha mencionado en una historia]'
  if (tipos.includes('share')) return '[El cliente ha compartido una publicación]'
  if (tipos.includes('like_heart')) return '❤️'
  if (tipos.includes('location')) return '[El cliente ha enviado su ubicación]'
  return ''
}

const ORDEN: Record<string, number> = { pendiente: 0, reintentar: 0, enviado: 1, entregado: 2, leido: 3 }

export async function POST(req: Request, { params }: Ctx) {
  const { canal: id } = await params
  const cuerpo = Buffer.from(await req.arrayBuffer())

  const canal = await cargarCanal(id)
  if (!canal || canal.metodo !== 'meta_oficial') return new NextResponse('Not found', { status: 404 })

  let credenciales
  try {
    credenciales = await leerCredencialesMeta(canal.id)
  } catch {
    return new NextResponse('Service unavailable', { status: 503 })
  }
  if (!credenciales || !firmaValida(cuerpo, req.headers.get('x-hub-signature-256'), credenciales.app_secret)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let datos: any
  try {
    datos = JSON.parse(cuerpo.toString('utf8'))
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }
  if (canal.estado === 'desconectado') return NextResponse.json({ ok: true })

  // Messenger avisa con object "page"; Instagram, con "instagram". Cada canal
  // solo atiende lo suyo (la misma app puede tener las dos cosas).
  const objeto = String(datos.object || '')
  if ((canal.tipo === 'facebook' && objeto !== 'page') || (canal.tipo === 'instagram' && objeto !== 'instagram')) return NextResponse.json({ ok: true, ignorado: objeto })
  const tipo = canal.tipo as 'facebook' | 'instagram'
  const propio = String(canal.identificador_externo || '')

  try {
    for (const entrada of datos.entry || []) {
      // La página (o la cuenta de Instagram) del aviso tiene que ser la del canal
      if (propio && entrada.id && String(entrada.id) !== propio) continue
      for (const ev of entrada.messaging || []) {
        const de = String(ev.sender?.id || '')
        // Lo que enviamos nosotros vuelve como eco: no es un mensaje del cliente
        if (ev.message?.is_echo || !de || de === propio) {
          continue
        }
        if (ev.message) {
          const m = ev.message
          const contenido = textoDelMensaje(m)
          // Un archivo (foto, vídeo, audio, documento): se descarga del enlace
          // temporal de Meta y se guarda en el almacén privado
          let archivo = null
          let sinDescargar = false
          const adjunto = (m.attachments || []).find((a: any) => ['image', 'video', 'audio', 'file'].includes(String(a.type)) && a.payload?.url)
          if (adjunto) {
            try {
              const d = await descargarAdjuntoDePagina(adjunto.payload.url)
              archivo = { datos: d.datos, tipo: d.tipo, nombre: String(adjunto.type) }
            } catch (e: any) {
              sinDescargar = true
              await registrarError({ origen: 'api_meta', descripcion: `No se ha podido descargar un archivo de ${tipo}`, stacktrace: JSON.stringify({ canal: canal.id, message: e?.message }), tenant_id: canal.tenant_id })
            }
          }
          if (!contenido && !archivo && !sinDescargar) continue
          const queEs = (t: string) => (t === 'image' ? 'una foto' : t === 'video' ? 'un vídeo' : t === 'audio' ? 'un audio' : 'un archivo')
          const nombre = await perfilDeContacto(de, credenciales.access_token, tipo)
          const r = await registrarMensajeEntrante({
            canal: { id: canal.id, tenant_id: canal.tenant_id, branch_id: canal.branch_id, tipo },
            contactoExterno: de,
            nombreContacto: nombre,
            mensajeExterno: String(m.mid || `${de}-${ev.timestamp}`),
            contenido: contenido || (archivo ? `[El cliente ha enviado ${queEs(archivo.nombre)}]` : sinDescargar ? `[El cliente ha enviado ${queEs(String(adjunto?.type))} que no se ha podido descargar]` : ''),
            archivo
          })
          if (!r.ok) throw new Error(r.error)
        } else if (ev.postback) {
          // Un botón pulsado cuenta como un mensaje con su texto
          const nombre = await perfilDeContacto(de, credenciales.access_token, tipo)
          const r = await registrarMensajeEntrante({
            canal: { id: canal.id, tenant_id: canal.tenant_id, branch_id: canal.branch_id, tipo },
            contactoExterno: de,
            nombreContacto: nombre,
            mensajeExterno: String(ev.postback.mid || `${de}-${ev.timestamp}-postback`),
            contenido: String(ev.postback.title || ev.postback.payload || '')
          })
          if (!r.ok) throw new Error(r.error)
        } else if (ev.delivery || ev.read) {
          // Entregas y lecturas de lo que enviamos, por el identificador del mensaje
          const nuevo = ev.read ? 'leido' : 'entregado'
          const mids: string[] = ev.delivery?.mids || []
          let consulta = supabaseAdmin.from('messages').select('id, estado_envio').eq('tenant_id', canal.tenant_id).in('remitente', ['ia', 'agente'])
          if (mids.length) consulta = consulta.in('identificador_externo', mids)
          else {
            // Una lectura llega con una marca de tiempo: todo lo enviado a ese contacto antes de ella
            const { data: conv } = await supabaseAdmin.from('conversations').select('id, contacts!inner(identificador_canal)').eq('branch_id', canal.branch_id).eq('canal', tipo).eq('contacts.identificador_canal', de).order('fecha_ultimo_mensaje', { ascending: false }).limit(1).maybeSingle()
            if (!conv) continue
            const hasta = ev.read?.watermark || ev.delivery?.watermark
            consulta = consulta.eq('conversation_id', conv.id)
            if (hasta) consulta = consulta.lte('timestamp', new Date(Number(hasta)).toISOString())
          }
          const { data: msgs } = await consulta
          for (const msg of msgs || []) {
            if ((ORDEN[nuevo] ?? 0) > (ORDEN[msg.estado_envio || 'pendiente'] ?? 0)) {
              await supabaseAdmin.from('messages').update({ estado_envio: nuevo }).eq('id', msg.id)
            }
          }
        }
      }
    }
  } catch (e: any) {
    await registrarError({
      origen: 'api_meta',
      descripcion: `Fallo al procesar un aviso de ${tipo} (Meta lo reintentará)`,
      stacktrace: JSON.stringify({ canal: canal.id, message: e?.message }),
      tenant_id: canal.tenant_id
    })
    return NextResponse.json({ error: 'Error procesando el aviso' }, { status: 500 })
  }

  await supabaseAdmin.from('channels').update({ ultima_actividad: new Date().toISOString() }).eq('id', canal.id)
  return NextResponse.json({ ok: true })
}
