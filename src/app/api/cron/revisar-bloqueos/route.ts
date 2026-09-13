import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { isFueraDeHorario } from '@/lib/horarios'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
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

  // 2. BUSCAR CONVERSACIONES BLOQUEADAS TEMPORALMENTE
  const { data: bloqueadas, error: fetchError } = await supabaseAdmin
    .from('conversations')
    .select(`
      id, tenant_id, branch_id, motivo_bloqueo,
      sucursales:branch_id (
        modo_pausa, timezone,
        business_profiles (modo_horario_ia),
        business_hours (dia_semana, apertura, cierre, cerrado, tipo)
      )
    `)
    .in('motivo_bloqueo', ['fuera_horario', 'sucursal_apagada', 'sin_cuota'])
    .eq('estado', 'activa')

  if (fetchError) {
    return NextResponse.json({ error: 'Error fetching', details: fetchError }, { status: 500 })
  }

  if (!bloqueadas || bloqueadas.length === 0) {
    return NextResponse.json({ status: 'Sin conversaciones bloqueadas' })
  }

  let procesadas = 0

  for (const conv of bloqueadas) {
    try {
      const branch = Array.isArray(conv.sucursales) ? conv.sucursales[0] : conv.sucursales
      let desbloquear = false

      if (conv.motivo_bloqueo === 'sucursal_apagada') {
        if (branch && branch.modo_pausa !== 'apagada') {
          desbloquear = true
        }
      } 
      else if (conv.motivo_bloqueo === 'fuera_horario') {
        const profile = Array.isArray(branch?.business_profiles) ? branch?.business_profiles[0] : branch?.business_profiles
        const hours = branch?.business_hours || []
        
        if (branch && profile) {
          const modo = profile.modo_horario_ia || 'mismo_negocio'
          if (modo === 'siempre_activa') {
            desbloquear = true
          } else {
            const targetTipo = modo === 'personalizado' ? 'ia' : 'negocio'
            const horasAFiltrar = hours.filter((h: any) => h.tipo === targetTipo)
            
            if (!isFueraDeHorario(branch.timezone, horasAFiltrar)) {
              desbloquear = true
            }
          }
        }
      }
      else if (conv.motivo_bloqueo === 'sin_cuota') {
        const { data: quota } = await supabaseAdmin
          .from('message_quotas')
          .select('saldo')
          .eq('tenant_id', conv.tenant_id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single()

        const saldo = quota?.saldo || 0
        if (saldo > 0) {
          desbloquear = true
        }
      }

      if (desbloquear) {
        // Se quita el bloqueo y ya está: NO se pone candado ni se llama a la
        // IA desde aquí.
        //
        // Antes esta ruta se encargaba ella misma de disparar /api/ai/process
        // dentro de un `after()`. El problema (visto el 14-09-2026): en Vercel
        // la conexión no se cierra hasta que termina el `after()`, y ese
        // `after()` esperaba a una respuesta de la IA, que tarda. Resultado:
        // pg_net se quedaba colgado los 60 s enteros y daba la llamada por
        // perdida (1-3 veces por hora, siempre en los múltiplos de 5 minutos,
        // que es cuando corre este cron).
        //
        // Como `disparar_webhook_ia()` pasa cada 20 segundos y coge cualquier
        // conversación con `motivo_bloqueo IS NULL` que tenga algo sin
        // contestar, basta con desbloquear: la recoge él, con su propio
        // candado, y no hay dos sitios llamando a la IA.
        const { error: updateError } = await supabaseAdmin
          .from('conversations')
          .update({ motivo_bloqueo: null, bloqueada_desde: null })
          .eq('id', conv.id)

        if (!updateError) procesadas++
      }
    } catch (err) {
      console.error(`Error procesando conversación bloqueada ${conv.id}:`, err)
      // Continuamos con el resto del lote gracias al try/catch
    }
  }

  return NextResponse.json({ status: `Revisión completada. ${procesadas} desbloqueadas.` })
}
