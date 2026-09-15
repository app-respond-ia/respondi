import OpenAI from 'openai'
import type { ConfigCorreo, CorreoEntrante } from './correo'

// Qué correos del buzón NO son de clientes y no hay que contestar. Un buzón
// real recibe de todo: avisos de plataformas, publicidad, proveedores, correos
// internos (Jorge, 15-09-2026: «un cliente va a conectar un correo que tenga
// alguna suscripción al lado»). Dos capas:
//   1. Reglas sin coste: respuestas automáticas y listas (ya en correo.ts),
//      el buzón solo en copia, remitentes que el negocio ha dicho que no, y
//      correos del propio dominio del negocio (internos).
//   2. Si pasa las reglas, el modelo decide si es un cliente que escribe al
//      negocio o un aviso/publicidad. Solo entonces se abre conversación.
// Lo que se descarta queda apuntado (correos_descartados) para que el negocio
// lo vea y pueda «tratarlo como cliente» si nos equivocamos.

export type MotivoDescarte = 'automatico' | 'en_copia' | 'remitente_ignorado' | 'interno' | 'notificacion' | 'publicidad' | 'otro'

export const TEXTO_MOTIVO: Record<MotivoDescarte, string> = {
  automatico: 'Respuesta automática, rebote o boletín',
  en_copia: 'El buzón solo iba en copia',
  remitente_ignorado: 'Remitente marcado como «no contestar»',
  interno: 'Correo interno del propio negocio',
  notificacion: 'Aviso automático de una plataforma',
  publicidad: 'Publicidad o boletín',
  otro: 'No parece un cliente escribiendo al negocio'
}

// Dominios de correo de la gente (un negocio con Gmail no es "interno" solo
// porque le escriba otro Gmail)
const DOMINIOS_PUBLICOS = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'aol.com', 'msn.com', 'gmx.com', 'gmx.es', 'mail.com'])

const dominioDe = (direccion: string) => (direccion.split('@')[1] || '').toLowerCase()

// Normaliza lo que el negocio escribe en «no contestar»: correos o dominios
export function normalizarNoContestar(lista: string[] | null | undefined): string[] {
  return [...new Set((lista || []).map(x => String(x || '').trim().toLowerCase().replace(/^@/, '')).filter(x => x && /^[^\s@]+(@[^\s@]+)?$/.test(x)))].slice(0, 200)
}

export function remitenteIgnorado(direccion: string, lista: string[] | null | undefined) {
  const de = direccion.toLowerCase()
  const dominio = dominioDe(de)
  return normalizarNoContestar(lista).some(x => x.includes('@') ? x === de : (dominio === x || dominio.endsWith('.' + x)))
}

// Las reglas sin coste. Devuelve el motivo o null si hay que seguir mirando.
export function motivoDescarteRapido(c: Pick<CorreoEntrante, 'de' | 'para' | 'cc' | 'automatico'>, config: Pick<ConfigCorreo, 'direccion' | 'no_contestar'>): MotivoDescarte | null {
  if (c.automatico) return 'automatico'
  const propia = config.direccion.toLowerCase()
  if (remitenteIgnorado(c.de.direccion, config.no_contestar)) return 'remitente_ignorado'
  // Solo en copia: iba a otra persona y a nosotros nos lo pasan por enterarnos.
  // Si no aparece en ninguno (un alias tipo info@ que reenvía), se trata como
  // normal: puede ser un cliente.
  if (!c.para.includes(propia) && c.cc.includes(propia)) return 'en_copia'
  const dominio = dominioDe(c.de.direccion)
  if (dominio && dominio === dominioDe(propia) && !DOMINIOS_PUBLICOS.has(dominio)) return 'interno'
  return null
}

const MODELO = process.env.FILTRO_CORREO_MODELO_IA || 'gpt-4o-mini'
let cliente: OpenAI | null = null
const openai = () => (cliente ||= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))

// El modelo decide si es un cliente escribiendo al negocio. Si falla OpenAI,
// se trata como cliente: mejor contestar un aviso que dejar a alguien sin
// respuesta. No gasta créditos del cliente (no es una respuesta).
export async function clasificarCorreoEntrante(c: { de: { direccion: string; nombre: string | null }; asunto: string; texto: string; adjuntos?: number }, negocio: { nombre: string; direccion: string }): Promise<'cliente' | 'notificacion' | 'publicidad' | 'interno' | 'otro'> {
  try {
    const r = await openai().chat.completions.create({
      model: MODELO,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `Eres el filtro del buzón de atención al cliente de un negocio llamado "${negocio.nombre}" (${negocio.direccion}). Decide qué es cada correo que llega. Responde SOLO con JSON: {"tipo": "cliente" | "notificacion" | "publicidad" | "interno" | "otro"}.
- "cliente": una persona (o empresa que es cliente) escribe al negocio con una consulta, una petición, una queja, una reserva, un pedido, una pregunta por precios o similar. Aunque sea corto o informal. Aquí también van los proveedores o colaboradores que piden algo y esperan respuesta de una persona.
- "notificacion": aviso automático de una plataforma o servicio (banco, Google, Shopify, Stripe, Meta, redes sociales, facturas automáticas, confirmaciones, códigos de verificación, alertas de seguridad, informes).
- "publicidad": promociones, boletines, ofertas, marketing, invitaciones masivas, cursos, "oportunidades".
- "interno": correos entre el propio equipo del negocio o de su gestoría/proveedores de software hablando de gestión interna, sin ser un cliente.
- "otro": nada de lo anterior y tampoco parece alguien esperando respuesta (spam, texto vacío, cadenas).
Ante la duda entre cliente y otra cosa, elige "cliente".` },
        { role: 'user', content: `De: ${c.de.nombre ? `${c.de.nombre} <${c.de.direccion}>` : c.de.direccion}\nAsunto: ${c.asunto || '(sin asunto)'}\nAdjuntos: ${c.adjuntos || 0}\n\n${(c.texto || '').slice(0, 1500)}` }
      ]
    })
    const tipo = JSON.parse(r.choices[0]?.message?.content || '{}').tipo
    return ['cliente', 'notificacion', 'publicidad', 'interno', 'otro'].includes(tipo) ? tipo : 'cliente'
  } catch (e: any) {
    console.error('Filtro de correo: no se pudo clasificar, se trata como cliente:', e?.message)
    return 'cliente'
  }
}
