import OpenAI from 'openai'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { crearCasoDesdeSistema } from '@/lib/casos/crearCasoDesdeSistema'
import { registrarError } from '@/lib/errores'
import { enviarMensajeSaliente } from '@/lib/canales/salida'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-placeholder'
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// Precio de reserva por si el plan no lo tiene puesto. El bueno viene de
// `plans.precio_input_usd_millon` / `precio_output_usd_millon`, editables por
// plan desde /superadmin/planes: el cliente siempre paga 1 crédito por
// respuesta, pero a Respondi le cuesta distinto según el modelo del plan, y
// de ahí sale el margen.
const NOMBRE_IDIOMA: Record<string, string> = {
    es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés',
    it: 'italiano', de: 'alemán', ca: 'catalán', gl: 'gallego', eu: 'euskera'
  }

const PRECIO_POR_DEFECTO = { input: 0.20, output: 1.20 }

// Indicios de que una respuesta le dice al cliente que le va a atender una
// persona. Es solo un primer filtro, amplio a propósito: si salta, el modelo
// revisa su propia respuesta (paso 10) y decide si de verdad hay que escalar,
// así que un falso aviso solo cuesta una revisión. Una lista de frases
// concretas se quedaba corta (se escapó "voy a pasar tu solicitud al equipo
// para que puedan contactarte"). Cuenta una frase afirmativa que habla de
// alguien del equipo y de pasar, avisar, contactar o atender. Las preguntas
// ("¿quieres que te pase con alguien?") no cuentan: ofrecer no es prometer.
const QUIEN_ATIENDE = /(equipo|persona|agente|humano|responsable|compañer|alguien|encargad|gerente|miembro|someone|agent|team|human|person|staff)/i
const ACCION_DE_ATENDER = /(pas[aáeéoó]|deriv|escal|traslad|transfer|envi[aáeéoó]|avis|notific|comunic|contact|llam|atend|atiend|escrib|pondr|respond|connect|reach|call|get back)/i

// El cliente pide expresamente hablar con una persona ("quiero hablar con una
// persona de verdad", "pásame con alguien", "I want to talk to a human")
const PIDE_PERSONA = /(habl|atiend|atend|p[aá]s[ae]me|pasa\s?me|p[aá]sen|contact|llam|comunic|pon(ga|me|edme))[^.?!]{0,40}(persona|humano|agente|alguien|encargad|responsable|gerente|emplead|operador|comercial)|\b(human|real person|someone real|an agent)\b/i
function clientePidePersona(textos: string[]) {
  // Sin excluir negaciones: "no quiero un bot, quiero un humano" es una
  // petición. Si no lo era, la IA lo ve en la revisión y no escala.
  return textos.some(t => PIDE_PERSONA.test(t || ''))
}

function parecePrometerPersona(texto: string) {
  return texto
    .split(/(?<=[.!?\n])/)
    .map(f => f.trim())
    .filter(f => f && !f.endsWith('?') && !f.startsWith('¿'))
    // "No puedo pasarte con otra persona" es justo lo contrario de prometerlo
    .filter(f => !/\bno (puedo|podemos|es posible|me es posible|tengo forma)\b/i.test(f))
    // "Solo puedo atenderte yo" tampoco: habla de la propia IA
    .filter(f => !/\b(solo puedo|te atiendo yo|atenderte yo|ayudarte yo)\b/i.test(f))
    .some(f => QUIEN_ATIENDE.test(f) && ACCION_DE_ATENDER.test(f))
}

export async function generarRespuesta(conv: any) {
  const conversationId = conv.id
  const tenantId = conv.tenant_id
  const branchId = conv.branch_id
  const contactId = conv.contact_id
  
  const branch = Array.isArray(conv.sucursales) ? conv.sucursales[0] : conv.sucursales
  const profile = Array.isArray(branch?.business_profiles) ? branch?.business_profiles[0] : branch?.business_profiles

  // El modelo lo manda el plan de la organización (`plans.modelo_ia`), que se
  // edita por plan desde /superadmin/planes. Estaba escrito a fuego en cuatro
  // sitios de este archivo, así que ese campo del panel no hacía nada y todos
  // los clientes usaban el mismo modelo, pagaran lo que pagaran.
  // `plans!plan_id` es obligatorio: organizaciones tiene dos claves hacia
  // plans (plan_id y plan_pendiente_id) y sin indicar cuál, la consulta falla.
  const { data: orgPlan } = await supabaseAdmin
    .from('organizaciones')
    .select('plans!plan_id(modelo_ia, precio_input_usd_millon, precio_output_usd_millon)')
    .eq('id', tenantId)
    .single()

  const planRel: any = Array.isArray(orgPlan?.plans) ? orgPlan?.plans[0] : orgPlan?.plans
  const MODELO_IA = planRel?.modelo_ia || 'gpt-4o-mini'
  const PRECIO = {
    input: Number(planRel?.precio_input_usd_millon ?? PRECIO_POR_DEFECTO.input) / 1000000,
    output: Number(planRel?.precio_output_usd_millon ?? PRECIO_POR_DEFECTO.output) / 1000000
  }

  // 1. Obtener mensajes sin agrupar
  const { data: ungrouped } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('agrupado', false)
    .order('timestamp', { ascending: true })

  if (!ungrouped || ungrouped.length === 0) {
    return { success: true, reason: 'No_New_Messages' }
  }

  const hasClient = ungrouped.some(m => m.remitente === 'cliente')
  if (!hasClient) {
    // Si solo hay mensajes de IA o agente, los marcamos como agrupados y no respondemos
    const ids = ungrouped.map(m => m.id)
    if (ids.length > 0) {
      await supabaseAdmin.from('messages').update({ agrupado: true }).in('id', ids)
    }
    return { success: true, reason: 'No_Client_Messages' }
  }

  // 2. Obtener historial (últimos 40 agrupados)
  const { data: history } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('agrupado', true)
    .order('timestamp', { ascending: false })
    .limit(40)

  const allMessages = [...(history || []).reverse(), ...ungrouped]

  // 3. Obtener Categorías y Reglas de Caso de la sucursal
  const { data: categories } = await supabaseAdmin
    .from('message_categories')
    .select('id, nombre, descripcion_intencion, es_fallback')
    .eq('branch_id', branchId)
    .eq('activa', true)

  const { data: rules } = await supabaseAdmin
    .from('case_rules')
    .select('id, nombre, descripcion_intencion, tipo_caso, prioridad_default')
    .eq('branch_id', branchId)
    .eq('activa', true)

  // 3.5. Obtener Skills Activas
  const { data: branchSkills } = await supabaseAdmin
    .from('skills')
    .select('activo, skills_globales!inner(slug)')
    .eq('branch_id', branchId)
    .eq('activo', true)

  const activeSkills = new Set(branchSkills?.map((s: any) => s.skills_globales.slug) || [])
  const canEscalate = activeSkills.has('escalar_humano') && rules && rules.length > 0
  const canTag = activeSkills.has('etiquetar_conversacion') && categories && categories.length > 0
  const canUseNovedades = activeSkills.has('novedades_dia')

  // 3.6. Contexto CRM (Historial y Novedades)
  // Solo lo hablado con ESTA tienda: lo que el cliente habló con otra no se
  // comparte (antes la IA de una tienda "recordaba" conversaciones de otra).
  const { data: pastConvs } = await supabaseAdmin
    .from('conversations')
    .select('id, fecha_cierre, resumen')
    .eq('contact_id', contactId)
    .eq('branch_id', branchId)
    .eq('estado', 'cerrada')
    .neq('id', conversationId)
    .not('resumen', 'is', null)
    .order('fecha_cierre', { ascending: false })
    .limit(5)

  const { data: dailyUpdates } = canUseNovedades
    ? await supabaseAdmin
        .from('daily_updates')
        .select('*, tipos_novedad:tipo_id(nombre)')
        .eq('branch_id', branchId)
        .eq('activo', true)
        .lte('fecha_vigencia_inicio', new Date().toISOString())
        .or(`fecha_vigencia_fin.is.null,fecha_vigencia_fin.gte.${new Date().toISOString()}`)
    : { data: null }

  // 4. Preparar Prompt del Sistema
  // Un correo se escribe distinto que un chat (ver estilo-email.ts)
  const esCorreo = conv.canal === 'email'
  const { instruccionesEmail, correoParaIA, limpiarRespuestaEmail } = await import('@/lib/ai/estilo-email')
  const idiomaBase = NOMBRE_IDIOMA[profile?.idioma_base || 'es'] || profile?.idioma_base || 'español'
  let systemPrompt = `Eres el asistente virtual del negocio.\n`
  // El idioma, lo primero de todo. Iba solo al final, dentro de
  // "INSTRUCCIONES ESTRICTAS", y a esas alturas del prompt los modelos
  // baratos se lo saltaban: contestaban en español a un cliente inglés.
  // Medido el 14-09-2026 con probar-modelos.mjs.
  systemPrompt += activeSkills.has('idioma_multi')
    ? `IDIOMA (regla nº 1, por encima de todo lo demás): contesta SIEMPRE en el mismo idioma en el que te escribe el cliente, sea cual sea. Si te escribe en inglés, contestas en inglés; si en francés, en francés. Solo si no se entiende en qué idioma escribe, contestas en ${idiomaBase}.\n`
    : `IDIOMA: contesta SIEMPRE en ${idiomaBase}, aunque el cliente te escriba en otro idioma.\n`
  if (esCorreo) systemPrompt += instruccionesEmail()
  if (profile) {
    if (profile.tono) {
      systemPrompt += `Tono: ${profile.tono}\n`
    }
    
    // El nombre y la dirección de la sucursal. Medido el 14-09-2026: sin
    // esto, a "¿dónde estáis?" contestaba "en el centro de Madrid", que era
    // lo único que decía la descripción, y no daba la calle.
    if (branch?.nombre) systemPrompt += `Negocio: ${branch.nombre}\n`
    if (branch?.direccion) systemPrompt += `Dirección: ${branch.direccion}\n`
    if (profile.servicios) {
      let infoLimpia = profile.servicios;
      if (infoLimpia.length > 500) {
        const cutPoint = infoLimpia.substring(0, 500).lastIndexOf(' ');
        infoLimpia = infoLimpia.substring(0, cutPoint > 0 ? cutPoint : 500) + '...';
      }
      systemPrompt += `Información del negocio: ${infoLimpia}\n`
    }
  }

  // LO QUE CAMBIA EN CADA CONVERSACIÓN VA AL FINAL (14-09-2026).
  //
  // OpenAI cobra a mitad de precio la parte del prompt que se repite igual,
  // pero solo cuenta el trozo del PRINCIPIO que coincide: en cuanto algo
  // cambia, se acabó la caché para todo lo que viene detrás. Este bloque
  // (nota del contacto, conversaciones anteriores, novedades del día) es
  // distinto en cada conversación, y estaba puesto EN MEDIO, así que dejaba
  // fuera de la caché a las instrucciones, las etiquetas y las reglas, que
  // son idénticas para toda la sucursal.
  //
  // Se guarda aparte y se pega al final. No cambia ni una palabra de lo que
  // lee el modelo, solo el orden.
  let contextoDelCliente = ''
  let contextAdded = false;
  
  // La nota es la que ha puesto ESTA tienda (`contactos_sucursal`); la de otra
  // tienda no se comparte. La trae /api/ai/process en `ficha_contacto`.
  if (conv.ficha_contacto?.nota) {
    if (!contextAdded) { contextoDelCliente += `\n--- CONTEXTO ESPECÍFICO DEL CLIENTE ---\n`; contextAdded = true; }
    let notaLimpia = conv.ficha_contacto.nota;
    if (notaLimpia.length > 300) {
      const cutPoint = notaLimpia.substring(0, 300).lastIndexOf(' ');
      notaLimpia = notaLimpia.substring(0, cutPoint > 0 ? cutPoint : 300) + '...';
    }
    contextoDelCliente += `Nota interna sobre este cliente:\n${notaLimpia}\n\n`;
  }

  if (pastConvs && pastConvs.length > 0) {
    if (!contextAdded) { contextoDelCliente += `\n--- CONTEXTO ESPECÍFICO DEL CLIENTE ---\n`; contextAdded = true; }
    contextoDelCliente += `Historial reciente de conversaciones CERRADAS con este mismo cliente (para tener contexto, NO respondas a esto, es solo informativo):\n`;
    pastConvs.forEach(c => {
      const fechaCierre = new Date(c.fecha_cierre).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      contextoDelCliente += `- [${fechaCierre}]: ${c.resumen}\n`;
    });
    contextoDelCliente += `\n`;
  }

  // --- NOVEDADES DEL DÍA --- (cambian cada día, así que también van al final)
  if (dailyUpdates && dailyUpdates.length > 0) {
    contextoDelCliente += `\n--- NOVEDADES Y AVISOS ACTIVOS HOY ---\n`;
    contextoDelCliente += `Son avisos de HOY y mandan sobre lo demás. Si alguno afecta a lo que pregunta el cliente (un descuento en el servicio por el que pregunta, una persona que no está, un cambio de horario), DILO en la respuesta aunque no lo pregunte: un cliente que pregunta el precio del tinte tiene que enterarse de que esta semana tiene descuento.\n`;
    dailyUpdates.forEach((u: any) => {
      const tipo = u.tipos_novedad?.nombre || 'Aviso';
      contextoDelCliente += `- [${tipo}]: ${u.descripcion}\n`;
    });
    contextoDelCliente += `\n`;
  }

  // El idioma sale de dos ajustes que hasta ahora no hacía nada ninguno: la
  // skill "Idioma multi" no se consultaba en el motor, y `idioma_base` se
  // configuraba en Perfil de sucursal, se guardaba en la base y nadie la leía.

  systemPrompt += `\nINSTRUCCIONES ESTRICTAS:\n`
  if (activeSkills.has('idioma_multi')) {
    systemPrompt += `- Responde SIEMPRE en el mismo idioma en el que el cliente te escribe, sea cual sea, sin excepción. Si no queda claro en qué idioma escribe, responde en ${idiomaBase}.\n`
  } else {
    systemPrompt += `- Responde SIEMPRE en ${idiomaBase}, aunque el cliente te escriba en otro idioma.\n`
  }
  systemPrompt += `- No inventes información. Si no lo sabes, indícalo${canEscalate ? ' o usa escalar_humano' : ''}.\n`
  // Antes de decir "no lo tenemos", MIRAR. Medido el 14-09-2026: preguntando
  // "¿cuánto cuesta cortarme el pelo?" a un negocio que sí lo vende, la IA
  // contestaba 2 de cada 4 veces "no tengo información, consulta con una
  // barbería" SIN llamar a consultar_catalogo. Se fiaba de la descripción del
  // negocio ("Cafetería de barrio") en vez de mirar la lista de precios. Eso
  // es mandar un cliente a la competencia.
  if (activeSkills.has('consultar_catalogo')) {
    systemPrompt += `- NUNCA digas que no ofrecéis algo, ni que no tienes información sobre un producto o servicio, sin haber llamado antes a consultar_catalogo. La descripción del negocio no es la lista completa: lo que se vende está en el catálogo. Solo si el catálogo no lo tiene, dices que no lo ofrecéis.\n`
  }
  if (activeSkills.has('consultar_politicas')) {
    // Los modelos pequeños contestaban de memoria ("puedes venir con tu perro,
    // tenemos patio") en vez de mirar la norma del negocio
    systemPrompt += `- Antes de responder sobre condiciones o sobre qué se permite (devoluciones, envíos, reservas, pagos, mascotas, normas del local...), consulta SIEMPRE las políticas con consultar_politicas. No supongas nada. Cuando contestes con una política, da los plazos y las cifras EXACTOS que diga (días, horas, porcentajes): no los resumas ni los omitas.\n`
    systemPrompt += `- Si el cliente PREGUNTA por las condiciones (qué pasa si cancela, si se cobra algo, plazos, retrasos) sin pedir cancelar ni mover una cita concreta, es una consulta de políticas: contesta con consultar_politicas y NO toques su agenda.\n`
  }
  if (!esCorreo) systemPrompt += `- Eres un asistente, responde de manera concisa y natural.\n`
  if (activeSkills.has('presupuestos')) {
    // Los totales los calcula la herramienta con los precios reales: el
    // modelo se equivoca haciendo cuentas
    systemPrompt += `- Si el cliente pide un presupuesto o el total de varios productos o cantidades, llama a hacer_presupuesto en ese mismo momento (sin preguntar antes detalles que no cambian el precio) y da exactamente las cifras que devuelve. NUNCA calcules tú precios ni totales.\n`
  }
  // Cuando el negocio estaba cerrado se le manda al cliente un aviso
  // automático y la conversación queda en espera. Al abrir, esa respuesta
  // pendiente se contesta, pero el aviso sigue en el historial y el modelo lo
  // repetía: el cliente leía "estamos cerrados" justo cuando ya habían
  // abierto.
  systemPrompt += `- Si en el historial hay un aviso automático de que el negocio estaba cerrado o sin disponibilidad, NO lo repitas: el cliente ya lo recibió. Contesta directamente a lo que preguntó.\n`
  if (canEscalate) {
    systemPrompt += `- Si el usuario envía un archivo no soportado (ej. PDF o Word), invoca escalar_humano.\n`
    // Sin esto, el modelo contesta "te paso con una persona del equipo" y se
    // queda tan ancho: no invoca la herramienta, no se crea ningún caso y
    // nadie se entera. El cliente espera a alguien que nunca va a llegar.
    // Detectado probando el motor con un cliente pidiendo hablar con alguien.
    systemPrompt += `- Si el mensaje del cliente encaja con alguna de las Reglas de Caso listadas más abajo, DEBES invocar escalar_humano con el ID de esa regla.\n`
    systemPrompt += `- NUNCA digas que vas a avisar al equipo, pasar la conversación a una persona, derivar el caso o similar sin haber invocado antes escalar_humano. Si no invocas la herramienta, no se avisa a nadie y el cliente se queda esperando.\n`
    systemPrompt += `- Cuando derives, di que "una persona del equipo" seguirá con ello; no digas "un humano" ni "he escalado tu caso", que suena a máquina.\n`
    systemPrompt += `- Si el cliente cuenta un daño, dolor, picor, reacción alérgica o cualquier problema de salud tras un servicio, invoca escalar_humano EN ESA MISMA RESPUESTA con la regla que encaje, antes que nada. No des consejos médicos ni le mandes "a un profesional": la persona del equipo se pondrá en contacto.\n`
  } else {
    // Sin escalado activado no hay forma de avisar a nadie: prometerlo es
    // dejar al cliente esperando a alguien que no va a llegar.
    systemPrompt += `- No puedes pasar la conversación a una persona del equipo: no lo ofrezcas ni lo prometas.\n`
  }

  if (canTag || canEscalate) {
    const actions = []
    if (canTag) actions.push('etiquetado')
    if (canEscalate) actions.push('escalado')
    systemPrompt += `- Usa las herramientas disponibles de ${actions.join(' o ')} cuando corresponda a la intención del cliente.\n`
  }

  systemPrompt += `- IMPORTANTE: Si un mensaje incluye una imagen, SIEMPRE DEBES llamar a la herramienta guardar_descripcion_imagen inmediatamente, para guardar un resumen textual de lo que se ve.\n\n`
  
  if (canTag) {
    systemPrompt += `Etiquetas (Categorías) Disponibles:\n`
    let fallbackName = null;
    categories?.forEach(c => {
      if (c.es_fallback) fallbackName = c.nombre;
      systemPrompt += `- ID: ${c.id} | Nombre: ${c.nombre} | Info: ${c.descripcion_intencion || ''}\n`
    })
    if (fallbackName) {
      // Sin decirle que SIEMPRE tiene que etiquetar, el modelo se saltaba el
      // etiquetado justo en los mensajes que no encajaban en ninguna categoría
      // — que son precisamente los que hay que poder contar para saber qué
      // pregunta la gente y qué falta configurar.
      systemPrompt += `\nDEBES etiquetar SIEMPRE la conversación, sin excepción, incluso si el mensaje no tiene nada que ver con el negocio. La categoría '${fallbackName}' es la de respaldo: úsala únicamente cuando ninguna de las otras encaje claramente, pero úsala.\n`
    } else {
      systemPrompt += `\nDEBES etiquetar la conversación con la categoría que mejor encaje con la intención del cliente.\n`
    }
  }
  
  if (canEscalate) {
    systemPrompt += `\nReglas de Caso (Escalar a humano) Disponibles:\n`
    rules?.forEach(r => {
      systemPrompt += `- ID: ${r.id} | Nombre: ${r.nombre} | Tipo: ${r.tipo_caso} | Info: ${r.descripcion_intencion || ''}\n`
    })
  }

  // Y aquí, al final del todo, lo que cambia en cada conversación
  systemPrompt += contextoDelCliente

  // 5. Preparar Mensajes para OpenAI
  const openAiMessages: any[] = [{ role: 'system', content: systemPrompt }]
  let hasImage = false
  // Un archivo que la IA no puede leer (PDF, Word...) siempre lo revisa una
  // persona: el caso se abre en código, no se deja en manos del modelo
  let adjuntoSinLeerEnEstaPasada: string | null = null

  for (const m of allMessages) {
    let role = m.remitente === 'cliente' ? 'user' : 'assistant'

    // `messages.media_tipo` guarda el tipo MIME que manda el canal ('image/jpeg',
    // 'audio/ogg', 'application/pdf'...), no las palabras 'image' o 'audio'.
    // Aquí se comparaba con esas palabras exactas, así que NUNCA coincidía:
    // las fotos no llegaban a la IA, los audios no se transcribían y los
    // documentos pasaban como un mensaje vacío. Se compara por familia.
    const familia = (m.media_tipo || '').split('/')[0]
    const esImagen = familia === 'image'
    const esAudio = familia === 'audio'
    const esAdjuntoNoProcesable = !!m.media_tipo && !esImagen && !esAudio

    // Una imagen del historial que ya tiene su descripción guardada se manda
    // como texto, no como foto: mirar la misma imagen en cada turno multiplica
    // el coste sin aportar nada. Es el diseño descrito en docs/arquitectura.md
    // ("directo a la IA la primera vez; después se cachea la descripción").
    const imagenYaDescrita = esImagen && m.agrupado === true && !!m.contenido

    if (esImagen && !imagenYaDescrita) {
      hasImage = true
      const path = m.media_url?.replace(/.*?\/storage\/v1\/object\/public\/whatsapp_media\//, '')
      let finalUrl = m.media_url
      if (path) {
        const { data: signed } = await supabaseAdmin.storage.from('whatsapp_media').createSignedUrl(path, 60)
        if (signed?.signedUrl) finalUrl = signed.signedUrl
      }
      openAiMessages.push({
        role,
        content: [
          { type: 'text', text: `[ID_Mensaje_Imagen: ${m.id}] ${m.contenido || ''}` },
          { type: 'image_url', image_url: { url: finalUrl } }
        ]
      })
    } else if (esAudio && m.agrupado === false && m.media_url) {
      // Transcripción de audio con Whisper
      try {
        const path = m.media_url.replace(/.*?\/storage\/v1\/object\/public\/whatsapp_media\//, '')
        let finalUrl = m.media_url
        if (path) {
          const { data: signed } = await supabaseAdmin.storage.from('whatsapp_media').createSignedUrl(path, 60)
          if (signed?.signedUrl) finalUrl = signed.signedUrl
        }

        const audioResponse = await fetch(finalUrl)
        const audioBlob = await audioResponse.blob()
        const file = new File([audioBlob], 'audio.ogg', { type: audioBlob.type || 'audio/ogg' })
        
        // whisper-1 es el modelo antiguo y cuesta el doble: 0,006 $ por
        // minuto frente a 0,003 $ de gpt-4o-mini-transcribe, que además es
        // mejor. Mismo endpoint y misma respuesta (14-09-2026).
        const transcription = await openai.audio.transcriptions.create({
          file: file,
          model: process.env.TRANSCRIPCION_MODELO_IA || 'gpt-4o-mini-transcribe'
        })
        
        const textoExtraido = transcription.text
        await supabaseAdmin.from('messages').update({ contenido: textoExtraido }).eq('id', m.id)
        // También en memoria: las redes de seguridad leen el texto del
        // cliente de allMessages y un audio quedaba en blanco para ellas
        m.contenido = textoExtraido
        openAiMessages.push({ role, content: textoExtraido })
      } catch (err) {
        await registrarError({
          origen: 'app',
          descripcion: 'Fallo al transcribir un audio del cliente',
          stacktrace: JSON.stringify({ messageId: m.id, error: (err as any)?.message }),
          tenant_id: tenantId
        })
        openAiMessages.push({ role, content: '[Nota: Audio ininteligible o fallo en transcripción]' })
      }
    } else if (imagenYaDescrita) {
      openAiMessages.push({ role, content: `[Imagen que envió el cliente, ya descrita antes] ${m.contenido}` })
    } else if (esAdjuntoNoProcesable) {
      // Vídeos, PDF, Word... El motor no los procesa, pero la IA tiene que
      // ENTERARSE de que ha llegado algo: si no, le llega un mensaje vacío,
      // no entiende nada y no puede derivar el caso a una persona como se le
      // pide en las instrucciones.
      if (m.agrupado !== true) adjuntoSinLeerEnEstaPasada = m.media_tipo
      openAiMessages.push({
        role,
        content: `[El cliente ha enviado un archivo adjunto de tipo ${m.media_tipo} que no puedes abrir ni leer. En tu respuesta di EXPLÍCITAMENTE que has recibido el archivo pero que no puedes abrirlo, y que una persona del equipo lo revisará (el caso se abre solo, no hace falta escalar_humano).]${m.contenido ? ` Texto que lo acompaña: ${m.contenido}` : ''}`
      })
    } else {
      openAiMessages.push({ role, content: esCorreo && role === 'user' ? correoParaIA(m.asunto, m.contenido || '') : (m.contenido || '') })
    }
  }

  // 6. Definición de Herramientas
  const tools: any[] = [
    {
      type: "function" as const,
      function: {
        name: "guardar_descripcion_imagen",
        description: "Guarda la descripción en texto de la imagen recibida, para recordarla en el futuro.",
        parameters: {
          type: "object",
          properties: {
            message_id: { type: "string", description: "ID_Mensaje_Imagen del mensaje que contenía la foto." },
            descripcion: { type: "string", description: "Descripción detallada y útil de lo que muestra la imagen." }
          },
          required: ["message_id", "descripcion"]
        }
      }
    }
  ]

  if (activeSkills.has('consultar_horario')) {
    tools.push({
      type: "function" as const,
      function: {
        name: "consultar_horario",
        description: "Consulta el horario comercial físico de la sucursal y la fecha/hora actual. Útil para responder qué días abren, horarios, o si actualmente están abiertos.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    })
  }

  if (activeSkills.has('consultar_catalogo')) {
    tools.push({
      type: "function" as const,
      function: {
        name: "consultar_catalogo",
        description: "Consulta el catálogo de productos y servicios del negocio. Úsala cuando el cliente pregunte por precios, menú, servicios ofrecidos, o busque algo específico.",
        parameters: {
          type: "object",
          properties: {
            busqueda: { type: "string", description: "Texto libre para buscar en el nombre o descripción." },
            categoria: { type: "string", description: "Nombre de la categoría de productos que busca el cliente." },
            etiquetas: { type: "array", items: { type: "string" }, description: "Características mencionadas (ej. 'vegano', 'frio', 'madera')." },
            precio_maximo: { type: "number", description: "Precio máximo en caso de que el cliente especifique un presupuesto." }
          }
        }
      }
    })
  }

  if (activeSkills.has('presupuestos')) {
    tools.push({
      type: "function" as const,
      function: {
        name: "hacer_presupuesto",
        description: "Calcula un presupuesto exacto con los precios reales del catálogo. Úsala SIEMPRE, en cuanto el cliente diga qué productos y cuántos, cuando pida un presupuesto o el precio total de varios productos o de una cantidad. Pasa cada producto con el nombre que ha dicho el cliente (o el del catálogo) y su cantidad; la herramienta los encuentra aunque no estén escritos igual. No pidas detalles que no cambian el precio y no hagas tú las cuentas.",
        parameters: {
          type: "object",
          properties: {
            lineas: {
              type: "array",
              description: "Los productos del presupuesto.",
              items: {
                type: "object",
                properties: {
                  producto: { type: "string", description: "Nombre del producto o servicio." },
                  cantidad: { type: "number", description: "Cuántas unidades quiere el cliente." }
                },
                required: ["producto", "cantidad"]
              }
            }
          },
          required: ["lineas"]
        }
      }
    })
  }

  if (activeSkills.has('consultar_politicas')) {
    tools.push({
      type: "function" as const,
      function: {
        name: "consultar_politicas",
        description: "Consulta las políticas, normas o reglas del negocio. Úsala SIEMPRE antes de responder a cualquier pregunta sobre condiciones o sobre qué se permite: devoluciones, cambios, garantías, envíos, reservas, pagos, mascotas, accesos, horarios especiales o normas del local. No lo respondas de memoria.",
        parameters: {
          type: "object",
          properties: {
            consulta: { type: "string", description: "Pregunta o duda del cliente formulada claramente para buscar su respuesta en las políticas." }
          },
          required: ["consulta"]
        }
      }
    })
  }

  if (canTag) {
    tools.push({
      type: "function" as const,
      function: {
        name: "etiquetar_conversacion",
        description: "Etiqueta la conversación en base a la intención del cliente.",
        parameters: {
          type: "object",
          properties: {
            // Solo las que existen: los modelos a veces se inventan o
            // estropean el identificador
            category_id: { type: "string", enum: (categories || []).map((c: any) => c.id), description: "UUID de la categoría elegida (debe existir en la lista provista)." }
          },
          required: ["category_id"]
        }
      }
    })
  }

  if (canEscalate) {
    tools.push({
      type: "function" as const,
      function: {
        name: "escalar_humano",
        description: "Deriva el caso a un agente humano y detiene el bot automático.",
        parameters: {
          type: "object",
          properties: {
            rule_id: { type: "string", enum: (rules || []).map((r: any) => r.id), description: "UUID de la regla de escalado (debe existir en la lista provista)." },
            resumen_problema: { type: "string", description: "Breve explicación de por qué se escala el caso." }
          },
          required: ["rule_id", "resumen_problema"]
        }
      }
    })
  }

  // Las herramientas con datos de la tienda online (productos, pedidos,
  // enlace de compra): solo las que gobiernan las automatizaciones que el
  // negocio haya encendido. Viven en su propio archivo para no engordar este.
  const { cargarHerramientasDeTienda, ejecutarHerramientaDeTienda, esHerramientaDeTienda } = await import('@/lib/tiendas/herramientas-ia')
  const herramientasTienda = await cargarHerramientasDeTienda(branchId, contactId, conversationId)
  if (herramientasTienda.definiciones.length) {
    tools.push(...herramientasTienda.definiciones)
    openAiMessages.push({ role: 'system', content: herramientasTienda.instrucciones })
  }

  // Las herramientas de la agenda (ver huecos, reservar, cambiar, cancelar):
  // solo si la agenda de la sucursal está activada y hay algo reservable.
  const { cargarHerramientasDeAgenda, ejecutarHerramientaDeAgenda, esHerramientaDeAgenda } = await import('@/lib/agenda/herramientas-ia')
  const herramientasAgenda = await cargarHerramientasDeAgenda(branchId, contactId, conversationId)
  // Lo que ha escrito (o dicho) el cliente en este turno: si el modelo llama
  // a ver_huecos sin decir el servicio, la agenda lo busca en sus palabras
  if (herramientasAgenda.contexto) herramientasAgenda.contexto.texto_cliente = allMessages.filter((m: any) => m.remitente === 'cliente' && m.agrupado !== true).map((m: any) => m.contenido || '').join(' ')
  if (herramientasAgenda.definiciones.length) {
    tools.push(...herramientasAgenda.definiciones)
    openAiMessages.push({ role: 'system', content: herramientasAgenda.instrucciones })
  }
  // Consultar (ver huecos, mis citas) no es lo mismo que actuar (reservar,
  // cambiar, cancelar, lista de espera): la red de seguridad de abajo mira las dos
  let agendaEnEstaPasada = false
  let agendaAccionEnEstaPasada = false
  const ACCIONES_AGENDA = new Set(['reservar_cita', 'cambiar_cita', 'cancelar_cita', 'apuntar_espera_agenda'])

  // Recordatorio del idioma justo después de la conversación: los modelos
  // pequeños hacen más caso a lo último que leen que al principio del todo
  // (en las pruebas, gpt-4.1-mini contestaba en español a un cliente inglés)
  openAiMessages.push({
    role: 'system',
    content: activeSkills.has('idioma_multi')
      ? 'Responde en el mismo idioma en que está escrito el último mensaje del cliente.'
      : `Responde en ${idiomaBase}.`
  })

  let tokensInput = 0
  // Lo que OpenAI da por repetido y cobra a mitad de precio. Se apunta para
  // poder comprobar que el orden del prompt entra en la caché (14-09-2026).
  let tokensCacheados = 0
  let tokensOutput = 0

  // 7. Llamada a OpenAI (Paso 1)
  let responseMsg
  try {
    const response = await openai.chat.completions.create({
      model: MODELO_IA,
      messages: openAiMessages,
      tools: tools
    })

    responseMsg = response.choices[0].message
    tokensInput += response.usage?.prompt_tokens || 0
    tokensCacheados += response.usage?.prompt_tokens_details?.cached_tokens || 0
    tokensOutput += response.usage?.completion_tokens || 0

  } catch (error: any) {
    console.error('Error OpenAI Paso 1:', error)
    await supabaseAdmin.from('ai_logs').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      modelo_ia: MODELO_IA,
      resultado: 'fallo',
      contexto_snapshot: { step: 1, error: error?.message || 'OpenAI API Error' }
    })
    return { success: false, error: 'OpenAI API Error' }
  }

  openAiMessages.push(responseMsg)

  // La propia IA pausa la conversación cuando escala. Esa pausa no debe
  // impedir que salga su aviso de "te paso con una persona" (ver paso 10).
  let escaladoEnEstaPasada = false

  // Escalar a una persona: abre (o reutiliza) el caso y pausa la IA. Lo usa la
  // herramienta escalar_humano y también la revisión del paso 10.
  // Busca en las políticas del negocio lo que se parezca a una pregunta. La
  // usan la herramienta `consultar_politicas` y la de horarios.
  const politicasRelacionadas = async (consulta: string, cuantos = 3): Promise<string> => {
    try {
      const embedding = await openai.embeddings.create({ model: 'text-embedding-3-small', input: consulta })
      const { data: fragmentos, error } = await supabaseAdmin.rpc('match_fragmentos_politicas', {
        query_embedding: embedding.data[0].embedding,
        match_branch_id: branchId,
        match_limit: cuantos
      })
      if (error || !fragmentos?.length) return ''
      return fragmentos.map((f: any) => `- ${f.contenido}`).join('\n')
    } catch (err: any) {
      console.error('Error buscando en las políticas:', err?.message)
      return ''
    }
  }

  const ejecutarEscalado = async (args: any): Promise<string> => {
    const rule = rules?.find(r => r.id === args.rule_id)
    if (!rule) return 'Error: rule_id no válido para esta sucursal.'

    // OJO con los dos "tipo" que se llaman igual y NO son lo mismo:
    //  - `case_rules.tipo_caso` es el motivo de negocio que configura el
    //    cliente (derivacion_solicitada, queja, consulta...).
    //  - `cases.tipo` es un enum del sistema con otros valores
    //    (normal, fallo_llm, fallo_entrega, blacklist_sugerida).
    // Aquí se pasaba el primero como si fuera el segundo, y Postgres
    // rechazaba la inserción: NINGUNA regla de escalado llegó nunca a
    // crear un caso. Un caso nacido de una regla de negocio es 'normal';
    // el motivo concreto se guarda en la descripción, que es lo que lee
    // la persona que lo atiende.
    const idCaso = await crearCasoDesdeSistema(
      conversationId,
      tenantId,
      branchId,
      contactId,
      `[${rule.nombre}] ${args.resumen_problema}`,
      'normal',
      rule.prioridad_default
    )

    if (!idCaso) {
      // Si no hay caso, no se puede decir que lo hay: la IA no debe
      // prometerle al cliente una atención que no va a llegar.
      return 'No se ha podido derivar el caso a una persona. NO le digas al cliente que le vas a pasar con alguien; discúlpate y pídele que lo intente de nuevo más tarde.'
    }

    const { error } = await supabaseAdmin.from('conversations').update({ ia_pausada: true }).eq('id', conversationId)
    if (error) {
      await registrarError({
        origen: 'app',
        descripcion: 'Fallo al pausar la IA tras escalar a un humano (la IA seguirá contestando encima del agente)',
        stacktrace: JSON.stringify({ conversationId, error }),
        tenant_id: tenantId
      })
    }
    escaladoEnEstaPasada = true
    return 'Caso escalado a humano y respuestas automáticas pausadas.'
  }

  // Escalar desde una revisión: si el modelo elige una regla que no existe
  // (pasó con gpt-4.1: se inventó el identificador), se usa la de "quiere
  // hablar con una persona" (o la primera que haya) en vez de no avisar a nadie
  const escalarConReglaSegura = async (argumentos: string, resumenPorDefecto: string): Promise<string> => {
    let args: any = {}
    try { args = JSON.parse(argumentos || '{}') } catch { /* sin argumentos válidos */ }
    const resultado = await ejecutarEscalado(args)
    if (escaladoEnEstaPasada || rules?.some(r => r.id === args.rule_id)) return resultado
    const regla = rules?.find(r => r.tipo_caso === 'derivacion_solicitada') || rules?.[0]
    return regla ? ejecutarEscalado({ rule_id: regla.id, resumen_problema: args.resumen_problema || resumenPorDefecto }) : resultado
  }

  // Poner una etiqueta a la conversación (la llama la herramienta y, si la IA
  // se la salta, el etiquetado obligatorio de más abajo)
  let etiquetadoEnEstaPasada = false
  let presupuestoEnEstaPasada = false
  const aplicarEtiqueta = async (categoryId: string): Promise<string> => {
    let toolResult = ''
    const targetCategory = categories?.find(c => c.id === categoryId)
    
    if (!targetCategory) {
      toolResult = 'Error: category_id no válido para esta sucursal.'
    } else {
      // 1. Obtener estado actual de las etiquetas en esta conversación
      const { data: currentTags } = await supabaseAdmin
        .from('conversation_tags')
        .select('category_id, message_categories!inner(es_fallback)')
        .eq('conversation_id', conversationId)

      const hasRealTags = currentTags?.some((t: any) => !t.message_categories.es_fallback)
      const fallbackTag = currentTags?.find((t: any) => t.message_categories.es_fallback)

      let abortInsert = false

      // 2. Lógica bidireccional
      if (targetCategory.es_fallback) {
        if (hasRealTags) {
          toolResult = 'Ignorado: La conversación ya tiene una etiqueta específica, no es necesario aplicar la opción de respaldo.'
          abortInsert = true
        }
      } else {
        if (fallbackTag) {
          // 3. Borrado con chequeo explícito de error
          const { error: deleteError } = await supabaseAdmin
            .from('conversation_tags')
            .delete()
            .match({ conversation_id: conversationId, category_id: fallbackTag.category_id })
          
          if (deleteError) {
            console.error('Error al borrar la etiqueta de fallback:', deleteError)
            toolResult = 'Error del sistema: no se pudo limpiar la etiqueta anterior.'
            abortInsert = true
          }
        }
      }

      // 4. Inserción final si no se abortó
      if (!abortInsert) {
        const { error: insertError } = await supabaseAdmin.from('conversation_tags').insert({
          conversation_id: conversationId,
          category_id: categoryId,
          aplicada_por: 'ia'
        })
        
        if (insertError) {
          if (insertError.code === '23505') {
            toolResult = 'Ignorado: Esta etiqueta ya estaba aplicada a la conversación.'
          } else {
            console.error('Error etiquetando conversación:', insertError)
            toolResult = 'Error del sistema: fallo al guardar la etiqueta.'
          }
        } else {
          toolResult = 'Etiqueta aplicada correctamente.'
        }
      }
    }
    if (/^Etiqueta aplicada|^Ignorado/.test(toolResult)) etiquetadoEnEstaPasada = true
    // Aviso a las automatizaciones que llevan las etiquetas a Shopify
    if (/^Etiqueta aplicada/.test(toolResult) && targetCategory) {
      try {
        const { encolarEventoInterno } = await import('@/lib/canales/entrada')
        const { data: contacto } = await supabaseAdmin.from('contacts').select('canal, identificador_canal, nombre').eq('id', contactId).maybeSingle()
        await encolarEventoInterno(tenantId, branchId, 'conversacion_etiquetada', `${conversationId}:${targetCategory.id}`, {
          conversation_id: conversationId, contact_id: contactId, etiqueta: targetCategory.nombre,
          canal: contacto?.canal || null, identificador: contacto?.identificador_canal || null, nombre: contacto?.nombre || null
        })
      } catch {
        // Nunca por esto se deja de contestar
      }
    }
    return toolResult
  }

  let intencionEnEstaPasada = false

  // 8. Manejo de Tool Calls
  if (responseMsg.tool_calls) {
    for (const toolCall of responseMsg.tool_calls) {
      if (toolCall.type !== 'function') continue
      
      const args = JSON.parse(toolCall.function.arguments)
      let toolResult = ''

      if (toolCall.function.name === 'consultar_horario') {
        const timezone = branch?.timezone || 'UTC'
        const hours = branch?.business_hours || []
        const physicalHours = hours.filter((h: any) => h.tipo === 'negocio')
        
        let formatted = `Horario comercial físico del local (Zona horaria: ${timezone}):\n`
        
        if (physicalHours.length === 0) {
          formatted += "Este negocio no ha configurado un horario específico todavía, puedes asumir que está disponible.\n"
        } else {
          const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
          for (let i = 0; i <= 6; i++) {
            const franjas = physicalHours.filter((h: any) => h.dia_semana === i)
            if (franjas.length === 0 || franjas.some((h: any) => h.cerrado)) {
              formatted += `- ${days[i]}: Cerrado\n`
            } else {
              const franjasOrdenadas = franjas.sort((a: any, b: any) => (a.orden || 0) - (b.orden || 0))
              const times = franjasOrdenadas.map((f: any) => `${f.apertura?.substring(0,5) || '??'} a ${f.cierre?.substring(0,5) || '??'}`).join(', ')
              formatted += `- ${days[i]}: ${times}\n`
            }
          }
        }
        
        try {
          const current = new Date().toLocaleString('es-ES', { 
            timeZone: timezone, 
            hour12: false, 
            dateStyle: 'full', 
            timeStyle: 'short' 
          })
          formatted += `\nFecha y hora actual en la sucursal: ${current}`
        } catch (e) {
          formatted += `\nFecha y hora actual en la sucursal: No disponible`
        }

        // El horario del local no es lo mismo que cuándo se recogen o se
        // entregan los pedidos: eso suele estar en las políticas del negocio.
        // (Visto en pruebas: con el local abierto 24 h, la IA contestaba que se
        // podía recoger a cualquier hora, aunque las políticas dijeran otra
        // cosa.) Si la pregunta va de eso, la norma se trae aquí mismo: pedirle
        // que llame a otra herramienta después no funciona, porque en ese paso
        // ya está escribiendo la respuesta.
        const ultimoDelCliente = [...allMessages].reverse().find((m: any) => m.remitente === 'cliente')?.contenido || ''
        if (activeSkills.has('consultar_politicas') && /recog|entreg|repart|devolv|reserv|cita|domicilio|env[ií]o/i.test(ultimoDelCliente)) {
          const relacionadas = await politicasRelacionadas(ultimoDelCliente)
          if (relacionadas) formatted += `\n\nNormas del negocio relacionadas (tienen prioridad sobre el horario del local):\n${relacionadas}`
        }

        toolResult = formatted
      }
      else if (toolCall.function.name === 'etiquetar_conversacion') {
        toolResult = await aplicarEtiqueta(args.category_id)
      }
      else if (esHerramientaDeTienda(toolCall.function.name) && herramientasTienda.contexto) {
        toolResult = await ejecutarHerramientaDeTienda(toolCall.function.name, args, herramientasTienda.contexto)
        if (toolCall.function.name === 'detectar_intencion') intencionEnEstaPasada = true
      }
      else if (esHerramientaDeAgenda(toolCall.function.name) && herramientasAgenda.contexto) {
        toolResult = await ejecutarHerramientaDeAgenda(toolCall.function.name, args, herramientasAgenda.contexto)
        agendaEnEstaPasada = true
        if (ACCIONES_AGENDA.has(toolCall.function.name)) agendaAccionEnEstaPasada = true
      }
      else if (toolCall.function.name === 'escalar_humano') {
        toolResult = await ejecutarEscalado(args)
      }
      else if (toolCall.function.name === 'guardar_descripcion_imagen') {
        const msgExists = allMessages.some(m => m.id === args.message_id)
        if (!msgExists) {
          toolResult = 'Error: message_id no pertenece a la conversación actual.'
        } else {
          const { error } = await supabaseAdmin.from('messages').update({ contenido: args.descripcion }).eq('id', args.message_id)
          if (error) {
            console.error('Error actualizando descripción de imagen:', error)
          }
          toolResult = error ? `Error DB: ${error.message}` : 'Descripción de imagen guardada en base de datos correctamente.'
        }
      }
      else if (toolCall.function.name === 'consultar_catalogo') {
        // Lo que escribe el cliente se compara sin mayúsculas, tildes ni
        // plurales. Antes se buscaba el texto tal cual y "tartas de limon" no
        // encontraba "Tarta de limón": al cliente se le decía que no existía.
        const { normalizar, contienePalabras } = await import('@/lib/ai/comparar-texto')
        const conTexto = !!args.busqueda || (Array.isArray(args.etiquetas) && args.etiquetas.length > 0)
        let query = supabaseAdmin.from('price_list').select(`
          id, nombre, tipo, precio, precio_tipo, moneda, descripcion, etiquetas,
          categorias_precios (id, nombre, parent_id)
        `).eq('branch_id', branchId).eq('visible_ia', true).eq('disponible', true)

        if (args.categoria) {
          const { data: todasCats } = await supabaseAdmin.from('categorias_precios')
            .select('id, nombre, parent_id')
            .eq('branch_id', branchId)
          const buscadaCat = normalizar(args.categoria)
          const cats = (todasCats || []).filter((c: any) => normalizar(c.nombre).includes(buscadaCat) || contienePalabras(c.nombre, args.categoria))

          if (cats.length > 0) {
            const catIds = new Set<string>(cats.map((c: any) => c.id))
            for (const c of cats) {
              // Una categoría principal incluye sus subcategorías
              if (!c.parent_id) (todasCats || []).filter((x: any) => x.parent_id === c.id).forEach((x: any) => catIds.add(x.id))
            }
            query = query.in('categoria_id', Array.from(catIds))
          } else {
             query = query.eq('categoria_id', '00000000-0000-0000-0000-000000000000') 
          }
        }
        
        if (args.precio_maximo !== undefined) {
          query = query.lte('precio', args.precio_maximo)
        }
        
        // Con texto o características se filtra aquí mismo, sobre el catálogo
        // de la sucursal; sin ellos basta con los 15 primeros
        query = query.limit(conTexto ? 2000 : 15)
        
        const { data: encontrados, error } = await query
        let productos: any[] = encontrados || []

        if (!error && args.busqueda) {
          const b = normalizar(args.busqueda)
          const enNombre = (p: any) => normalizar(p.nombre).includes(b) || contienePalabras(p.nombre, args.busqueda)
          // Lo buscado puede ser el nombre de una categoría ("color",
          // "barbería", "productos"): entonces entran todos los de esa
          // categoría, aunque la palabra no salga en su nombre. Visto el
          // 14-09-2026: "servicios de color" traía el tinte y no las mechas.
          const enCategoria = (p: any) => { const c = (p.categorias_precios as any)?.nombre || ''; return !!c && (normalizar(c).includes(b) || contienePalabras(b, c) || contienePalabras(c, args.busqueda)) }
          productos = productos
            .filter(p => enNombre(p) || enCategoria(p) || normalizar(p.descripcion || '').includes(b) || contienePalabras(`${p.nombre} ${p.descripcion || ''}`, args.busqueda))
            .sort((a, z) => Number(enNombre(z)) - Number(enNombre(a)))
        }
        if (!error && Array.isArray(args.etiquetas) && args.etiquetas.length > 0) {
          const pedidas = args.etiquetas.map((e: string) => normalizar(e)).filter(Boolean)
          productos = productos.filter(p => (p.etiquetas || []).some((e: string) => pedidas.includes(normalizar(e))))
        }
        productos = productos.slice(0, 15)
        
        if (error) {
          console.error("Error consultando catálogo:", error)
          toolResult = "Error interno al consultar el catálogo."
        } else if (!productos || productos.length === 0) {
          toolResult = "No se encontraron productos o servicios que coincidan con la búsqueda."
        } else {
          toolResult = "Catálogo encontrado:\n"
          for (const p of productos) {
            const catObj = p.categorias_precios as any
            const catStr = catObj?.nombre ? ` [Categoría: ${catObj.nombre}]` : ''
            let priceStr = ''
            if (p.precio_tipo === 'consultar') priceStr = 'Precio: A consultar'
            else if (p.precio_tipo === 'desde') priceStr = `Precio: Desde ${p.precio} ${p.moneda}`
            else priceStr = `Precio: ${p.precio} ${p.moneda}`
            
            toolResult += `- ${p.nombre}${catStr} | ${priceStr}`
            if (p.descripcion) toolResult += `\n  Descripción: ${p.descripcion}`
            toolResult += '\n'
          }
        }
      }
      else if (toolCall.function.name === 'hacer_presupuesto') {
        const { calcularPresupuesto } = await import('@/lib/ai/presupuesto')
        toolResult = await calcularPresupuesto(branchId, Array.isArray(args.lineas) ? args.lineas : [])
        presupuestoEnEstaPasada = true
      }
      else if (toolCall.function.name === 'consultar_politicas') {
        const encontrado = await politicasRelacionadas(args.consulta, 5)
        toolResult = encontrado
          ? `Fragmentos de políticas relevantes encontrados:\n${encontrado}`
          : 'No se encontró información relevante en las políticas del negocio para esta consulta.'
      }

      openAiMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult
      })
    }

    // 9. Llamada a OpenAI (Paso 2)
    try {
      const secondResponse = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages
      })
      responseMsg = secondResponse.choices[0].message
      tokensInput += secondResponse.usage?.prompt_tokens || 0
    tokensCacheados += secondResponse.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += secondResponse.usage?.completion_tokens || 0
    } catch (error: any) {
      console.error('Error OpenAI Paso 2:', error)
      await supabaseAdmin.from('ai_logs').insert({
        tenant_id: tenantId,
        branch_id: branchId,
        modelo_ia: MODELO_IA,
        resultado: 'fallo',
        contexto_snapshot: { step: 2, error: error?.message || 'OpenAI API Error Step 2' }
      })
      return { success: false, error: 'OpenAI API Error Step 2' }
    }
  }

  // 9.5 Etiquetado obligatorio. Las instrucciones dicen que se etiquete SIEMPRE,
  // pero los modelos más baratos (los de Trial, Starter y Pro) a veces
  // contestan sin llamar a la herramienta y la conversación se queda sin
  // etiqueta, que es justo lo que se usa para contar qué pregunta la gente.
  // Si la conversación sigue sin ninguna, se le pide solo eso, obligando a
  // usar la herramienta.
  if (canTag && !etiquetadoEnEstaPasada) {
    const { count } = await supabaseAdmin
      .from('conversation_tags')
      .select('category_id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
    const herramienta = tools.find((t: any) => t.function?.name === 'etiquetar_conversacion')
    if (!count && herramienta) {
      try {
        const forzado = await openai.chat.completions.create({
          model: MODELO_IA,
          messages: [...openAiMessages, { role: 'system', content: 'Ahora etiqueta la conversación con la categoría que mejor encaje con lo que pide el cliente.' }],
          tools: [herramienta],
          tool_choice: { type: 'function', function: { name: 'etiquetar_conversacion' } }
        })
        tokensInput += forzado.usage?.prompt_tokens || 0
    tokensCacheados += forzado.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += forzado.usage?.completion_tokens || 0
        const llamada: any = forzado.choices[0].message.tool_calls?.[0]
        if (llamada?.function?.arguments) {
          await aplicarEtiqueta(JSON.parse(llamada.function.arguments).category_id)
        }
      } catch (e: any) {
        console.error('Etiquetado obligatorio fallido:', e?.message)
      }
    }
  }

  // Red de seguridad de la imagen: el cliente ha mandado una foto y el modelo
  // no ha llamado a guardar_descripcion_imagen (el prompt dice SIEMPRE, pero
  // medido el 14-09-2026 se lo salta de vez en cuando cuando además consulta
  // el catálogo). Sin descripción guardada, la foto se vuelve a mandar a
  // OpenAI en cada turno y el panel no sabe qué era. Se le obliga.
  const describioImagen = () => openAiMessages.some((m: any) => m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.some((t: any) => t.function?.name === 'guardar_descripcion_imagen'))
  if (hasImage && !describioImagen()) {
    try {
      const herramientaImagen = tools.find((t: any) => t.function?.name === 'guardar_descripcion_imagen')
      const imagenesPendientes = allMessages.filter((m: any) => String(m.media_tipo || '').startsWith('image') && m.agrupado !== true)
      openAiMessages.push({ role: 'system', content: 'REVISIÓN: el cliente ha mandado una imagen y no has guardado su descripción. Llama ahora a guardar_descripcion_imagen con el ID_Mensaje_Imagen y una descripción útil de lo que se ve (colores, objetos, texto legible). No escribas respuesta.' })
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: [herramientaImagen],
        tool_choice: { type: 'function', function: { name: 'guardar_descripcion_imagen' } }
      })
      tokensInput += revision.usage?.prompt_tokens || 0
      tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamadas: any[] = (r.tool_calls || []).filter((t: any) => t.function?.name === 'guardar_descripcion_imagen')
      if (llamadas.length) {
        openAiMessages.push(r)
        for (const llamada of llamadas) {
          const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
          // Si copia mal el id y solo hay una foto sin describir, es esa
          const idImagen = args.message_id && allMessages.some((m: any) => m.id === args.message_id) ? args.message_id : (imagenesPendientes.length === 1 ? imagenesPendientes[0].id : null)
          let resultado = 'Error: message_id no pertenece a la conversación actual.'
          if (idImagen && args.descripcion) {
            const { error } = await supabaseAdmin.from('messages').update({ contenido: String(args.descripcion) }).eq('id', idImagen)
            resultado = error ? `Error DB: ${error.message}` : 'Descripción de imagen guardada en base de datos correctamente.'
          }
          openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        }
      }
    } catch (err: any) {
      console.error('Revisión de la imagen fallida:', err?.message)
    }
  }

  // Red de seguridad del catálogo: la IA dice que algo no se ofrece o que no
  // tiene información sin haber mirado el catálogo. Medido el 14-09-2026: a
  // "¿hacéis manicura?" contestaba que no sin consultar, y con la descripción
  // del negocio delante se fiaba de ella en vez de la lista de precios. Se le
  // obliga a mirar y a contestar de nuevo con lo que salga (si de verdad no
  // está, dirá que no, pero ya con fundamento).
  const NIEGA = /no (lo |los |la |las )?(tenemos|ofrecemos|hacemos|realizamos|disponemos|vendemos|contamos)|no (tengo|dispongo de) (esa )?informaci|no est[áa] (disponible|en nuestro)|no (se )?(hace|ofrece|vende) (aqu[íi]|en)/i
  const herramientaCatalogo = tools.find((t: any) => t.function?.name === 'consultar_catalogo')
  const miroCatalogo = () => openAiMessages.some((m: any) => m?.role === 'assistant' && (m.tool_calls || []).some((t: any) => t.function?.name === 'consultar_catalogo'))
  const ultimoTextoCliente = [...allMessages].reverse().find((m: any) => m.remitente === 'cliente')?.contenido || ''
  if (herramientaCatalogo && responseMsg?.content && NIEGA.test(responseMsg.content) && !miroCatalogo() && ultimoTextoCliente.length > 3) {
    try {
      openAiMessages.push({ role: 'assistant', content: responseMsg.content })
      openAiMessages.push({ role: 'system', content: 'REVISIÓN: has dicho que algo no se ofrece o que no tienes información sin mirar el catálogo. Búscalo ahora con consultar_catalogo (con lo que ha pedido el cliente) y contesta de nuevo con lo que encuentres. Si de verdad no está, dilo; si está, da precio y detalles.' })
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: [herramientaCatalogo],
        tool_choice: { type: 'function', function: { name: 'consultar_catalogo' } }
      })
      tokensInput += revision.usage?.prompt_tokens || 0
      tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.function?.name === 'consultar_catalogo')
      if (llamada) {
        const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
        // La misma búsqueda que hace la herramienta en la primera pasada
        const { normalizar, contienePalabras } = await import('@/lib/ai/comparar-texto')
        const { data: todos } = await supabaseAdmin.from('price_list').select('id, nombre, tipo, precio, precio_tipo, moneda, descripcion, categorias_precios (nombre)').eq('branch_id', branchId).eq('visible_ia', true).eq('disponible', true).limit(2000)
        const b = normalizar(args.busqueda || ultimoTextoCliente)
        const hallados = (todos || []).filter((p: any) => normalizar(p.nombre).includes(b) || contienePalabras(`${p.nombre} ${p.descripcion || ''} ${(p.categorias_precios as any)?.nombre || ''}`, args.busqueda || ultimoTextoCliente)).slice(0, 15)
        const resultado = hallados.length
          ? 'Catálogo encontrado:\n' + hallados.map((p: any) => `- ${p.nombre} | ${p.precio_tipo === 'consultar' ? 'Precio: A consultar' : p.precio_tipo === 'desde' ? `Precio: Desde ${p.precio} ${p.moneda}` : `Precio: ${p.precio} ${p.moneda}`}${p.descripcion ? `\n  Descripción: ${p.descripcion}` : ''}`).join('\n')
          : 'No se encontraron productos o servicios que coincidan con la búsqueda.'
        openAiMessages.push(r)
        openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
        tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
      }
    } catch (e: any) {
      console.error('Revisión de catálogo fallida:', e?.message)
    }
  }

  // Red de seguridad: el cliente pide un total o un presupuesto y la IA ha
  // contestado sin usar `hacer_presupuesto` (visto en pruebas: decía el precio
  // de un producto y del otro "no tengo información, te respondo luego", en
  // vez de calcularlo). Se le pide que lo haga con la herramienta.
  // Solo cuando pide un total o el precio de VARIAS cosas. «¿Cuánto cuesta un
  // corte?» se contesta con el catálogo: forzar aquí el presupuesto costaba
  // dos llamadas más y daba respuestas de «presupuesto» a una pregunta simple
  // (medido el 14-09-2026; una vez acabó pidiendo día y hora sin dar el precio)
  const PIDE_PRESUPUESTO = /presupuesto|precio total|en total|cu[áa]nto (me )?(ser[íi]a|costar[íi]a|saldr[íi]a)|cuanto seria|qu[ée] precio.*(todo|junto)/i
  const PRECIO_DE_VARIOS = /cu[áa]nto (me )?(cuesta|vale|sale|cuestan|valen|salen)\b.*(\d|\b(dos|tres|cuatro|cinco|seis|varios|varias|todo|todos|juntos?)\b|\by (un|una|el|la|los|las)\b|\bm[áa]s (un|una|el|la|los|las)\b)/i
  const pendientesCliente = allMessages.filter((m: any) => m.remitente === 'cliente' && m.agrupado !== true).map((m: any) => m.contenido || '')
  // Con la tienda conectada y su presupuesto encendido, manda el de la tienda
  const herramientaPresupuesto = tools.find((t: any) => t.function?.name === 'presupuesto_de_tienda') || tools.find((t: any) => t.function?.name === 'hacer_presupuesto')
  if (herramientaPresupuesto && !presupuestoEnEstaPasada && responseMsg?.content && pendientesCliente.some(t => PIDE_PRESUPUESTO.test(t) || PRECIO_DE_VARIOS.test(t))) {
    try {
      openAiMessages.push({ role: 'assistant', content: responseMsg.content })
      openAiMessages.push({
        role: 'system',
        content: `REVISIÓN: el cliente está pidiendo un total o un presupuesto y has contestado sin usar ${herramientaPresupuesto.function.name}. Úsala ahora con lo que ha pedido: el nombre de cada cosa tal como la ha dicho el cliente y su cantidad. Si no ha pedido nada concreto, pásale una lista vacía.`
      })
      // Obligada: si se le deja elegir, a veces contesta "te lo digo luego"
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: [herramientaPresupuesto],
        tool_choice: { type: 'function', function: { name: herramientaPresupuesto.function.name } }
      })
      tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.function?.name === herramientaPresupuesto.function.name)
      if (llamada) {
        const { calcularPresupuesto } = await import('@/lib/ai/presupuesto')
        const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
        const resultado = llamada.function.name === 'presupuesto_de_tienda' && herramientasTienda.contexto
          ? await ejecutarHerramientaDeTienda('presupuesto_de_tienda', args, herramientasTienda.contexto)
          : await calcularPresupuesto(branchId, Array.isArray(args.lineas) ? args.lineas : [])
        presupuestoEnEstaPasada = true
        openAiMessages.push(r)
        openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
    tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
      } else if (r.content) {
        responseMsg.content = r.content
      }
    } catch (err: any) {
      console.error('Revisión del presupuesto fallida:', err?.message)
    }
  }

  // Red de seguridad: el cliente pide comprar (o el enlace para pagar) y la IA
  // ha contestado con el enlace del producto para que se apañe él, en vez de
  // prepararle el carrito con `enlace_de_compra` (visto en pruebas con
  // gpt-4o-mini). Se le obliga a usar la herramienta, como con el presupuesto.
  const PIDE_COMPRAR = /enlace (de|para) pag|para pagar|quiero comprar|c[oó]mprame|h[aá]zme el pedido|prep[aá]rame|me lo llevo|lo quiero|quiero \d+ |mándame el enlace|mandame el enlace/i
  const herramientaCompra = tools.find((t: any) => t.function?.name === 'enlace_de_compra')
  const yaConEnlaceDePago = /invoices\/|\/checkouts\//.test(responseMsg?.content || '')
  if (herramientaCompra && herramientasTienda.contexto && responseMsg?.content && !yaConEnlaceDePago && pendientesCliente.some(t => PIDE_COMPRAR.test(t))) {
    try {
      openAiMessages.push({ role: 'assistant', content: responseMsg.content })
      openAiMessages.push({
        role: 'system',
        content: 'REVISIÓN: el cliente quiere comprar y has contestado sin usar enlace_de_compra. Úsala ahora con los productos y cantidades que ha dicho (los nombres tal como los ha dicho). Si de verdad no ha concretado qué quiere, pásale una lista vacía.'
      })
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: [herramientaCompra],
        tool_choice: { type: 'function', function: { name: 'enlace_de_compra' } }
      })
      tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.function?.name === 'enlace_de_compra')
      if (llamada) {
        const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
        const lineas = Array.isArray(args.lineas) ? args.lineas : []
        if (lineas.length) {
          const resultado = await ejecutarHerramientaDeTienda('enlace_de_compra', args, herramientasTienda.contexto)
          openAiMessages.push(r)
          openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
          const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
          tokensInput += final.usage?.prompt_tokens || 0
    tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
          tokensOutput += final.usage?.completion_tokens || 0
          if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
        }
      }
    } catch (err: any) {
      console.error('Revisión del enlace de compra fallida:', err?.message)
    }
  }

  // Red de seguridad: el cliente quiere devolver, cambiar la dirección, dice
  // que le llegó roto o pone una queja, la automatización correspondiente
  // está encendida, y la IA ha contestado sin avisar con detectar_intencion
  // (visto en pruebas: prefería "consultar las políticas y te digo luego").
  // Se le obliga, y con lo que devuelve la herramienta reescribe la respuesta.
  const PIDE_GESTION = /devol|reembols|cambiar (la )?direcci|otra direcci|roto|rota|da[ñn]ad|en mal estado|equivocad|no es lo que (ped|compr)|reclamaci|queja|verg[üu]enza|responsable|denunci|hoja de reclamaciones/i
  const herramientaIntencion = tools.find((t: any) => t.function?.name === 'detectar_intencion')
  if (herramientaIntencion && herramientasTienda.contexto && !intencionEnEstaPasada && responseMsg?.content && pendientesCliente.some(t => PIDE_GESTION.test(t))) {
    try {
      openAiMessages.push({ role: 'assistant', content: responseMsg.content })
      openAiMessages.push({
        role: 'system',
        content: 'REVISIÓN: el cliente está pidiendo una gestión (devolución, cambio de dirección, producto dañado o reclamación) y has contestado sin usar detectar_intencion. Úsala ahora con la intención que corresponda, el número de pedido si lo ha dicho y un resumen de lo que cuenta. Después contesta siguiendo sus instrucciones.'
      })
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: [herramientaIntencion],
        tool_choice: { type: 'function', function: { name: 'detectar_intencion' } }
      })
      tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.function?.name === 'detectar_intencion')
      if (llamada) {
        const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
        const resultado = await ejecutarHerramientaDeTienda('detectar_intencion', args, herramientasTienda.contexto)
        intencionEnEstaPasada = true
        openAiMessages.push(r)
        openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
    tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
      }
    } catch (err: any) {
      console.error('Revisión de la intención fallida:', err?.message)
    }
  }

  // Red de seguridad fuerte de la agenda: el cliente pide cancelar (de forma
  // clara) o cambiar a una hora concreta, o dice "sí" a lo que la IA acababa
  // de proponer, y la IA no lo ha hecho. Se le obliga a usar la herramienta
  // (visto en pruebas: "ahora mismo lo cambio, un segundo" sin llamarla).
  const AFIRMA = /^\s*(s[ií]+|vale|ok|okey|perfecto|claro|de acuerdo|eso es|correcto|adelante|hazlo|c[aá]mbiala|canc[eé]lala)\b/i
  const HORA_EN_TEXTO = /\b\d{1,2}[:.]\d{2}\b|\ba las \d{1,2}\b/i
  const PIDE_CANCELAR = /\bcanc[eé]la(me|la|melo|mela)?\b|an[uú]la(me|la)?\b|quiero cancelar|cancelar (la |mi |esa )?(cita|reserva)|no (voy a )?poder ir.*cancel/i
  const NIEGA_CANCELAR = /\bno (quiero|hace falta|la )?(cancel|anul)/i
  const ultimoDeLaIA = [...allMessages].reverse().find((m: any) => m.remitente === 'ia')?.contenido || ''
  const textoCliente = pendientesCliente.join(' ')
  const ultimoCliente = pendientesCliente[pendientesCliente.length - 1] || ''
  // "¿Me cobráis si cancelo?" es una pregunta sobre las condiciones, no una
  // orden de cancelar: la agenda no tiene que actuar (14-09-2026: la red de
  // la agenda pisaba a la de políticas y contestaba "no tienes ninguna cita").
  const PREGUNTA_CONDICIONES_AGENDA = /cobr[áa]is|cobran|me cobr|penaliz|qu[ée] pasa si|sin coste|gratis|plazo|si no (puedo ir|voy)|si llego tarde/i
  const preguntaCondiciones = PREGUNTA_CONDICIONES_AGENDA.test(textoCliente) && !PIDE_CANCELAR.test(textoCliente)
  const quiereCancelar = !preguntaCondiciones && !NIEGA_CANCELAR.test(textoCliente) && (PIDE_CANCELAR.test(textoCliente) || (/cancel|anul/i.test(ultimoDeLaIA) && AFIRMA.test(ultimoCliente)))
  const quiereCambiar = !quiereCancelar && (
    (/c[aá]mbi|mu[eé]v|pasar(la|me)|otra hora|otro d[ií]a/i.test(textoCliente) && HORA_EN_TEXTO.test(textoCliente))
    || (/c[aá]mbi|mu[eé]v/i.test(ultimoDeLaIA) && AFIRMA.test(ultimoCliente) && HORA_EN_TEXTO.test(`${ultimoDeLaIA} ${ultimoCliente}`))
  )
  if (herramientasAgenda.contexto && !agendaAccionEnEstaPasada && responseMsg?.content && (quiereCancelar || quiereCambiar)) {
    const nombreAccion = quiereCancelar ? 'cancelar_cita' : 'cambiar_cita'
    const herramientaAccion = tools.find((t: any) => t.function?.name === nombreAccion)
    if (herramientaAccion) {
      try {
        openAiMessages.push({ role: 'assistant', content: responseMsg.content })
        openAiMessages.push({
          role: 'system',
          content: `REVISIÓN: el cliente ${quiereCancelar ? 'pide cancelar su cita' : 'pide cambiar su cita a la hora que ha dicho'} y has contestado sin usar ${nombreAccion}. Úsala ahora con lo que sabes${quiereCancelar ? ' (cita_id solo si tiene varias)' : ' (fecha AAAA-MM-DD y hora HH:MM; cita_id solo si tiene varias)'}. Después contesta con lo que devuelva la herramienta, sin prometer nada que no haya confirmado.`
        })
        const revision = await openai.chat.completions.create({
          model: MODELO_IA,
          messages: openAiMessages,
          tools: [herramientaAccion],
          tool_choice: { type: 'function', function: { name: nombreAccion } }
        })
        tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += revision.usage?.completion_tokens || 0
        const r: any = revision.choices[0].message
        const llamada: any = r.tool_calls?.find((t: any) => t.function?.name === nombreAccion)
        if (llamada) {
          const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
          const resultado = await ejecutarHerramientaDeAgenda(nombreAccion, args, herramientasAgenda.contexto)
          agendaEnEstaPasada = true
          agendaAccionEnEstaPasada = true
          openAiMessages.push(r)
          openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
          const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
          tokensInput += final.usage?.prompt_tokens || 0
    tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
          tokensOutput += final.usage?.completion_tokens || 0
          if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
        }
      } catch (err: any) {
        console.error('Revisión fuerte de la agenda fallida:', err?.message)
      }
    }
  }

  // Red de seguridad de la agenda: el cliente habla de reservar, cambiar o
  // cancelar una cita, la agenda está activa y la IA ha contestado sin tocar
  // ninguna herramienta de agenda (los modelos baratos a veces proponen horas
  // de memoria o dicen "te confirmo luego"). Se le pide que lo revise: si ya
  // sabe servicio y día, que llame a ver_huecos; si no, que pregunte lo que
  // falta sin inventar horas.
  const PIDE_AGENDA = /\breserv|\bcita\b|\bcitas\b|\bhueco|disponib|mesa para|hora (tienes|ten[ée]is|hay|me das)|c[oó]geme|ap[uú]nta(me|r)|cancel|cambiar (la |mi )?(cita|reserva|hora)|otro d[ií]a|otra hora/i
  // Pide cancelar o cambiar de forma clara: entonces no basta con haber consultado
  // «¿Me la puedes cambiar a la última hora?» también es pedirlo (medido el
  // 14-09-2026: sin cubrir esa forma la IA miraba huecos y preguntaba
  // «¿te gustaría que lo confirmara?» en vez de cambiarla)
  const PIDE_ACCION_AGENDA = /canc[eé]l|anul|c[aá]mbia(me|la|mela)?\b|cambiar(me|la|mela)? (la |mi |a |para |de )|mu[eé]ve(me|la|mela)?\b|mover(la|me|mela)?\b|pasar(la|me|mela)? a|adel[aá]nt(a|ar)(me|la|mela)?\b|retr[aá]s(a|ar)(me|la|mela)?\b|aplaz|pospon|ap[uú]ntame en la lista/i
  // Y la propia respuesta promete hacerlo "en un momento": eso es justo lo que
  // no puede pasar (nadie lo hará luego)
  // Solo promesas en primera persona: «si deseas proceder con la reserva,
  // dime día y hora» es una oferta, no una promesa (medido el 14-09-2026: la
  // revisión reescribía una respuesta de precio y el precio desaparecía)
  const PROMETE_ACCION = /un momento|un segundo|lo gestiono|procedo a|proceder[ée] a|voy a proceder|voy a reprogramar|reprogramar[ée]|te (la |lo )?reprogramo|ahora mismo|enseguida|en breve|voy a (cancelar|cambiar|mover|reservar|gestionar|apuntar|comprobar|consultar|reprogramar|cambiarla|moverla|cancelarla|reservarla)|te (cambio|reservo|cancelo|apunto|muevo) (la |tu |el |una )?(cita|reserva|hora)/i
  const faltaAgenda = !preguntaCondiciones && (!agendaEnEstaPasada || (!agendaAccionEnEstaPasada && pendientesCliente.some(t => PIDE_ACCION_AGENDA.test(t))))
  const prometeSinHacer = !agendaAccionEnEstaPasada && PROMETE_ACCION.test(responseMsg?.content || '')
  // «¿Me la puedes cambiar a la última hora?» no dice «cita» ni «reserva»:
  // vale con que pida la acción (medido el 14-09-2026: la red no entraba y
  // la IA se quedaba en «¿te la confirmo?»)
  if (herramientasAgenda.contexto && (faltaAgenda || prometeSinHacer) && responseMsg?.content && (prometeSinHacer || pendientesCliente.some(t => PIDE_AGENDA.test(t) || PIDE_ACCION_AGENDA.test(t)))) {
    try {
      // Si pide CAMBIAR, cancelar_cita ni se le ofrece (medido el 14-09-2026:
      // con las dos a mano, a «cámbiamela a la última hora» una vez la
      // canceló y el cliente se quedó sin cita). Y al revés si pide cancelar.
      const pideCambio = !quiereCancelar && pendientesCliente.some(t => /c[aá]mbi|mu[eé]v|mover|pasar(la|me|mela)? a|adel[aá]nt|retr[aá]s|aplaz|pospon/i.test(t))
      const deAgenda = tools.filter((t: any) => {
        const n = t.function?.name
        if (!esHerramientaDeAgenda(n)) return false
        if (quiereCancelar && n === 'cambiar_cita') return false
        if (pideCambio && n === 'cancelar_cita') return false
        return true
      })
      openAiMessages.push({ role: 'assistant', content: responseMsg.content })
      openAiMessages.push({
        role: 'system',
        content: prometeSinHacer
          ? 'REVISIÓN: en tu respuesta dices que lo gestionas "en un momento", pero nadie lo hará luego: o lo haces AHORA con la herramienta que toque (reservar_cita, cambiar_cita, cancelar_cita, apuntar_espera_agenda; con ver_huecos antes si necesitas la hora), o escribes de nuevo tu respuesta completa preguntando el dato que te falta y conservando todo lo demás que decías (precios, datos). Nunca "un momento".'
          : agendaEnEstaPasada
          ? (pideCambio
            ? 'REVISIÓN: el cliente pide claramente CAMBIAR su cita y solo has consultado, sin cambiarla. Llama ahora a cambiar_cita con la hora nueva: una que ver_huecos haya dado libre (si ha dicho "la última" o "la primera", es la última o la primera de esa lista). La cita se mueve, no se cancela: NUNCA uses cancelar_cita para un cambio. La herramienta aplica el plazo y avisa al equipo si no está en plazo. No consultes políticas ni digas que lo mirarás luego. Solo si de verdad te falta un dato, escribe de nuevo tu respuesta completa preguntándolo.'
            : quiereCancelar
            ? 'REVISIÓN: el cliente pide claramente CANCELAR su cita y solo has consultado, sin hacerlo. Llama ahora a cancelar_cita: la herramienta aplica el plazo y avisa al equipo si no está en plazo. No consultes políticas ni digas que lo mirarás luego. Solo si de verdad te falta un dato, escribe de nuevo tu respuesta completa preguntándolo.'
            : 'REVISIÓN: el cliente pide claramente una gestión de su cita (o apuntarse en la lista de espera) y solo has consultado, sin hacerlo. Si sabes qué cita y, en un cambio, a qué hora (una que ver_huecos haya dado libre), llama ahora a la herramienta que toque (cambiar_cita para mover, cancelar_cita para anular, apuntar_espera_agenda para la lista de espera): aplica el plazo y avisa al equipo si no está en plazo. No consultes políticas ni digas que lo mirarás luego. Si de verdad te falta un dato, escribe de nuevo tu respuesta completa preguntándolo.')
          : 'REVISIÓN: el cliente habla de una reserva o cita y has contestado sin usar las herramientas de la agenda. Si ya sabes el servicio y el día, llama ahora a ver_huecos (o a cambiar_cita, cancelar_cita o mis_citas si es eso lo que pide). Si te falta algún dato, escribe de nuevo tu respuesta completa preguntándolo, sin proponer horas de memoria ni decir que confirmarás luego.'
      })
      const revision = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages, tools: deAgenda })
      tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamadas: any[] = (r.tool_calls || []).filter((t: any) => t.type === 'function' && esHerramientaDeAgenda(t.function?.name))
      if (llamadas.length) {
        openAiMessages.push(r)
        for (const llamada of llamadas) {
          const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
          const resultado = await ejecutarHerramientaDeAgenda(llamada.function.name, args, herramientasAgenda.contexto)
          openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        }
        agendaEnEstaPasada = true
        if (llamadas.some((t: any) => ACCIONES_AGENDA.has(t.function?.name))) agendaAccionEnEstaPasada = true
        // Segundo paso con las herramientas a mano: "cámbiamela a la última
        // hora" es mirar huecos Y DESPUÉS cambiar. Con un solo paso se quedaba
        // en "te la cambio a las 19:00, un momento" sin cambiarla.
        let final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages, tools: deAgenda })
        tokensInput += final.usage?.prompt_tokens || 0
        tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        const r2: any = final.choices[0].message
        const llamadas2: any[] = (r2.tool_calls || []).filter((t: any) => t.type === 'function' && esHerramientaDeAgenda(t.function?.name))
        if (llamadas2.length) {
          openAiMessages.push(r2)
          for (const llamada of llamadas2) {
            const args = (() => { try { return JSON.parse(llamada.function.arguments || '{}') } catch { return {} } })()
            const resultado = await ejecutarHerramientaDeAgenda(llamada.function.name, args, herramientasAgenda.contexto)
            openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
          }
          if (llamadas2.some((t: any) => ACCIONES_AGENDA.has(t.function?.name))) agendaAccionEnEstaPasada = true
          final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
          tokensInput += final.usage?.prompt_tokens || 0
          tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
          tokensOutput += final.usage?.completion_tokens || 0
        }
        if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
      } else if (r.content) {
        responseMsg.content = r.content
      }
    } catch (err: any) {
      console.error('Revisión de la agenda fallida:', err?.message)
    }
  }
  if (herramientasAgenda.contexto?.gestion?.caso) escaladoEnEstaPasada = true

  // Red de seguridad de las políticas: el cliente pregunta por CONDICIONES
  // (qué pasa si cancela, si se cobra algo, plazos, devoluciones, pagos) y la
  // IA ha contestado sin consultar las políticas. Medido el 14-09-2026: a "si
  // tengo cita mañana y no puedo ir, ¿me cobráis algo?" miraba la agenda,
  // veía que no había cita y contestaba "no tienes ninguna cita", sin decir
  // nunca la norma de las 24 h. Se le obliga a consultar y a contestar de nuevo.
  const PIDE_CONDICIONES = /cobr[áa]is|cobran|me cobr|penaliz|qu[ée] pasa si|sin coste|gratis|plazo|devolver|devoluci|reembols|garant[íi]a|acept[áa]is|admit[íi]s|puedo (ir|llevar|traer|pagar|cancelar|cambiar|venir)|se puede (cancelar|cambiar|pagar|devolver)|condiciones|pol[íi]tica|retras|llego tarde|si no voy|si no puedo ir/i
  const herramientaPoliticas = tools.find((t: any) => t.function?.name === 'consultar_politicas')
  const miroPoliticas = () => openAiMessages.some((m: any) => m?.role === 'assistant' && (m.tool_calls || []).some((t: any) => t.function?.name === 'consultar_politicas'))
  const pendientesParaPoliticas = allMessages.filter((m: any) => m.remitente === 'cliente' && m.agrupado !== true).map((m: any) => m.contenido || '')
  if (herramientaPoliticas && responseMsg?.content && !miroPoliticas() && pendientesParaPoliticas.some(t => PIDE_CONDICIONES.test(t))) {
    try {
      const consulta = pendientesParaPoliticas.join(' ').slice(0, 400)
      const encontrado = await politicasRelacionadas(consulta, 5)
      if (encontrado) {
        openAiMessages.push({ role: 'assistant', content: responseMsg.content })
        openAiMessages.push({ role: 'system', content: `REVISIÓN: el cliente pregunta por las condiciones del negocio y has contestado sin consultar las políticas. Estas son las normas que aplican:\n${encontrado}\n\nEscribe de nuevo tu respuesta completa contestando a lo que pregunta CON estas normas, con sus plazos y cifras exactos. Si además preguntaba otra cosa (su cita, un precio), mantenlo.` })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
        tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
        // Que quede apuntado que se consultaron (para el registro de herramientas usadas)
        openAiMessages.push({ role: 'assistant', content: null, tool_calls: [{ id: 'politicas_revision', type: 'function', function: { name: 'consultar_politicas', arguments: JSON.stringify({ consulta }) } }] })
        openAiMessages.push({ role: 'tool', tool_call_id: 'politicas_revision', content: encontrado })
      }
    } catch (e: any) {
      console.error('Revisión de políticas fallida:', e?.message)
    }
  }


  // Red de seguridad de las novedades del día: hay un aviso que afecta a lo
  // que pregunta el cliente (un descuento en ese servicio, alguien ausente) y
  // la respuesta no lo menciona. Medido el 14-09-2026: con "10 % en tintes"
  // activo, a "¿cuánto vale el tinte?" contestaba 45 € y se callaba la
  // oferta unas veces sí y otras no. Se le obliga a decirlo.
  if (canUseNovedades && dailyUpdates?.length && responseMsg?.content) {
    try {
      const { contienePalabras, normalizar } = await import('@/lib/ai/comparar-texto')
      const textoPendiente = allMessages.filter((m: any) => m.remitente === 'cliente' && m.agrupado !== true).map((m: any) => m.contenido || '').join(' ')
      const palabrasCliente = normalizar(textoPendiente).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4)
      const relevantes = (dailyUpdates as any[]).filter(u => palabrasCliente.some(w => contienePalabras(u.descripcion || '', w)))
      const respuestaTexto: string = responseMsg.content || ''
      const yaMencionada = (u: any) => {
        // Las palabras que ya usó el cliente ("tinte") salen en cualquier
        // respuesta y no prueban nada: lo que cuenta es el resto del aviso
        // (el "10", "descuento", "semana")
        const claves = normalizar(u.descripcion || '').split(/[^a-z0-9ñ%]+/)
          .filter(w => w.length >= 5 || /^\d+%?$/.test(w))
          .filter(w => !palabrasCliente.some(pc => contienePalabras(w, pc) || contienePalabras(pc, w)))
        const enRespuesta = claves.filter(w => contienePalabras(respuestaTexto, w) || normalizar(respuestaTexto).includes(w))
        return enRespuesta.length >= Math.min(2, claves.length)
      }
      const olvidadas = relevantes.filter(u => !yaMencionada(u))
      if (olvidadas.length) {
        openAiMessages.push({ role: 'assistant', content: responseMsg.content })
        openAiMessages.push({ role: 'system', content: `REVISIÓN: hay avisos de hoy que afectan a lo que pregunta el cliente y no los has mencionado:\n${olvidadas.map((u: any) => `- ${u.descripcion}`).join('\n')}\nEscribe de nuevo tu respuesta completa incluyéndolos de forma natural (si es un descuento, dilo junto al precio; si alguien no está, dilo antes de ofrecer horas con esa persona).` })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
        tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        if (final.choices[0].message.content) responseMsg.content = final.choices[0].message.content
      }
    } catch (e: any) {
      console.error('Revisión de novedades fallida:', e?.message)
    }
  }

  // Un archivo que la IA no puede leer: el caso se abre aquí, en código, con
  // la regla "documento no procesable" si existe. Medido el 14-09-2026: el
  // modelo decía "una persona del equipo lo revisará" y no llamaba a
  // escalar_humano, así que nadie se enteraba.
  if (adjuntoSinLeerEnEstaPasada && !escaladoEnEstaPasada) {
    const reglaDocumento = (rules || []).find((r: any) => /documento|archivo|adjunto|procesable/i.test(`${r.nombre} ${r.tipo_caso} ${r.descripcion_intencion || ''}`))
    const idCaso = await crearCasoDesdeSistema(conversationId, tenantId, branchId, contactId, `[${reglaDocumento?.nombre || 'Archivo sin leer'}] El cliente ha enviado un archivo de tipo ${adjuntoSinLeerEnEstaPasada} que la IA no puede abrir. Hay que revisarlo a mano.`, 'normal', reglaDocumento?.prioridad_default || 'normal')
    if (idCaso) {
      await supabaseAdmin.from('conversations').update({ ia_pausada: true }).eq('id', conversationId)
      escaladoEnEstaPasada = true
    }
  }

  // Si una gestión de la tienda (devolución, cambio de dirección, producto
  // dañado, reclamación) ya ha abierto caso o ha apartado a la IA en esta
  // pasada, el equipo ya lo tiene: la promesa de "una persona lo revisará" es
  // verdad y no hay que escalar otra vez (visto en pruebas: la revisión de
  // abajo volvía a escalar y pausaba la IA en mitad de una devolución, y los
  // siguientes mensajes del cliente se quedaban sin contestar). Y si la IA
  // queda pausada, ha sido ella misma ahora: su despedida tiene que salir.
  const gestionDeTienda = herramientasTienda.contexto?.gestion
  if (gestionDeTienda?.caso || gestionDeTienda?.pausa) escaladoEnEstaPasada = true

  // 10. Guardar respuesta final en messages
  let insertId = null
  let isFallback = false
  let finalContent: string = responseMsg?.content || ''
  
  if (!finalContent) {
    finalContent = 'Dame un momento, estoy revisando tu consulta.'
    isFallback = true
  }

  // Red de seguridad: la IA no puede prometer una persona sin avisar a nadie.
  // La instrucción se lo prohíbe, pero el modelo a veces se la salta (visto en
  // pruebas: "te pongo en contacto con una persona de nuestro equipo" sin usar
  // escalar_humano), y el cliente se queda esperando a alguien que no sabe
  // nada. Si la respuesta PARECE prometerlo y no ha escalado, se le pide que
  // lo revise: o escala de verdad, o reescribe la respuesta sin prometerlo.
  // (Buscar solo frases daría falsos avisos, como "nuestro equipo te atenderá
  // en la tienda"; por eso decide el modelo.)
  // Red de seguridad hermana de la de abajo: el cliente PIDE una persona y la
  // IA no ha escalado. Los modelos más baratos a veces contestan "entiendo tu
  // frustración, ¿en qué puedo ayudarte?" y el equipo no se entera (visto en
  // pruebas con gpt-4.1-mini). Se le pide que lo revise con las reglas de caso
  // delante: o escala con la que encaje, o reescribe su respuesta.
  const pendientesDelCliente = allMessages.filter((m: any) => m.remitente === 'cliente' && m.agrupado !== true).map((m: any) => m.contenido || '')
  // Un daño o una reacción tras un servicio es lo único que NUNCA puede
  // quedarse en un consejo de la IA (medido el 14-09-2026: a "me pica la
  // cabeza y tengo rojeces desde el tinte" contestaba "consulta con un
  // profesional" sin abrir caso). Con una regla que lo cubra, se escala sí o sí.
  const DESCRIBE_DANIO = /alerg|\bpic(a|or|az[oó]n)\b|me pica|quemaz|roje|escoz|irrita|da[ñn]o|dolor|duele|sangr|herid|reacci[oó]n|hinchaz|ampoll|se me cae el pelo|calva|quemad/i
  const cuentaUnDanio = pendientesDelCliente.some(t => DESCRIBE_DANIO.test(t))
  if (!isFallback && canEscalate && !escaladoEnEstaPasada && (clientePidePersona(pendientesDelCliente) || cuentaUnDanio)) {
    openAiMessages.push({ role: 'assistant', content: finalContent })
    openAiMessages.push({
      role: 'system',
      content: cuentaUnDanio && !clientePidePersona(pendientesDelCliente)
        ? 'REVISIÓN: el cliente describe un daño, dolor o reacción tras un servicio y no has invocado escalar_humano: nadie del equipo se ha enterado y esto no puede quedarse en un consejo. Invoca escalar_humano AHORA con la regla que encaje (la de reacciones o daños si existe; si no, la de reclamaciones o la más parecida). Después escribe una respuesta corta: que lo sientes, que una persona del equipo se pondrá en contacto enseguida, sin consejos médicos.'
        : 'REVISIÓN: el cliente pide expresamente hablar con una persona y no has invocado escalar_humano, así que nadie del equipo se ha enterado. Si alguna de las Reglas de Caso encaja, invoca escalar_humano ahora con esa regla. Si ninguna encaja, escribe de nuevo tu respuesta completa.'
    })
    try {
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: tools.filter((t: any) => t.function?.name === 'escalar_humano')
      })
      tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.type === 'function' && t.function?.name === 'escalar_humano')
      if (llamada) {
        const resultado = await escalarConReglaSegura(llamada.function.arguments, 'El cliente ha pedido hablar con una persona.')
        // Y la respuesta al cliente, ya sabiendo que se ha pasado (o no) el caso
        openAiMessages.push(r)
        openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
    tokensCacheados += final.usage?.prompt_tokens_details?.cached_tokens || 0
        tokensOutput += final.usage?.completion_tokens || 0
        if (final.choices[0].message.content) finalContent = final.choices[0].message.content
      } else if (r.content) {
        finalContent = r.content
      }
    } catch (err: any) {
      console.error('Revisión de petición de persona fallida:', err?.message)
    }
    await registrarError({
      origen: 'llm',
      descripcion: escaladoEnEstaPasada
        ? 'El cliente pidió una persona y la IA no escaló; al revisarlo, se ha escalado'
        : 'El cliente pidió una persona y la IA no escaló; al revisarlo, no ha visto regla que encaje',
      stacktrace: JSON.stringify({ conversationId, cliente: pendientesDelCliente.join(' | ').slice(0, 300), respuesta: (finalContent || '').slice(0, 300) }),
      tenant_id: tenantId
    })
  }

  if (!isFallback && !escaladoEnEstaPasada && parecePrometerPersona(finalContent)) {
    const original = finalContent
    openAiMessages.push({ role: 'assistant', content: original })
    openAiMessages.push({
      role: 'system',
      content: canEscalate
        ? 'REVISIÓN: en tu última respuesta le dices al cliente que una persona del equipo le va a atender, pero NO has invocado escalar_humano, así que nadie del equipo se ha enterado. Si de verdad hay que pasar la conversación a una persona, invoca escalar_humano ahora. Si no hace falta, escribe de nuevo tu respuesta completa sin decir que le va a atender una persona.'
        : 'REVISIÓN: en tu última respuesta le dices al cliente que una persona del equipo le va a atender, pero aquí no puedes pasar la conversación a nadie. Escribe de nuevo tu respuesta completa sin prometerlo.'
    })
    try {
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        ...(canEscalate ? { tools: tools.filter((t: any) => t.function?.name === 'escalar_humano') } : {})
      })
      tokensInput += revision.usage?.prompt_tokens || 0
    tokensCacheados += revision.usage?.prompt_tokens_details?.cached_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.type === 'function' && t.function?.name === 'escalar_humano')
      if (llamada) {
        const resultado = await escalarConReglaSegura(llamada.function.arguments, 'La IA le ha dicho al cliente que le atenderá una persona.')
        // Si el caso no se ha podido abrir, la promesa no puede salir. Antes se
        // cambiaba la respuesta entera por una frase fija de chat (en un
        // correo quedaba fatal y se perdía lo útil); ahora la reescribe ella.
        if (!escaladoEnEstaPasada) {
          openAiMessages.push(r as any)
          for (const t of (r.tool_calls || []) as any[]) {
            openAiMessages.push({ role: 'tool', tool_call_id: t.id, content: t.id === llamada.id ? resultado : 'Ignorado.' })
          }
          openAiMessages.push({ role: 'system', content: 'No se ha podido pasar la conversación a una persona. Escribe de nuevo tu respuesta completa al cliente sin decirle que le va a atender una persona.' })
          const otra = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
          tokensInput += otra.usage?.prompt_tokens || 0
    tokensCacheados += otra.usage?.prompt_tokens_details?.cached_tokens || 0
          tokensOutput += otra.usage?.completion_tokens || 0
          const texto = otra.choices[0].message.content || ''
          finalContent = texto && !parecePrometerPersona(texto)
            ? texto
            : 'Ahora mismo no puedo pasarte con una persona del equipo, pero dime en qué te puedo ayudar y lo intento yo.'
        }
      } else if (r.content) {
        finalContent = r.content
      }
    } catch (err: any) {
      // Sin revisión, se cumple la promesa por la vía segura: se escala con la
      // regla de "quiere hablar con un humano" (o la primera que haya).
      const regla = rules?.find(r => r.tipo_caso === 'derivacion_solicitada') || rules?.[0]
      if (canEscalate && regla) {
        await ejecutarEscalado({ rule_id: regla.id, resumen_problema: 'La IA le ha dicho al cliente que le atenderá una persona.' })
      }
    }
    // Para poder vigilar cuántas veces pasa
    await registrarError({
      origen: 'llm',
      descripcion: escaladoEnEstaPasada
        ? 'La IA prometió una persona sin escalar; al revisarlo, se ha escalado'
        : 'La IA prometió una persona sin escalar; al revisarlo, ha reescrito la respuesta',
      stacktrace: JSON.stringify({ conversationId, antes: original.slice(0, 300), despues: finalContent.slice(0, 300) }),
      tenant_id: tenantId
    })
  }

  // ¿Sigue siendo el turno de la IA? Entre leer los mensajes y tener la
  // respuesta pasan varios segundos, y en ese rato una persona puede haber
  // escrito al cliente, pausado la IA o cerrado la conversación. Mandar la
  // respuesta entonces sería hablar encima de esa persona, así que se descarta
  // (y no se cobra: quien llama no descuenta crédito si viene `reason`).
  const { data: estadoActual } = await supabaseAdmin
    .from('conversations')
    .select('estado, ia_pausada')
    .eq('id', conversationId)
    .single()

  if (estadoActual && (estadoActual.estado !== 'activa' || (estadoActual.ia_pausada && !escaladoEnEstaPasada))) {
    await supabaseAdmin.from('ai_logs').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      modelo_ia: MODELO_IA,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      costo_estimado_usd: (tokensInput * PRECIO.input) + (tokensOutput * PRECIO.output),
      resultado: 'pausa',
      contexto_snapshot: { descartada: 'Una persona tomó la conversación mientras la IA preparaba la respuesta' }
    })
    return { success: true, reason: 'Humano_Tomo_El_Control' }
  }

  if (esCorreo) finalContent = limpiarRespuestaEmail(finalContent) || finalContent

  const { data: newMsg, error: errorMsg } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    remitente: 'ia',
    contenido: finalContent,
    agrupado: true
  }).select('id').single()
  
  if (errorMsg) {
    console.error('Error insertando mensaje IA en base de datos:', errorMsg)
  }
  if (newMsg) insertId = newMsg.id

  // Marcar los mensajes origen como agrupados. Solo los que la IA ha leído: si
  // el cliente escribió otra cosa mientras tanto, se queda sin marcar y el
  // cron la recoge en la siguiente pasada.
  const ungroupedIds = ungrouped.map(m => m.id)
  if (ungroupedIds.length > 0) {
    await supabaseAdmin.from('messages').update({ agrupado: true }).in('id', ungroupedIds)
  }

  // La respuesta de la IA también cuenta como actividad. Si no, una
  // conversación que la IA contesta al abrir el negocio (tras un fin de semana
  // esperando) se cerraba por "24 h sin actividad" nada más contestar, porque
  // el reloj seguía contando desde el mensaje del sábado.
  await supabaseAdmin
    .from('conversations')
    .update({ fecha_ultimo_mensaje: new Date().toISOString() })
    .eq('id', conversationId)

  // 11. Registrar Coste
  const costeTotal = (tokensInput * PRECIO.input) + (tokensOutput * PRECIO.output)
  
  const { error: errorLog } = await supabaseAdmin.from('ai_logs').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    message_id: insertId, 
    modelo_ia: MODELO_IA,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    costo_estimado_usd: costeTotal,
    resultado: isFallback ? 'fallo' : 'respondio',
    // Qué herramientas tenía el modelo a mano y cuáles usó: es lo primero que
    // hace falta cuando "la IA no ha hecho X" y hay que saber si podía
    contexto_snapshot: {
      herramientas: tools.map((t: any) => t.function?.name).filter(Boolean),
      usadas: [...new Set(openAiMessages.filter((m: any) => m?.role === 'assistant' && Array.isArray(m.tool_calls)).flatMap((m: any) => m.tool_calls.map((t: any) => t.function?.name)).filter(Boolean))],
      tienda: !!herramientasTienda.contexto,
      agenda: !!herramientasAgenda.contexto,
      // Qué redes de seguridad han saltado en esta pasada (cada una mete un
      // mensaje de sistema que empieza por "REVISIÓN:"). Sin esto no se sabe
      // si una respuesta rara viene del modelo o de una revisión.
      revisiones: openAiMessages
        .filter((m: any) => m?.role === 'system' && typeof m.content === 'string' && m.content.startsWith('REVISIÓN'))
        .map((m: any) => m.content.replace(/^REVISIÓN:\s*/, '').slice(0, 70)),
      // Cuánto del prompt ha venido de la caché (se cobra a mitad de precio).
      // Sirve para comprobar que lo estable va delante y lo variable detrás.
      tokens_cacheados: tokensCacheados
    }
  })
  if (errorLog) console.error('Error insertando ai_log:', errorLog)

  // OJO: aquí NO se descuenta la cuota. Lo hace quien llama a esta función
  // (`/api/ai/process`), y solo si la respuesta salió bien. Antes se descontaba
  // en los dos sitios, así que cada respuesta de la IA gastaba 2 créditos en
  // vez de 1 y los clientes se quedaban sin saldo al doble de velocidad.
  // El descuento de `route.ts` es además el bueno: guarda la sucursal y el
  // origen del movimiento, que este no rellenaba.

  // 12. Enviar la respuesta al cliente por el canal de la sucursal. Antes aquí
  // solo se dejaba una anotación de "simulación" y la respuesta no salía hacia
  // ningún WhatsApp. Si el envío falla, queda apuntado en el propio mensaje
  // (lo ve el agente en Chats) y, si es algo pasajero, se reintenta solo.
  if (insertId) {
    await enviarMensajeSaliente(insertId)
  }

  return { success: true }
}
