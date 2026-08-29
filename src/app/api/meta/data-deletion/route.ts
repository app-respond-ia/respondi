import { NextRequest, NextResponse } from 'next/server'
import { parseSignedRequest } from '@/lib/meta-crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    let signedRequest = null

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData()
      signedRequest = formData.get('signed_request') as string
    } else {
      const json = await req.json().catch(() => ({}))
      signedRequest = json.signed_request
    }

    if (!signedRequest) {
      return NextResponse.json({ error: 'Falta signed_request' }, { status: 400 })
    }

    const secret = process.env.META_APP_SECRET
    if (!secret) {
      console.error('La variable META_APP_SECRET no está configurada')
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 })
    }

    const data = parseSignedRequest(signedRequest, secret)
    if (!data || !data.user_id) {
      return NextResponse.json({ error: 'Firma inválida o payload mal formado' }, { status: 400 })
    }

    const userId = data.user_id

    // Lógica de borrado: 
    // 1. Buscamos y actualizamos todos los canales asociados a este meta_user_id
    // 2. Desconectamos los canales (estado = 'desconectado')
    // 3. Borramos el rastro limpiando la columna meta_user_id
    // NO se borran mensajes, conversaciones, ni contactos, porque pertenecen a la organización.
    const { error: updateError } = await supabaseAdmin
      .from('channels')
      .update({
        estado: 'desconectado',
        meta_user_id: null
      })
      .eq('meta_user_id', userId)

    if (updateError) {
      console.error('Error al actualizar canales:', updateError)
      return NextResponse.json({ error: 'Error procesando borrado en DB' }, { status: 500 })
    }

    // URL donde el usuario puede comprobar el estado del borrado (Meta exige enviarla)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.app'
    const statusUrl = `${baseUrl}/meta-deletion-status?id=${userId}`
    
    // Generar un código de confirmación (Meta exige enviarlo)
    const confirmationCode = `${userId}-${Date.now().toString(36)}`

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode
    })

  } catch (err: any) {
    console.error('Error procesando data-deletion webhook:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
