import OpenAI from 'openai'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { crearCasoDesdeSistema } from '@/lib/casos/crearCasoDesdeSistema'
import { registrarAuditoria } from '@/lib/auditoria'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-placeholder'
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const PRICING = {
  input: 0.20 / 1000000,
  output: 1.20 / 1000000
}

export async function generarRespuesta(conv: any) {
  const conversationId = conv.id
  const tenantId = conv.tenant_id
  const branchId = conv.branch_id
  const contactId = conv.contact_id
  
  const branch = Array.isArray(conv.sucursales) ? conv.sucursales[0] : conv.sucursales
  const profile = Array.isArray(branch?.business_profiles) ? branch?.business_profiles[0] : branch?.business_profiles

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

  // 3.6. Contexto CRM (Historial y Novedades)
  const { data: pastConvs } = await supabaseAdmin
    .from('conversations')
    .select('id, fecha_cierre, resumen')
    .eq('contact_id', contactId)
    .eq('estado', 'cerrada')
    .neq('id', conversationId)
    .not('resumen', 'is', null)
    .order('fecha_cierre', { ascending: false })
    .limit(5)

  const { data: dailyUpdates } = await supabaseAdmin
    .from('daily_updates')
    .select('*, tipos_novedad:tipo_id(nombre)')
    .eq('branch_id', branchId)
    .eq('activo', true)
    .lte('fecha_vigencia_inicio', new Date().toISOString())
    .or(`fecha_vigencia_fin.is.null,fecha_vigencia_fin.gte.${new Date().toISOString()}`)

  // 4. Preparar Prompt del Sistema
  let systemPrompt = `Eres el asistente virtual del negocio.\n`
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
  
  if (conv.contacts?.nota) {
    if (!contextAdded) { systemPrompt += `\n--- CONTEXTO ESPECÍFICO DEL CLIENTE ---\n`; contextAdded = true; }
    let notaLimpia = conv.contacts.nota;
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

  systemPrompt += `\nINSTRUCCIONES ESTRICTAS:\n`
  systemPrompt += `- Responde SIEMPRE en el mismo idioma en el que el cliente te escribe, sea cual sea, sin excepción.\n`
  systemPrompt += `- No inventes información. Si no lo sabes, indícalo${canEscalate ? ' o usa escalar_humano' : ''}.\n`
  systemPrompt += `- Eres un asistente, responde de manera concisa y natural.\n`
  if (canEscalate) {
    systemPrompt += `- Si el usuario envía un archivo no soportado (ej. PDF o Word), invoca escalar_humano.\n`
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
      systemPrompt += `\nNota: La categoría '${fallbackName}' es la opción de respaldo y SOLO debe usarse cuando ninguna de las otras encaja claramente.\n`
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
    if (m.media_tipo === 'image') {
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
    } else if (m.media_tipo === 'audio' && m.agrupado === false && m.media_url) {
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
        console.error(`Error transcribiendo audio (ID: ${m.id}):`, err)
        openAiMessages.push({ role, content: '[Nota: Audio ininteligible o fallo en transcripción]' })
      }
    } else {
      openAiMessages.push({ role, content: m.contenido || '' })
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

  if (activeSkills.has('consultar_politicas')) {
    tools.push({
      type: "function" as const,
      function: {
        name: "consultar_politicas",
        description: "Consulta las políticas, normas o reglas del negocio. Úsala cuando el cliente pregunte por condiciones, devoluciones, garantías o políticas internas.",
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

  let tokensInput = 0
  let tokensOutput = 0

  // 7. Llamada a OpenAI (Paso 1)
  let responseMsg
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.6-luna',
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
      modelo_ia: 'gpt-5.6-luna',
      resultado: 'fallo',
      contexto_snapshot: { step: 1, error: error?.message || 'OpenAI API Error' }
    })
    return { success: false, error: 'OpenAI API Error' }
  }

  openAiMessages.push(responseMsg)

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
        const targetCategory = categories?.find(c => c.id === args.category_id)
        
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
              category_id: args.category_id,
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
      } 
      else if (toolCall.function.name === 'escalar_humano') {
        const rule = rules?.find(r => r.id === args.rule_id)
        if (!rule) {
          toolResult = 'Error: rule_id no válido para esta sucursal.'
        } else {
          await crearCasoDesdeSistema(
            conversationId,
            tenantId,
            branchId,
            contactId,
            args.resumen_problema,
            rule.tipo_caso,
            rule.prioridad_default
          )
          const { error } = await supabaseAdmin.from('conversations').update({ ia_pausada: true }).eq('id', conversationId)
          if (error) {
            console.error('Error pausando IA al escalar:', error)
          }
          toolResult = 'Caso escalado a humano y respuestas automáticas pausadas.'
        }
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
        let query = supabaseAdmin.from('price_list').select(`
          id, nombre, tipo, precio, precio_tipo, moneda, descripcion,
          categorias_precios (id, nombre, parent_id)
        `).eq('branch_id', branchId).eq('visible_ia', true).eq('disponible', true)
        
        if (args.busqueda) {
          query = query.or(`nombre.ilike.%${args.busqueda}%,descripcion.ilike.%${args.busqueda}%`)
        }
        
        if (args.categoria) {
          const { data: cats } = await supabaseAdmin.from('categorias_precios')
            .select('id, parent_id')
            .eq('branch_id', branchId)
            .ilike('nombre', `%${args.categoria}%`)
            
          if (cats && cats.length > 0) {
            const catIds = new Set<string>()
            for (const c of cats) {
              catIds.add(c.id)
              if (!c.parent_id) {
                const { data: subs } = await supabaseAdmin.from('categorias_precios')
                  .select('id')
                  .eq('branch_id', branchId)
                  .eq('parent_id', c.id)
                if (subs) subs.forEach(s => catIds.add(s.id))
              }
            }
            query = query.in('categoria_id', Array.from(catIds))
          } else {
             query = query.eq('categoria_id', '00000000-0000-0000-0000-000000000000') 
          }
        }
        
        if (args.etiquetas && args.etiquetas.length > 0) {
          query = query.overlaps('etiquetas', args.etiquetas)
        }
        
        if (args.precio_maximo !== undefined) {
          query = query.lte('precio', args.precio_maximo)
        }
        
        query = query.limit(15)
        
        const { data: productos, error } = await query
        
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
        model: 'gpt-5.6-luna',
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
        modelo_ia: 'gpt-5.6-luna',
        resultado: 'fallo',
        contexto_snapshot: { step: 2, error: error?.message || 'OpenAI API Error Step 2' }
      })
      return { success: false, error: 'OpenAI API Error Step 2' }
    }
  }

  // 10. Guardar respuesta final en messages
  let insertId = null
  let isFallback = false
  let finalContent = responseMsg?.content
  
  if (!finalContent) {
    finalContent = 'Dame un momento, estoy revisando tu consulta.'
    isFallback = true
  }

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

  // Marcar los mensajes origen como agrupados
  const ungroupedIds = ungrouped.map(m => m.id)
  if (ungroupedIds.length > 0) {
    await supabaseAdmin.from('messages').update({ agrupado: true }).in('id', ungroupedIds)
  }

  // 11. Registrar Coste
  const costeTotal = (tokensInput * PRICING.input) + (tokensOutput * PRICING.output)
  
  const { error: errorLog } = await supabaseAdmin.from('ai_logs').insert({
    tenant_id: tenantId,
    branch_id: branchId,
    message_id: insertId, 
    modelo_ia: 'gpt-5.6-luna',
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    costo_estimado_usd: costeTotal,
    resultado: isFallback ? 'fallo' : 'respondio'
  })
  if (errorLog) console.error('Error insertando ai_log:', errorLog)

  // Descontar cuota IA (1 unidad)
  const { error: errorRpc } = await supabaseAdmin.rpc('descontar_cuota_ia', {
    p_tenant_id: tenantId,
    p_cantidad: 1,
    p_descripcion: 'consumo por agrupacion de mensajes'
  })
  if (errorRpc) console.error('Error al descontar cuota:', errorRpc)

  // 12. Simular N8N webhook
  if (finalContent) {
    await registrarAuditoria({
      tenant_id: tenantId,
      user_id: null,
      accion: 'SIMULACION_N8N_WEBHOOK',
      tabla_afectada: 'messages',
      registro_id: insertId || conversationId,
      valor_nuevo: {
        event: 'message.sent',
        conversation_id: conversationId,
        content: finalContent
      }
    })
  }

  return { success: true }
}
