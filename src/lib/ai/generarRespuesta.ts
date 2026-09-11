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
  let systemPrompt = `Eres el asistente virtual del negocio.\n`
  if (esCorreo) systemPrompt += instruccionesEmail()
  if (profile) {
    if (profile.tono) {
      systemPrompt += `Tono: ${profile.tono}\n`
    }
    
    if (profile.servicios) {
      let infoLimpia = profile.servicios;
      if (infoLimpia.length > 500) {
        const cutPoint = infoLimpia.substring(0, 500).lastIndexOf(' ');
        infoLimpia = infoLimpia.substring(0, cutPoint > 0 ? cutPoint : 500) + '...';
      }
      systemPrompt += `Información del negocio: ${infoLimpia}\n`
    }
  }

  // --- CONTEXTO ESPECÍFICO DEL CLIENTE ---
  let contextAdded = false;
  
  // La nota es la que ha puesto ESTA tienda (`contactos_sucursal`); la de otra
  // tienda no se comparte. La trae /api/ai/process en `ficha_contacto`.
  if (conv.ficha_contacto?.nota) {
    if (!contextAdded) { systemPrompt += `\n--- CONTEXTO ESPECÍFICO DEL CLIENTE ---\n`; contextAdded = true; }
    let notaLimpia = conv.ficha_contacto.nota;
    if (notaLimpia.length > 300) {
      const cutPoint = notaLimpia.substring(0, 300).lastIndexOf(' ');
      notaLimpia = notaLimpia.substring(0, cutPoint > 0 ? cutPoint : 300) + '...';
    }
    systemPrompt += `Nota interna sobre este cliente:\n${notaLimpia}\n\n`;
  }

  if (pastConvs && pastConvs.length > 0) {
    if (!contextAdded) { systemPrompt += `\n--- CONTEXTO ESPECÍFICO DEL CLIENTE ---\n`; contextAdded = true; }
    systemPrompt += `Historial reciente de conversaciones CERRADAS con este mismo cliente (para tener contexto, NO respondas a esto, es solo informativo):\n`;
    pastConvs.forEach(c => {
      const fechaCierre = new Date(c.fecha_cierre).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      systemPrompt += `- [${fechaCierre}]: ${c.resumen}\n`;
    });
    systemPrompt += `\n`;
  }

  // --- NOVEDADES DEL DÍA ---
  if (dailyUpdates && dailyUpdates.length > 0) {
    systemPrompt += `\n--- NOVEDADES Y AVISOS ACTIVOS HOY ---\n`;
    systemPrompt += `Ten en cuenta esta información temporal al responder:\n`;
    dailyUpdates.forEach((u: any) => {
      const tipo = u.tipos_novedad?.nombre || 'Aviso';
      systemPrompt += `- [${tipo}]: ${u.descripcion}\n`;
    });
    systemPrompt += `\n`;
  }

  // El idioma sale de dos ajustes que hasta ahora no hacía nada ninguno: la
  // skill "Idioma multi" no se consultaba en el motor, y `idioma_base` se
  // configuraba en Perfil de sucursal, se guardaba en la base y nadie la leía.
  const NOMBRE_IDIOMA: Record<string, string> = {
    es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés',
    it: 'italiano', de: 'alemán', ca: 'catalán', gl: 'gallego', eu: 'euskera'
  }
  const idiomaBase = NOMBRE_IDIOMA[profile?.idioma_base || 'es'] || profile?.idioma_base || 'español'

  systemPrompt += `\nINSTRUCCIONES ESTRICTAS:\n`
  if (activeSkills.has('idioma_multi')) {
    systemPrompt += `- Responde SIEMPRE en el mismo idioma en el que el cliente te escribe, sea cual sea, sin excepción. Si no queda claro en qué idioma escribe, responde en ${idiomaBase}.\n`
  } else {
    systemPrompt += `- Responde SIEMPRE en ${idiomaBase}, aunque el cliente te escriba en otro idioma.\n`
  }
  systemPrompt += `- No inventes información. Si no lo sabes, indícalo${canEscalate ? ' o usa escalar_humano' : ''}.\n`
  if (activeSkills.has('consultar_politicas')) {
    // Los modelos pequeños contestaban de memoria ("puedes venir con tu perro,
    // tenemos patio") en vez de mirar la norma del negocio
    systemPrompt += `- Antes de responder sobre condiciones o sobre qué se permite (devoluciones, envíos, reservas, pagos, mascotas, normas del local...), consulta SIEMPRE las políticas con consultar_politicas. No supongas nada.\n`
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

  // 5. Preparar Mensajes para OpenAI
  const openAiMessages: any[] = [{ role: 'system', content: systemPrompt }]
  let hasImage = false

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
        
        const transcription = await openai.audio.transcriptions.create({
          file: file,
          model: 'whisper-1'
        })
        
        const textoExtraido = transcription.text
        await supabaseAdmin.from('messages').update({ contenido: textoExtraido }).eq('id', m.id)
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
      openAiMessages.push({
        role,
        content: `[El cliente ha enviado un archivo adjunto de tipo ${m.media_tipo} que no puedes abrir ni leer. Dile que lo has recibido pero que no puedes procesarlo, y deriva el caso a una persona.]${m.contenido ? ` Texto que lo acompaña: ${m.contenido}` : ''}`
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
            category_id: { type: "string", description: "UUID de la categoría elegida (debe existir en la lista provista)." }
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
            rule_id: { type: "string", description: "UUID de la regla de escalado (debe existir en la lista provista)." },
            resumen_problema: { type: "string", description: "Breve explicación de por qué se escala el caso." }
          },
          required: ["rule_id", "resumen_problema"]
        }
      }
    })
  }

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

  // Poner una etiqueta a la conversación (la llama la herramienta y, si la IA
  // se la salta, el etiquetado obligatorio de más abajo)
  let etiquetadoEnEstaPasada = false
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
    return toolResult
  }

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
        
        toolResult = formatted
      }
      else if (toolCall.function.name === 'etiquetar_conversacion') {
        toolResult = await aplicarEtiqueta(args.category_id)
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
          productos = productos
            .filter(p => enNombre(p) || normalizar(p.descripcion || '').includes(b) || contienePalabras(`${p.nombre} ${p.descripcion || ''}`, args.busqueda))
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
      }
      else if (toolCall.function.name === 'consultar_politicas') {
        try {
          // Generar embedding de la consulta
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: args.consulta,
          })
          const queryEmbedding = embeddingResponse.data[0].embedding

          // Llamar a RPC
          const { data: fragmentos, error } = await supabaseAdmin.rpc('match_fragmentos_politicas', {
            query_embedding: queryEmbedding,
            match_branch_id: branchId,
            match_limit: 5
          })

          if (error) {
            console.error("Error consultando políticas:", error)
            toolResult = "Error interno al consultar las políticas."
          } else if (!fragmentos || fragmentos.length === 0) {
            toolResult = "No se encontró información relevante en las políticas del negocio para esta consulta."
          } else {
            toolResult = "Fragmentos de políticas relevantes encontrados:\n"
            for (const f of fragmentos) {
              toolResult += `\n- ${f.contenido}`
            }
          }
        } catch (err) {
          console.error("Error procesando embedding para políticas:", err)
          toolResult = "Error interno procesando la consulta."
        }
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
  if (!isFallback && canEscalate && !escaladoEnEstaPasada && clientePidePersona(pendientesDelCliente)) {
    openAiMessages.push({ role: 'assistant', content: finalContent })
    openAiMessages.push({
      role: 'system',
      content: 'REVISIÓN: el cliente pide expresamente hablar con una persona y no has invocado escalar_humano, así que nadie del equipo se ha enterado. Si alguna de las Reglas de Caso encaja, invoca escalar_humano ahora con esa regla. Si ninguna encaja, escribe de nuevo tu respuesta completa.'
    })
    try {
      const revision = await openai.chat.completions.create({
        model: MODELO_IA,
        messages: openAiMessages,
        tools: tools.filter((t: any) => t.function?.name === 'escalar_humano')
      })
      tokensInput += revision.usage?.prompt_tokens || 0
      tokensOutput += revision.usage?.completion_tokens || 0
      const r: any = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.type === 'function' && t.function?.name === 'escalar_humano')
      if (llamada) {
        const resultado = await ejecutarEscalado(JSON.parse(llamada.function.arguments))
        // Y la respuesta al cliente, ya sabiendo que se ha pasado (o no) el caso
        openAiMessages.push(r)
        openAiMessages.push({ role: 'tool', tool_call_id: llamada.id, content: resultado })
        const final = await openai.chat.completions.create({ model: MODELO_IA, messages: openAiMessages })
        tokensInput += final.usage?.prompt_tokens || 0
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
      tokensOutput += revision.usage?.completion_tokens || 0
      const r = revision.choices[0].message
      const llamada: any = r.tool_calls?.find((t: any) => t.type === 'function' && t.function?.name === 'escalar_humano')
      if (llamada) {
        await ejecutarEscalado(JSON.parse(llamada.function.arguments))
        // Si el caso no se ha podido abrir, la promesa no puede salir
        if (!escaladoEnEstaPasada) finalContent = 'Ahora mismo no puedo pasarte con una persona del equipo, pero dime en qué te puedo ayudar y lo intento yo.'
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
    resultado: isFallback ? 'fallo' : 'respondio'
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
