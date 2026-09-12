import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { registrarMensajeEntrante } from '@/lib/canales/entrada'
import { leerCorreosNuevos, leerContrasenaCorreo, ErrorCorreo, type ConfigCorreo } from '@/lib/canales/correo'

async function guardarLectura(channelId: string, direccion: string, lectura: { uidvalidity: string; ultimo_uid: number }) {
  const { error } = await supabaseAdmin.rpc('guardar_lectura_correo', { p_channel_id: channelId, p_direccion: direccion, p_lectura: lectura })
  if (error) throw new Error(`No se pudo apuntar lo leído: ${error.message}`)
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cada minuto (cron `revisar-correos`): mira los buzones de correo conectados
// y mete en Respondi los correos nuevos de los clientes, como si fueran
// mensajes de WhatsApp. A partir de ahí, la IA los contesta igual (con su
// forma de escribir para correo). Las respuestas automáticas, los rebotes y
// los boletines se saltan.
export async function POST(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const secreto = process.env.CRON_INTERNAL_SECRET || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!secreto || token.length !== secreto.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secreto))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: canales, error: errCanales } = await supabaseAdmin
    .from('channels')
    .select('id, tenant_id, branch_id, tipo, estado, configuracion')
    .eq('tipo', 'email')
    .eq('metodo', 'imap_smtp')
    .eq('estado', 'activo')
  // Si la base de datos no responde, se dice (antes parecía "no hay buzones")
  // y se vuelve a intentar al minuto siguiente
  if (errCanales) return NextResponse.json({ error: `No se han podido leer los canales: ${errCanales.message || errCanales.code}` }, { status: 503 })

  const resumen: Record<string, string> = {}
  const empezar = Date.now()
  for (const canal of canales || []) {
    // Que una pasada lenta no se coma la siguiente: se revisa cada minuto, así
    // que se corta a los 25 s y los buzones que falten van en la siguiente
    if (Date.now() - empezar > 25000) break
    const config = canal.configuracion as ConfigCorreo
    try {
      const contrasena = await leerContrasenaCorreo(canal.id)
      if (!contrasena) throw new ErrorCorreo('El canal de correo no tiene la contraseña guardada. Vuelve a conectarlo en Canales.', 'credenciales')

      const { correos, lectura } = await leerCorreosNuevos(config, contrasena)
      let metidos = 0
      for (const c of correos) {
        if (!c.automatico && c.de.direccion) {
          const r = await registrarMensajeEntrante({
            canal: { id: canal.id, tenant_id: canal.tenant_id, branch_id: canal.branch_id, tipo: 'email' },
            contactoExterno: c.de.direccion,
            // Sin nombre en el correo, la dirección (mejor que "Desconocido")
            nombreContacto: c.de.nombre || c.de.direccion,
            mensajeExterno: c.messageId || `uid-${lectura.uidvalidity}-${c.uid}@${canal.id}`,
            contenido: c.texto || (c.adjuntos.length ? `(correo sin texto, con ${c.adjuntos.length === 1 ? 'un archivo adjunto' : c.adjuntos.length + ' archivos adjuntos'})` : '(correo sin texto)'),
            archivos: c.adjuntos.map(a => ({ datos: a.datos, tipo: a.tipo, nombre: a.nombre })),
            asunto: c.asunto || null,
            referencias: c.messageId ? [...c.referencias, c.messageId] : c.referencias
          })
          if (!r.ok) throw new Error(r.error)
          if (!r.duplicado) metidos++
        }
        // Hasta aquí leído: si algo falla después, este no se vuelve a meter
        await guardarLectura(canal.id, config.direccion, { uidvalidity: lectura.uidvalidity, ultimo_uid: c.uid })
      }
      // Solo lo leído: si el cliente ha cambiado su firma o sus servidores
      // mientras tanto, no se pisa
      await guardarLectura(canal.id, config.direccion, lectura)
      await supabaseAdmin.from('channels').update({
        ultima_actividad: new Date().toISOString(),
        ultimo_error: null
      }).eq('id', canal.id)
      resumen[canal.id] = `${metidos} correo(s) nuevo(s)`
    } catch (e: any) {
      const texto = e?.message || 'Error al leer el buzón'
      if (e instanceof ErrorCorreo && e.tipo === 'credenciales') {
        // Sin claves que valgan no tiene sentido seguir intentándolo cada minuto
        await supabaseAdmin.from('channels').update({ estado: 'error', ultimo_error: texto }).eq('id', canal.id)
      } else {
        await supabaseAdmin.from('channels').update({ ultimo_error: texto }).eq('id', canal.id)
        if (!(e instanceof ErrorCorreo)) {
          await registrarError({ origen: 'app', descripcion: 'Fallo al revisar un buzón de correo', stacktrace: JSON.stringify({ canal: canal.id, message: texto }), tenant_id: canal.tenant_id })
        }
      }
      resumen[canal.id] = `error: ${texto.slice(0, 80)}`
    }
  }
  return NextResponse.json({ ok: true, canales: resumen })
}
