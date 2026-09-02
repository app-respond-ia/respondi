import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { chunkTextRecursive } from '@/lib/utils/chunker'
import OpenAI from 'openai'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-test-placeholder' })
  // 1. AUTENTICACIÓN
  const authHeader = req.headers.get('Authorization')
  const secret = process.env.CRON_INTERNAL_SECRET

  if (!secret || !authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  
  try {
    const isMatch = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
    if (!isMatch) throw new Error()
  } catch (e) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. PARSEO DE BODY
  let sourceId: string
  try {
    const body = await req.json()
    sourceId = body.sourceId
    if (!sourceId) throw new Error()
  } catch (e) {
    return NextResponse.json({ error: 'sourceId es requerido' }, { status: 400 })
  }

  // Obtenemos la fuente
  const { data: source, error: fetchError } = await supabaseAdmin
    .from('policy_sources')
    .select('*')
    .eq('id', sourceId)
    .single()

  if (fetchError || !source) {
    return NextResponse.json({ error: 'Source no encontrado' }, { status: 404 })
  }

  // Solo procesar si está en estado procesando
  if (source.estado !== 'procesando') {
    return NextResponse.json({ error: 'Source no está en estado procesando' }, { status: 400 })
  }

  try {
    // 3. IDEMPOTENCIA: Borrar fragmentos previos (por si es un reintento)
    await supabaseAdmin
      .from('policy_fragments')
      .delete()
      .eq('source_id', sourceId)

    // 4. EXTRACCIÓN DE TEXTO
    let textToProcess = ''

    if (source.tipo_origen === 'texto_manual') {
      textToProcess = source.texto_manual || ''
    } else if (source.tipo_origen === 'archivo' && source.ruta_archivo) {
      // Descargar archivo de Supabase Storage
      const { data: fileData, error: downloadError } = await supabaseAdmin
        .storage
        .from('policy_documents')
        .download(source.ruta_archivo)

      if (downloadError || !fileData) {
        throw new Error('No se pudo descargar el archivo de Storage')
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const extension = source.ruta_archivo.split('.').pop()?.toLowerCase()

      if (extension === 'pdf') {
        const pdfParse = require('pdf-parse')
        const pdfData = await pdfParse(buffer)
        textToProcess = pdfData.text
      } else if (extension === 'docx') {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        textToProcess = result.value
      } else {
        throw new Error(`Extensión de archivo no soportada: ${extension}`)
      }
    } else {
      throw new Error('Tipo de origen desconocido o ruta inválida')
    }

    if (!textToProcess || textToProcess.trim() === '') {
      throw new Error('El documento no contiene texto extraíble')
    }

    // 5. TROCEADO
    const chunks = chunkTextRecursive(textToProcess)

    if (chunks.length === 0) {
      throw new Error('No se generaron fragmentos válidos tras procesar el texto')
    }

    // 6. GENERACIÓN DE EMBEDDINGS (por lotes paralelos para no agotar maxDuration)
    const batchSize = 10
    const embeddingsData: any[] = []
    
    const batches = []
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push({
        chunks: chunks.slice(i, i + batchSize),
        startIndex: i
      })
    }

    // Paralelismo acotado: máximo 3 peticiones simultáneas
    const MAX_CONCURRENT = 3
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
      const currentBatches = batches.slice(i, i + MAX_CONCURRENT)
      
      await Promise.all(currentBatches.map(async (batch) => {
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch.chunks,
        })

        batch.chunks.forEach((chunk, index) => {
          embeddingsData.push({
            tenant_id: source.tenant_id,
            branch_id: source.branch_id,
            source_id: sourceId,
            contenido: chunk,
            embedding: embeddingResponse.data[index].embedding,
            posicion_orden: batch.startIndex + index
          })
        })
      }))
    }

    // 7. GUARDAR FRAGMENTOS EN BD
    const { error: insertError } = await supabaseAdmin
      .from('policy_fragments')
      .insert(embeddingsData)

    if (insertError) throw insertError

    // 8. MARCAR COMO COMPLETADO
    await supabaseAdmin
      .from('policy_sources')
      .update({ estado: 'completado' })
      .eq('id', sourceId)

  } catch (error: any) {
    console.error(`Error procesando policy ${sourceId}:`, error)
    
    // Incrementar intentos y marcar error si llega a 3
    const nuevosIntentos = (source.intentos_fallidos || 0) + 1
    const nuevoEstado = nuevosIntentos >= 3 ? 'error' : 'procesando'
    
    await supabaseAdmin
      .from('policy_sources')
      .update({
        intentos_fallidos: nuevosIntentos,
        estado: nuevoEstado,
        error_msg: error.message || 'Error desconocido'
      })
      .eq('id', sourceId)
      
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  } finally {
    // 9. LIBERAR CANDADO
    await supabaseAdmin
      .from('policy_sources')
      .update({ procesando_desde: null })
      .eq('id', sourceId)
  }

  return NextResponse.json({ success: true })
}
