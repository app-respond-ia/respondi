import { supabaseAdmin } from '@/utils/supabase/admin'
import { cargarAgenda, esRestaurante, huecosDelDia, huecosEntreDias, recursosCandidatos, servicioMesa, servicioPorId, type Agenda } from './disponibilidad'
import { crearCita, moverCita, cancelarCita, citasDelContacto, normalizarTelefono } from './citas'
import { diaEnZona, instanteLocal, leerFecha, partesEnZona, sumarDias, textoFecha, textoFechaHora, textoHora } from './tiempo'
import type { Cita, Recurso, Servicio } from './tipos'

// LAS HERRAMIENTAS DE LA IA PARA LA AGENDA.
//
// Existen solo si la agenda de la sucursal está activada y hay algo que se
// pueda reservar. Reglas (decididas con Jorge el 12-09-2026):
//   · La IA confirma directamente lo que cabe en las reglas; el negocio puede
//     poner "confirmación a mano" y entonces la cita queda pendiente.
//   · Lo raro (grupo grande, fuera de plazo, tope de reservas) va a una
//     persona: se abre un caso con la conversación.
//   · Solo toca las citas del contacto que escribe.
//   · Nunca dice "reservado" sin que reservar_cita lo haya confirmado.

export interface ContextoAgenda {
  agenda: Agenda
  tenant_id: string
  branch_id: string
  contacto: { id: string | null; canal: string | null; identificador: string | null; nombre: string | null }
  conversation_id: string | null
  // Lo que ha dejado hecho la última herramienta, para el motor de la IA
  gestion?: { caso: boolean; pausa: boolean; avisado: boolean }
}

const NOMBRES = ['ver_huecos', 'reservar_cita', 'cambiar_cita', 'cancelar_cita', 'mis_citas', 'apuntar_espera_agenda']

export function esHerramientaDeAgenda(nombre: string) {
  return NOMBRES.includes(nombre)
}

export async function cargarHerramientasDeAgenda(branchId: string, contactId: string | null, conversationId: string | null): Promise<{ contexto: ContextoAgenda | null; definiciones: any[]; instrucciones: string }> {
  const agenda = await cargarAgenda(branchId)
  if (!agenda || !agenda.ajustes.activa) return { contexto: null, definiciones: [], instrucciones: '' }
  const servicios = agenda.servicios.filter(s => s.reservable && s.disponible && s.visible_ia)
  const restaurante = esRestaurante(agenda)
  const mesas = agenda.recursos.filter(r => r.activo && r.tipo === 'mesa')
  if (!servicios.length && !(restaurante && mesas.length)) return { contexto: null, definiciones: [], instrucciones: '' }

  let contacto: ContextoAgenda['contacto'] = { id: contactId, canal: null, identificador: null, nombre: null }
  if (contactId) {
    const { data: c } = await supabaseAdmin.from('contacts').select('canal, identificador_canal, nombre').eq('id', contactId).maybeSingle()
    if (c) contacto = { id: contactId, canal: c.canal, identificador: c.identificador_canal, nombre: c.nombre }
  }

  const ahora = new Date()
  const hoy = diaEnZona(ahora, agenda.zona)
  const profesionales = agenda.recursos.filter(r => r.activo && r.elegible && r.tipo === 'persona').map(r => r.nombre)
  const dinero = (n: number | null, moneda?: string | null) => n === null ? 'precio a consultar' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || agenda.negocio.moneda}`
  const listaServicios = servicios.slice(0, 40).map(s => `- ${s.nombre}: ${s.duracion_minutos || 30} min, ${dinero(s.precio, s.moneda)}${s.precio_por_persona ? ' por persona' : ''}${s.aforo ? ` (clase, ${s.aforo} plazas por hueco)` : ''}${s.extras.length ? `; extras: ${s.extras.map(e => e.nombre).join(', ')}` : ''}`).join('\n')
  const a = agenda.ajustes
  const antelacion = a.antelacion_minima_minutos >= 60 ? `${Math.round(a.antelacion_minima_minutos / 60)} h` : `${a.antelacion_minima_minutos} min`

  const zonas = [...new Set(mesas.map(m => (m.zona || '').trim()).filter(Boolean))]
  const turnos = agenda.ajustes.turnos.map(t => `${t.nombre} de ${t.inicio} a ${t.fin}${t.ultima_entrada ? ` (última entrada ${t.ultima_entrada})` : ''}`).join('; ')
  const notas = [
    `AGENDA DE RESERVAS. Hoy es ${textoFechaHora(ahora, agenda.zona, { conAnio: true })} (${hoy}); mañana es ${sumarDias(hoy, 1)}. Las fechas se pasan siempre como AAAA-MM-DD y las horas como HH:MM.`,
    restaurante
      ? `RESTAURANTE: lo que se reserva es una MESA (pasa servicio "mesa"). ${turnos ? `Turnos: ${turnos}.` : 'Sin turnos definidos: vale cualquier hora de apertura.'} ${zonas.length ? `Zonas: ${zonas.join(', ')} (si el cliente pide una, pásala en zona).` : ''} Pregunta SIEMPRE cuántas personas antes de buscar mesa. Las peticiones (alergias, trona, cumpleaños, silla de ruedas) van en "peticiones". Nunca prometas una mesa concreta ni la terraza si la herramienta no la ha dado.`
      : '',
    servicios.length ? `${restaurante ? 'Además se reservan estos servicios' : 'Servicios que se reservan'}:\n${listaServicios}` : '',
    profesionales.length ? `Profesionales que se pueden elegir: ${profesionales.join(', ')}. Si el cliente no dice con quién, no preguntes: se asigna solo.` : '',
    `Reglas: reservar con al menos ${antelacion} de antelación y como mucho ${a.antelacion_maxima_dias} días antes; cambiar o cancelar hasta ${a.cancelacion_horas} h antes; a partir de ${a.grupo_grande_desde} personas la reserva la gestiona una persona del equipo.`,
    a.confirmacion === 'manual' ? 'Las reservas quedan PENDIENTES hasta que alguien del equipo las confirme: dilo así, no digas que está confirmada.' : 'Las reservas quedan confirmadas al momento.',
    a.instrucciones_ia ? `Indicaciones del negocio: ${a.instrucciones_ia}` : '',
    'CÓMO RESERVAR: 1) averigua qué servicio, qué día y a qué hora prefiere (y cuántas personas si es una mesa o una clase); 2) llama a ver_huecos; 3) ofrece 2 o 4 de las opciones que te dé, tal cual; 4) cuando el cliente elija una, llama a reservar_cita; 5) confirma con día, hora, servicio y profesional. NUNCA digas que está reservado, cambiado o cancelado si la herramienta no lo ha confirmado. Si ver_huecos no da opciones ese día, ofrece los días que te diga o apúntale en lista de espera con apuntar_espera_agenda.',
    'CAMBIAR O CANCELAR: si el cliente lo pide claramente, llama a cancelar_cita (o a cambiar_cita, a una hora que ver_huecos dé libre) en la misma respuesta, sin pedirle otra confirmación, sin consultar políticas y sin decir que lo mirarás luego: la herramienta ya aplica el plazo de cancelación y, si no está en plazo, avisa al equipo por ti. Solo pregunta si de verdad no sabes qué cita o qué hora quiere. Nunca contestes "un momento, lo gestiono": o llamas a la herramienta en esta misma respuesta, o preguntas lo que falta.'
  ].filter(Boolean)

  const definiciones: any[] = [
    {
      type: 'function',
      function: {
        name: 'ver_huecos',
        description: 'Busca huecos libres para un servicio en un día (y en los siguientes si ese día no hay). Úsala SIEMPRE antes de proponer una hora: no te inventes disponibilidad.',
        parameters: {
          type: 'object',
          properties: {
            servicio: { type: 'string', description: 'El servicio, con las palabras del cliente o el nombre de la lista. En un restaurante, "mesa".' },
            fecha: { type: 'string', description: 'Día que quiere, AAAA-MM-DD.' },
            hora_preferida: { type: 'string', description: 'Hora aproximada que prefiere, HH:MM, si la ha dicho.' },
            franja: { type: 'string', enum: ['manana', 'tarde', 'cualquiera'], description: 'Parte del día que prefiere.' },
            personas: { type: 'number', description: 'Cuántas personas (mesas, clases). En un restaurante es obligatorio.' },
            profesional: { type: 'string', description: 'Con quién quiere, si lo ha dicho.' },
            zona: { type: 'string', description: 'Restaurante: zona que pide (terraza, interior...), si la dice.' }
          },
          required: ['servicio', 'fecha']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'reservar_cita',
        description: 'Reserva de verdad un hueco que ver_huecos haya dado y el cliente haya elegido. Devuelve la confirmación con los datos exactos.',
        parameters: {
          type: 'object',
          properties: {
            servicio: { type: 'string', description: 'El servicio; en un restaurante, "mesa".' },
            fecha: { type: 'string', description: 'AAAA-MM-DD' },
            hora: { type: 'string', description: 'HH:MM, una de las que dio ver_huecos.' },
            personas: { type: 'number' },
            profesional: { type: 'string', description: 'Si el cliente eligió con quién.' },
            zona: { type: 'string', description: 'Restaurante: zona que pidió, si ver_huecos la dio.' },
            nombre: { type: 'string', description: 'Nombre del cliente si lo ha dicho y no lo teníamos.' },
            extras: { type: 'array', items: { type: 'string' }, description: 'Extras que ha pedido, con el nombre de la lista.' },
            peticiones: { type: 'string', description: 'Peticiones especiales (alergias, trona, aparcamiento...).' }
          },
          required: ['servicio', 'fecha', 'hora']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'cambiar_cita',
        description: 'Mueve una cita del cliente a otro día u hora (que ver_huecos haya dado), o cambia cuántas personas son. Si tiene varias, pasa cita_id de la que toque (las da mis_citas).',
        parameters: {
          type: 'object',
          properties: {
            cita_id: { type: 'string' },
            fecha: { type: 'string', description: 'AAAA-MM-DD (si no cambia, la misma).' },
            hora: { type: 'string', description: 'HH:MM (si no cambia, la misma).' },
            personas: { type: 'number', description: 'Solo si cambia el número de personas.' },
            profesional: { type: 'string' }
          },
          required: ['hora']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'cancelar_cita',
        description: 'Cancela una cita del cliente. Pide confirmación al cliente antes de llamarla. Si tiene varias, pasa cita_id.',
        parameters: {
          type: 'object',
          properties: {
            cita_id: { type: 'string' },
            motivo: { type: 'string' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'mis_citas',
        description: 'Las próximas citas del cliente que escribe. Úsala cuando pregunte cuándo tiene cita, o antes de cambiar o cancelar si no sabes cuál es.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'apuntar_espera_agenda',
        description: 'Apunta al cliente en la lista de espera de un día que está lleno: si se libera un hueco, se le avisa.',
        parameters: {
          type: 'object',
          properties: {
            servicio: { type: 'string' },
            fecha: { type: 'string', description: 'AAAA-MM-DD' },
            franja: { type: 'string', enum: ['manana', 'tarde', 'cualquiera'] },
            personas: { type: 'number' }
          },
          required: ['fecha']
        }
      }
    }
  ]

  return {
    contexto: { agenda, tenant_id: agenda.ajustes.tenant_id, branch_id: branchId, contacto, conversation_id: conversationId },
    definiciones,
    instrucciones: notas.join(' ')
  }
}

// ---------------------------------------------------------------------------
// Ejecutar
// ---------------------------------------------------------------------------
export async function ejecutarHerramientaDeAgenda(nombre: string, args: any, ctx: ContextoAgenda): Promise<string> {
  try {
    if (nombre === 'ver_huecos') return await verHuecos(args, ctx)
    if (nombre === 'reservar_cita') return await reservar(args, ctx)
    if (nombre === 'cambiar_cita') return await cambiar(args, ctx)
    if (nombre === 'cancelar_cita') return await cancelar(args, ctx)
    if (nombre === 'mis_citas') return await misCitas(ctx)
    if (nombre === 'apuntar_espera_agenda') return await apuntarEspera(args, ctx)
  } catch (e: any) {
    return `No se ha podido consultar la agenda ahora mismo (${String(e?.message || e).slice(0, 120)}). Dile al cliente que lo compruebas en un momento; no inventes horas.`
  }
  return 'Herramienta desconocida.'
}

// --- Buscar servicio y profesional por lo que dice el cliente --------------
const HABLA_DE_MESA = /\bmesa|reserv|comer|cenar|almorz|comida|cena|desayun|brunch|men[uú]/i

async function buscarServicio(ctx: ContextoAgenda, texto: string, personas = 1): Promise<Servicio | null> {
  const { normalizar, contienePalabras } = await import('@/lib/ai/comparar-texto')
  const servicios = ctx.agenda.servicios.filter(s => s.reservable && s.disponible)
  const restaurante = esRestaurante(ctx.agenda)
  const buscado = normalizar(String(texto || ''))
  // En un restaurante, salvo que nombre un servicio de la lista, es una mesa
  if (restaurante && (!buscado || buscado === 'mesa' || HABLA_DE_MESA.test(texto || '')) && !servicios.some(s => buscado && normalizar(s.nombre) === buscado)) return servicioMesa(ctx.agenda, personas)
  if (!buscado) return servicios.length === 1 ? servicios[0] : (restaurante ? servicioMesa(ctx.agenda, personas) : null)
  const exacto = servicios.find(s => normalizar(s.nombre) === buscado)
  if (exacto) return exacto
  const contiene = servicios.filter(s => contienePalabras(s.nombre, buscado) || contienePalabras(buscado, s.nombre))
  if (contiene.length === 1) return contiene[0]
  if (contiene.length > 1) return contiene.sort((a, b) => a.nombre.length - b.nombre.length)[0]
  // Por palabras sueltas
  const palabras = buscado.split(/\s+/).filter(p => p.length > 2)
  const puntuados = servicios.map(s => ({ s, n: palabras.filter(p => normalizar(s.nombre).includes(p) || normalizar(s.descripcion || '').includes(p)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  if (puntuados.length && (puntuados.length === 1 || puntuados[0].n > puntuados[1].n)) return puntuados[0].s
  if (restaurante) return servicioMesa(ctx.agenda, personas)
  return servicios.length === 1 ? servicios[0] : null
}

async function buscarRecurso(ctx: ContextoAgenda, texto: string | undefined, servicio: Servicio): Promise<Recurso | null | 'no_existe'> {
  if (!texto) return null
  const { normalizar, contienePalabras } = await import('@/lib/ai/comparar-texto')
  const buscado = normalizar(texto)
  const candidatos = recursosCandidatos(ctx.agenda, servicio).filter(r => r.elegible)
  const r = candidatos.find(x => normalizar(x.nombre) === buscado) || candidatos.find(x => contienePalabras(x.nombre, buscado) || contienePalabras(buscado, x.nombre))
  return r || 'no_existe'
}

function nombresDe(ctx: ContextoAgenda, ids: string[]) {
  return ids.map(id => ctx.agenda.recursos.find(r => r.id === id)?.nombre).filter(Boolean).join(' y ')
}

function noHayServicio(ctx: ContextoAgenda) {
  const lista = ctx.agenda.servicios.filter(s => s.reservable && s.disponible).map(s => s.nombre).slice(0, 15).join(', ')
  if (esRestaurante(ctx.agenda)) return `No sé si quiere una mesa o uno de estos servicios: ${lista || 'ninguno'}. Si es una mesa, pasa servicio "mesa" y las personas.`
  return `No sé a qué servicio se refiere. Pregúntale cuál quiere de estos: ${lista}.`
}

function horaEnMinutos(hora?: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora || '').trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

// Elegir hasta 6 opciones repartidas (mañana y tarde), cerca de la hora preferida
function elegirOpciones(huecos: { inicio: string; recursos: string[]; plazas?: number }[], zona: string, preferida: number | null, franja?: string) {
  let lista = huecos.map(h => ({ ...h, minutos: (() => { const p = partesEnZona(new Date(h.inicio), zona); return p.hora * 60 + p.minuto })() }))
  if (franja === 'manana') lista = lista.filter(h => h.minutos < 14 * 60).length ? lista.filter(h => h.minutos < 14 * 60) : lista
  if (franja === 'tarde') lista = lista.filter(h => h.minutos >= 14 * 60).length ? lista.filter(h => h.minutos >= 14 * 60) : lista
  if (preferida !== null) {
    lista.sort((a, b) => Math.abs(a.minutos - preferida) - Math.abs(b.minutos - preferida))
    return lista.slice(0, 5).sort((a, b) => a.minutos - b.minutos)
  }
  if (lista.length <= 6) return lista
  // Repartidas a lo largo del día
  const paso = lista.length / 6
  const salida: typeof lista = []
  for (let i = 0; i < 6; i++) salida.push(lista[Math.min(lista.length - 1, Math.floor(i * paso))])
  return salida
}

async function verHuecos(args: any, ctx: ContextoAgenda) {
  const personasDichas = Number(args?.personas) || 0
  const servicio = await buscarServicio(ctx, args?.servicio, personasDichas || 1)
  if (!servicio) return noHayServicio(ctx)
  const fecha = leerFecha(args?.fecha) ? String(args.fecha) : null
  if (!fecha) return 'La fecha tiene que ir como AAAA-MM-DD. Pregunta al cliente qué día quiere.'
  if (servicio.id === 'mesa' && !personasDichas) return 'Antes de buscar mesa pregunta cuántas personas son.'
  const personas = Math.max(1, Math.round(personasDichas || 1))
  if (personas >= ctx.agenda.ajustes.grupo_grande_desde) {
    // Grupo grande: no se busca hueco, se abre el caso ya con lo que se sabe
    const cuando = `${fecha}${args?.hora_preferida ? ` hacia las ${args.hora_preferida}` : args?.franja && args.franja !== 'cualquiera' ? ` por la ${args.franja === 'manana' ? 'mañana' : 'tarde'}` : ''}`
    const abierto = await abrirCasoAgenda(ctx, `Reserva de grupo para gestionar a mano: ${servicio.nombre}, ${cuando}, ${personas} personas${ctx.contacto.nombre ? `, a nombre de ${ctx.contacto.nombre}` : ''}.`)
    return abierto
      ? `Son ${personas} personas: a partir de ${ctx.agenda.ajustes.grupo_grande_desde} lo gestiona una persona del equipo. YA SE HA ABIERTO UN CASO con el servicio, el día y las personas: dile al cliente que una persona del equipo le confirmará la reserva (sin prometer hora) y pregúntale solo lo que ayude al equipo (nombre si no lo tienes, peticiones especiales).`
      : `Son ${personas} personas: a partir de ${ctx.agenda.ajustes.grupo_grande_desde} lo gestiona una persona del equipo. Dile que le confirmarán por aquí y, si puede, que deje su nombre.`
  }
  const recurso = await buscarRecurso(ctx, args?.profesional, servicio)
  if (recurso === 'no_existe') return `No hay nadie que se llame "${args.profesional}" para ${servicio.nombre}. Los que hay: ${recursosCandidatos(ctx.agenda, servicio).filter(r => r.elegible).map(r => r.nombre).join(', ') || 'ninguno con nombre'}.`

  const zona = ctx.agenda.zona
  const preferida = horaEnMinutos(args?.hora_preferida)
  const zonaPedida = args?.zona ? String(args.zona) : null
  const { huecos, motivo } = await huecosDelDia({ agenda: ctx.agenda, servicio, fecha, personas, recursoId: recurso?.id || null, zona: zonaPedida })
  if (huecos.length) {
    const opciones = elegirOpciones(huecos, zona, preferida, args?.franja)
    const zonaDe = (h: { recursos: string[] }) => { const z = [...new Set(h.recursos.map(id => ctx.agenda.recursos.find(r => r.id === id)?.zona).filter(Boolean))]; return z.length ? ` (${z.join(' + ')})` : '' }
    const lineas = opciones.map(h => `- ${textoHora(h.inicio, zona)}${(h as any).turno ? ` [${(h as any).turno}]` : ''}${servicio.id === 'mesa' ? zonaDe(h) : ''}${h.recursos.length && ctx.agenda.recursos.find(r => r.id === h.recursos[0])?.tipo === 'persona' ? ` con ${nombresDe(ctx, h.recursos)}` : ''}${h.plazas !== undefined ? ` (${h.plazas} plazas libres)` : ''}`)
    return `Huecos para ${servicio.nombre} el ${textoFecha(instanteLocal(zona, ...fechaPartes(fecha), 12, 0), zona)} (${fecha})${personas > 1 && servicio.id !== 'mesa' ? ` para ${personas} personas` : ''}${zonaPedida ? ` en ${zonaPedida}` : ''}:\n${lineas.join('\n')}\n${huecos.length > opciones.length ? `Hay ${huecos.length} huecos en total ese día; si el cliente quiere otra hora, vuelve a llamar con hora_preferida.` : ''} Ofrécele estas horas y, cuando elija, llama a reservar_cita con fecha ${fecha}${servicio.id === 'mesa' ? `, servicio "mesa", ${personas} personas${zonaPedida ? `, zona "${zonaPedida}"` : ''}` : ''} y la hora exacta.`
  }
  // Ese día no: los siguientes 7
  const siguiente = await huecosEntreDias({ agenda: ctx.agenda, servicio, desde: sumarDias(fecha, 1), dias: 7, personas, recursoId: recurso?.id || null, maximoPorDia: 3, zona: zonaPedida })
  if (!siguiente.porDia.length) return `El ${fecha} no hay hueco para ${servicio.nombre}${motivo ? ` (${motivo.toLowerCase()})` : ''} y tampoco en la semana siguiente. Ofrece apuntarle en la lista de espera (apuntar_espera_agenda) o pregunta por otra fecha más adelante.`
  const lineas = siguiente.porDia.slice(0, 3).map(d => `- ${textoFecha(instanteLocal(zona, ...fechaPartes(d.fecha), 12, 0), zona)} (${d.fecha}): ${d.huecos.map(h => textoHora(h.inicio, zona)).join(', ')}`)
  return `El ${fecha} no hay hueco para ${servicio.nombre}${motivo ? ` (${motivo.toLowerCase()})` : ''}. Lo más cercano:\n${lineas.join('\n')}\nOfrece estas opciones o la lista de espera para el día que quería (apuntar_espera_agenda).`
}

function fechaPartes(fecha: string): [number, number, number] {
  const p = leerFecha(fecha)!
  return [p.anio, p.mes, p.dia]
}

async function reservar(args: any, ctx: ContextoAgenda) {
  if (!ctx.contacto.id) return 'No se puede reservar: el cliente no está identificado en esta conversación. Pide que escriba desde su WhatsApp o correo.'
  const personas = Math.max(1, Math.round(Number(args?.personas) || 1))
  const servicio = await buscarServicio(ctx, args?.servicio, personas)
  if (!servicio) return noHayServicio(ctx)
  const fecha = leerFecha(args?.fecha) ? String(args.fecha) : null
  const minutos = horaEnMinutos(args?.hora)
  if (!fecha || minutos === null) return 'Faltan la fecha (AAAA-MM-DD) o la hora (HH:MM). Pídeselas al cliente.'
  if (servicio.id === 'mesa' && !Number(args?.personas)) return 'Falta cuántas personas son. Pregúntalo antes de reservar la mesa.'
  const recurso = await buscarRecurso(ctx, args?.profesional, servicio)
  if (recurso === 'no_existe') return `No hay nadie que se llame "${args.profesional}". Pregunta con quién quiere de: ${recursosCandidatos(ctx.agenda, servicio).filter(r => r.elegible).map(r => r.nombre).join(', ')}.`
  const zona = ctx.agenda.zona
  const [anio, mes, dia] = fechaPartes(fecha)
  const inicio = instanteLocal(zona, anio, mes, dia, Math.floor(minutos / 60), minutos % 60)
  const nombre = (args?.nombre && String(args.nombre).trim()) || ctx.contacto.nombre || null
  if (nombre && !ctx.contacto.nombre) await supabaseAdmin.from('contacts').update({ nombre }).eq('id', ctx.contacto.id)

  const r = await crearCita({
    tenant_id: ctx.tenant_id,
    branch_id: ctx.branch_id,
    servicio_id: servicio.id,
    inicio: inicio.toISOString(),
    personas,
    recurso_id: recurso?.id || null,
    zona: args?.zona ? String(args.zona) : null,
    extras: Array.isArray(args?.extras) ? args.extras.map(String) : [],
    contact_id: ctx.contacto.id,
    conversation_id: ctx.conversation_id,
    canal_conversacion: ctx.contacto.canal,
    nombre_cliente: nombre,
    telefono: ctx.contacto.canal === 'whatsapp' ? normalizarTelefono(ctx.contacto.identificador) : null,
    email: ctx.contacto.canal === 'email' ? ctx.contacto.identificador : null,
    peticiones: args?.peticiones ? String(args.peticiones).slice(0, 300) : null,
    origen: 'ia'
  })
  if (!r.ok) {
    if (r.codigo === 'grupo_grande' || r.codigo === 'limite') {
      await abrirCasoAgenda(ctx, `Reserva para gestionar a mano: ${servicio.nombre}, ${textoFechaHora(inicio, zona)}, ${personas} ${personas === 1 ? 'persona' : 'personas'}${nombre ? `, a nombre de ${nombre}` : ''}. Motivo: ${r.error}`)
      return `${r.error} Ya se ha abierto un caso para el equipo con los datos: dile al cliente que una persona le confirmará la reserva, sin prometer hora.`
    }
    if (r.codigo === 'sin_hueco' || r.codigo === 'ocupado' || r.codigo === 'aforo') return `${r.error} Vuelve a llamar a ver_huecos para ese día y ofrece otra hora; no confirmes nada.`
    return `${r.error} No confirmes la reserva.`
  }
  const c = r.cita
  const quien = (c.recursos || []).filter(x => x.tipo === 'persona').map(x => x.nombre).join(' y ')
  const zonaMesa = [...new Set((c.recursos || []).filter(x => x.tipo === 'mesa').map(x => ctx.agenda.recursos.find(rr => rr.id === x.id)?.zona).filter(Boolean))].join(' + ')
  return `RESERVA GUARDADA (${c.estado === 'pendiente' ? 'PENDIENTE de que el equipo la confirme' : 'confirmada'}): ${c.servicio_nombre}, ${textoFechaHora(c.inicio, zona)}${quien ? ` con ${quien}` : ''}${zonaMesa ? ` en ${zonaMesa}` : ''}${c.personas > 1 && servicio.id !== 'mesa' ? `, ${c.personas} personas` : ''}${c.precio_estimado !== null ? `, ${c.precio_estimado} ${c.moneda || ''}` : ''}. Confírmaselo al cliente con estos datos exactos${c.estado === 'pendiente' ? ' y dile que le avisarán cuando esté confirmada' : ''}. Cancelar o cambiar: hasta ${servicio.cancelacion_horas ?? ctx.agenda.ajustes.cancelacion_horas} h antes.`
}

async function citaDelCliente(ctx: ContextoAgenda, citaId?: string): Promise<Cita | string> {
  if (!ctx.contacto.id) return 'El cliente no está identificado: no se puede localizar su cita.'
  const citas = await citasDelContacto(ctx.branch_id, ctx.contacto.id, { soloFuturas: true })
  if (!citas.length) return 'Este cliente no tiene ninguna cita próxima.'
  if (citaId) {
    const c = citas.find(x => x.id === citaId)
    return c || 'Esa cita no es de este cliente o ya no está activa. Usa mis_citas para ver las suyas.'
  }
  if (citas.length === 1) return citas[0]
  return `Tiene varias citas: pregunta cuál y vuelve a llamar con cita_id.\n${citas.map(c => `- ${c.id}: ${c.servicio_nombre}, ${textoFechaHora(c.inicio, ctx.agenda.zona)}`).join('\n')}`
}

async function cambiar(args: any, ctx: ContextoAgenda) {
  const cita = await citaDelCliente(ctx, args?.cita_id)
  if (typeof cita === 'string') return cita
  // Sin fecha, se entiende el mismo día de la cita
  const fecha = leerFecha(args?.fecha) ? String(args.fecha) : diaEnZona(new Date(cita.inicio), ctx.agenda.zona)
  const minutos = horaEnMinutos(args?.hora)
  if (minutos === null) return 'Falta la hora nueva (HH:MM). Pregúntasela al cliente o usa ver_huecos.'
  const servicio = servicioPorId(ctx.agenda, cita.servicio_id, cita.personas)
  let recursoId: string | null | undefined = undefined
  if (args?.profesional && servicio) {
    const r = await buscarRecurso(ctx, args.profesional, servicio)
    if (r === 'no_existe') return `No hay nadie que se llame "${args.profesional}".`
    recursoId = r?.id || undefined
  }
  const zona = ctx.agenda.zona
  const [anio, mes, dia] = fechaPartes(fecha)
  const inicio = instanteLocal(zona, anio, mes, dia, Math.floor(minutos / 60), minutos % 60)
  const r = await moverCita(cita.id, { inicio: inicio.toISOString(), recurso_id: recursoId, por: 'cliente', origen: 'ia', personas: Number(args?.personas) || null })
  if (!r.ok) {
    if (r.codigo === 'plazo_cancelacion') {
      await abrirCasoAgenda(ctx, `Cambio de cita fuera de plazo: ${cita.servicio_nombre} del ${textoFechaHora(cita.inicio, zona)} → pide ${textoFechaHora(inicio, zona)}.`)
      return `${r.error} Ya hay un caso abierto para el equipo: dile que una persona lo mirará, sin prometer el cambio.`
    }
    if (r.codigo === 'sin_hueco' || r.codigo === 'ocupado' || r.codigo === 'aforo') return `${r.error} Llama a ver_huecos y ofrece otra hora; la cita original sigue como estaba.`
    return `${r.error} La cita original sigue como estaba.`
  }
  return `CITA CAMBIADA: ${r.cita.servicio_nombre}${r.cita.personas !== cita.personas ? ` (${r.cita.personas} personas)` : ''} ahora es el ${textoFechaHora(r.cita.inicio, zona)}${(r.cita.recursos || []).filter(x => x.tipo === 'persona').length ? ` con ${(r.cita.recursos || []).filter(x => x.tipo === 'persona').map(x => x.nombre).join(' y ')}` : ''}. Confírmaselo así al cliente.`
}

async function cancelar(args: any, ctx: ContextoAgenda) {
  const cita = await citaDelCliente(ctx, args?.cita_id)
  if (typeof cita === 'string') return cita
  const zona = ctx.agenda.zona
  const r = await cancelarCita(cita.id, { por: 'cliente', motivo: args?.motivo ? String(args.motivo).slice(0, 200) : null, origen: 'ia' })
  if (!r.ok) {
    if (r.codigo === 'plazo_cancelacion') {
      await abrirCasoAgenda(ctx, `Cancelación fuera de plazo: ${cita.servicio_nombre} del ${textoFechaHora(cita.inicio, zona)}.${args?.motivo ? ` Motivo: ${args.motivo}` : ''}`)
      return `${r.error} Ya hay un caso abierto para el equipo: dile que una persona lo gestionará, sin confirmar la cancelación.`
    }
    return `${r.error}`
  }
  return `CITA CANCELADA: ${cita.servicio_nombre} del ${textoFechaHora(cita.inicio, zona)}. Confírmaselo al cliente y ofrécele reservar otro día si quiere.`
}

async function misCitas(ctx: ContextoAgenda) {
  if (!ctx.contacto.id) return 'El cliente no está identificado.'
  const citas = await citasDelContacto(ctx.branch_id, ctx.contacto.id, { soloFuturas: true })
  if (!citas.length) return 'No tiene ninguna cita próxima.'
  return `Citas próximas del cliente:\n${citas.map(c => `- ${c.servicio_nombre}, ${textoFechaHora(c.inicio, ctx.agenda.zona)}${(c.recursos || []).filter(x => x.tipo === 'persona').length ? ` con ${(c.recursos || []).filter(x => x.tipo === 'persona').map(x => x.nombre).join(' y ')}` : ''} (${c.estado === 'pendiente' ? 'pendiente de confirmar' : c.estado}) [cita_id ${c.id}]`).join('\n')}`
}

async function apuntarEspera(args: any, ctx: ContextoAgenda) {
  if (!ctx.contacto.id) return 'El cliente no está identificado: no se puede apuntar.'
  const fecha = leerFecha(args?.fecha) ? String(args.fecha) : null
  if (!fecha) return 'Falta el día (AAAA-MM-DD).'
  const servicio = args?.servicio ? await buscarServicio(ctx, args.servicio) : null
  const franja = ['manana', 'tarde', 'cualquiera'].includes(args?.franja) ? args.franja : 'cualquiera'
  const { error } = await supabaseAdmin.from('agenda_espera').upsert({
    tenant_id: ctx.tenant_id, branch_id: ctx.branch_id, contact_id: ctx.contacto.id,
    servicio_id: servicio?.id || null, servicio_nombre: servicio?.nombre || null,
    fecha, franja, personas: Math.max(1, Math.round(Number(args?.personas) || 1)), avisado_en: null
  }, { onConflict: 'branch_id,contact_id,fecha' })
  if (error) return 'No se ha podido apuntar en la lista de espera ahora mismo.'
  return `Apuntado en la lista de espera para el ${fecha}${servicio ? ` (${servicio.nombre})` : ''}. Dile que, si se libera un hueco ese día, le avisaremos por aquí.`
}

// Lo raro va a una persona: un caso en la conversación (una conversación,
// un caso: si ya lo hay, se anota en él)
async function abrirCasoAgenda(ctx: ContextoAgenda, descripcion: string): Promise<boolean> {
  if (!ctx.conversation_id || !ctx.contacto.id) return false
  const { crearCasoDesdeSistema } = await import('@/lib/casos/crearCasoDesdeSistema')
  const id = await crearCasoDesdeSistema(ctx.conversation_id, ctx.tenant_id, ctx.branch_id, ctx.contacto.id, `[Agenda] ${descripcion}`, 'normal', 'normal')
  if (id) ctx.gestion = { caso: true, pausa: false, avisado: true }
  return !!id
}
