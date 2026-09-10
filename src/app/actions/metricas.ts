'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { getAuthContext } from '@/lib/auth-context'

export async function getMetricas(periodo: 'hoy' | 'semana' | 'mes' | 'total' = 'mes') {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = auth.branch_id
  const userData = { tenant_id: auth.tenant_id }

  const now = new Date()
  let desde: string
  if (periodo === 'hoy') {
    desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  } else if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 7); desde = d.toISOString()
  } else if (periodo === 'mes') {
    desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  } else {
    desde = '2000-01-01T00:00:00.000Z'
  }

  // ── CONVERSACIONES ──────────────────────────────────────────
  // OJO: esta pantalla estaba escrita contra un esquema que no existe
  // (`status`, `created_at`, `updated_at`, `channel_id`, `channels(tipo)`...).
  // Todas las consultas fallaban y, como el error se descartaba, la pantalla
  // enseñaba ceros como si fueran datos reales. Los nombres correctos son
  // `estado`, `fecha_inicio`, `fecha_cierre` y `canal`.
  const { data: convs, error: errConvs } = await supabase
    .from('conversations')
    .select('id, estado, canal, fecha_inicio, fecha_cierre')
    .eq('branch_id', branchId)
    .gte('fecha_inicio', desde)

  if (errConvs) return { success: false, error: errConvs.message }

  const totalConvs = convs?.length || 0
  const convsActivas = convs?.filter(c => c.estado === 'activa').length || 0
  const convsCerradas = convs?.filter(c => c.estado === 'cerrada').length || 0
  const tasaCierre = totalConvs > 0 ? Math.round((convsCerradas / totalConvs) * 100) : 0

  const porCanal: Record<string, number> = {}
  convs?.forEach(c => {
    const tipo = c.canal || 'desconocido'
    porCanal[tipo] = (porCanal[tipo] || 0) + 1
  })

  // Duración media de las conversaciones ya cerradas, en minutos
  const cerradas = convs?.filter(c => c.estado === 'cerrada' && c.fecha_cierre) || []
  const duracionMedia = cerradas.length > 0
    ? Math.round(cerradas.reduce((acc, c) => {
        const dur = new Date(c.fecha_cierre).getTime() - new Date(c.fecha_inicio).getTime()
        return acc + (isNaN(dur) || dur < 0 ? 0 : dur)
      }, 0) / cerradas.length / 60000)
    : 0

  // Hora pico
  const porHora: Record<number, number> = {}
  for (let i = 0; i < 24; i++) porHora[i] = 0
  convs?.forEach(c => {
    const h = new Date(c.fecha_inicio).getHours()
    porHora[h] = (porHora[h] || 0) + 1
  })
  const horaPico = Object.entries(porHora).sort((a, b) => b[1] - a[1])[0]?.[0] || '0'

  // ── MENSAJES ─────────────────────────────────────────────────
  // `messages` no tiene `branch_id`: se filtra por las conversaciones de esta
  // sucursal. Y las columnas son `remitente` ('cliente'|'ia'|'agente') y
  // `timestamp`, no `role` ni `created_at`.
  const { data: idsConvSucursal } = await supabase
    .from('conversations')
    .select('id')
    .eq('branch_id', branchId)

  const idsConv = (idsConvSucursal || []).map(c => c.id)

  const { data: msgs } = idsConv.length
    ? await supabase
        .from('messages')
        .select('id, remitente, timestamp, conversation_id')
        .in('conversation_id', idsConv)
        .gte('timestamp', desde)
    : { data: [] as any[] }

  const totalMsgs = msgs?.length || 0
  const msgsIA = msgs?.filter(m => m.remitente === 'ia').length || 0
  const msgsCliente = msgs?.filter(m => m.remitente === 'cliente').length || 0
  const ratioIA = totalMsgs > 0 ? Math.round((msgsIA / totalMsgs) * 100) : 0
  const promedioMsgsPorConv = totalConvs > 0 ? Math.round(totalMsgs / totalConvs) : 0

  // ── CASOS ────────────────────────────────────────────────────
  // `cases` usa `estatus` (pendiente|atendiendo|resuelto|cerrado),
  // `fecha_apertura`, `fecha_cierre` y `agente_id`. No existe `source`.
  const { data: casosData } = await supabase
    .from('cases')
    .select('id, estatus, descripcion, fecha_apertura, fecha_cierre, agente_id, conversation_id')
    .eq('branch_id', branchId)
    .gte('fecha_apertura', desde)

  const CERRADOS = ['resuelto', 'cerrado']
  const totalCasos = casosData?.length || 0
  const casosAbiertos = casosData?.filter(c => !CERRADOS.includes(c.estatus)).length || 0
  const casosCerrados = casosData?.filter(c => CERRADOS.includes(c.estatus)).length || 0
  const tasaResolucion = totalCasos > 0 ? Math.round((casosCerrados / totalCasos) * 100) : 0

  // Tiempo medio de resolución de los casos cerrados, en minutos
  const casosCerradosData = casosData?.filter(c => CERRADOS.includes(c.estatus) && c.fecha_cierre) || []
  const tiempoMedioResolucion = casosCerradosData.length > 0
    ? Math.round(casosCerradosData.reduce((acc, c) => {
        const dur = new Date(c.fecha_cierre).getTime() - new Date(c.fecha_apertura).getTime()
        return acc + (isNaN(dur) || dur < 0 ? 0 : dur)
      }, 0) / casosCerradosData.length / 60000)
    : 0

  // No hay ninguna columna que diga de dónde salió el caso. Hoy solo los crea
  // el sistema (al escalar, fuera de horario, sin cuota...) y siempre con una
  // descripción; los que abre la entrada de mensajes nacen sin ella. Se usa
  // eso como distinción hasta que exista un campo de origen de verdad.
  const casosEscaladosIA = casosData?.filter(c => !!c.descripcion).length || 0
  const casosEscaladosManuales = totalCasos - casosEscaladosIA

  // Tasa de escalado (% convs que generaron un caso)
  const tasaEscalado = totalConvs > 0 ? Math.round((totalCasos / totalConvs) * 100) : 0

  // ── CONTACTOS ────────────────────────────────────────────────
  // `contacts` es por organización, no por sucursal: no tiene `branch_id`.
  // Y el canal es una columna suya (`canal`), no una relación con `channels`.
  const { data: contactosData } = await supabase
    .from('contacts')
    .select('id, created_at, canal')
    .eq('tenant_id', auth.tenant_id)

  const totalContactos = contactosData?.length || 0
  const nuevosContactos = contactosData?.filter(c => c.created_at >= desde).length || 0

  // Contactos por canal
  const contactosPorCanal: Record<string, number> = {}
  contactosData?.forEach(c => {
    const tipo = c.canal || 'desconocido'
    contactosPorCanal[tipo] = (contactosPorCanal[tipo] || 0) + 1
  })

  // Contactos recurrentes (más de 1 conversación)
  const convsAllTime = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('branch_id', branchId)

  const convsPerContact: Record<string, number> = {}
  convsAllTime.data?.forEach(c => {
    if (c.contact_id) convsPerContact[c.contact_id] = (convsPerContact[c.contact_id] || 0) + 1
  })
  const contactosRecurrentes = Object.values(convsPerContact).filter(v => v > 1).length

  // ── CRÉDITOS ─────────────────────────────────────────────────
  // Saldo actual (fuente de verdad: última fila por timestamp)
  const { data: quotaRow } = await supabase
    .from('message_quotas')
    .select('saldo')
    .eq('tenant_id', auth.tenant_id)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle()
  const creditosDisponibles = quotaRow?.saldo ?? 0

  // Historial de consumo, para las métricas de proyección
  const hace30dias = new Date(now); hace30dias.setDate(hace30dias.getDate() - 30)
  const { data: consumoData } = await supabase
    .from('message_quotas')
    .select('cantidad, timestamp')
    .eq('tenant_id', auth.tenant_id)
    .eq('origen', 'consumo_ia')
    .gte('timestamp', hace30dias.toISOString())

  const consumoReciente = Math.abs(
    consumoData?.reduce((acc, q) => acc + q.cantidad, 0) || 0
  )
  const consumoDiarioPromedio = consumoReciente > 0 ? Math.round(consumoReciente / 30) : 0

  const diasRestantes = consumoDiarioPromedio > 0
    ? Math.round(creditosDisponibles / consumoDiarioPromedio)
    : null

  const { data: consumoTotalData } = await supabase
    .from('message_quotas')
    .select('cantidad')
    .eq('tenant_id', auth.tenant_id)
    .eq('origen', 'consumo_ia')

  const creditosConsumidos = Math.abs(
    consumoTotalData?.reduce((acc, q) => acc + q.cantidad, 0) || 0
  )

  // ── USUARIOS ─────────────────────────────────────────────────
  const { data: usuariosData } = await supabase
    .from('users')
    .select('id, nombre, email, activo')
    .eq('tenant_id', userData.tenant_id)
    .eq('activo', true)

  const totalUsuarios = usuariosData?.length || 0

  // Actividad por usuario (casos gestionados)
  const actividadPorUsuario: { nombre: string, email: string, casos: number }[] = []
  if (usuariosData) {
    for (const u of usuariosData) {
      const { count } = await supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('agente_id', u.id)
        .gte('fecha_apertura', desde)
      actividadPorUsuario.push({
        nombre: u.nombre || u.email,
        email: u.email,
        casos: count || 0
      })
    }
  }
  actividadPorUsuario.sort((a, b) => b.casos - a.casos)

  // ── RENDIMIENTO IA ───────────────────────────────────────────
  // Convs resueltas sin intervención humana = cerradas sin casos asociados
  const convsConCaso = new Set(casosData?.map(c => c.conversation_id) || [])
  const convsSinEscalado = convsCerradas - [...convsConCaso].filter(id =>
    convs?.some(c => c.id === id && c.estado === 'cerrada')
  ).length
  const tasaResolucionIA = convsCerradas > 0
    ? Math.round((convsSinEscalado / convsCerradas) * 100)
    : 0

  // ── NOVEDADES ────────────────────────────────────────────────
  const { count: totalNovedades } = await supabase
    .from('daily_updates')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .gte('created_at', desde)

  // ── GRÁFICOS ─────────────────────────────────────────────────
  // Conversaciones por día (últimos 30 días)
  const hace30 = new Date(now); hace30.setDate(hace30.getDate() - 29)
  const { data: convsGrafico } = await supabase
    .from('conversations')
    .select('fecha_inicio')
    .eq('branch_id', branchId)
    .gte('fecha_inicio', hace30.toISOString())

  const porDia: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(hace30); d.setDate(d.getDate() + i)
    porDia[d.toISOString().split('T')[0]] = 0
  }
  convsGrafico?.forEach(c => {
    const key = c.fecha_inicio.split('T')[0]
    if (porDia[key] !== undefined) porDia[key]++
  })
  const graficoConvs = Object.entries(porDia).map(([fecha, total]) => ({ fecha, total }))

  // Mensajes por día (últimos 30 días)
  const { data: msgsGrafico } = idsConv.length
    ? await supabase
        .from('messages')
        .select('timestamp, remitente')
        .in('conversation_id', idsConv)
        .gte('timestamp', hace30.toISOString())
    : { data: [] as any[] }

  const msgsPorDia: Record<string, { ia: number, cliente: number }> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(hace30); d.setDate(d.getDate() + i)
    msgsPorDia[d.toISOString().split('T')[0]] = { ia: 0, cliente: 0 }
  }
  msgsGrafico?.forEach(m => {
    const key = String(m.timestamp).split('T')[0]
    if (msgsPorDia[key]) {
      if (m.remitente === 'ia') msgsPorDia[key].ia++
      else msgsPorDia[key].cliente++
    }
  })
  const graficoMsgs = Object.entries(msgsPorDia).map(([fecha, v]) => ({ fecha, ...v }))

  // Distribución horaria
  const graficoHoras = Object.entries(porHora).map(([hora, total]) => ({
    hora: `${hora}h`, total
  }))

  return {
    success: true,
    data: {
      periodo,
      conversaciones: {
        total: totalConvs,
        activas: convsActivas,
        cerradas: convsCerradas,
        tasaCierre,
        porCanal,
        duracionMediaMinutos: duracionMedia,
        horaPico: parseInt(horaPico)
      },
      mensajes: {
        total: totalMsgs,
        ia: msgsIA,
        cliente: msgsCliente,
        ratioIA,
        promedioporConv: promedioMsgsPorConv
      },
      casos: {
        total: totalCasos,
        abiertos: casosAbiertos,
        cerrados: casosCerrados,
        tasaResolucion,
        tiempoMedioResolucionMinutos: tiempoMedioResolucion,
        escaladosIA: casosEscaladosIA,
        escaladosManuales: casosEscaladosManuales,
        tasaEscalado
      },
      contactos: {
        total: totalContactos,
        nuevos: nuevosContactos,
        recurrentes: contactosRecurrentes,
        porCanal: contactosPorCanal
      },
      creditos: {
        disponibles: creditosDisponibles,
        consumidos: creditosConsumidos,
        consumoDiarioPromedio,
        diasRestantes
      },
      usuarios: {
        total: totalUsuarios,
        actividad: actividadPorUsuario
      },
      rendimientoIA: {
        tasaResolucionSinEscalado: tasaResolucionIA,
        tasaEscalado
      },
      novedades: {
        total: totalNovedades || 0
      },
      graficos: {
        convsPorDia: graficoConvs,
        msgsPorDia: graficoMsgs,
        convsPorHora: graficoHoras
      }
    }
  }
}

export async function getMovimientosCreditosCliente(filtros?: {
  tipo?: 'abono' | 'debito'
  origen?: 'consumo_ia' | 'recarga_manual' | 'recarga_plan'
  fecha_desde?: string
  fecha_hasta?: string
}) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  let query = supabase
    .from('message_quotas')
    .select('id, tipo, origen, cantidad, saldo, descripcion, timestamp')
    .eq('tenant_id', auth.tenant_id)
    .order('timestamp', { ascending: false })
    .limit(100)

  if (filtros?.tipo) query = query.eq('tipo', filtros.tipo)
  if (filtros?.origen) query = query.eq('origen', filtros.origen)
  if (filtros?.fecha_desde) query = query.gte('timestamp', filtros.fecha_desde)
  if (filtros?.fecha_hasta) query = query.lte('timestamp', filtros.fecha_hasta)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, movimientos: data }
}
