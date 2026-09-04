import { NextResponse } from 'next/server'
import { after } from 'next/server'
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
        // ACTUALIZACIÓN DE LIBERACIÓN + CANDADO EN LA MISMA OPERACIÓN
        const { error: updateError } = await supabaseAdmin
          .from('conversations')
          .update({ 
            motivo_bloqueo: null, 
            bloqueada_desde: null, 
            ia_procesando_desde: new Date().toISOString() // Candado para evitar choque con cron principal
          })
          .eq('id', conv.id)

        if (!updateError) {
          // DISPARAR EL WEBHOOK EN SEGUNDO PLANO
          after(() => {
            fetch(`https://respondi.vercel.app/api/ai/process`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secret}`
              },
              body: JSON.stringify({ conversation_id: conv.id })
            }).catch(err => console.error('Error triggering webhook for', conv.id, err))
          })
          
          procesadas++
        }
      }
    } catch (err) {
      console.error(`Error procesando conversación bloqueada ${conv.id}:`, err)
      // Continuamos con el resto del lote gracias al try/catch
    }
  }

  return NextResponse.json({ status: `Revisión completada. ${procesadas} desbloqueadas.` })
}
