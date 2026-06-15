'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a un comercio', user_id: user.id }
  }

  const branchId = await resolveBranchId(supabase, userData.tenant_id, userData.branch_id, userData.rol)
  if (!branchId) return { error: 'Usuario no vinculado a una sucursal', user_id: user.id }

  return { tenant_id: userData.tenant_id, branch_id: branchId, user_id: user.id }
}

export async function getDashboardData(period: 'hoy' | 'semana' | 'mes') {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const now = new Date()
  let days = 0
  let startCurrent: Date
  
  if (period === 'hoy') {
    startCurrent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    days = (now.getTime() - startCurrent.getTime()) / (1000 * 60 * 60 * 24)
  } else if (period === 'semana') {
    days = 7
    startCurrent = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  } else {
    days = 30
    startCurrent = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  }

  // Previous period range
  const startPrev = new Date(startCurrent.getTime() - days * 24 * 60 * 60 * 1000)
  const endPrev = startCurrent

  // Rango máximo a fetchear desde la base de datos (para cubrir periodo anterior)
  const fetchDays = period === 'mes' ? 60 : (period === 'semana' ? 14 : 2)
  const fetchDate = new Date(now.getTime() - fetchDays * 24 * 60 * 60 * 1000)
  const fetchDateIso = fetchDate.toISOString()

  const queries = [
    // 1. comercios
    supabase.from('comercios').select('trial_activo, fecha_vencimiento').eq('id', auth.tenant_id).single(),
    
    // 2. message_quotas
    supabase.from('message_quotas').select('saldo').eq('tenant_id', auth.tenant_id).order('timestamp', { ascending: false }).limit(1).single(),
    
    // 3. cases
    (() => {
      let q = supabase.from('cases').select('fecha_apertura, fecha_cierre, estatus').eq('tenant_id', auth.tenant_id).gte('fecha_apertura', fetchDateIso)
      if (auth.branch_id) q = q.eq('branch_id', auth.branch_id)
      return q
    })(),

    // 4. conversations
    (() => {
      let q = supabase.from('conversations').select('id, estado, fecha_inicio, conversation_tags(created_at, message_categories(nombre))').eq('tenant_id', auth.tenant_id).gte('fecha_inicio', fetchDateIso)
      if (auth.branch_id) q = q.eq('branch_id', auth.branch_id)
      return q
    })(),

    // 5. ai_logs
    (() => {
      let q = supabase.from('ai_logs').select('resultado, timestamp, message_id').eq('tenant_id', auth.tenant_id).gte('timestamp', fetchDateIso)
      if (auth.branch_id) q = q.eq('branch_id', auth.branch_id)
      return q
    })()
  ]

  const [comerciosRes, quotasRes, casesRes, convRes, aiLogsRes] = await Promise.all(queries)

  if (comerciosRes.error) return { success: false, error: comerciosRes.error.message }

  const comercios: any = comerciosRes.data
  const saldo = (quotasRes.data as any)?.saldo || 0
  const cases: any[] = (casesRes.data as any) || []
  const convs: any[] = (convRes.data as any) || []
  const aiLogs: any[] = (aiLogsRes.data as any) || []

  // 6. messages (for AI logs response time)
  let messages: any[] = []
  if (aiLogs.length > 0) {
    const msgRes = await supabase.from('messages').select('id, timestamp').eq('tenant_id', auth.tenant_id).gte('timestamp', fetchDateIso)
    messages = msgRes.data || []
  }

  // Calculos en JS
  const inRange = (dateStr: string | null, start: Date, end: Date) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d >= start && d <= end
  }

  const isCurrent = (d: string | null) => inRange(d, startCurrent, now)
  const isPrev = (d: string | null) => inRange(d, startPrev, endPrev)

  // -- AI Logs --
  let resueltos_ia = 0
  let escalados = 0
  let resueltos_ia_prev = 0
  
  let response_time_sum = 0
  let response_time_count = 0

  aiLogs.forEach((log: any) => {
    if (isCurrent(log.timestamp)) {
      if (log.resultado === 'respondio') resueltos_ia++
      if (log.resultado === 'abrio_caso') escalados++

      if (log.resultado === 'respondio' && log.message_id) {
        const msg = messages.find((m: any) => m.id === log.message_id)
        if (msg) {
          const logTime = new Date(log.timestamp).getTime()
          const msgTime = new Date(msg.timestamp).getTime()
          response_time_sum += (logTime - msgTime) / 1000
          response_time_count++
        }
      }
    } else if (isPrev(log.timestamp)) {
      if (log.resultado === 'respondio') resueltos_ia_prev++
    }
  })

  // -- Casos --
  let casos_abiertos = 0
  let casos_resueltos = 0
  let casos_cierre_min_sum = 0
  let casos_cierre_count = 0

  cases.forEach((c: any) => {
    if (isCurrent(c.fecha_apertura)) {
      if (c.estatus === 'pendiente' || c.estatus === 'atendiendo') casos_abiertos++
      if (c.estatus === 'resuelto' || c.estatus === 'cerrado') {
        casos_resueltos++
        if (c.fecha_cierre) {
          const openTime = new Date(c.fecha_apertura).getTime()
          const closeTime = new Date(c.fecha_cierre).getTime()
          casos_cierre_min_sum += (closeTime - openTime) / (1000 * 60)
          casos_cierre_count++
        }
      }
    }
  })

  // -- Conversaciones y Tags --
  let conversaciones_activas = 0
  let conversaciones_totales = 0
  const tagsCount: Record<string, number> = {}

  convs.forEach((c: any) => {
    if (isCurrent(c.fecha_inicio)) {
      conversaciones_totales++
      if (c.estado === 'activa') conversaciones_activas++

      if (c.conversation_tags) {
        const tags = Array.isArray(c.conversation_tags) ? c.conversation_tags : [c.conversation_tags]
        tags.forEach((t: any) => {
          if (t.message_categories?.nombre) {
            const name = t.message_categories.nombre
            tagsCount[name] = (tagsCount[name] || 0) + 1
          }
        })
      }
    }
  })

  // Evolucion: últimos 7 días
  const evolucion = []
  for (let i = 6; i >= 0; i--) {
    const dStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const dayStart = new Date(Date.UTC(dStart.getUTCFullYear(), dStart.getUTCMonth(), dStart.getUTCDate()))
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    
    let dayResueltos = 0
    aiLogs.forEach((log: any) => {
      if (inRange(log.timestamp, dayStart, dayEnd)) {
        if (log.resultado === 'respondio') dayResueltos++
      }
    })
    evolucion.push({
      fecha: dayStart.toISOString().split('T')[0],
      minutos: dayResueltos * 3
    })
  }

  // Temas frecuentes (Top 5)
  const totalTags = Object.values(tagsCount).reduce((a, b) => a + b, 0)
  const temas_frecuentes = Object.entries(tagsCount)
    .map(([nombre, count]) => ({ nombre, porcentaje: totalTags > 0 ? (count / totalTags) * 100 : 0 }))
    .sort((a, b) => b.porcentaje - a.porcentaje)
    .slice(0, 5)

  // Metricas
  const total_intentos_ia = resueltos_ia + escalados
  const tasa_resolucion = total_intentos_ia > 0 ? (resueltos_ia / total_intentos_ia) * 100 : null
  const tiempo_recuperado_min = resueltos_ia * 3
  const tiempo_recuperado_min_anterior = resueltos_ia_prev * 3
  const tiempo_respuesta_ia_seg = response_time_count > 0 ? response_time_sum / response_time_count : null
  const tiempo_cierre_casos_min = casos_cierre_count > 0 ? casos_cierre_min_sum / casos_cierre_count : null

  let dias_restantes = null
  if (comercios.trial_activo && comercios.fecha_vencimiento) {
    const v = new Date(comercios.fecha_vencimiento)
    dias_restantes = Math.ceil((v.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (dias_restantes < 0) dias_restantes = 0
  }

  return {
    success: true,
    data: {
      trial: {
        activo: comercios.trial_activo,
        dias_restantes
      },
      creditos_disponibles: saldo,
      periodo: {
        mensajes_resueltos_ia: resueltos_ia,
        mensajes_escalados: escalados,
        tasa_resolucion,
        tiempo_recuperado_min,
        tiempo_recuperado_min_anterior,
        tiempo_respuesta_ia_seg,
        tiempo_cierre_casos_min,
        casos_abiertos,
        casos_resueltos,
        conversaciones_activas,
        conversaciones_totales
      },
      evolucion,
      temas_frecuentes
    }
  }
}
