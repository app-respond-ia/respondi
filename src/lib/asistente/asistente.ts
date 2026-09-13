import OpenAI from 'openai'
import { HERRAMIENTAS, PorNombre, type Herramienta } from './herramientas'

// EL MOTOR DEL ASISTENTE DEL PANEL (14-09-2026).
//
// Le das lo que ha escrito el cliente y la conversación anterior, y devuelve
// lo que contesta más las propuestas de cambio que haya preparado.
//
// La regla que manda: MIRAR se hace al momento, CAMBIAR nunca. Una
// herramienta que escribe no se ejecuta aquí: se guarda como propuesta y el
// cliente decide. Por eso el asistente tiene prohibido decir "ya está hecho".

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-test-placeholder' })

// El asistente del panel no gasta los créditos de IA del cliente: pedir
// ayuda no puede salir caro justo cuando estás atascado (decidido con Jorge
// el 14-09-2026). Por eso lleva su propio modelo, no el del plan.
const MODELO = process.env.ASISTENTE_MODELO_IA || 'gpt-4o-mini'
const MAX_VUELTAS = 6

export interface PropuestaPreparada {
  herramienta: string
  argumentos: any
  resumen: string
  seccion: string | null
  destructiva: boolean
}

export interface Contexto {
  negocio: string | null
  sucursal: string | null
  zona: string | null
  moneda: string | null
  esAdmin: boolean
  permisos: { seccion: string; nivel: string }[]
}

// Qué herramientas puede usar esta persona. Si no tiene permiso de escritura
// en precios, ni se le ofrece cambiar precios: así el asistente no propone
// cosas que luego rebotan.
export function herramientasPara(ctx: Contexto): Herramienta[] {
  if (ctx.esAdmin) return HERRAMIENTAS
  const nivel = (seccion: string) => ctx.permisos.find(p => p.seccion === seccion)?.nivel || 'ninguno'
  return HERRAMIENTAS.filter(h => {
    if (!h.seccion) return true
    const n = nivel(h.seccion)
    return h.escribe ? n === 'escritura' : n === 'lectura' || n === 'escritura'
  })
}

function instrucciones(ctx: Contexto, disponibles: Herramienta[]) {
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const puedeCambiar = disponibles.some(h => h.escribe)
  return [
    'Eres el asistente de Respondi, la plataforma con la que este negocio atiende a sus clientes por WhatsApp, Instagram, Facebook y correo con ayuda de una IA.',
    `Hablas con alguien del equipo de ${ctx.negocio || 'el negocio'}${ctx.sucursal ? `, sucursal ${ctx.sucursal}` : ''}. Hoy es ${hoy}.`,
    '',
    'CÓMO HABLAS',
    '- En español, de tú, claro y corto. Nada de jerga técnica: quien te lee no es informático.',
    '- Frases cortas. Si te piden algo que se hace en el panel, dices en qué pantalla está.',
    '- No inventas. Si no sabes algo del negocio, lo miras con una herramienta antes de contestar.',
    '',
    'QUÉ PUEDES HACER',
    '- Resolver dudas de uso de Respondi.',
    '- Mirar la configuración de este negocio con las herramientas de ver_*. Úsalas siempre antes de responder sobre datos concretos y antes de proponer un cambio, para no trabajar a ciegas.',
    puedeCambiar
      ? '- Preparar cambios en la configuración. MUY IMPORTANTE: cuando llamas a una herramienta que cambia algo, NO se ejecuta. Se le enseña al cliente una tarjeta para que la confirme. Así que nunca digas "ya está hecho", "ya lo he creado" ni "listo". Di que lo has preparado y que lo confirme cuando quiera. Después de preparar una propuesta, contesta con UNA frase corta y para.'
      : '- Solo puedes mirar y explicar: esta persona no tiene permisos para cambiar la configuración. Si te piden un cambio, dilo y sugiere que lo pida a un administrador.',
    '',
    'LÍMITES',
    '- No tocas claves ni tokens de los canales, ni el plan, ni los cobros, ni borras la cuenta. Si te lo piden, explica dónde se hace a mano.',
    '- No lees ni escribes conversaciones con clientes finales: para eso está la pantalla de Chats.',
    '- Si algo puede tener consecuencias serias, avisa antes en la misma frase.',
    '- Si una herramienta falla, cuenta el motivo tal cual te lo ha dado, sin adornarlo.',
    '',
    'CAMBIOS GRANDES',
    '- Para cambiar horarios hay que mandar la semana entera. Mira primero el horario actual y manda los siete días, cambiando solo lo que te han pedido.',
    '- Si te piden varias cosas a la vez, prepáralas todas, cada una con su propia herramienta.'
  ].filter(Boolean).join('\n')
}

export async function responderAsistente(p: {
  mensaje: string
  historial: { papel: string; contenido: string }[]
  contexto: Contexto
}): Promise<{ texto: string; propuestas: PropuestaPreparada[]; error?: string }> {
  const disponibles = herramientasPara(p.contexto)
  const propuestas: PropuestaPreparada[] = []

  const mensajes: any[] = [
    { role: 'system', content: instrucciones(p.contexto, disponibles) },
    ...p.historial.slice(-20).map(m => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: m.contenido })),
    { role: 'user', content: p.mensaje }
  ]

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await openai.chat.completions.create({
        model: MODELO,
        messages: mensajes,
        tools: disponibles.map(h => h.definicion),
        temperature: 0.2
      })
      const msg: any = respuesta.choices[0]?.message
      if (!msg) break
      mensajes.push(msg)

      const llamadas: any[] = (msg.tool_calls || []).filter((t: any) => t.type === 'function')
      if (!llamadas.length) {
        return { texto: String(msg.content || '').trim() || 'No he sabido qué contestar. ¿Me lo cuentas de otra forma?', propuestas }
      }

      for (const llamada of llamadas) {
        const herramienta = PorNombre[llamada.function?.name]
        let contenido: string
        if (!herramienta || !disponibles.includes(herramienta)) {
          contenido = JSON.stringify({ ok: false, mensaje: 'Esa herramienta no está disponible para esta persona.' })
        } else {
          let args: any = {}
          try { args = JSON.parse(llamada.function.arguments || '{}') } catch { args = {} }

          if (herramienta.escribe) {
            // Nada se ejecuta aquí: se prepara y se espera el sí del cliente
            const resumen = herramienta.resumen ? await herramienta.resumen(args) : `Ejecutar ${herramienta.nombre}.`
            propuestas.push({
              herramienta: herramienta.nombre,
              argumentos: args,
              resumen,
              seccion: herramienta.seccion,
              destructiva: !!herramienta.destructiva
            })
            contenido = JSON.stringify({
              ok: true,
              preparada: true,
              mensaje: 'Propuesta preparada y enseñada al cliente. Todavía NO se ha hecho: está esperando que la confirme. No digas que está hecho.'
            })
          } else {
            const r = await herramienta.ejecutar(args)
            contenido = JSON.stringify(r).slice(0, 12000)
          }
        }
        mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: contenido })
      }
    }

    // Se acabaron las vueltas: se le pide que cierre con texto
    const cierre = await openai.chat.completions.create({ model: MODELO, messages: mensajes, temperature: 0.2 })
    return { texto: String(cierre.choices[0]?.message?.content || '').trim() || 'Lo he dejado preparado.', propuestas }
  } catch (e: any) {
    return {
      texto: 'Ahora mismo no puedo pensar: la IA no ha respondido. Inténtalo en un momento.',
      propuestas: [],
      error: e?.message || 'fallo al hablar con OpenAI'
    }
  }
}
